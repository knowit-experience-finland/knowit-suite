import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import SummaryReporter from '../knowit-suite/reporters/summary.js';

const run = (results) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-'));
  const reporter = new SummaryReporter();
  reporter.onBegin({ configFile: path.join(dir, 'playwright.config.js') });
  results.forEach(
    ({ id, url, status = 'passed', attachments = {}, errors = [] }) =>
      reporter.onTestEnd(
        {
          id,
          title: `Test ${id}`,
          annotations: url ? [{ type: 'url', description: url }] : [],
        },
        {
          status,
          errors,
          attachments: Object.entries(attachments).map(([name, data]) => ({
            name,
            body: Buffer.from(JSON.stringify(data)),
          })),
        }
      )
  );
  reporter.onEnd();
  return fs.readFileSync(
    path.join(dir, 'playwright-report', 'summary.html'),
    'utf8'
  );
};

const contrast = {
  id: 'color-contrast',
  impact: 'serious',
  help: 'Elements must meet minimum color contrast ratio thresholds',
  helpUrl: 'https://dequeuniversity.com/rules/axe/color-contrast',
};

test('groups issues across pages and counts failed tests', () => {
  const html = run([
    {
      id: 'a1',
      url: 'https://example.com/a/',
      status: 'failed',
      attachments: {
        'accessibility-violations.json': [{ ...contrast, elements: 2 }],
      },
    },
    {
      id: 'a2',
      url: 'https://example.com/b/',
      status: 'failed',
      attachments: {
        'accessibility-violations.json': [{ ...contrast, elements: 3 }],
      },
    },
    {
      id: 'e1',
      url: 'https://example.com/b/',
      status: 'failed',
      attachments: {
        'console-errors.json': [{ type: 'error', message: 'x <b> y' }],
      },
    },
    { id: 'ok', url: 'https://example.com/c/' },
  ]);

  assert.match(html, /<b>3<\/b>pages tested/);
  assert.match(html, /<b>2<\/b>pages with accessibility issues/);
  assert.match(html, /<b>3<\/b>of 4 tests failed/);
  assert.match(
    html,
    /color-contrast[\s\S]*?<td class="num">2<\/td>\s*<td class="num">5<\/td>/
  );
  assert.match(html, /x &lt;b&gt; y/);
  assert.doesNotMatch(html, /Other failed tests/);
});

test('lists failures without summary data, and the last attempt of a retried test', () => {
  const html = run([
    {
      id: 'shot',
      url: 'https://example.com/a/',
      status: 'failed',
      errors: [
        { message: '\u001b[31mScreenshot differs\u001b[39m\nmore lines' },
      ],
    },
    { id: 'flaky', url: 'https://example.com/a/', status: 'failed' },
    { id: 'flaky', url: 'https://example.com/a/', status: 'passed' },
  ]);

  assert.match(
    html,
    /Other failed tests[\s\S]*<code>Screenshot differs<\/code>/
  );
  assert.doesNotMatch(html, /more lines/);
  assert.match(html, /<b>1<\/b>of 2 tests failed/);
});
