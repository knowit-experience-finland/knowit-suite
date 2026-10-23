// helpers/helperCookiebotBlock.js

/** Match common Cookiebot hosts & the uc.js loader */
export const COOKIEBOT_RE =
  /(^https?:\/\/)?([a-z0-9-]+\.)?(cookiebot\.com|consent\.cookiebot\.com|consent\.cdn\.cookiebot\.com)\/.*|\/uc\.js(\?|$)/i;

/**
 * Stub Cookiebot resources to avoid net::ERR_FAILED and keep pages happy.
 * Call once per BrowserContext (e.g., in test.beforeEach). Consent is denied
 * by default, so tests don't count as consenting visitors in analytics.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ consent?: 'deny' | 'grant' }} [options]
 */
export const stubCookiebot = async (context, { consent = 'deny' } = {}) => {
  if (!context) {
    return;
  }
  const granted = consent === 'grant';

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
              cb.consent = { necessary: true, preferences: ${granted}, statistics: ${granted}, marketing: ${granted} };
              cb.consented = ${granted};
              cb.declined = ${!granted};
              cb.hasResponse = true;

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

/**
 * Answer the real Cookiebot like `consent` says, so the consent is stored in
 * the browser. Does nothing on pages without Cookiebot. The default
 * `lighthouseConsent`.
 *
 * @param {{ page: import('@playwright/test').Page, consent: 'deny' | 'grant' }} args
 */
export const answerCookiebot = async ({ page, consent }) => {
  const script = 'script[src*="cookiebot.com"], script[src*="cookiebot.eu"]';
  if (!(await page.locator(script).count())) {
    return;
  }
  await page
    .waitForFunction(() => window.Cookiebot?.submitCustomConsent, null, {
      timeout: 10_000,
    })
    .catch(() => {
      throw new Error(
        `Cookiebot didn't start on ${page.url()}. Fix it, or give lighthouseConsent your own step (or null).`
      );
    });
  const granted = consent === 'grant';
  await page.evaluate(
    (optIn) => window.Cookiebot.submitCustomConsent(optIn, optIn, optIn),
    granted
  );
  // Cookiebot stores the answer asynchronously, and an earlier cookie (e.g.
  // regional auto-consent) may exist, so wait for this explicit answer
  await page.waitForFunction((optIn) => {
    // Only this cookie: decoding others, e.g. "discount=20%", can throw
    const value = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith('CookieConsent='))
      ?.slice('CookieConsent='.length);
    return decodeURIComponent(value ?? '').includes(
      `preferences:${optIn},statistics:${optIn},marketing:${optIn},method:'explicit'`
    );
  }, granted);
};
