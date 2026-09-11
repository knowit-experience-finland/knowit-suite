import { getUrls, urlToPath } from '../urls.js';
import { expect, test } from '@playwright/test';
import { stubCookiebot } from '../helpers/helperCookiebotBlock.js';
import { blockImages } from '../helpers/blockImages.js';
import { attachJson } from '../helpers/attachJson.js';

let logs = [];

test.beforeEach(async ({ context }) => {
  logs = [];
  await stubCookiebot(context);
  await blockImages(context);

  //get the logs
  context.on('console', (msg) => {
    if (msg.type() === 'error') {
      logs.push({
        message: msg.text(),
        type: msg.type(),
        location: JSON.stringify(msg.location()),
      });
    }
  });

  //get the errors
  context.on('pageerror', (error) => {
    logs.push({ message: error.message, type: error.name, location: '' });
  });
});

getUrls().forEach((url) => {
  test(
    `Should not have console errors: ${urlToPath(url)}`,
    {
      annotation: {
        type: 'url',
        description: `${url}`,
      },
    },
    async ({ page }, testInfo) => {
      // Some waiting time before the test is executed. Feel free to adjust these to match
      // your system. Older ones might need some more time.

      const response = await page.goto(url);
      await page.waitForLoadState('load', { timeout: 10_000 }); // Wait max 10s for `load` event.
      await expect(response.ok()).toBeTruthy();
      const errorLogs = (logs ?? [])
        .map((e) => `${e.type}: ${e.message} ${e.location}`)
        .join('\n');

      if (logs?.length > 0) {
        await attachJson(testInfo, 'console-errors.json', {
          url,
          errors: logs,
        });
        await testInfo.attach('console logs', {
          body: errorLogs.toString(),
          contentType: 'text/plain',
        });
      }

      expect(logs.length).toBe(0);
    }
  );
});
