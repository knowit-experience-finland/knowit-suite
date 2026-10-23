// Pages for the sitemap scan (SITEMAP_SCAN=true): reads the site's sitemap
// and picks a varied sample, a few pages of each kind instead of the first
// N news articles.

const RETRIES = 2;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sitemap XML, retrying rate limiting, server errors and network failures.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
const fetchSitemap = async (url) => {
  let reason;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt) {
      await wait(1000 * 2 ** (attempt - 1));
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.text();
      }
      reason = `HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) {
        break;
      }
    } catch (error) {
      reason = error.message;
    }
  }
  throw new Error(`Could not load sitemap ${url}: ${reason}`);
};

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

/**
 * Locations in a sitemap or sitemap index. Only `<loc>` itself: image
 * sitemap entries (`<image:loc>`) aren't pages.
 *
 * @param {string} xml
 * @param {string} url Where the XML came from, for errors
 * @returns {{ isIndex: boolean, locations: string[] }}
 */
export const parseSitemap = (xml, url) => {
  const isIndex = /<sitemapindex[\s>]/.test(xml);
  if (!isIndex && !/<urlset[\s>]/.test(xml)) {
    throw new Error(`${url} is not a sitemap (no <urlset> or <sitemapindex>)`);
  }
  const locations = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map(
    ([, location]) =>
      location
        .replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, '$1')
        .replace(/&(amp|lt|gt|quot|apos);/g, (entity) => ENTITIES[entity])
        .trim()
  );
  return { isIndex, locations };
};

/**
 * Numbered parts of one sitemap (post-sitemap2.xml, wp-sitemap-posts-post-3.xml)
 * list the same kind of pages, so one of them is enough for a sample.
 *
 * @param {string} url
 */
const sitemapFamily = (url) => url.replace(/-?\d+(?=\.xml)/, '');

/**
 * Pages of the same kind share a URL pattern: the last part (the slug)
 * becomes *, other parts with numbers (dates, issues) #. E.g.
 * /uutiset/2018/12/some-title/ is "uutiset/#/#/*" and
 * /wwf-lehti/wwf-lehti-1-2024/some-title/ "wwf-lehti/#/*".
 *
 * @param {string} url
 */
export const pageGroup = (url) => {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  return (
    parts
      .map((part, i) => {
        if (i === parts.length - 1) {
          // A number-only last part is e.g. a date archive, not an item
          return /^\d+$/.test(part) ? '#' : '*';
        }
        return /\d/.test(part) ? '#' : part;
      })
      .join('/') || '/'
  );
};

/**
 * Up to `limit` pages, taking turns between URL groups: first one page of
 * each kind, then a second one, and so on. Larger groups go first, so with
 * more groups than `limit` the most common kinds of pages are covered.
 * 0 means all pages.
 *
 * @param {string[]} urls
 * @param {number} limit
 * @returns {string[]}
 */
export const selectPages = (urls, limit) => {
  if (!limit) {
    return urls;
  }
  const groups = new Map();
  for (const url of urls) {
    const group = pageGroup(url);
    groups.set(group, [...(groups.get(group) ?? []), url]);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  const selected = [];
  for (let round = 0; selected.length < limit; round++) {
    const picks = ordered.map((group) => group[round]).filter(Boolean);
    if (!picks.length) {
      break;
    }
    selected.push(...picks.slice(0, limit - selected.length));
  }
  return selected;
};

/**
 * Same-origin pages of the site's sitemap, sampled with `selectPages`.
 * Without `sitemapUrl`, tries /sitemap.xml and then /sitemap_index.xml.
 * A child sitemap that fails is skipped with a warning.
 *
 * @param {{ baseUrl: string, sitemapUrl?: string, limit: number }} options
 * @returns {Promise<string[]>}
 */
export const getSitemapPages = async ({ baseUrl, sitemapUrl, limit }) => {
  const base = new URL(baseUrl);
  const candidates = sitemapUrl
    ? [new URL(sitemapUrl, base).href]
    : ['/sitemap.xml', '/sitemap_index.xml'].map(
        (path) => new URL(path, base).href
      );

  let root;
  const failures = [];
  for (const url of candidates) {
    try {
      root = { url, xml: await fetchSitemap(url) };
      break;
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (!root) {
    throw new Error(failures.join('\n'));
  }

  const pages = new Set();
  // When sampling, one sitemap per family is enough; for all pages, each one
  const visitedKey = (url) => (limit ? sitemapFamily(url) : url);
  const visited = new Set([visitedKey(root.url)]);
  const visit = async (url, xml) => {
    const { isIndex, locations } = parseSitemap(xml, url);
    for (const location of locations) {
      let target;
      try {
        target = new URL(location, url);
      } catch {
        continue;
      }
      if (!isIndex) {
        if (target.origin === base.origin) {
          target.hash = '';
          pages.add(target.href);
        }
        continue;
      }
      if (visited.has(visitedKey(target.href))) {
        continue;
      }
      visited.add(visitedKey(target.href));
      try {
        await visit(target.href, await fetchSitemap(target.href));
      } catch (error) {
        console.warn(`Sitemap scan skipped a sitemap: ${error.message}`);
      }
    }
  };
  await visit(root.url, root.xml);

  return selectPages([...pages], limit);
};
