import fs from 'node:fs';
import lighthouse from 'lighthouse';
import { chromium, expect, test } from '@playwright/test';
import {
  config,
  getLighthouseUrls,
  getUnlockStep,
  urlToPath,
} from '../config.js';
import { openUrl } from '../helpers/helperOpenUrl.js';

// Runs in the "lighthouse" Playwright project, mobile (Lighthouse default).
// Scores are the median of RUNS audits; thresholds come from
// `lighthouseThresholds` in project.config.js and never change by themselves.
const RUNS = 3;

// Normal run-to-run variance per category, kept as margin in suggestions
const VARIANCE = { performance: 5 };
const DEFAULT_VARIANCE = 2;

const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const audit = async (url, port) => {
  // Lighthouse opens its tab in this (default) context, so cookies apply
  const context = await chromium.launchPersistentContext('', {
    args: [`--remote-debugging-port=${port}`, '--ignore-certificate-errors'],
  });
  try {
    const { storageState } = config.playwright.use ?? {};
    if (typeof storageState === 'string') {
      const { cookies } = JSON.parse(fs.readFileSync(storageState, 'utf8'));
      await context.addCookies(cookies);
    }
    if (getUnlockStep(url)) {
      // Unlock once; cookies it sets stay in this context
      const page = await context.newPage();
      await openUrl(page, url);
      await page.close();
    }

    const { lhr, report } = await lighthouse(url, {
      port,
      logLevel: 'error',
      output: 'html',
      onlyCategories: Object.keys(config.lighthouseThresholds),
    });
    if (lhr.runtimeError) {
      throw new Error(
        `Lighthouse could not audit ${url}: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`
      );
    }
    // A redirect usually means a login page, which would be audited instead
    if (lhr.finalDisplayedUrl !== url) {
      throw new Error(
        `Lighthouse was redirected from ${url} to ${lhr.finalDisplayedUrl}. Login missing, or fix the URL in lighthouseUrls.`
      );
    }
    const scores = Object.fromEntries(
      Object.entries(lhr.categories).map(([id, { score }]) => [
        id,
        Math.round(score * 100),
      ])
    );
    return { scores, report };
  } finally {
    await context.close();
  }
};

getLighthouseUrls().forEach((url) => {
  test(
    `Should meet Lighthouse thresholds: ${urlToPath(url)}`,
    {
      annotation: {
        type: 'url',
        description: url,
      },
    },
    async () => {
      const testInfo = test.info();
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        runs.push(await audit(url, 9222 + testInfo.workerIndex));
      }

      const thresholds = config.lighthouseThresholds;
      const scores = {};
      const suggested = {};
      for (const [id, threshold] of Object.entries(thresholds)) {
        scores[id] = median(runs.map((run) => run.scores[id]));
        suggested[id] = Math.max(
          threshold,
          scores[id] - (VARIANCE[id] ?? DEFAULT_VARIANCE)
        );
      }

      await testInfo.attach('lighthouse-scores.json', {
        body: JSON.stringify(
          { url, runs: runs.map((run) => run.scores), scores, thresholds },
          null,
          2
        ),
        contentType: 'application/json',
      });
      await testInfo.attach('lighthouse-report.html', {
        body: runs.at(-1).report,
        contentType: 'text/html',
      });

      if (
        Object.keys(thresholds).some((id) => suggested[id] > thresholds[id])
      ) {
        const description = `Scores allow stricter thresholds: lighthouseThresholds: ${JSON.stringify(suggested)}`;
        testInfo.annotations.push({ type: 'suggestion', description });
        console.info(`${urlToPath(url)} ${description}`);
      }

      for (const [id, threshold] of Object.entries(thresholds)) {
        expect
          .soft(scores[id], `Lighthouse ${id}, median of ${RUNS} runs`)
          .toBeGreaterThanOrEqual(threshold);
      }
    }
  );
});
