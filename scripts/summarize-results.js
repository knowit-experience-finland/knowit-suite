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
    (annotation) => annotation.type === 'url' || annotation.type === 'sitemap'
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
                const issueKey = `accessibility:${violation.id}`;
                const url = data.url ?? fallbackUrl;
                addIssue(
                  issues,
                  issueKey,
                  {
                    type: 'accessibility',
                    id: violation.id,
                    error: violation.help,
                    impact: violation.impact,
                    description: violation.description,
                    helpUrl: violation.helpUrl,
                  },
                  url
                );

                const groupedIssue = issues.get(issueKey);
                groupedIssue.nodeMap ??= new Map();
                for (const node of violation.nodes ?? []) {
                  const nodeKey = JSON.stringify(node);
                  const groupedNode = groupedIssue.nodeMap.get(nodeKey) ?? {
                    ...node,
                    urls: new Set(),
                  };
                  if (url) groupedNode.urls.add(url);
                  groupedIssue.nodeMap.set(nodeKey, groupedNode);
                }
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

            if (attachment.name === 'test-errors.json') {
              hasStructuredIssues = true;
              for (const error of data.errors ?? []) {
                if (!error.message) continue;
                addIssue(
                  issues,
                  `test:${error.message}`,
                  { type: 'test', error: error.message },
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
    .map((issue) => {
      const summarized = {
        ...issue,
        urls: [...issue.urls].sort(),
      };
      delete summarized.nodeMap;
      if (issue.nodeMap) {
        summarized.nodes = [...issue.nodeMap.values()]
          .map((node) => ({ ...node, urls: [...node.urls].sort() }))
          .sort(
            (left, right) =>
              right.urls.length - left.urls.length ||
              JSON.stringify(left.target).localeCompare(
                JSON.stringify(right.target)
              )
          );
      }
      return summarized;
    })
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

export const summarizeFragments = (fragments) =>
  summarizeReport({
    suites: [
      {
        specs: fragments.map((fragment) => ({
          tests: [
            {
              results: [
                {
                  status: 'failed',
                  attachments: [
                    {
                      name: fragment.name,
                      contentType: 'application/json',
                      body: Buffer.from(JSON.stringify(fragment.data)).toString(
                        'base64'
                      ),
                    },
                  ],
                },
              ],
            },
          ],
        })),
      },
    ],
  });

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export const renderSummaryHtml = (summary) => {
  const issues = summary.issues
    .map(
      (issue) => `
        <article>
          <h2><span>${escapeHtml(issue.type)}</span> ${escapeHtml(issue.error)}</h2>
          <p>${issue.urls.length} affected URL${issue.urls.length === 1 ? '' : 's'}</p>
          <details><summary>URLs</summary><ul>${issue.urls
            .map(
              (url) =>
                `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`
            )
            .join('')}</ul></details>
          ${
            issue.nodes
              ? `<details><summary>${issue.nodes.length} unique node${issue.nodes.length === 1 ? '' : 's'}</summary>${issue.nodes
                  .map(
                    (node) =>
                      `<section><code>${escapeHtml(JSON.stringify(node.target))}</code><pre>${escapeHtml(node.html)}</pre><p>${escapeHtml(node.failureSummary)}</p><details><summary>${node.urls.length} node URL${node.urls.length === 1 ? '' : 's'}</summary><ul>${node.urls.map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`).join('')}</ul></details></section>`
                  )
                  .join('')}</details>`
              : ''
          }
        </article>`
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Issue summary</title>
<style>body{font:16px/1.5 system-ui;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#202124}article{border:1px solid #ddd;border-radius:8px;padding:1rem;margin:1rem 0}h2{font-size:1.1rem}h2 span{font-size:.75rem;text-transform:uppercase;background:#eee;padding:.2rem .4rem;border-radius:4px}details{margin:.75rem 0}section{border-top:1px solid #eee;padding:.75rem 0}pre{white-space:pre-wrap;background:#f6f8fa;padding:.5rem;overflow:auto}a{color:#0969da}</style>
</head><body><h1>Issue summary</h1><p>${summary.totals.issues} grouped issues affecting ${summary.totals.affectedUrls} URLs.</p>${issues || '<p>No issues found.</p>'}</body></html>`;
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
