# Knowit Suite

Knowit Suite – fast Playwright tests for website quality. Configure the base URL in `.env` and the paths you care about in `knowit-suite.config.js`.

All tests are written with [Playwright](https://playwright.dev/).

## Contents

- [Tests](#tests)
- [Structure](#structure)
  - [Adding the suite to a project](#adding-the-suite-to-a-project)
  - [Project settings](#project-settings)
- [Requirements](#requirements)
- [Running](#running)
  - [Tips](#tips)
- [URLs](#urls)
- [Adding new tests](#adding-new-tests)
- [Changelog](#changelog)

## Tests

Currently, the suite includes the following tests.

- Accessibility `accessibility.spec.js` with [AXE](https://npmjs.org/@axe-core/playwright): WCAG A and AA plus axe's best-practice rules by default; `axeTags` changes the list.
- Regression `regression.spec.js` compares screenshots using Playwright's [Visual Comparison](https://playwright.dev/docs/test-snapshots).
- Mobile regression `regression-mobile.spec.js` takes mobile screenshots (320px wide), also with the menu open when `menuToggleSelector` is set, and fails if the page scrolls sideways (WCAG 1.4.10 Reflow).
- Errors `errors.spec.js` checks for JavaScript console errors and uncaught exceptions.
- Lighthouse `lighthouse.spec.js` audits `lighthouseUrls` on mobile (median of 3 runs) against `lighthouseThresholds`. Thresholds never change by themselves; when scores clearly exceed them, the test suggests stricter values.

## Structure

Projects install the suite from GitHub, and an npm script copies its `knowit-suite/` folder into the project. Everything under `knowit-suite/` comes from the suite; project-specific things live next to it.

```
playwright.config.js   re-exports knowit-suite/playwright.config.js
knowit-suite.config.js project settings: URLs, spinners, axe excludes, menu toggle…
knowit-suite/          copied from the suite on npm install (gitignored)
tests/                 project's own tests
helpers/               project's own helpers
snapshots/             screenshots (kept out of knowit-suite/)
```

### Adding the suite to a project

In the project's test folder (needs `"type": "module"` in `package.json`):

```bash
npm i -D github:knowit-experience-finland/knowit-suite#v2.0.0
```

```json
"scripts": {
  "postinstall": "knowit-suite sync"
}
```

Add `knowit-suite/` to `.gitignore` and run `npm install`. The `postinstall` script replaces the `knowit-suite/` folder with the installed version on every plain `npm install`. Adding or updating the package with `npm install <package>` doesn't run it, so run `npm install` (or `npx knowit-suite sync`) afterwards.

To update, change the tag in `package.json` and run `npm install`. During development a branch name works instead of a tag; `npm update knowit-suite` then pulls its newest commit.

Never edit files in `knowit-suite/` inside a project: the next `npm install` replaces them. Change the suite instead, or use the settings below.

### Project settings

All settings in `knowit-suite.config.js` are optional; see `SuiteConfig` in `knowit-suite/config.js`.

```js
/** @type {import('./knowit-suite/config.js').SuiteConfig} */
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
  axeTags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
  maxDiffPixels: 50,
  screenshotCss: ['./helpers/screenshot.css'],
  consent: 'deny',
  blockAnalytics: ['stats.example.com'],
  allowedEmbeds: ['challenges.cloudflare.com'],
  playwright: { globalSetup: './helpers/global-setup.js' },
};
```

Tests don't count as visitors in analytics by default:

- `consent`: the Cookiebot stub denies consent (`'deny'`, default) or gives it (`'grant'`), e.g. for testing tracking scripts. With consent denied, third-party iframes (YouTube, maps, social media) get an empty page, as Cookiebot holds them back from real visitors without consent.
- `allowedEmbeds`: domains whose iframes still load when consent is denied, for embeds that don't need consent (e.g. `challenges.cloudflare.com` for Turnstile).
- `blockAnalytics`: requests to common analytics services (Google Tag Manager, Google Analytics, Matomo Cloud, Hotjar, Microsoft Clarity) get an empty response, as do standard analytics paths on any domain (`/gtm.js`, `/gtag/js`, `/g/collect`, `matomo.js`/`.php`), which covers server-side Tag Manager and self-hosted Matomo. Give a list to block extra domains too, or `false` to allow them.

Neither stops analytics sent from the server. Screenshots can differ from runs with consent given, e.g. placeholders instead of embeds.

`maxDiffPixels` is how many pixels a screenshot may differ from its baseline (default 50). Rendering noise on stable pages is typically 0, so keep it low; hide elements that render differently on each load with `screenshotCss` instead of raising it. `menuMaxDiffPixels` sets the limit for the mobile menu screenshot only, for menus whose text renders slightly differently on each load.

`axeTags` replaces the whole default list, so a project that sets it doesn't get later changes to the default.

`playwright` overrides the shared Playwright config (`use` and `expect.toHaveScreenshot` are merged, the rest replaced).

#### Extending without editing the suite

From lightest to heaviest; the lighter the mechanism, the longer a project keeps getting suite updates.

**Hooks** run project-specific steps inside the shared tests:

```js
hooks: {
  // After the page has loaded (and settled), in every shared page test
  afterLoad: async ({ page, url }) => {},
  // Right before each screenshot, e.g. close a popup
  beforeScreenshot: async ({ page }) => {
    await page.locator('.newsletter-popup .close').click();
  },
},
```

**Turning shared tests off**: `regression`, `regression-mobile`, `accessibility`, `errors` or `lighthouse`. An unknown name fails at start.

```js
disable: ['lighthouse'],
```

**Fixture overrides** replace the suite's [Playwright fixtures](https://playwright.dev/docs/test-fixtures) of the same name in every shared test, e.g. a different axe setup. Everything else in the suite's fixtures stays up to date:

```js
import AxeBuilder from '@axe-core/playwright';

fixtures: {
  makeAxeBuilder: async ({ page }, use) => {
    await use(() => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']));
  },
},
```

Project tests can use the suite's base test, which stubs Cookiebot and blocks images:

```js
import { test, expect } from '../knowit-suite/helpers/fixtures.js';
```

## Requirements

The shared tests support projects still on Node 18, so dependency versions have upper limits until every project is on Node 22.19 or newer:

| Package            | Node 18      | Node 20 | Node 22.19+  |
| ------------------ | ------------ | ------- | ------------ |
| `@playwright/test` | up to 1.61.x | latest  | latest       |
| `lighthouse`       | 12.x         | 12.x    | 12.x or 13.x |

- `@playwright/test` 1.62 and newer need Node 20. A Node 18 project must pin it, e.g. `"@playwright/test": "~1.61.0"`; otherwise `npm update` installs a version that no longer supports Node 18.
- `lighthouse` 13 needs Node 22.19, so the suite stays on Lighthouse 12 while any project is on Node 18 or 20.
- The suite's own code needs Node 18.16 or newer and ES modules (`"type": "module"`).
- The suite repo's development tools (ESLint, Prettier, Husky) run only in this repo, so they can need a newer Node; see `.nvmrc`.

## Running

```bash
nvm use
npm install
npx playwright test
```

In this repo, run `npm run setup` once after cloning: it installs the browsers and the Git hooks.

If the UI has changed, update snapshots with:

```bash
npx playwright test --update-snapshots
```

### Tips

- Add `--ui` to open actual browser window to debug and see what is happening.
- Want to run only specific test: `npx playwright test accessibility` and only test files matching `accessibility` will be run.
- `--project=mobile` runs only the mobile screenshots, `--project=lighthouse` only Lighthouse.

## URLs

URLs to test are managed in `knowit-suite.config.js`. Paths starting with `/` are prefixed with `BASE_URL`, full URLs are used as is.

A page that needs unlocking first, e.g. a password-protected test page, is given as an object with an `unlock` step. It runs after the page has loaded, in every shared test and before Lighthouse, and returns the unlocked page's response:

```js
const allBlocks = {
  path: '/all-blocks/',
  // E.g. a site that unlocks previews with a cookie
  unlock: async ({ page, url }) => {
    await page
      .context()
      .addCookies([{ name: 'preview', value: process.env.PREVIEW_TOKEN, url }]);
    return page.goto(url);
  },
};

export default {
  urls: { '': ['/', allBlocks] },
  mobileUrls: { '': [allBlocks] },
};
```

Keep passwords in `.env`, not in the config. A test page with every block is a good candidate: one URL covers all of them.

#### WordPress

`knowit-suite/helpers/wordpress.js` has ready-made helpers for WordPress sites. For a page protected with a post password:

```js
import { wpPostPassword } from './knowit-suite/helpers/wordpress.js';

const allBlocks = {
  path: '/all-blocks/',
  unlock: wpPostPassword(process.env.ALL_BLOCKS_PASSWORD),
};
```

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

To test new URLs with the shared specs, update `knowit-suite.config.js`. Custom scenarios live in `tests/`; create a new `.spec.js` there when you need something bespoke.

See [Playwright's documentation](https://playwright.dev/docs/writing-tests) for more information on writing tests.

## Changelog

### 2.0.0 – 2026-10-22

- Projects install the suite from GitHub and copy `knowit-suite/` into place with `knowit-suite sync` from `postinstall` (gitignored). Settings live in `knowit-suite.config.js`, snapshots in `snapshots/`. Requires `"type": "module"`.
- New: mobile screenshots with menu open, reflow check, Lighthouse thresholds, unlocking protected pages, hooks, `disable`, fixture overrides, axe best-practice rules (`axeTags`).
- Tests deny cookie consent and block analytics and third-party embeds by default, and run with reduced motion.
- Screenshot tolerance is in pixels: `maxDiffPixels` (default 50).
- Fixed: uncaught page errors are now caught.

Upgrading from 1.0: install the suite and add the `postinstall` script (see [Adding the suite to a project](#adding-the-suite-to-a-project)), move URLs from `urls.js` to `knowit-suite.config.js` as paths, remove the copied shared tests and helpers, and regenerate screenshot baselines.
