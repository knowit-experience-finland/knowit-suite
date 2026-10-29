import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mock, test } from 'node:test';
import SummaryReporter from '../knowit-suite/reporters/summary.js';

const run = (results, env = {}) => {
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
  // The text summary is also printed; keep the test output clean
  const log = mock.method(console, 'log', () => {});
  Object.assign(process.env, env);
  try {
    reporter.onEnd();
  } finally {
    Object.keys(env).forEach((key) => delete process.env[key]);
    log.mock.restore();
  }
  const read = (file) =>
    fs.readFileSync(path.join(dir, 'playwright-report', file), 'utf8');
  return { html: read('summary.html'), text: read('summary.txt') };
};

const contrast = {
  id: 'color-contrast',
  impact: 'serious',
  help: 'Elements must meet minimum color contrast ratio thresholds',
  helpUrl: 'https://dequeuniversity.com/rules/axe/color-contrast',
};

test('groups issues across pages and counts failed tests', () => {
  const { html, text } = run([
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

  assert.match(text, /^❌ Test summary: example\.com · /);
  assert.match(text, /📄 3 pages tested\n🧪 3 of 4 tests failed\n/);
  assert.match(text, /♿ 2 pages with accessibility issues\n🐞 1 page with/);
  assert.match(
    text,
    /\nSerious\n• Elements must meet minimum color contrast ratio thresholds: 2 pages, 5 elements\n {3}\/a\/, \/b\/\n/
  );
  assert.match(text, /• `x <b> y` \(error\): 1 page\n {3}\/b\/\n/);
  assert.doesNotMatch(text, /Lighthouse|Other failed tests|Full report/);
});

test('text summary of a clean run, with a report link', () => {
  const { html, text } = run([{ id: 'ok', url: 'https://example.com/' }], {
    REPORT_URL: 'https://ci.example.com/report/',
  });

  assert.match(text, /^✅ Test summary: example\.com/);
  assert.match(
    text,
    /✅ 0 of 1 test failed\n✅ 0 pages with accessibility issues\n✅ 0 pages with console errors\n\n🔗/
  );
  assert.doesNotMatch(text, /Accessibility issues|Console errors/);
  assert.match(text, /🔗 Full report: https:\/\/ci\.example\.com\/report\/\n$/);
  // The HTML summary copies the same text
  const copied = html
    .match(/<pre id="text" hidden>([\s\S]*?)<\/pre>/)[1]
    .replaceAll('&amp;', '&');
  assert.equal(copied, text);
});

test('shows Lighthouse thresholds, low scores and stricter thresholds every page allows', () => {
  const thresholds = { performance: 50, seo: 90 };
  const { html, text } = run([
    {
      id: 'l1',
      url: 'https://example.com/',
      attachments: {
        'lighthouse-scores.json': {
          url: 'https://example.com/',
          scores: { performance: 80, seo: 100 },
          thresholds,
          suggested: { performance: 75, seo: 98 },
        },
      },
    },
    {
      id: 'l2',
      url: 'https://example.com/a/',
      attachments: {
        'lighthouse-scores.json': {
          url: 'https://example.com/a/',
          scores: { performance: 70, seo: 92 },
          thresholds,
          suggested: { performance: 65, seo: 90 },
        },
      },
    },
  ]);

  assert.match(text, /\n✅ Lighthouse\n\/: /);
  assert.match(text, /\/: performance 80 · seo 100\n/);
  assert.match(
    text,
    /💡 Scores allow stricter thresholds: lighthouseThresholds: \{"performance":65,"seo":90\}/
  );
  assert.match(html, /performance<div class="muted">min 50<\/div>/);
  assert.match(html, /lighthouseThresholds: \{&quot;performance&quot;:65/);

  const low = run([
    {
      id: 'l3',
      url: 'https://example.com/',
      status: 'failed',
      attachments: {
        'lighthouse-scores.json': {
          url: 'https://example.com/',
          scores: { performance: 45, seo: 100 },
          thresholds,
          suggested: { performance: 50, seo: 98 },
        },
      },
    },
  ]);
  assert.match(
    low.text,
    /\n🚦 Lighthouse\n\/: performance 45\/50 ⚠️ · seo 100\n/
  );
  // Not until the low score is fixed, though seo could be raised
  assert.doesNotMatch(low.text, /💡/);
  assert.doesNotMatch(low.html, /stricter thresholds/);
});

test('text summary keeps long lists and messages short', () => {
  const { text } = run(
    Array.from({ length: 12 }, (_, i) => ({
      id: `e${i}`,
      url: `https://example.com/${i}/`,
      status: 'failed',
      attachments: {
        'console-errors.json': [
          {
            type: 'error',
            message: `Error ${i}\nwith \`ticks\` ${'x'.repeat(300)}`,
          },
        ],
      },
    }))
  );

  assert.match(text, /• `Error 0 with 'ticks' x+…` \(error\)/);
  assert.match(text, /\+ 2 more in the full report/);
  assert.doesNotMatch(text, /Error 11/);
});

test('lists failures without summary data, and the last attempt of a retried test', () => {
  const { html, text } = run([
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
  assert.match(
    text,
    /🧪 Other failed tests\n• Test shot \(\/a\/\): `Screenshot differs`\n/
  );
});

test('text summary puts accessibility issues under severities, with 3 example pages', () => {
  const heading = {
    id: 'heading-order',
    impact: 'moderate',
    help: 'Heading levels should only increase by one',
    helpUrl: 'https://dequeuniversity.com/rules/axe/heading-order',
  };
  const { text } = run(
    ['a', 'b', 'c', 'd'].map((page) => ({
      id: page,
      url: `https://example.com/${page}/`,
      status: 'failed',
      attachments: {
        'accessibility-violations.json': [
          { ...heading, elements: 1 },
          { ...contrast, elements: 2 },
        ],
      },
    }))
  );

  assert.match(
    text,
    /♿ Accessibility issues\nSerious\n• Elements must[^\n]*: 4 pages, 8 elements\n {3}\/a\/, \/b\/, \/c\/, \+ 1 more\nModerate\n• Heading levels[^\n]*: 4 pages, 4 elements\n/
  );
});

test('text summary groups tests of a page that fail the same way', () => {
  const failure = (id, message) => ({
    id,
    url: 'https://example.com/gone/',
    status: 'failed',
    errors: [{ message }],
  });
  const { text } = run([
    failure('r1', 'Error: page returned 404'),
    failure('r2', 'Error: page returned 404'),
    failure('r3', 'Error: page returned 404'),
    failure('r4', 'Screenshot differs'),
  ]);

  assert.match(
    text,
    /• \/gone\/: 3 tests failed: `Error: page returned 404`\n• Test r4 \(\/gone\/\): `Screenshot differs`\n/
  );
});

test('text summary counts skipped tests apart', () => {
  const tests = [
    { id: 'a', url: 'https://example.com/' },
    { id: 'b', url: 'https://example.com/', status: 'skipped' },
  ];
  assert.match(run(tests).text, /✅ 0 of 2 tests failed, 1 skipped\n/);
  assert.match(
    run([...tests, { id: 'c', url: 'https://example.com/', status: 'failed' }])
      .text,
    /🧪 1 of 3 tests failed, 1 skipped\n/
  );
});

test('text summary survives a violation without an impact', () => {
  const { text } = run([
    {
      id: 'x',
      url: 'https://example.com/',
      status: 'failed',
      attachments: {
        'accessibility-violations.json': [
          { ...contrast, impact: null, elements: 1 },
        ],
      },
    },
  ]);
  assert.match(text, /\nOther\n• Elements must/);
});
