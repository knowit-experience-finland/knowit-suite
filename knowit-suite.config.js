/**
 * Project settings for the shared tests in knowit-suite/. Everything is optional.
 *
 * @type {import('./knowit-suite/config.js').SuiteConfig}
 */
export default {
  // Paths are prefixed with BASE_URL, full URLs are used as is.
  // The '' category is always tested, others by URL_CATEGORY (default 'test').
  urls: {
    // prettier-ignore
    '': [
      '/',
    ],
    test: [],
    production: [],
  },
  mobileUrls: {
    '': ['/'],
  },
  lighthouseUrls: {
    '': ['/'],
  },
  lighthouseThresholds: {
    performance: 50,
    accessibility: 50,
    'best-practices': 50,
    seo: 50,
  },
  axeExclude: ['#CookieBanner'],
};
