import { config, getUrls, urlToPath, runHook } from '../config.js';
import { test, expect } from '../helpers/fixtures.js';
import { createHtmlReport } from 'axe-html-reporter';
import { openUrl } from '../helpers/helperOpenUrl.js';

getUrls().forEach((url) => {
  test(
    `Should not have accessibility violations: ${urlToPath(url)}`,
    {
      annotation: [
        { type: 'url', description: `${url}` },
        { type: 'axe tags', description: config.axeTags.join(', ') },
      ],
    },
    async ({ page, makeAxeBuilder }, testInfo) => {
      const response = await openUrl(page, url);
      await expect(response.ok()).toBeTruthy();
      await runHook('afterLoad', { page, url });

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
