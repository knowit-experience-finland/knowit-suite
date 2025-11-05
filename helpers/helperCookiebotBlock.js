// helpers/helperCookiebotBlock.js

/** Match common Cookiebot hosts & the uc.js loader */
export const COOKIEBOT_RE =
  /(^https?:\/\/)?([a-z0-9-]+\.)?(cookiebot\.com|consent\.cookiebot\.com|consent\.cdn\.cookiebot\.com)\/.*|\/uc\.js(\?|$)/i;

/**
 * Stub Cookiebot resources to avoid net::ERR_FAILED and keep pages happy.
 * Call once per BrowserContext (e.g., in test.beforeEach).
 */
export const stubCookiebot = async (context) => {
  if (!context) {
    return;
  }

  await context.route(COOKIEBOT_RE, async (route) => {
    const req = route.request();
    const isScript =
      req.resourceType() === 'script' || /\.js(\?|$)/i.test(req.url());

    if (isScript) {
      // Serve a tiny no-op Cookiebot
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          (function () {
            try {
              // Minimal no-op API so site code doesn't explode
              var cb = (window.Cookiebot = window.Cookiebot || {});
              cb.submitCustomConsent = cb.submitCustomConsent || function(){};
              cb.renew = cb.renew || function(){};
              cb.consent = cb.consent || { necessary: true, preferences: true, statistics: true, marketing: true };

              // Some sites check events/dataLayer
              if (Array.isArray(window.dataLayer)) {
                window.dataLayer.push({ event: 'cookiebot_loaded' });
              }
            } catch (e) {}
          })();
        `,
      });
    }

    // For non-script assets just respond empty (no error)
    return route.fulfill({ status: 204, body: '' });
  });
};
