import { XMLParser, XMLValidator } from 'fast-xml-parser';

const parser = new XMLParser({
  removeNSPrefix: true,
  trimValues: true,
  isArray: (name) => name === 'url' || name === 'sitemap',
});

const parseSitemap = (xml, sourceUrl) => {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(
      `Invalid sitemap XML at ${sourceUrl}: ${validation.err.msg}`
    );
  }

  const document = parser.parse(xml);
  if (document.urlset) {
    return {
      type: 'urlset',
      locations: (document.urlset.url ?? [])
        .map((entry) => entry?.loc)
        .filter((location) => typeof location === 'string'),
    };
  }
  if (document.sitemapindex) {
    return {
      type: 'sitemapindex',
      locations: (document.sitemapindex.sitemap ?? [])
        .map((entry) => entry?.loc)
        .filter((location) => typeof location === 'string'),
    };
  }

  throw new Error(
    `Unsupported sitemap XML at ${sourceUrl}: expected urlset or sitemapindex`
  );
};

const fetchSitemap = async (url, fetchImpl) => {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new Error(`Failed to fetch sitemap ${url}: ${error.message}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch sitemap ${url}: HTTP ${response.status} ${response.statusText}`
    );
  }
  return response.text();
};

const toAbsoluteUrl = (location, parentUrl) => {
  try {
    return new URL(location, parentUrl);
  } catch {
    return undefined;
  }
};

export const isSitemapScanEnabled = () =>
  process.env.SITEMAP_SCAN?.toLowerCase() === 'true';

export const getSitemapThrottleMs = () => {
  const throttleMs = Number(process.env.SITEMAP_THROTTLE_MS ?? '1000');

  if (!Number.isInteger(throttleMs) || throttleMs < 0) {
    throw new Error('SITEMAP_THROTTLE_MS must be a non-negative integer');
  }

  return throttleMs;
};

/**
 * Return every unique, same-origin page URL in a sitemap tree.
 *
 * @param {{baseUrl?: string, sitemapUrl?: string, fetchImpl?: typeof fetch}} options
 * @returns {Promise<string[]>}
 */
export const getSitemapUrls = async ({
  baseUrl = process.env.BASE_URL,
  sitemapUrl = process.env.SITEMAP_URL,
  fetchImpl = fetch,
} = {}) => {
  if (!baseUrl) {
    throw new Error('BASE_URL is required for sitemap scanning');
  }

  const base = new URL(baseUrl);
  const defaults = [
    new URL('/sitemap.xml', base).href,
    new URL('/sitemap_index.xml', base).href,
  ];
  let rootUrl;
  let rootXml;

  if (sitemapUrl) {
    rootUrl = new URL(sitemapUrl, base).href;
    rootXml = await fetchSitemap(rootUrl, fetchImpl);
  } else {
    const failures = [];
    for (const candidate of defaults) {
      try {
        rootXml = await fetchSitemap(candidate, fetchImpl);
        rootUrl = candidate;
        break;
      } catch (error) {
        failures.push(error.message);
      }
    }
    if (!rootUrl) {
      throw new Error(
        `Could not load a sitemap from the default locations:\n${failures.join('\n')}`
      );
    }
  }

  const pageUrls = new Set();
  const visitedSitemaps = new Set();
  const visit = async (url, prefetchedXml) => {
    if (visitedSitemaps.has(url)) return;

    visitedSitemaps.add(url);
    const xml = prefetchedXml ?? (await fetchSitemap(url, fetchImpl));
    const sitemap = parseSitemap(xml, url);

    if (sitemap.type === 'urlset') {
      for (const location of sitemap.locations) {
        const pageUrl = toAbsoluteUrl(location, url);
        if (pageUrl?.origin === base.origin) {
          pageUrl.hash = '';
          pageUrls.add(pageUrl.href);
        }
      }
      return;
    }

    for (const location of sitemap.locations) {
      const childUrl = toAbsoluteUrl(location, url);
      if (!childUrl) {
        throw new Error(`Invalid child sitemap URL "${location}" in ${url}`);
      }
      await visit(childUrl.href);
    }
  };

  await visit(rootUrl, rootXml);
  return [...pageUrls];
};
