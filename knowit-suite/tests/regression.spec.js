import { config, getUrls, urlToPath, runHook } from '../config.js';
import { expect, test } from '../helpers/fixtures.js';
import { waitForPageToSettle } from '../helpers/helperWaitForPageToSettle.js';
import { openUrl } from '../helpers/helperOpenUrl.js';

getUrls().forEach((url) => {
  test(
    `Should match visually saved state: ${urlToPath(url)}`,
    {
      annotation: {
        type: 'url',
        description: url,
      },
    },
    async ({ page }) => {
      test.slow();
      const response = await openUrl(page, url);
      await waitForPageToSettle(page);
      await runHook('afterLoad', { page, url });

      expect(response.ok()).toBeTruthy();

      await runHook('beforeScreenshot', { page, url });
      await expect(page).toHaveScreenshot({
        fullPage: true,
        maxDiffPixelRatio: config.maxDiffPixelRatio,
        timeout: 30000,
        animations: 'disabled',
        mask: [page.locator('img')],
      });
    }
  );
});
