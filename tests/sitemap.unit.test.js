import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSitemapThrottleMs, getSitemapUrls } from '../helpers/sitemap.js';

const response = (body, status = 200) =>
  new Response(body, {
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
  });

const mockFetch = (responses) => async (url) =>
  responses[url] ?? response('', 404);

test('reads a urlset, filters origins, and removes duplicates', async () => {
  const fetchImpl = mockFetch({
    'https://example.com/sitemap.xml': response(`
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/one</loc></url>
        <url><loc>https://example.com/one#section</loc></url>
        <url><loc>https://other.example/two</loc></url>
      </urlset>`),
  });

  assert.deepEqual(
    await getSitemapUrls({ baseUrl: 'https://example.com', fetchImpl }),
    ['https://example.com/one']
  );
});

test('falls back to sitemap_index.xml and follows nested indexes once', async () => {
  const calls = [];
  const responses = {
    'https://example.com/sitemap.xml': response('', 404),
    'https://example.com/sitemap_index.xml': response(`
      <sitemapindex>
        <sitemap><loc>https://example.com/nested.xml</loc></sitemap>
        <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
      </sitemapindex>`),
    'https://example.com/nested.xml': response(`
      <sitemapindex>
        <sitemap><loc>https://example.com/pages.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap_index.xml</loc></sitemap>
      </sitemapindex>`),
    'https://example.com/pages.xml': response(`
      <urlset><url><loc>https://example.com/page</loc></url></urlset>`),
  };
  const fetchImpl = async (url) => {
    calls.push(url);
    return responses[url] ?? response('', 404);
  };

  assert.deepEqual(
    await getSitemapUrls({ baseUrl: 'https://example.com', fetchImpl }),
    ['https://example.com/page']
  );
  assert.equal(
    calls.filter((url) => url === 'https://example.com/pages.xml').length,
    1
  );
});

test('uses an explicit sitemap URL', async () => {
  const fetchImpl = mockFetch({
    'https://cdn.example/custom.xml': response(`
      <urlset><url><loc>https://example.com/page</loc></url></urlset>`),
  });

  assert.deepEqual(
    await getSitemapUrls({
      baseUrl: 'https://example.com',
      sitemapUrl: 'https://cdn.example/custom.xml',
      fetchImpl,
    }),
    ['https://example.com/page']
  );
});

test('fails clearly for invalid XML', async () => {
  const fetchImpl = mockFetch({
    'https://example.com/sitemap.xml': response('<urlset>'),
  });

  await assert.rejects(
    getSitemapUrls({ baseUrl: 'https://example.com', fetchImpl }),
    /Invalid sitemap XML/
  );
});

test('reports both failed default locations', async () => {
  await assert.rejects(
    getSitemapUrls({
      baseUrl: 'https://example.com',
      fetchImpl: mockFetch({}),
    }),
    (error) =>
      error.message.includes('https://example.com/sitemap.xml') &&
      error.message.includes('https://example.com/sitemap_index.xml')
  );
});

test('uses a one-second default throttle and accepts an override', () => {
  const originalValue = process.env.SITEMAP_THROTTLE_MS;

  try {
    delete process.env.SITEMAP_THROTTLE_MS;
    assert.equal(getSitemapThrottleMs(), 1000);

    process.env.SITEMAP_THROTTLE_MS = '2500';
    assert.equal(getSitemapThrottleMs(), 2500);

    process.env.SITEMAP_THROTTLE_MS = '-1';
    assert.throws(getSitemapThrottleMs, /non-negative integer/);
  } finally {
    if (originalValue === undefined) {
      delete process.env.SITEMAP_THROTTLE_MS;
    } else {
      process.env.SITEMAP_THROTTLE_MS = originalValue;
    }
  }
});
