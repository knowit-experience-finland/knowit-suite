import { test as baseTest, expect as baseExpect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { config } from '../config.js';
import { stubCookiebot } from './helperCookiebotBlock.js';
import { blockImages } from './blockImages.js';

// Extend base test so every test gets Cookiebot stubbed and images blocked,
// plus a consistently configured AxeBuilder instance as "makeAxeBuilder".
// See https://playwright.dev/docs/test-fixtures
export const test = baseTest.extend({
  context: async ({ context }, use) => {
    await stubCookiebot(context);
    await blockImages(context);
    await use(context);
  },
  makeAxeBuilder: async ({ page }, use) => {
    const makeAxeBuilder = () => {
      const builder = new AxeBuilder({ page }).withTags(config.axeTags);
      config.axeExclude.forEach((selector) => builder.exclude(selector));
      return builder;
    };
    await use(makeAxeBuilder);
  },
});
export const expect = baseExpect;
