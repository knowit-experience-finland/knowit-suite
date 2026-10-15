import { config, getMobileUrls, urlToPath } from '../config.js';
import { expect, test } from '../helpers/fixtures.js';
import { waitForPageToSettle } from '../helpers/helperWaitForPageToSettle.js';
import { openUrl } from '../helpers/helperOpenUrl.js';

// Runs in the "mobile" Playwright project. Opens the menu when
// `menuToggleSelector` is set in project.config.js.
getMobileUrls().forEach((url) => {
  test(
    `Should match visually saved mobile state: ${urlToPath(url)}`,
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

      expect(response.ok()).toBeTruthy();

      // WCAG 1.4.10 Reflow: no sideways scrolling at 320px. Lists the
      // outermost elements that stick out to help find the culprit.
      // Compares to the viewport, not the layout width: without a viewport
      // meta tag mobile Chromium lays the page out 980px wide.
      const { width } = page.viewportSize();
      const overflow = await page.evaluate((width) => {
        const sticksOut = (el) => el.getBoundingClientRect().right > width + 1;
        const offenders = [...document.body.querySelectorAll('*')]
          .filter((el) => sticksOut(el) && !sticksOut(el.parentElement))
          .slice(0, 5)
          .map((el) =>
            [el.tagName.toLowerCase(), el.id && `#${el.id}`, ...el.classList]
              .filter(Boolean)
              .join('.')
          );
        return {
          scrollWidth: document.documentElement.scrollWidth,
          layoutWidth: document.documentElement.clientWidth,
          offenders,
        };
      }, width);
      expect
        .soft(
          overflow.scrollWidth,
          overflow.layoutWidth > width
            ? `Page is laid out ${overflow.layoutWidth}px wide on a ${width}px screen. Is the viewport meta tag missing?`
            : `Page scrolls sideways at ${width}px. Sticking out: ${overflow.offenders.join(', ')}`
        )
        .toBeLessThanOrEqual(width);

      const screenshotOptions = {
        fullPage: true,
        maxDiffPixelRatio: config.maxDiffPixelRatio,
        timeout: 30000,
        animations: 'disabled',
        mask: [page.locator('img')],
      };

      await expect(page).toHaveScreenshot(screenshotOptions);

      if (config.menuToggleSelector) {
        await page
          .locator(config.menuToggleSelector)
          .locator('visible=true')
          .first()
          .click();
        // The open menu covers the viewport, the rest of the page is noise.
        // Masks are drawn on top of the menu too, so leave them out.
        await expect(page).toHaveScreenshot({
          ...screenshotOptions,
          fullPage: false,
          mask: [],
        });
      }
    }
  );
});
