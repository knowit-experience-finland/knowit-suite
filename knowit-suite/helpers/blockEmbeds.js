// Without consent, Cookiebot holds back third-party embeds (YouTube, maps,
// social media) for real visitors. The stub doesn't block anything, so when
// consent is denied, third-party iframes get an empty page instead.

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string[]} [allowedDomains] Embeds that load without consent, e.g. challenges.cloudflare.com
 */
export const blockEmbeds = async (context, allowedDomains = []) => {
  const siteHost = new URL(process.env.BASE_URL).hostname;
  const isBlocked = (url) =>
    url.hostname !== siteHost &&
    !allowedDomains.some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );

  await context.route(isBlocked, (route) => {
    const request = route.request();
    const isIframe =
      request.isNavigationRequest() && request.frame().parentFrame() !== null;

    return isIframe
      ? route.fulfill({ contentType: 'text/html', body: '' })
      : route.fallback();
  });
};
