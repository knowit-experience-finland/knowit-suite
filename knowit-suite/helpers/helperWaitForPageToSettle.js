import { config } from '../config.js';

// Helper function to wait for the page to fully load. Spinners to wait for
// are listed in `spinnerSelectors` in knowit-suite.config.js.
export const waitForPageToSettle = async (page) => {
  // Wait for the basic "load" state
  await page.waitForLoadState('load', { timeout: 15000 });

  let spinnerFound = false;
  for (const selector of config.spinnerSelectors) {
    const spinner = page.locator(selector).first();
    if (await spinner.count()) {
      spinnerFound = true;
      try {
        await spinner.waitFor({ state: 'hidden', timeout: 15000 });
      } catch {
        console.warn(
          `Spinner with selector ${selector} did not disappear in time.`
        );
      }
    }
  }

  if (spinnerFound) {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  }

  // Wait for webfonts, otherwise screenshots can be taken mid font-swap
  await page.evaluate(() => document.fonts.ready.then(() => {}));
};
