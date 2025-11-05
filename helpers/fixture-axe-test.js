// axe-test.js
import { test as baseTest, expect as baseExpect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Extend base test by providing "makeAxeBuilder"
//
// This new "test" can be used in multiple test files, and each of them will get
// a consistently configured AxeBuilder instance.
export const test = baseTest.extend({
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = () =>
      new AxeBuilder({ page })
        .withTags([
          'wcag2a',
          'wcag2aa',
          'wcag21a',
          'wcag21aa',
          'wcag22a',
          'wcag22aa',
        ])
        // .disableRules('color-contrast') // Disable contrast checks
        .exclude('#CookieBanner');
    await use(makeAxeBuilder);
  },
});
export const expect = baseExpect;
