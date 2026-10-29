import fs from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

// summary.html and summary.txt next to the HTML report: a short overview of a
// run, e.g. to share a sitemap scan's results with a client, or to paste the
// text one anywhere. Reads the JSON attachments of the shared tests; other
// failures are listed with their first error line.

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];
const SAMPLE_PAGES = 5;
// summary.txt stays short enough for one chat message
const TEXT_ITEMS = 10;
const TEXT_PAGES = 3;
const TEXT_MESSAGE = 200;

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]
  );

const attachment = (result, name) => {
  const body = result.attachments.find((a) => a.name === name)?.body;
  try {
    return body ? JSON.parse(body.toString()) : null;
  } catch {
    return null;
  }
};

const pathOf = (url) => {
  try {
    const { pathname, search } = new URL(url);
    return pathname + search;
  } catch {
    return url;
  }
};

const pageLinks = (pages) => {
  const list = [...pages];
  const links = list
    .slice(0, SAMPLE_PAGES)
    .map((url) => `<a href="${escape(url)}">${escape(pathOf(url))}</a>`)
    .join('<br>');
  const more = list.length - SAMPLE_PAGES;
  return more > 0
    ? `${links}<br><span class="muted">+ ${more} more</span>`
    : links;
};

const group = (map, key, item, url) => {
  const entry = map.get(key) ?? { ...item, count: 0, pages: new Set() };
  entry.count += item.count ?? 1;
  entry.pages.add(url);
  map.set(key, entry);
};

const formatDate = (date) =>
  date.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });

const capitalize = (word) => `${word[0].toUpperCase()}${word.slice(1)}`;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// One line in backticks, which chat apps show as code
const code = (value) => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .replaceAll('`', "'")
    .trim();
  return `\`${text.length > TEXT_MESSAGE ? `${text.slice(0, TEXT_MESSAGE - 1)}…` : text}\``;
};

const pagePaths = (pages) => {
  const list = [...pages];
  const more = list.length - TEXT_PAGES;
  return [
    ...list.slice(0, TEXT_PAGES).map(pathOf),
    ...(more > 0 ? [`+ ${more} more`] : []),
  ].join(', ');
};

// Totals and grouped issues of a run, shared by both summaries
export const collect = (results) => {
  const pages = new Set();
  const accessibility = new Map();
  const consoleErrors = new Map();
  const lighthouse = [];
  const failures = [];
  let failed = 0;
  let skipped = 0;

  for (const { test, result } of results) {
    const url = test.annotations.find((a) => a.type === 'url')?.description;
    if (url) {
      pages.add(url);
    }
    if (result.status === 'skipped') {
      skipped++;
    } else if (result.status !== 'passed') {
      failed++;
    }

    const violations = attachment(result, 'accessibility-violations.json');
    const errors = attachment(result, 'console-errors.json');
    const scores = attachment(result, 'lighthouse-scores.json');

    for (const { id, impact, help, helpUrl, elements } of violations ?? []) {
      group(
        accessibility,
        id,
        { id, impact, help, helpUrl, count: elements },
        url
      );
    }
    for (const { type, message } of errors ?? []) {
      group(consoleErrors, `${type}: ${message}`, { type, message }, url);
    }
    if (scores) {
      lighthouse.push(scores);
    }
    if (
      !['passed', 'skipped'].includes(result.status) &&
      !violations &&
      !errors &&
      !scores
    ) {
      const message = stripVTControlCharacters(
        result.errors[0]?.message ?? result.status
      ).split('\n')[0];
      failures.push({ title: test.title, url, message });
    }
  }

  const pagesWith = (map) =>
    new Set([...map.values()].flatMap(({ pages }) => [...pages])).size;
  const categories = [
    ...new Set(lighthouse.flatMap(({ scores }) => Object.keys(scores))),
  ];
  const thresholds = Object.assign(
    {},
    ...lighthouse.map(({ thresholds }) => thresholds)
  );
  // Thresholds are shared by all pages, so only what every page allows, and
  // not until low scores are fixed
  const low = lighthouse.some(({ scores }) =>
    categories.some((id) => scores[id] < (thresholds[id] ?? 0))
  );
  const suggested = { ...thresholds };
  for (const id of categories) {
    const values = lighthouse.map(({ suggested }) => suggested?.[id]);
    if (values.every(Number.isFinite)) {
      suggested[id] = Math.min(...values);
    }
  }

  return {
    sites: [...new Set([...pages].map((url) => new URL(url).host))],
    date: new Date(),
    pages: pages.size,
    tests: results.length,
    failed,
    skipped,
    accessibility: [...accessibility.values()].sort(
      (a, b) =>
        IMPACTS.indexOf(a.impact) - IMPACTS.indexOf(b.impact) ||
        b.pages.size - a.pages.size
    ),
    pagesWithAccessibility: pagesWith(accessibility),
    consoleErrors: [...consoleErrors.values()].sort(
      (a, b) => b.pages.size - a.pages.size
    ),
    pagesWithConsoleErrors: pagesWith(consoleErrors),
    lighthouse,
    categories,
    thresholds,
    suggestedThresholds:
      !low && categories.some((id) => suggested[id] > (thresholds[id] ?? 0))
        ? suggested
        : null,
    failures,
  };
};

export const renderText = (summary, reportUrl) => {
  const { categories, thresholds } = summary;
  const isLow = ({ scores }) =>
    categories.some((id) => scores[id] < (thresholds[id] ?? 0));
  // ✅ for what passed, the topic's own icon for what didn't
  const icon = (problems, own) => (problems ? own : '✅');
  const skipped = summary.skipped ? `, ${summary.skipped} skipped` : '';
  const lines = [
    `${summary.failed ? '❌' : '✅'} Test summary${summary.sites.length ? `: ${summary.sites.join(', ')}` : ''} · ${formatDate(summary.date)}`,
    '',
    `📄 ${plural(summary.pages, 'page')} tested`,
    `${icon(summary.failed, '🧪')} ${summary.failed} of ${plural(summary.tests, 'test')} failed${skipped}`,
    `${icon(summary.pagesWithAccessibility, '♿')} ${plural(summary.pagesWithAccessibility, 'page')} with accessibility issues`,
    `${icon(summary.pagesWithConsoleErrors, '🐞')} ${plural(summary.pagesWithConsoleErrors, 'page')} with console errors`,
  ];
  // Left out when empty; the totals above already say so
  const section = (title, items, line) => {
    if (!items.length) {
      return;
    }
    lines.push('', title);
    items
      .slice(0, TEXT_ITEMS)
      .forEach((item, i, shown) => lines.push(...line(item, i, shown)));
    if (items.length > TEXT_ITEMS) {
      lines.push(`+ ${items.length - TEXT_ITEMS} more in the full report`);
    }
  };

  // Under a heading per severity; issues are sorted by it
  section(
    '♿ Accessibility issues',
    summary.accessibility,
    (issue, i, issues) => [
      ...(i > 0 && issue.impact === issues[i - 1].impact
        ? []
        : [capitalize(issue.impact ?? 'other')]),
      `• ${issue.help}: ${plural(issue.pages.size, 'page')}, ${plural(issue.count, 'element')}`,
      `   ${pagePaths(issue.pages)}`,
    ]
  );
  section('🐞 Console errors', summary.consoleErrors, (error) => [
    `• ${code(error.message)} (${error.type}): ${plural(error.pages.size, 'page')}`,
    `   ${pagePaths(error.pages)}`,
  ]);
  if (summary.lighthouse.length) {
    section(
      `${icon(summary.lighthouse.some(isLow), '🚦')} Lighthouse`,
      summary.lighthouse,
      ({ url, scores }) => [
        `${pathOf(url)}: ${categories
          .map((id) =>
            scores[id] < (thresholds[id] ?? 0)
              ? `${id} ${scores[id]}/${thresholds[id]} ⚠️`
              : `${id} ${scores[id] ?? '–'}`
          )
          .join(' · ')}`,
      ]
    );
    if (summary.suggestedThresholds) {
      lines.push(
        `💡 Scores allow stricter thresholds: lighthouseThresholds: ${JSON.stringify(summary.suggestedThresholds)}`
      );
    }
  }
  if (summary.failures.length) {
    // Tests of one page failing the same way, e.g. when the page is down
    const failures = new Map();
    for (const failure of summary.failures) {
      const key = `${failure.url ?? failure.title}\n${failure.message}`;
      const entry = failures.get(key) ?? { ...failure, count: 0 };
      entry.count++;
      failures.set(key, entry);
    }
    section(
      '🧪 Other failed tests',
      [...failures.values()],
      ({ title, url, message, count }) => {
        const path = url ? pathOf(url) : '';
        const name =
          count > 1
            ? `${path}: ${count} tests failed`
            : `${title}${path && !title.includes(path) ? ` (${path})` : ''}`;
        return [`• ${name}: ${code(message)}`];
      }
    );
  }
  if (reportUrl) {
    lines.push('', `🔗 Full report: ${reportUrl}`);
  }
  return `${lines.join('\n')}\n`;
};

export const renderHtml = (summary, text) => {
  const { sites, categories, thresholds } = summary;
  const accessibilityRows = summary.accessibility.map(
    (issue) => `<tr>
        <td><a href="${escape(issue.helpUrl)}">${escape(issue.help)}</a><div class="muted">${escape(issue.id)}</div></td>
        <td><span class="impact impact-${escape(issue.impact)}">${escape(issue.impact)}</span></td>
        <td class="num">${issue.pages.size}</td>
        <td class="num">${issue.count}</td>
        <td>${pageLinks(issue.pages)}</td>
      </tr>`
  );
  const consoleRows = summary.consoleErrors.map(
    (error) => `<tr>
        <td><code>${escape(error.message)}</code><div class="muted">${escape(error.type)}</div></td>
        <td class="num">${error.pages.size}</td>
        <td>${pageLinks(error.pages)}</td>
      </tr>`
  );
  const lighthouseRows = summary.lighthouse.map(
    ({ url, scores }) => `<tr>
      <td><a href="${escape(url)}">${escape(pathOf(url))}</a></td>
      ${categories
        .map((id) => {
          const low = scores[id] < (thresholds[id] ?? 0);
          return `<td class="num${low ? ' low' : ''}">${scores[id] ?? ''}</td>`;
        })
        .join('')}
    </tr>`
  );
  const failureRows = summary.failures.map(
    ({ title, url, message }) => `<tr>
      <td>${escape(title)}${url ? `<div class="muted">${escape(pathOf(url))}</div>` : ''}</td>
      <td><code>${escape(message)}</code></td>
    </tr>`
  );
  const suggestion = summary.suggestedThresholds
    ? `<p>Scores allow stricter thresholds: <code>lighthouseThresholds: ${escape(JSON.stringify(summary.suggestedThresholds))}</code></p>`
    : '';
  const section = (title, rows, head, empty) =>
    `<h2>${title}</h2>${
      rows.length
        ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
        : `<p class="ok">${empty}</p>`
    }`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test summary – ${escape(sites.join(', '))}</title>
<style>
  :root { --text: #1d1d1f; --muted: #6e6e73; --line: #e5e5ea; --bg: #fff; --card: #f5f5f7; --ok: #1e7b34; --bad: #b3261e; }
  @media (prefers-color-scheme: dark) { :root { --text: #f5f5f7; --muted: #a1a1a6; --line: #3a3a3c; --bg: #1c1c1e; --card: #2c2c2e; --ok: #63d07a; --bad: #ff8a80; } }
  body { margin: 0; padding: 32px 16px; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, sans-serif; }
  main { max-width: 1000px; margin: 0 auto; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  h2 { margin: 36px 0 12px; font-size: 19px; }
  a { color: inherit; }
  .muted { color: var(--muted); font-size: 13px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 24px; }
  .card { background: var(--card); border-radius: 10px; padding: 14px 16px; }
  .card b { display: block; font-size: 28px; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  th { font-size: 13px; color: var(--muted); font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .low { color: var(--bad); font-weight: 600; }
  .ok { color: var(--ok); }
  code { font-size: 13px; word-break: break-word; }
  .impact { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 99px; background: var(--card); white-space: nowrap; }
  .impact-critical, .impact-serious { color: var(--bad); }
  button { font: inherit; font-size: 13px; color: inherit; background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 1px 10px; cursor: pointer; }
  pre { margin: 16px 0 0; padding: 14px 16px; background: var(--card); border-radius: 10px; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
  @media print { body { padding: 0; } a { text-decoration: none; } button { display: none; } }
</style>
</head>
<body>
<main>
  <h1>Test summary</h1>
  <div class="muted">${escape(sites.join(', '))} · ${escape(formatDate(summary.date))} · <a href="index.html">Full report</a> · <button type="button" id="copy">Copy as text</button></div>
  <pre id="text" hidden>${escape(text)}</pre>

  <div class="cards">
    <div class="card"><b>${summary.pages}</b>pages tested</div>
    <div class="card"><b>${summary.pagesWithAccessibility}</b>pages with accessibility issues</div>
    <div class="card"><b>${summary.pagesWithConsoleErrors}</b>pages with console errors</div>
    <div class="card"><b>${summary.failed}</b>of ${summary.tests} tests failed</div>
  </div>

  ${section('Accessibility issues', accessibilityRows, ['Issue', 'Severity', 'Pages', 'Elements', 'Example pages'], 'No accessibility issues found.')}
  ${section('Console errors', consoleRows, ['Error', 'Pages', 'Example pages'], 'No console errors found.')}
  ${summary.lighthouse.length ? section('Lighthouse', lighthouseRows, ['Page', ...categories.map((id) => `${escape(id)}<div class="muted">min ${thresholds[id] ?? '–'}</div>`)], '') + suggestion : ''}
  ${summary.failures.length ? section('Other failed tests', failureRows, ['Test', 'Error'], '') : ''}
</main>
<script>
  document.getElementById('copy').addEventListener('click', async ({ currentTarget: button }) => {
    // Shown too, to see what was copied
    const text = document.getElementById('text');
    text.hidden = false;
    try {
      await navigator.clipboard.writeText(text.textContent);
    } catch {
      // No clipboard API, e.g. on some file:// pages
      getSelection().selectAllChildren(text);
      document.execCommand('copy');
    }
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy as text'), 2000);
  });
</script>
</body>
</html>
`;
};

export default class SummaryReporter {
  constructor({ outputFolder = 'playwright-report' } = {}) {
    this.outputFolder = outputFolder;
    // Last attempt of each test, so retries count once
    this.results = new Map();
  }

  onBegin(config) {
    this.folder = path.resolve(
      path.dirname(config.configFile ?? path.join(process.cwd(), 'x')),
      process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? this.outputFolder
    );
  }

  onTestEnd(test, result) {
    this.results.set(test.id, { test, result });
  }

  onEnd() {
    const summary = collect([...this.results.values()]);
    const text = renderText(summary, process.env.REPORT_URL);
    fs.mkdirSync(this.folder, { recursive: true });
    fs.writeFileSync(
      path.join(this.folder, 'summary.html'),
      renderHtml(summary, text)
    );
    fs.writeFileSync(path.join(this.folder, 'summary.txt'), text);
    console.log(`\n${text}`);

    // A link to the summary at the top of the HTML report, which has no
    // setting for extra content. The report renders into its own element.
    const report = path.join(this.folder, 'index.html');
    if (fs.existsSync(report)) {
      const bar = `<style>
  #knowit-summary { display: block; padding: 10px 16px; font: 14px/1.4 system-ui, sans-serif; color: #1d1d1f; background: #eef3ff; border-bottom: 1px solid #d0d7de; text-decoration: none; }
  #knowit-summary b { text-decoration: underline; }
  @media (prefers-color-scheme: dark) { #knowit-summary { color: #f5f5f7; background: #1f2a44; border-color: #30363d; } }
</style>
<a id="knowit-summary" href="summary.html">Summary: ${summary.pages} pages tested · ${summary.pagesWithAccessibility} with accessibility issues · ${summary.pagesWithConsoleErrors} with console errors · ${summary.failed} of ${summary.tests} tests failed — <b>Open summary</b></a>`;
      fs.writeFileSync(
        report,
        fs.readFileSync(report, 'utf8').replace('<body>', `<body>\n${bar}`)
      );
    }
  }

  printsToStdio() {
    return false;
  }
}
