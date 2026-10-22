import { getUrls, urlToPath, runHook } from '../config.js';
import { expect, test } from '../helpers/fixtures.js';
import { openUrl } from '../helpers/helperOpenUrl.js';

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
      const logs = [];

      //get the logs
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          logs.push({
            message: msg.text(),
            type: msg.type(),
            location: JSON.stringify(msg.location()),
          });
        }
      });

      //get the errors
      page.on('pageerror', (error) => {
        logs.push({ message: error.message, type: error.name, location: '' });
      });

      const response = await openUrl(page, url);
      await page.waitForLoadState('load', { timeout: 10_000 }); // Wait max 10s for `load` event.
      await expect(response.ok()).toBeTruthy();
      await runHook('afterLoad', { page, url });

      if (logs.length > 0) {
        await testInfo.attach('console logs', {
          body: logs
            .map((e) => `${e.type}: ${e.message} ${e.location}`)
            .join('\n'),
          contentType: 'text/plain',
        });
      }

      expect(logs.length).toBe(0);
    }
  );
});
