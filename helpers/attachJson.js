/**
 * Attach structured data to both the HTML and JSON Playwright reports.
 *
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} name
 * @param {unknown} data
 */
export const attachJson = async (testInfo, name, data) => {
  await testInfo.attach(name, {
    body: JSON.stringify(data, null, 2),
    contentType: 'application/json',
  });
};
