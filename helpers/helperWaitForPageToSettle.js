// Define the spinner selectors as an array
const spinnerSelectors = [
  '.loading-spinner',
  '.archive-app__loading-spinner',
  '.magazine-archive',
];

// Helper function to wait for the page to fully load
export const waitForPageToSettle = async (page) => {
  // Wait for the basic "load" state
  await page.waitForLoadState('load', { timeout: 15000 });

  let spinnerFound = false;
  for (const selector of spinnerSelectors) {
    const spinnerElement = await page.$(selector);
    if (spinnerElement) {
      spinnerFound = true;
      try {
        await page.waitForSelector(selector, {
          state: 'hidden',
          timeout: 15000,
        });
      } catch {
        console.warn(
          `Spinner with selector ${selector} did not disappear in time.`
        );
      }
    }
  }

  if (spinnerFound) {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    // await page.waitForTimeout(3500);
  }
};
