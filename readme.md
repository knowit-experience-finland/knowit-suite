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

## Adding new tests

To test new URLs with the default specs (accessibility, regression, and error), update `urls.js`. Custom scenarios live in `tests/`; create a new `.spec.js` there when you need something bespoke.

See [Playwright's documentation](https://playwright.dev/docs/writing-tests) for more information on writing tests.
