// @ts-check
import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { config } from './config.js';

if (!process.env.BASE_URL) {
  throw new Error('BASE_URL is not set. Copy .env.example to .env.');
}

const { playwright } = config;
const MOBILE_SPEC = /regression-mobile\.spec\.js$/;
const LIGHTHOUSE_SPEC = /knowit-suite\/tests\/lighthouse\.spec\.js$/;

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
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
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
  projects: playwright.projects ?? [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [MOBILE_SPEC, LIGHTHOUSE_SPEC],
    },
    {
      name: 'mobile',
      /* 320px is the WCAG 1.4.10 reflow width */
      use: { ...devices['Pixel 7'], viewport: { width: 320, height: 640 } },
      testMatch: MOBILE_SPEC,
    },
    {
      /* Lighthouse launches its own browser, mobile by default */
      name: 'lighthouse',
      testMatch: LIGHTHOUSE_SPEC,
    },
  ],
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
