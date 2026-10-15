import { test as baseTest, expect as baseExpect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { config } from '../config.js';
import { stubCookiebot } from './helperCookiebotBlock.js';
import { blockImages } from './blockImages.js';
import { blockAnalytics } from './blockAnalytics.js';

// Extend base test so every test gets Cookiebot stubbed (consent denied by
// default) and images and analytics blocked, plus a consistently configured
// AxeBuilder instance as "makeAxeBuilder".
// Fixtures in `fixtures` in knowit-suite.config.js replace these by name.
// See https://playwright.dev/docs/test-fixtures
export const test = baseTest
  .extend({
    context: async ({ context }, use) => {
      await stubCookiebot(context, { consent: config.consent });
      await blockImages(context);
      if (config.blockAnalytics) {
        await blockAnalytics(
          context,
          Array.isArray(config.blockAnalytics) ? config.blockAnalytics : []
        );
      }
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
  })
  .extend(config.fixtures);
export const expect = baseExpect;
