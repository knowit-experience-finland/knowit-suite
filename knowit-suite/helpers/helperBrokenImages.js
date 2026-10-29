// Images are faked in the tests (see blockImages.js) and lazy ones are never
// requested, so broken images don't show up as console errors. Check every
// image URL on the page with a HEAD request instead, which downloads nothing.

// Requests at a time, like a browser's per-host limit
const CONCURRENCY = 6;

// URLs in src and srcset of images and <picture> sources, resolved and unique.
// A srcset URL runs until whitespace and may contain commas (e.g. Cloudflare
// "/cdn-cgi/image/format=auto,width=1920/..."), so it isn't split on commas.
const getImageUrls = (page) =>
  page.$$eval('img, picture source', (elements) => {
    const urls = elements.flatMap((element) => [
      element.getAttribute('src'),
      ...(element.getAttribute('srcset')?.match(/(?<=^|,)\s*\S+/g) ?? []).map(
        (candidate) => candidate.trim().replace(/,+$/, '')
      ),
    ]);
    return [
      ...new Set(
        urls
          .filter(Boolean)
          .map((url) => new URL(url, document.baseURI).href)
          .filter((url) => /^https?:/.test(url))
      ),
    ];
  });

// Error message for a broken image, or null. Some servers don't answer HEAD,
// so a failed HEAD is retried as a GET of the first byte.
const checkImage = async (page, url) => {
  try {
    const head = await page.request.head(url);
    if (head.ok()) {
      return null;
    }
    const get = await page.request.get(url, {
      headers: { Range: 'bytes=0-0' },
    });
    return get.ok() ? null : `${get.status()} ${url}`;
  } catch (error) {
    return `${error.message.split('\n')[0]} ${url}`;
  }
};

/**
 * Broken images on the page, as "<status> <url>" messages.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export const findBrokenImages = async (page) => {
  const urls = await getImageUrls(page);
  const broken = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const results = await Promise.all(
      urls.slice(i, i + CONCURRENCY).map((url) => checkImage(page, url))
    );
    broken.push(...results.filter(Boolean));
  }
  return broken;
};
