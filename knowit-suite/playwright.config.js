// @ts-check
import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { config, isSitemapScan } from './config.js';

if (!process.env.BASE_URL && !process.env.TEST_URL?.trim()) {
  throw new Error(
    'Set BASE_URL in .env or pass TEST_URL to test specific pages.'
  );
}

const { playwright } = config;
const SHARED_SPECS = [
  'regression',
  'regression-mobile',
  'accessibility',
  'errors',
  'lighthouse',
];
const sharedSpec = (name) =>
  new RegExp(`knowit-suite[\\\\/]tests[\\\\/]${name}\\.spec\\.js$`);
const MOBILE_SPEC = sharedSpec('regression-mobile');
const LIGHTHOUSE_SPEC = sharedSpec('lighthouse');

// Shared tests turned off with `disable` in knowit-suite.config.js
const DISABLED_SPECS = config.disable.map((name) => {
  if (!SHARED_SPECS.includes(name)) {
    throw new Error(
      `Unknown test "${name}" in disable. Use: ${SHARED_SPECS.join(', ')}.`
    );
  }
  return sharedSpec(name);
});

const PROJECTS = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
    testIgnore: [MOBILE_SPEC, LIGHTHOUSE_SPEC, ...DISABLED_SPECS],
  },
  {
    name: 'mobile',
    /* 320px is the WCAG 1.4.10 reflow width */
    use: { ...devices['Pixel 7'], viewport: { width: 320, height: 640 } },
    testMatch: MOBILE_SPEC,
    testIgnore: DISABLED_SPECS,
  },
  {
    /* Lighthouse launches its own browser, mobile by default */
    name: 'lighthouse',
    testMatch: LIGHTHOUSE_SPEC,
    testIgnore: DISABLED_SPECS,
  },
];

// Sitemap scan: the sitemap's pages in the accessibility and console error
// tests only, not in screenshots, Lighthouse or the project's own tests
const SITEMAP_PROJECTS = [
  {
    name: 'sitemap',
    use: { ...devices['Desktop Chrome'] },
    testMatch: [sharedSpec('accessibility'), sharedSpec('errors')],
    testIgnore: DISABLED_SPECS,
  },
];

/**
 * Shared config, re-exported by the project's own `playwright.config.js`.
 * Relative paths resolve from the project root. Override anything with
 * `playwright` in `knowit-suite.config.js`.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: '.',
  /* Keep snapshots out of knowit-suite/, so the folder stays identical across projects */
  snapshotDir: './snapshots',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Five minute tests, long pages & slow environments */
  timeout: 5 * 60 * 1000,
  /* Opt out of parallel tests on CI, and in the sitemap scan to go easy on the site */
  workers: process.env.CI || isSitemapScan ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  /* The summary writes summary.html into the HTML report after it, so keep this order */
  reporter: [['html'], ['./knowit-suite/reporters/summary.js']],
  ...playwright,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Ignore SSL errors */
    ignoreHTTPSErrors: true,
    /* Prefer reduced motion: fewer animations, more stable screenshots */
    reducedMotion: 'reduce',
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    ...playwright.use,
  },
  projects:
    playwright.projects ?? (isSitemapScan ? SITEMAP_PROJECTS : PROJECTS),
  expect: {
    ...playwright.expect,
    toHaveScreenshot: {
      stylePath: [
        './knowit-suite/helpers/screenshot.css',
        ...config.screenshotCss,
      ],
      ...playwright.expect?.toHaveScreenshot,
    },
  },
});
