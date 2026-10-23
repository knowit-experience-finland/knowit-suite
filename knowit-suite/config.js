import suiteConfig from '../knowit-suite.config.js';
import { answerCookiebot } from './helpers/helperCookiebotBlock.js';
import { getSitemapPages } from './helpers/sitemap.js';

const BASE_URL = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const URL_CATEGORY = process.env.URL_CATEGORY ?? 'test';
const testUrl = process.env.TEST_URL?.trim();
const testUrls = testUrl ? testUrl.split(',').map((url) => url.trim()) : null;

for (const url of testUrls ?? []) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'TEST_URL must contain comma-separated absolute HTTP(S) URLs.'
    );
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(
      'TEST_URL must contain comma-separated absolute HTTP(S) URLs.'
    );
  }
}

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
 * @property {((args: { page: import('@playwright/test').Page, consent: 'deny' | 'grant' }) => Promise<void>) | null} [lighthouseConsent] Answers the site's real cookie banner before each Lighthouse audit, so scores don't depend on where the tests run. Defaults to answering Cookiebot; null to skip.
 * @property {string} [menuToggleSelector] Mobile menu toggle; the menu is opened for a second screenshot.
 * @property {string[]} [spinnerSelectors] Loaders to wait for before screenshots.
 * @property {string[]} [axeExclude] Selectors left out of the accessibility scan.
 * @property {string[]} [axeTags] Axe rule groups to check. Replaces the default list.
 * @property {number} [maxDiffPixels] Pixels a screenshot may differ from its baseline.
 * @property {number} [menuMaxDiffPixels] Same for the mobile menu screenshot; defaults to maxDiffPixels.
 * @property {string[]} [screenshotCss] Extra stylesheets applied for screenshots.
 * @property {'deny' | 'grant'} [consent] Cookie consent given by the Cookiebot stub. Denied by default.
 * @property {boolean | string[]} [blockAnalytics] Block analytics services (default), false to allow, or extra domains to block.
 * @property {string[]} [allowedEmbeds] Domains whose iframes still load when consent is denied (other third-party iframes get an empty page).
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
  lighthouseConsent: answerCookiebot,
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
  maxDiffPixels: 50,
  screenshotCss: [],
  consent: 'deny',
  blockAnalytics: true,
  allowedEmbeds: [],
  hooks: {},
  disable: [],
  fixtures: {},
  playwright: {},
  ...suiteConfig,
};

config.menuMaxDiffPixels ??= config.maxDiffPixels;

if (!['deny', 'grant'].includes(config.consent)) {
  throw new Error(
    `consent must be 'deny' or 'grant', not "${config.consent}".`
  );
}

// Sitemap scan: a sample of the sitemap's pages in the accessibility and
// console error tests (screenshots would need a baseline for every page)
export const isSitemapScan = process.env.SITEMAP_SCAN === 'true';
let sitemapUrls = null;

if (isSitemapScan) {
  if (testUrls) {
    throw new Error('Use either TEST_URL or SITEMAP_SCAN, not both.');
  }
  if (!BASE_URL) {
    throw new Error('SITEMAP_SCAN needs BASE_URL.');
  }
  const limit = Number(process.env.SITEMAP_LIMIT || 50);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('SITEMAP_LIMIT must be a whole number, 0 for all pages.');
  }
  // Read once in the main process; the test workers inherit the list
  process.env.KNOWIT_SITEMAP_PAGES ??= JSON.stringify(
    await getSitemapPages({
      baseUrl: BASE_URL,
      sitemapUrl: process.env.SITEMAP_URL,
      limit,
    })
  );
  sitemapUrls = JSON.parse(process.env.KNOWIT_SITEMAP_PAGES);
  if (!sitemapUrls.length) {
    throw new Error(`The sitemap has no pages on ${BASE_URL}.`);
  }
}

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

// Resolve configured entries even with an override, so matching unlock steps stay available.
export const getUrls = () => sitemapUrls ?? testUrls ?? urls;

export const getMobileUrls = () => testUrls ?? mobileUrls;

export const getLighthouseUrls = () => testUrls ?? lighthouseUrls;

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
