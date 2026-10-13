import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BLOCKED_STATUS, classifyAttempt, runAttackChecks } from '../src/attack-check.mjs';
import { buildCheckRecord, summarizeCheckRecord } from '../src/check-record.mjs';
import { buildOpsReport, runLocalChecks } from '../src/ops-room.mjs';
import checksHandler from '../api/checks.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('관측 값은 HTTP 상태로만 막음·뚫림·미실행을 나눈다', () => {
  assert.equal(classifyAttempt({ attackId: 'public_data_json_gone', observed: 'HTTP 404; method=GET' }), 'blocked');
  assert.equal(classifyAttempt({ attackId: 'anonymous_notes_list_rejected', observed: 'HTTP 200; method=GET' }), 'breached');
  assert.equal(classifyAttempt({ attackId: 'anonymous_notes_list_rejected', observed: 'not_run' }), 'not_run');
  assert.equal(classifyAttempt({ attackId: 'unknown_check', observed: 'HTTP 401; method=GET' }), 'breached');
});

test('기록의 수치는 점검을 하나씩 센 값이고 합이 점검 수와 같다', () => {
  const record = buildCheckRecord([
    { attackId: 'public_data_json_gone', expected: 'HTTP 404', observed: 'HTTP 404; method=GET' },
    { attackId: 'anonymous_notes_list_rejected', expected: 'HTTP 401', observed: 'HTTP 200; method=GET' },
    { attackId: 'direct_original_api_denied', expected: 'HTTP 401', observed: 'not_run' },
  ], { checkedAt: new Date('2026-10-13T00:00:00Z') });
  const summary = summarizeCheckRecord(record);
  assert.deepEqual(summary.counts, { total: 3, blocked: 1, breached: 1, notRun: 1 });
  assert.equal(summary.checkedAt, '2026-10-13T00:00:00.000Z');
  assert.deepEqual(summary.judgeSuite, { total: 41, recorded: 0, status: '미실행' });
  assert.deepEqual(summarizeCheckRecord(null).counts, { total: 0, blocked: 0, breached: 0, notRun: 0 });
  assert.equal(summarizeCheckRecord(null).available, false);
});

test('커밋된 기록은 제출 점검과 같은 점검 이름을 담고, /api/checks·/api/ops 가 같은 수치를 준다', async () => {
  const record = JSON.parse(read('docs/check-record.json'));
  const ids = record.attempts.map((item) => item.attackId).sort();
  assert.deepEqual(ids, Object.keys(BLOCKED_STATUS).sort());
  assert.equal(JSON.stringify(record).includes('https://'), false);

  let status;
  let body;
  const headers = {};
  await checksHandler({ method: 'GET', url: '/api/checks', headers: {} }, {
    setHeader: (name, value) => { headers[name] = value; },
    status(code) { status = code; return this; },
    json(value) { body = value; return this; },
  });
  assert.equal(status, 200);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.deepEqual(body.counts, summarizeCheckRecord(record).counts);
  const report = buildOpsReport({ rows: await runLocalChecks(), recovery: [], devices: [], checkRecord: record });
  assert.deepEqual(report.checks.counts, body.counts);
});

test('제출 점검 기록과 같은 응답을 받으면 같은 결과가 나온다', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => new Response('{}', { status: String(url).endsWith('/data.json') ? 404 : 401 });
    const attempts = await runAttackChecks({
      step: 12, publicAppUrl: 'https://student-defense.vercel.app/', originalApiUrl: 'https://db.example.org/rest/v1/notes',
    });
    const summary = summarizeCheckRecord(buildCheckRecord(attempts));
    assert.deepEqual(summary.counts, { total: attempts.length, blocked: attempts.length, breached: 0, notRun: 0 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('화면은 /api/checks 응답 값만 textContent 로 표시한다', () => {
  const page = read('public/index.html');
  for (const word of ["fetch('/api/checks'", 'checksSummaryText(checks)', 'checksSummaryText(report.checks)', '실행하지 않은 점검', '뚫린 공격']) {
    assert.ok(page.includes(word), word);
  }
  assert.equal(page.includes('innerHTML'), false);
});
