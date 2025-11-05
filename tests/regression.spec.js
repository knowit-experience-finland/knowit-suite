import { getUrls, urlToPath } from '../urls.js';
import { expect, test } from '@playwright/test';

import { waitForPageToSettle } from '../helpers/helperWaitForPageToSettle.js';
import { stubCookiebot } from '../helpers/helperCookiebotBlock.js';
import { blockImages } from '../helpers/blockImages.js';

// in your test setup (beforeEach or a project-level fixture)
test.beforeEach(async ({ context }) => {
  await stubCookiebot(context);
  await blockImages(context);
});

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

      let imageLocator = page.locator('img');

      await expect(page).toHaveScreenshot({
        fullPage: true,
        maxDiffPixelRatio: 0.05, // 5%
        timeout: 30000,
        animations: 'disabled',
        mask: [imageLocator],
      });
    }
  );
});
