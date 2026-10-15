import { config, getUrls, urlToPath } from '../config.js';
import { expect, test } from '../helpers/fixtures.js';
import { waitForPageToSettle } from '../helpers/helperWaitForPageToSettle.js';

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
      const response = await page.goto(url);
      await waitForPageToSettle(page);

      expect(response.ok()).toBeTruthy();

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
