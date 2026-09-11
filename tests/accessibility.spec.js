import { getUrls, urlToPath } from '../urls.js';
import { test, expect } from '../helpers/fixture-axe-test.js';
import { createHtmlReport } from 'axe-html-reporter';
import { stubCookiebot } from '../helpers/helperCookiebotBlock.js';
import { blockImages } from '../helpers/blockImages.js';
import { attachJson } from '../helpers/attachJson.js';

test.beforeEach(async ({ context }) => {
  await stubCookiebot(context);
  await blockImages(context);
});

getUrls().forEach((url) => {
  test(
    `Should not have WCAG A, AA violations: ${urlToPath(url)}`,
    {
      annotation: {
        type: 'url',
        description: `${url}`,
      },
    },
    async ({ page, makeAxeBuilder }, testInfo) => {
      const response = await page.goto(url);
      await expect(response.ok()).toBeTruthy();

      const accessibilityScanResults = await makeAxeBuilder().analyze();

      const reportHTML = createHtmlReport({
        results: accessibilityScanResults,
        options: {
          doNotCreateReportFile: true,
        },
      });

      const violations = accessibilityScanResults.violations.length;

      if (violations) {
        await attachJson(testInfo, 'accessibility-violations.json', {
          url,
          violations: accessibilityScanResults.violations,
        });
        await testInfo.attach('accessibility-scan-results.html', {
          body: reportHTML,
          contentType: 'text/html',
        });
      }

      expect(violations).toEqual(0);
    }
  );
});
