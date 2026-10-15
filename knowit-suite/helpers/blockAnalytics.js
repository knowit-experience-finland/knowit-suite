// Analytics services blocked by default (`blockAnalytics` in
// knowit-suite.config.js), so test runs don't show up as visits.
export const ANALYTICS_DOMAINS = [
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'matomo.cloud',
  'hotjar.com',
  'clarity.ms',
];

// Standard analytics paths on any domain: catches first-party setups such as
// server-side Tag Manager, Google tag gateway and self-hosted Matomo
export const ANALYTICS_PATHS =
  /\/(gtm\.js|gtag\/js|g\/collect|matomo\.(js|php)|piwik\.(js|php))$/;

/**
 * Answer requests to analytics services with an empty response. Aborting
 * them instead would log a console error on every page.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string[]} [extraDomains] Project-specific analytics domains
 */
export const blockAnalytics = async (context, extraDomains = []) => {
  const domains = [...ANALYTICS_DOMAINS, ...extraDomains];
  const isAnalytics = (url) =>
    ANALYTICS_PATHS.test(url.pathname) ||
    domains.some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );

  await context.route(isAnalytics, (route) =>
    route.request().resourceType() === 'script'
      ? route.fulfill({ contentType: 'application/javascript', body: '' })
      : route.fulfill({ status: 204, body: '' })
  );
};
