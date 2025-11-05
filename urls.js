const BASE_URL = process.env.BASE_URL;
const URL_CATEGORY = process.env.URL_CATEGORY ?? 'test';

/**
 * Add your URL_CATEGORY-keys and URLs here. Empty category is always used and `test` category is mandatory.
 *
 * @type {{"": string[], test: string[], production: string[]}}
 */
const urls = {
  '': [
    `${BASE_URL}/`,
    `${BASE_URL}/referenssit/`,
    `${BASE_URL}/yhteystiedot/`,
    `${BASE_URL}/tietoa-meista/`,
  ],
  test: [
    // Some only 'test' urls here. Eg. fixtures
  ],
  production: [
    // Only production urls here
  ],
};

/**
 * Get all URLs in specified URL_CATEGORY.
 *
 * @returns {*[]}
 */
export const getUrls = () => {
  const sharedUrls = urls[''] ?? [];
  const categoryKey = urls[URL_CATEGORY] ? URL_CATEGORY : 'test';
  const categoryUrls = urls[categoryKey] ?? [];

  return [...sharedUrls, ...categoryUrls];
};

/**
 * Strip BASE_URL from url
 *
 * @param url
 * @returns {*}
 */
export const urlToPath = (url) => {
  return url.replace(BASE_URL, '');
};
