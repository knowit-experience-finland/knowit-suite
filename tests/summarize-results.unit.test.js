import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  renderSummaryHtml,
  summarizeFragments,
  summarizeReport,
} from '../scripts/summarize-results.js';

const attachment = (name, data) => ({
  name,
  contentType: 'application/json',
  body: Buffer.from(JSON.stringify(data)).toString('base64'),
});

test('groups matching accessibility and console issues by URL', () => {
  const report = {
    suites: [
      {
        specs: [
          {
            tests: [
              {
                results: [
                  {
                    status: 'failed',
                    attachments: [
                      attachment('accessibility-violations.json', {
                        url: 'https://example.com/one',
                        violations: [
                          {
                            id: 'button-name',
                            help: 'Buttons must have discernible text',
                            impact: 'critical',
                            nodes: [
                              {
                                html: '<button></button>',
                                target: ['button.submit'],
                                failureSummary: 'Fix the button label',
                              },
                            ],
                          },
                        ],
                      }),
                    ],
                  },
                ],
              },
              {
                results: [
                  {
                    status: 'failed',
                    attachments: [
                      attachment('accessibility-violations.json', {
                        url: 'https://example.com/two',
                        violations: [
                          {
                            id: 'button-name',
                            help: 'Buttons must have discernible text',
                            impact: 'critical',
                            nodes: [
                              {
                                html: '<button></button>',
                                target: ['button.submit'],
                                failureSummary: 'Fix the button label',
                              },
                            ],
                          },
                        ],
                      }),
                      attachment('console-errors.json', {
                        url: 'https://example.com/two',
                        errors: [{ type: 'error', message: 'API failed' }],
                      }),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const summary = summarizeReport(report);

  assert.deepEqual(summary.totals, { issues: 2, affectedUrls: 2 });
  assert.deepEqual(summary.issues[0].urls, [
    'https://example.com/one',
    'https://example.com/two',
  ]);
  assert.equal(summary.issues[0].id, 'button-name');
  assert.deepEqual(summary.issues[0].nodes, [
    {
      html: '<button></button>',
      target: ['button.submit'],
      failureSummary: 'Fix the button label',
      urls: ['https://example.com/one', 'https://example.com/two'],
    },
  ]);
  assert.equal(summary.issues[1].error, 'API failed');
});

test('includes unstructured test failures using their URL annotation', () => {
  const summary = summarizeReport({
    suites: [
      {
        specs: [
          {
            tests: [
              {
                annotations: [
                  { type: 'url', description: 'https://example.com/broken' },
                ],
                results: [
                  {
                    status: 'failed',
                    attachments: [],
                    errors: [{ message: 'Expected response to be OK' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(summary.issues[0].type, 'test');
  assert.deepEqual(summary.issues[0].urls, ['https://example.com/broken']);
});

test('summarizes issue fragments and renders an HTML report', () => {
  const summary = summarizeFragments([
    {
      name: 'test-errors.json',
      data: {
        url: 'https://example.com/broken',
        errors: [{ message: 'Gateway timeout' }],
      },
    },
  ]);
  const html = renderSummaryHtml(summary);

  assert.equal(summary.issues[0].error, 'Gateway timeout');
  assert.match(html, /Issue summary/);
  assert.match(html, /https:\/\/example\.com\/broken/);
});
