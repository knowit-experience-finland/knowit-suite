import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from '@playwright/test';
import { readIssueFragments } from '../helpers/issueFragments.js';
import { isSitemapScanEnabled } from '../helpers/sitemap.js';
import {
  renderSummaryHtml,
  summarizeFragments,
} from '../scripts/summarize-results.js';

if (isSitemapScanEnabled()) {
  // Playwright requires the fixtures argument before testInfo.
  // eslint-disable-next-line no-empty-pattern
  test('Issue summary', async ({}, testInfo) => {
    const summary = summarizeFragments(await readIssueFragments());
    const outputDirectory = path.resolve('test-results');
    const jsonPath = path.join(outputDirectory, 'summary.json');
    const htmlPath = path.join(outputDirectory, 'summary.html');

    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`),
      writeFile(htmlPath, renderSummaryHtml(summary)),
    ]);

    await testInfo.attach('issue-summary.json', {
      path: jsonPath,
      contentType: 'application/json',
    });
    await testInfo.attach('issue-summary.html', {
      path: htmlPath,
      contentType: 'text/html',
    });
  });
}
