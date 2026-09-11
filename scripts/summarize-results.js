import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const decodeAttachment = (attachment) => {
  if (attachment.contentType !== 'application/json' || !attachment.body) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
};

const collectSpecs = (suite, specs = []) => {
  specs.push(...(suite.specs ?? []));
  for (const child of suite.suites ?? []) {
    collectSpecs(child, specs);
  }
  return specs;
};

const testUrl = (test, result) =>
  [...(result.annotations ?? []), ...(test.annotations ?? [])].find(
    (annotation) => annotation.type === 'url'
  )?.description;

const addIssue = (issues, key, issue, url) => {
  const existing = issues.get(key) ?? { ...issue, urls: new Set() };
  if (url) existing.urls.add(url);
  issues.set(key, existing);
};

export const summarizeReport = (report) => {
  const issues = new Map();

  for (const suite of report.suites ?? []) {
    for (const spec of collectSpecs(suite)) {
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) {
          const fallbackUrl = testUrl(test, result);
          let hasStructuredIssues = false;

          for (const attachment of result.attachments ?? []) {
            const data = decodeAttachment(attachment);
            if (!data) continue;

            if (attachment.name === 'accessibility-violations.json') {
              hasStructuredIssues = true;
              for (const violation of data.violations ?? []) {
                addIssue(
                  issues,
                  `accessibility:${violation.id}`,
                  {
                    type: 'accessibility',
                    id: violation.id,
                    error: violation.help,
                    impact: violation.impact,
                    description: violation.description,
                    helpUrl: violation.helpUrl,
                  },
                  data.url ?? fallbackUrl
                );
              }
            }

            if (attachment.name === 'console-errors.json') {
              hasStructuredIssues = true;
              for (const error of data.errors ?? []) {
                addIssue(
                  issues,
                  `console:${error.type}:${error.message}`,
                  {
                    type: 'console',
                    errorType: error.type,
                    error: error.message,
                  },
                  data.url ?? fallbackUrl
                );
              }
            }
          }

          if (!hasStructuredIssues && result.status !== 'passed') {
            for (const error of result.errors ?? []) {
              const message = error.message ?? error.value;
              if (!message) continue;
              addIssue(
                issues,
                `test:${message}`,
                { type: 'test', error: message },
                fallbackUrl
              );
            }
          }
        }
      }
    }
  }

  const summarizedIssues = [...issues.values()]
    .map((issue) => ({ ...issue, urls: [...issue.urls].sort() }))
    .sort(
      (left, right) =>
        right.urls.length - left.urls.length ||
        left.error.localeCompare(right.error)
    );
  const affectedUrls = new Set(summarizedIssues.flatMap((issue) => issue.urls));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      issues: summarizedIssues.length,
      affectedUrls: affectedUrls.size,
    },
    issues: summarizedIssues,
  };
};

const main = async () => {
  const inputPath = path.resolve(
    process.argv[2] ?? 'test-results/results.json'
  );
  const outputPath = path.resolve(
    process.argv[3] ?? 'test-results/summary.json'
  );
  const report = JSON.parse(await readFile(inputPath, 'utf8'));
  const summary = summarizeReport(report);

  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    `Wrote ${summary.totals.issues} grouped issues affecting ${summary.totals.affectedUrls} URLs to ${outputPath}`
  );
};

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
