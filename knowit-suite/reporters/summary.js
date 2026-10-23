import fs from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

// summary.html next to the HTML report: a short overview of a run, e.g. to
// share a sitemap scan's results with a client. Reads the JSON attachments of
// the shared tests; other failures are listed with their first error line.

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'];
const SAMPLE_PAGES = 5;

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

export default class SummaryReporter {
  constructor({ outputFolder = 'playwright-report' } = {}) {
    this.outputFolder = outputFolder;
    // Last attempt of each test, so retries count once
    this.results = new Map();
  }

  onBegin(config) {
    this.file = path.resolve(
      path.dirname(config.configFile ?? path.join(process.cwd(), 'x')),
      process.env.PLAYWRIGHT_HTML_OUTPUT_DIR ?? this.outputFolder,
      'summary.html'
    );
  }

  onTestEnd(test, result) {
    this.results.set(test.id, { test, result });
  }

  onEnd() {
    const pages = new Set();
    const accessibility = new Map();
    const consoleErrors = new Map();
    const lighthouse = [];
    const failures = [];
    let failed = 0;

    for (const { test, result } of this.results.values()) {
      const url = test.annotations.find((a) => a.type === 'url')?.description;
      if (url) {
        pages.add(url);
      }
      if (!['passed', 'skipped'].includes(result.status)) {
        failed++;
      }

      const violations = attachment(result, 'accessibility-violations.json');
      const errors = attachment(result, 'console-errors.json');
      const scores = attachment(result, 'lighthouse-scores.json');

      for (const { id, impact, help, helpUrl, elements } of violations ?? []) {
        group(
          accessibility,
          id,
          { impact, help, helpUrl, count: elements },
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
    const accessibilityRows = [...accessibility.entries()]
      .sort(
        ([, a], [, b]) =>
          IMPACTS.indexOf(a.impact) - IMPACTS.indexOf(b.impact) ||
          b.pages.size - a.pages.size
      )
      .map(
        ([id, issue]) => `<tr>
          <td><a href="${escape(issue.helpUrl)}">${escape(issue.help)}</a><div class="muted">${escape(id)}</div></td>
          <td><span class="impact impact-${escape(issue.impact)}">${escape(issue.impact)}</span></td>
          <td class="num">${issue.pages.size}</td>
          <td class="num">${issue.count}</td>
          <td>${pageLinks(issue.pages)}</td>
        </tr>`
      );
    const consoleRows = [...consoleErrors.values()]
      .sort((a, b) => b.pages.size - a.pages.size)
      .map(
        (error) => `<tr>
          <td><code>${escape(error.message)}</code><div class="muted">${escape(error.type)}</div></td>
          <td class="num">${error.pages.size}</td>
          <td>${pageLinks(error.pages)}</td>
        </tr>`
      );
    const categories = [
      ...new Set(lighthouse.flatMap(({ scores }) => Object.keys(scores))),
    ];
    const lighthouseRows = lighthouse.map(
      ({ url, scores, thresholds }) => `<tr>
        <td><a href="${escape(url)}">${escape(pathOf(url))}</a></td>
        ${categories
          .map((id) => {
            const low = scores[id] < (thresholds?.[id] ?? 0);
            return `<td class="num${low ? ' low' : ''}">${scores[id] ?? ''}</td>`;
          })
          .join('')}
      </tr>`
    );
    const failureRows = failures.map(
      ({ title, url, message }) => `<tr>
        <td>${escape(title)}${url ? `<div class="muted">${escape(pathOf(url))}</div>` : ''}</td>
        <td><code>${escape(message)}</code></td>
      </tr>`
    );

    const sites = [...new Set([...pages].map((url) => new URL(url).host))];
    const section = (title, rows, head, empty) =>
      `<h2>${title}</h2>${
        rows.length
          ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
          : `<p class="ok">${empty}</p>`
      }`;

    const html = `<!doctype html>
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
  @media print { body { padding: 0; } a { text-decoration: none; } }
</style>
</head>
<body>
<main>
  <h1>Test summary</h1>
  <div class="muted">${escape(sites.join(', '))} · ${escape(new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }))} · <a href="index.html">Full report</a></div>

  <div class="cards">
    <div class="card"><b>${pages.size}</b>pages tested</div>
    <div class="card"><b>${pagesWith(accessibility)}</b>pages with accessibility issues</div>
    <div class="card"><b>${pagesWith(consoleErrors)}</b>pages with console errors</div>
    <div class="card"><b>${failed}</b>of ${this.results.size} tests failed</div>
  </div>

  ${section('Accessibility issues', accessibilityRows, ['Issue', 'Severity', 'Pages', 'Elements', 'Example pages'], 'No accessibility issues found.')}
  ${section('Console errors', consoleRows, ['Error', 'Pages', 'Example pages'], 'No console errors found.')}
  ${lighthouse.length ? section('Lighthouse', lighthouseRows, ['Page', ...categories.map(escape)], '') : ''}
  ${failures.length ? section('Other failed tests', failureRows, ['Test', 'Error'], '') : ''}
</main>
</body>
</html>
`;

    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, html);

    // A link to the summary at the top of the HTML report, which has no
    // setting for extra content. The report renders into its own element.
    const report = path.join(path.dirname(this.file), 'index.html');
    if (fs.existsSync(report)) {
      const bar = `<style>
  #knowit-summary { display: block; padding: 10px 16px; font: 14px/1.4 system-ui, sans-serif; color: #1d1d1f; background: #eef3ff; border-bottom: 1px solid #d0d7de; text-decoration: none; }
  #knowit-summary b { text-decoration: underline; }
  @media (prefers-color-scheme: dark) { #knowit-summary { color: #f5f5f7; background: #1f2a44; border-color: #30363d; } }
</style>
<a id="knowit-summary" href="summary.html">Summary: ${pages.size} pages tested · ${pagesWith(accessibility)} with accessibility issues · ${pagesWith(consoleErrors)} with console errors · ${failed} of ${this.results.size} tests failed — <b>Open summary</b></a>`;
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
