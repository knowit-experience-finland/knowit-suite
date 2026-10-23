import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  getSitemapPages,
  pageGroup,
  parseSitemap,
  selectPages,
} from '../knowit-suite/helpers/sitemap.js';

const urlset = (...urls) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((url) => `<url><loc>${url}</loc></url>`)
    .join('')}</urlset>`;

const sitemapindex = (...urls) =>
  `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((url) => `<sitemap><loc>${url}</loc></sitemap>`)
    .join('')}</sitemapindex>`;

const realFetch = globalThis.fetch;
const realWarn = console.warn;
afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});

/** Serve sitemaps from `files`, 404 for anything else; returns requested URLs */
const serve = (files) => {
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(url);
    return url in files
      ? new Response(files[url])
      : new Response('', { status: 404 });
  };
  return requested;
};

test('parseSitemap reads pages, skipping image entries', () => {
  const xml = `<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
    <url>
      <loc> https://example.com/a?x=1&amp;y=2 </loc>
      <image:image><image:loc>https://example.com/a.jpg</image:loc></image:image>
    </url>
    <url><loc><![CDATA[https://example.com/b/]]></loc></url>
  </urlset>`;
  assert.deepEqual(parseSitemap(xml, 'test'), {
    isIndex: false,
    locations: ['https://example.com/a?x=1&y=2', 'https://example.com/b/'],
  });
});

test('parseSitemap recognises an index and rejects other XML', () => {
  assert.equal(
    parseSitemap(sitemapindex('https://example.com/s.xml'), 'test').isIndex,
    true
  );
  assert.throws(() => parseSitemap('<html></html>', 'test'), /not a sitemap/);
});

test('pageGroup puts pages of the same kind together', () => {
  assert.equal(pageGroup('https://example.com/'), '/');
  assert.equal(pageGroup('https://example.com/contact/'), '*');
  assert.equal(
    pageGroup('https://example.com/news/2018/12/title/'),
    'news/#/#/*'
  );
  assert.equal(
    pageGroup('https://example.com/en/news/2020/04/other-title/'),
    'en/news/#/#/*'
  );
  assert.equal(pageGroup('https://example.com/species/seal/'), 'species/*');
  // Issues of a magazine are one kind of page, not one kind per issue
  assert.equal(
    pageGroup('https://example.com/magazine/magazine-1-2024/title/'),
    'magazine/#/*'
  );
  assert.equal(
    pageGroup('https://example.com/magazine/magazine-3-2023/other/'),
    'magazine/#/*'
  );
  // The slug stays * even with numbers; a number-only one is an archive
  assert.equal(pageGroup('https://example.com/gallery/phs229/'), 'gallery/*');
  assert.equal(pageGroup('https://example.com/news/2018/12/'), 'news/#/#');
});

test('selectPages takes turns between groups', () => {
  const news = [1, 2, 3, 4, 5].map(
    (n) => `https://example.com/news/2020/01/n${n}/`
  );
  const species = ['seal', 'lynx'].map(
    (s) => `https://example.com/species/${s}/`
  );
  const urls = [...news, ...species, 'https://example.com/contact/'];

  assert.deepEqual(selectPages(urls, 5), [
    news[0],
    species[0],
    'https://example.com/contact/',
    news[1],
    species[1],
  ]);
  assert.deepEqual(selectPages(urls, 0), urls);
  assert.equal(selectPages(urls, 100).length, urls.length);
});

test('selectPages covers the largest groups first when there are more groups than the limit', () => {
  const oneOffs = ['a', 'b', 'c'].map((s) => `https://example.com/${s}/x/`);
  const news = [1, 2, 3].map((n) => `https://example.com/news/2020/01/n${n}/`);

  assert.deepEqual(selectPages([...oneOffs, ...news], 2), [
    news[0],
    oneOffs[0],
  ]);
});

test('getSitemapPages reads one sitemap of each family, same origin only', async () => {
  const requested = serve({
    'https://example.com/sitemap_index.xml': sitemapindex(
      'https://example.com/post-sitemap1.xml',
      'https://example.com/post-sitemap2.xml',
      'https://example.com/page-sitemap.xml',
      'https://example.com/missing-sitemap.xml'
    ),
    'https://example.com/post-sitemap1.xml': urlset(
      'https://example.com/news/2020/01/a/',
      'https://other.example/elsewhere/'
    ),
    'https://example.com/page-sitemap.xml': urlset(
      'https://example.com/contact/#form'
    ),
  });
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  const pages = await getSitemapPages({
    baseUrl: 'https://example.com',
    limit: 50,
  });

  assert.deepEqual(pages, [
    'https://example.com/news/2020/01/a/',
    'https://example.com/contact/',
  ]);
  assert.ok(!requested.includes('https://example.com/post-sitemap2.xml'));
  assert.match(warnings.join('\n'), /missing-sitemap\.xml: HTTP 404/);
});

test('getSitemapPages reads every sitemap when the limit is 0', async () => {
  const requested = serve({
    'https://example.com/sitemap.xml': sitemapindex(
      'https://example.com/post-sitemap1.xml',
      'https://example.com/post-sitemap2.xml'
    ),
    'https://example.com/post-sitemap1.xml': urlset('https://example.com/a/'),
    'https://example.com/post-sitemap2.xml': urlset('https://example.com/b/'),
  });

  const pages = await getSitemapPages({
    baseUrl: 'https://example.com',
    limit: 0,
  });

  assert.deepEqual(pages, ['https://example.com/a/', 'https://example.com/b/']);
  assert.ok(requested.includes('https://example.com/post-sitemap2.xml'));
});

test('getSitemapPages fails when no sitemap can be read', async () => {
  serve({});
  await assert.rejects(
    getSitemapPages({ baseUrl: 'https://example.com', limit: 50 }),
    /sitemap\.xml: HTTP 404[\s\S]*sitemap_index\.xml: HTTP 404/
  );
});
