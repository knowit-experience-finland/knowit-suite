import { getUrls, urlToPath } from '../config.js';
import { test, expect } from '../helpers/fixtures.js';
import { createHtmlReport } from 'axe-html-reporter';

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
        await testInfo.attach('accessibility-scan-results.html', {
          body: reportHTML,
          contentType: 'text/html',
        });
      }

      expect(violations).toEqual(0);
    }
  );
});
