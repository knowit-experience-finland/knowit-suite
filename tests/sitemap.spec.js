import { createHtmlReport } from 'axe-html-reporter';
import { expect, test } from '../helpers/fixture-axe-test.js';
import { blockImages } from '../helpers/blockImages.js';
import { attachJson } from '../helpers/attachJson.js';
import { stubCookiebot } from '../helpers/helperCookiebotBlock.js';
import {
  getSitemapThrottleMs,
  getSitemapUrls,
  isSitemapScanEnabled,
} from '../helpers/sitemap.js';
import { urlToPath } from '../urls.js';

const sitemapUrls = isSitemapScanEnabled() ? await getSitemapUrls() : [];
const throttleMs = getSitemapThrottleMs();
let previousNavigationStartedAt = 0;

test.beforeEach(async ({ context }) => {
  await stubCookiebot(context);
  await blockImages(context);

  const waitMs = Math.max(
    0,
    previousNavigationStartedAt + throttleMs - Date.now()
  );
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  previousNavigationStartedAt = Date.now();
});

for (const url of sitemapUrls) {
  test(
    `Sitemap page should not have WCAG A, AA violations: ${urlToPath(url)}`,
    { annotation: { type: 'url', description: url } },
    async ({ page, makeAxeBuilder }, testInfo) => {
      const response = await page.goto(url);
      await expect(response.ok()).toBeTruthy();
      const results = await makeAxeBuilder().analyze();

      if (results.violations.length) {
        await attachJson(testInfo, 'accessibility-violations.json', {
          url,
          violations: results.violations,
        });
        await testInfo.attach('accessibility-scan-results.html', {
          body: createHtmlReport({
            results,
            options: { doNotCreateReportFile: true },
          }),
          contentType: 'text/html',
        });
      }
      expect(results.violations.length).toEqual(0);
    }
  );

  test(
    `Sitemap page should not have console errors: ${urlToPath(url)}`,
    { annotation: { type: 'url', description: url } },
    async ({ page }, testInfo) => {
      const logs = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          logs.push({
            message: message.text(),
            type: message.type(),
            location: JSON.stringify(message.location()),
          });
        }
      });
      page.on('pageerror', (error) => {
        logs.push({ message: error.message, type: error.name, location: '' });
      });

      const response = await page.goto(url);
      await page.waitForLoadState('load', { timeout: 10_000 });
      await expect(response.ok()).toBeTruthy();

      if (logs.length) {
        await attachJson(testInfo, 'console-errors.json', {
          url,
          errors: logs,
        });
        await testInfo.attach('console logs', {
          body: logs
            .map((entry) =>
              `${entry.type}: ${entry.message} ${entry.location}`.trim()
            )
            .join('\n'),
          contentType: 'text/plain',
        });
      }
      expect(logs.length).toBe(0);
    }
  );
}
