import projectConfig from '../project.config.js';

const BASE_URL = (process.env.BASE_URL ?? '').replace(/\/+$/, '');
const URL_CATEGORY = process.env.URL_CATEGORY ?? 'test';

/**
 * @typedef {object} ProjectConfig
 * @property {Record<string, string[]>} [urls] URLs per URL_CATEGORY for the desktop tests.
 * @property {Record<string, string[]>} [mobileUrls] URLs per URL_CATEGORY for the mobile screenshots.
 * @property {Record<string, string[]>} [lighthouseUrls] URLs per URL_CATEGORY for the Lighthouse audit.
 * @property {Record<string, number>} [lighthouseThresholds] Minimum Lighthouse scores per category, 0–100.
 * @property {string} [menuToggleSelector] Mobile menu toggle; the menu is opened for a second screenshot.
 * @property {string[]} [spinnerSelectors] Loaders to wait for before screenshots.
 * @property {string[]} [axeExclude] Selectors left out of the accessibility scan.
 * @property {number} [maxDiffPixelRatio] Allowed screenshot difference, 0–1.
 * @property {string[]} [screenshotCss] Extra stylesheets applied for screenshots.
 * @property {import('@playwright/test').PlaywrightTestConfig} [playwright] Overrides for the Playwright config.
 */

/**
 * Project settings from `project.config.js`, with defaults for anything left out.
 *
 * @type {Required<ProjectConfig>}
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
  maxDiffPixelRatio: 0.05,
  screenshotCss: [],
  playwright: {},
  ...projectConfig,
};

/**
 * URLs in the always-tested '' category plus the URL_CATEGORY one ('test' if
 * the category is missing). Paths starting with "/" are prefixed with BASE_URL.
 *
 * @param {Record<string, string[]>} urls
 * @returns {string[]}
 */
const resolveUrls = (urls) =>
  [...(urls[''] ?? []), ...(urls[URL_CATEGORY] ?? urls.test ?? [])].map(
    (url) => (url.startsWith('/') ? `${BASE_URL}${url}` : url)
  );

export const getUrls = () => resolveUrls(config.urls);

export const getMobileUrls = () => resolveUrls(config.mobileUrls);

export const getLighthouseUrls = () => resolveUrls(config.lighthouseUrls);

/**
 * Strip BASE_URL from url.
 *
 * @param {string} url
 * @returns {string}
 */
export const urlToPath = (url) => url.replace(BASE_URL, '');
