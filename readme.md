# Knowit Suite

Knowit Suite – fast Playwright tests for website quality. Configure the base URL in `.env` and the paths you care about in `project.config.js`.

All tests are written with [Playwright](https://playwright.dev/).

## Contents

- [Tests](#tests)
- [Structure](#structure)
  - [Project settings](#project-settings)
- [Running](#running)
  - [Tips](#tips)
- [URLs](#urls)
- [Adding new tests](#adding-new-tests)
- [Changelog](#changelog)

## Tests

Currently, the suite includes the following tests.

- Accessibility `accessibility.spec.js` with [AXE](https://npmjs.org/@axe-core/playwright).
- Regression `regression.spec.js` compares screenshots using Playwright's [Visual Comparison](https://playwright.dev/docs/test-snapshots).
- Mobile regression `regression-mobile.spec.js` takes mobile screenshots (320px wide), also with the menu open when `menuToggleSelector` is set, and fails if the page scrolls sideways (WCAG 1.4.10 Reflow).
- Errors `errors.spec.js` checks for JavaScript console errors and uncaught exceptions.
- Lighthouse `lighthouse.spec.js` audits `lighthouseUrls` on mobile (median of 3 runs) against `lighthouseThresholds`. Thresholds never change by themselves; when scores clearly exceed them, the test suggests stricter values.

## Structure

The suite is meant to be copied into projects as is. Everything under `knowit-suite/` is identical in every project; project-specific things live next to it.

```
playwright.config.js   identical: re-exports knowit-suite/playwright.config.js
project.config.js      project settings: URLs, spinners, axe excludes, menu toggle…
knowit-suite/          identical: shared config, helpers and tests
tests/                 project's own tests
helpers/               project's own helpers
snapshots/             screenshots (kept out of knowit-suite/)
```

Never edit files in `knowit-suite/` inside a project. Make the change here and copy the folder over:

```bash
rsync -a --delete ../knowit-suite/knowit-suite/ ./knowit-suite/
```

`diff -r ../knowit-suite/knowit-suite ./knowit-suite` shows whether a project is up to date.

Projects need `"type": "module"` in `package.json`.

### Project settings

All settings in `project.config.js` are optional; see `ProjectConfig` in `knowit-suite/config.js`.

```js
/** @type {import('./knowit-suite/config.js').ProjectConfig} */
export default {
  urls: { '': ['/', '/contact/'], test: [], production: [] },
  mobileUrls: { '': ['/'] },
  lighthouseUrls: { '': ['/'] },
  lighthouseThresholds: {
    performance: 50,
    accessibility: 90,
    'best-practices': 90,
    seo: 90,
  },
  menuToggleSelector: '.menu-toggle',
  spinnerSelectors: ['.loading-spinner'],
  axeExclude: ['iframe'],
  maxDiffPixelRatio: 0.05,
  screenshotCss: ['./helpers/screenshot.css'],
  playwright: { globalSetup: './helpers/global-setup.js' },
};
```

`playwright` overrides the shared Playwright config (`use` and `expect.toHaveScreenshot` are merged, the rest replaced).

Project tests can use the suite's base test, which stubs Cookiebot and blocks images:

```js
import { test, expect } from '../knowit-suite/helpers/fixtures.js';
```

## Running

```bash
nvm use
npm install
npx playwright test
```

If the UI has changed, update snapshots with:

```bash
npx playwright test --update-snapshots
```

### Tips

- Add `--ui` to open actual browser window to debug and see what is happening.
- Want to run only specific test: `npx playwright test accessibility` and only test files matching `accessibility` will be run.
- `--project=mobile` runs only the mobile screenshots, `--project=lighthouse` only Lighthouse.

## URLs

URLs to test are managed in `project.config.js`. Paths starting with `/` are prefixed with `BASE_URL`, full URLs are used as is.

The base URL for tests can be changed with `BASE_URL` environment variable, allowing us to test the same paths in multiple environments.

The URL category for tests can be defined with `URL_CATEGORY` environment variable. This affects which URLs are tested in test.

- URLs in empty category `''` are always tested.
- URLs in `'test'` category are tested when the URL category is set to `test` (the default, also used for unknown categories).
- URLs in `'production'` category are tested when the URL category is set to `production`.

Example `.env` snippet:

```ini
BASE_URL="https://knowit.fi"
URL_CATEGORY="test"
```

You can override these on the command line when needed:

```bash
BASE_URL="https://knowit.fi" URL_CATEGORY="production" npx playwright test
```

## Adding new tests

To test new URLs with the shared specs, update `project.config.js`. Custom scenarios live in `tests/`; create a new `.spec.js` there when you need something bespoke.

See [Playwright's documentation](https://playwright.dev/docs/writing-tests) for more information on writing tests.

## Changelog

### 1.1.0 – 2026-10-15

- Shared tests moved to a `knowit-suite/` folder that is copied into projects as is; project settings live in `project.config.js`, snapshots in `snapshots/`. Requires `"type": "module"`.
- New: mobile screenshots with menu open, reflow check, Lighthouse thresholds.
- Fixed: uncaught page errors are now caught.
