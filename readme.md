# Knowit Suite

Knowit Suite – fast Playwright tests for website quality. Configure the base URL in `.env` and list the paths you care about in `urls.js`.

All tests are written with [Playwright](https://playwright.dev/).

## Tests

Currently, the suite includes the following tests.

- Accessibility `accessibility.spec.js` with [AXE](https://npmjs.org/@axe-core/playwright).
- Regression `regression.spec.js` compares screenshots using Playwright's [Visual Comparison](https://playwright.dev/docs/test-snapshots).
- Errors `errors.spec.js` checks for JavaScript console errors.

## Running

```bash
nvm use
npm install
npx playwright test
```

If the UI has changed, update snapshots with:

```bash
npx playwright test --update-snapshots
```

### Tips

- Add `--ui` to open actual browser window to debug and see what is happening.
- Want to run only specific test: `npx playwright test accessibility` and only test files matching `accessibility` will be run.

## URLs

URLs to test are managed in `urls.js`.

The suite defaults to base URL `https://knowit.fi` and URL category `test`.

The base URL for tests can be changed with `BASE_URL` environment variable. This is used in `urls.js` allowing us to test the same paths in multiple environments.

The URL category for tests can be defined with `URL_CATEGORY` environment variable. This affects which URLs are tested in test.
There are currently the following categories defined in the `urls.js`.

- URLs in empty category `''` are always tested.
- URLs in `'test'` category are tested when the URL category is set to `test`.
- URLs in `'production'` category are tested when the URL category is set to `production`.

Example `.env` snippet:

```ini
BASE_URL="https://knowit.fi"
URL_CATEGORY="test"
```

You can override these on the command line when needed:

```bash
BASE_URL="https://knowit.fi" URL_CATEGORY="production" npx playwright test
```

## Sitemap scan

Set `SITEMAP_SCAN=true` to run additional accessibility and JavaScript error
checks for every same-origin URL found in the site's sitemap. The manually
configured URL tests continue to run as before, and sitemap URLs are not added
to visual regression tests.

By default, the suite first requests `${BASE_URL}/sitemap.xml` and falls back to
`${BASE_URL}/sitemap_index.xml`. Both regular sitemaps and sitemap indexes are
supported, including nested indexes. Use `SITEMAP_URL` to override the root
sitemap location.

Sitemap tests run serially and wait 1000 milliseconds between page navigations
by default. Increase `SITEMAP_THROTTLE_MS` if the target responds with HTTP 429,
or set it to `0` to disable the delay.

Sitemap downloads retry HTTP 429, server errors, and network failures twice with
exponential backoff. Configure this with `SITEMAP_FETCH_RETRIES` and
`SITEMAP_RETRY_DELAY_MS`. If a child sitemap still fails, it is reported as a
failed test while pages from the other sitemaps continue to run. Failure to load
the root sitemap remains fatal.

```bash
SITEMAP_SCAN=true npx playwright test sitemap.spec.js
```

```bash
SITEMAP_SCAN=true SITEMAP_URL="https://knowit.fi/custom-sitemap.xml" npx playwright test sitemap.spec.js
```

For example, to wait three seconds between page navigations:

```bash
SITEMAP_SCAN=true SITEMAP_THROTTLE_MS=3000 npx playwright test sitemap.spec.js
```

The run fails if the configured sitemap cannot be fetched or parsed. Run the
sitemap reader's unit tests with `npm run test:sitemap`.

## Reports

Every test run creates both the normal HTML report in `playwright-report/` and
a machine-readable Playwright report in `test-results/results.json`. Failed
accessibility checks include an `accessibility-violations.json` attachment, and
console failures include a `console-errors.json` attachment. These structured
attachments contain the tested URL and the complete issue data for later
aggregation or summary generation.

Create a grouped summary where each unique issue lists all affected URLs:

```bash
npm run report:summary
```

The command reads `test-results/results.json` and writes
`test-results/summary.json`. Optional input and output paths can be passed after
`--`, for example:

Each grouped accessibility issue also contains its unique Axe `nodes`. An
identical node appears once with a deduplicated `urls` list, preserving its
selectors, HTML and failure details while showing every affected page.

For sitemap runs, a final `Issue summary` teardown test also generates
`summary.json` and `summary.html` and attaches both files to Playwright's native
HTML report. The teardown runs after the sitemap project even when page tests
fail, so the report retains the issues collected before and after individual
failures.

```bash
npm run report:summary -- archived-results.json reports/summary.json
```

## Adding new tests

To test new URLs with the default specs (accessibility, regression, and error), update `urls.js`. Custom scenarios live in `tests/`; create a new `.spec.js` there when you need something bespoke.

See [Playwright's documentation](https://playwright.dev/docs/writing-tests) for more information on writing tests.
