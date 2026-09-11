import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeReport } from '../scripts/summarize-results.js';

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
