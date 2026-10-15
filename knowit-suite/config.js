import suiteConfig from '../knowit-suite.config.js';

const BASE_URL = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const URL_CATEGORY = process.env.URL_CATEGORY ?? 'test';

/**
 * Opens a protected page, e.g. fills in a password form, after the page has
 * loaded. Returns the unlocked page's response, or nothing if it was already
 * unlocked. See helpers/wordpress.js for ready-made ones.
 *
 * @typedef {(args: { page: import('@playwright/test').Page, url: string }) => Promise<import('@playwright/test').Response | null | void>} UnlockStep
 */

/**
 * A path or full URL, or an object for a page that needs unlocking.
 *
 * @typedef {string | { path: string, unlock?: UnlockStep }} UrlEntry
 */

/**
 * A project-specific step in the shared tests.
 *
 * @typedef {(args: { page: import('@playwright/test').Page, url: string }) => Promise<void> | void} Hook
 */

/**
 * @typedef {object} Hooks
 * @property {Hook} [afterLoad] After the page has loaded (and settled), in every shared page test.
 * @property {Hook} [beforeScreenshot] Right before each screenshot.
 */

/**
 * @typedef {object} SuiteConfig
 * @property {Record<string, UrlEntry[]>} [urls] URLs per URL_CATEGORY for the desktop tests.
 * @property {Record<string, UrlEntry[]>} [mobileUrls] URLs per URL_CATEGORY for the mobile screenshots.
 * @property {Record<string, UrlEntry[]>} [lighthouseUrls] URLs per URL_CATEGORY for the Lighthouse audit.
 * @property {Record<string, number>} [lighthouseThresholds] Minimum Lighthouse scores per category, 0–100.
 * @property {string} [menuToggleSelector] Mobile menu toggle; the menu is opened for a second screenshot.
 * @property {string[]} [spinnerSelectors] Loaders to wait for before screenshots.
 * @property {string[]} [axeExclude] Selectors left out of the accessibility scan.
 * @property {string[]} [axeTags] Axe rule groups to check. Replaces the default list.
 * @property {number} [maxDiffPixelRatio] Allowed screenshot difference, 0–1.
 * @property {string[]} [screenshotCss] Extra stylesheets applied for screenshots.
 * @property {Hooks} [hooks] Project-specific steps in the shared tests.
 * @property {string[]} [disable] Shared tests to turn off: 'regression', 'regression-mobile', 'accessibility', 'errors', 'lighthouse'.
 * @property {Record<string, any>} [fixtures] Playwright fixtures that replace the suite's ones with the same name.
 * @property {import('@playwright/test').PlaywrightTestConfig} [playwright] Overrides for the Playwright config.
 */

/**
 * Settings from `knowit-suite.config.js`, with defaults for anything left out.
 *
 * @type {Required<SuiteConfig>}
 */
export const config = {
  urls: { '': ['/'] },
  mobileUrls: { '': ['/'] },
  lighthouseUrls: { '': ['/'] },
  lighthouseThresholds: {
    performance: 50,
    accessibility: 50,
    'best-practices': 50,
    seo: 50,
  },
  menuToggleSelector: '',
  spinnerSelectors: [],
  axeExclude: [],
  axeTags: [
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22a',
    'wcag22aa',
    'best-practice',
  ],
  maxDiffPixelRatio: 0.05,
  screenshotCss: [],
  hooks: {},
  disable: [],
  fixtures: {},
  playwright: {},
  ...suiteConfig,
};

// Unlock steps of protected pages, by full URL
const unlockSteps = new Map();

/**
 * URLs in the always-tested '' category plus the URL_CATEGORY one ('test' if
 * the category is missing). Paths starting with "/" are prefixed with BASE_URL.
 *
 * @param {Record<string, UrlEntry[]>} urls
 * @returns {string[]}
 */
const resolveUrls = (urls) =>
  [...(urls[''] ?? []), ...(urls[URL_CATEGORY] ?? urls.test ?? [])].map(
    (entry) => {
      const { path, unlock } =
        typeof entry === 'string' ? { path: entry } : entry;
      const url = path.startsWith('/') ? `${BASE_URL}${path}` : path;
      if (unlock) {
        unlockSteps.set(url, unlock);
      }
      return url;
    }
  );

const urls = resolveUrls(config.urls);
const mobileUrls = resolveUrls(config.mobileUrls);
const lighthouseUrls = resolveUrls(config.lighthouseUrls);

export const getUrls = () => urls;

export const getMobileUrls = () => mobileUrls;

export const getLighthouseUrls = () => lighthouseUrls;

/**
 * Unlock step of a protected page, if it has one.
 *
 * @param {string} url
 * @returns {UnlockStep | undefined}
 */
export const getUnlockStep = (url) => unlockSteps.get(url);

/**
 * Strip BASE_URL from url.
 *
 * @param {string} url
 * @returns {string}
 */
export const urlToPath = (url) => url.replace(BASE_URL, '');

/**
 * Run a project hook from `hooks` in knowit-suite.config.js, if it has one.
 *
 * @param {keyof Hooks} name
 * @param {{ page: import('@playwright/test').Page, url: string }} args
 */
export const runHook = async (name, args) => {
  await config.hooks[name]?.(args);
};
