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

  if (
    testInfo.project.name === 'sitemap-chromium' &&
    (name === 'accessibility-violations.json' || name === 'console-errors.json')
  ) {
    structuredIssueTests.add(testInfo);
    await writeIssueFragment(name, data);
  }
};

export const recordTestFailure = async (testInfo) => {
  if (
    testInfo.project.name !== 'sitemap-chromium' ||
    structuredIssueTests.has(testInfo) ||
    !testInfo.errors.length
  ) {
    return;
  }

  const url = testInfo.annotations.find(
    (annotation) => annotation.type === 'url' || annotation.type === 'sitemap'
  )?.description;
  await writeIssueFragment('test-errors.json', {
    url,
    errors: testInfo.errors.map((error) => ({
      message: error.message ?? error.value,
    })),
  });
};
import { writeIssueFragment } from './issueFragments.js';

const structuredIssueTests = new WeakSet();
