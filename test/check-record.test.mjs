import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BLOCKED_STATUS, classifyAttempt, runAttackChecks, UNSENT_CHECKS } from '../src/attack-check.mjs';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCheckRecord, loadCheckRecord, summarizeCheckRecord } from '../src/check-record.mjs';
import { buildOpsReport, runLocalChecks } from '../src/ops-room.mjs';
import checksHandler from '../api/checks.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('관측 값은 HTTP 상태로만 막음·뚫림·미실행을 나눈다', () => {
  assert.equal(classifyAttempt({ attackId: 'anonymous_ops_room_rejected', observed: 'HTTP 401; method=GET' }), 'blocked');
  assert.equal(classifyAttempt({ attackId: 'anonymous_ops_room_rejected', observed: 'HTTP 404; method=GET' }), 'breached');
  assert.equal(classifyAttempt({ attackId: 'anonymous_notes_list_rejected', observed: 'HTTP 200; method=GET' }), 'breached');
  assert.equal(classifyAttempt({ attackId: 'anonymous_notes_list_rejected', observed: 'not_run' }), 'not_run');
  assert.equal(classifyAttempt({ attackId: 'unknown_check', observed: 'HTTP 401; method=GET' }), 'breached');
});

test('기록의 수치는 점검을 하나씩 센 값이고 합이 점검 수와 같다', () => {
  const record = buildCheckRecord([
    { attackId: 'anonymous_ops_room_rejected', expected: 'HTTP 401', observed: 'HTTP 401; method=GET' },
    { attackId: 'anonymous_notes_list_rejected', expected: 'HTTP 401', observed: 'HTTP 200; method=GET' },
    { attackId: 'anonymous_device_route_rejected', expected: 'HTTP 401', observed: 'not_run' },
  ], { checkedAt: new Date('2026-10-13T00:00:00Z') });
  const summary = summarizeCheckRecord(record);
  assert.deepEqual(summary.recorded, { total: 3, blocked: 1, breached: 1, notRun: 1 });
  // 41종 기준: 응답이 기록된 2종만 실행, 나머지 39종(보내지 못한 1건 포함)은 미실행.
  assert.deepEqual(summary.counts, { total: 41, executed: 2, blocked: 1, breached: 1, notRun: 39 });
  assert.equal(summary.counts.executed + summary.counts.notRun, 41);
  assert.equal(summary.checkedAt, '2026-10-13T00:00:00.000Z');
  assert.deepEqual(summarizeCheckRecord(null).counts, { total: 41, executed: 0, blocked: 0, breached: 0, notRun: 41 });
  assert.equal(summarizeCheckRecord(null).available, false);
});

test('커밋된 기록은 제출 점검과 같은 점검 이름을 담고, /api/checks·/api/ops 가 같은 수치를 준다', async () => {
  const record = JSON.parse(read('docs/check-record.json'));
  const ids = record.attempts.map((item) => item.attackId).sort();
  assert.deepEqual(ids, [...Object.keys(BLOCKED_STATUS), ...UNSENT_CHECKS.map(([id]) => id)].sort());
  for (const [id] of UNSENT_CHECKS) {
    const item = record.attempts.find((attempt) => attempt.attackId === id);
    assert.equal(item.observed, 'not_run');
    assert.equal(item.result, 'not_run');
  }
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
  assert.deepEqual(body.counts, summarizeCheckRecord(loadCheckRecord()).counts);
  const report = buildOpsReport({ rows: await runLocalChecks(), recovery: [], devices: [], checkRecord: loadCheckRecord() });
  assert.deepEqual(report.checks.counts, body.counts);
});

test('방금 만든 제출 묶음이 있으면 그 결과(미실행 포함)로 세고, 없으면 커밋된 기록을 쓴다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'checks-'));
  const base = { bundleUrl: pathToFileURL(join(dir, 'artifacts', 'submission.json')), recordUrl: pathToFileURL(join(dir, 'docs', 'check-record.json')) };
  assert.equal(loadCheckRecord(base), null);
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'check-record.json'), JSON.stringify(buildCheckRecord([
    { attackId: 'anonymous_ops_room_rejected', expected: 'HTTP 401', observed: 'HTTP 401; method=GET' },
  ])));
  assert.equal(loadCheckRecord(base).source, 'docs/check-record.json');
  mkdirSync(join(dir, 'artifacts'));
  writeFileSync(join(dir, 'artifacts', 'submission.json'), JSON.stringify({
    schema: 'aleph.defense.submission.v2',
    attackAttempts: [
      { attackId: 'anonymous_ops_room_rejected', expected: 'HTTP 401', observed: 'HTTP 401; method=GET' },
      { attackId: 'anonymous_device_route_rejected', expected: 'HTTP 401', observed: 'not_run' },
    ],
  }));
  const summary = summarizeCheckRecord(loadCheckRecord(base));
  assert.equal(summary.source, 'artifacts/submission.json');
  assert.deepEqual(summary.recorded, { total: 2, blocked: 1, breached: 0, notRun: 1 });
  assert.deepEqual(summary.counts, { total: 41, executed: 1, blocked: 1, breached: 0, notRun: 40 });
});

test('제출 점검 기록과 같은 응답을 받으면 같은 결과가 나온다', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', { status: 401 });
    const attempts = await runAttackChecks({
      step: 12, publicAppUrl: 'https://student-defense.vercel.app/', originalApiUrl: 'https://db.example.org/rest/v1/notes',
    });
    const summary = summarizeCheckRecord(buildCheckRecord(attempts));
    const sent = Object.keys(BLOCKED_STATUS).length;
    const unsent = UNSENT_CHECKS.length;
    assert.equal(attempts.length, sent + unsent);
    assert.deepEqual(summary.recorded, { total: sent + unsent, blocked: sent, breached: 0, notRun: unsent });
    assert.deepEqual(summary.counts, { total: 41, executed: sent, blocked: sent, breached: 0, notRun: 41 - sent });
    for (const attempt of attempts) {
      assert.deepEqual(Object.keys(attempt).sort(), ['attackId', 'expected', 'observed', 'result', 'stage']);
      assert.equal(attempt.result, attempt.observed === 'not_run' ? 'not_run' : 'blocked');
      assert.ok(Number.isInteger(attempt.stage));
    }
    globalThis.fetch = async () => { throw new TypeError('blocked by sandbox'); };
    const offline = await runAttackChecks('https://student-defense.vercel.app/');
    assert.ok(offline.every((attempt) => attempt.observed === 'not_run' && attempt.result === 'not_run'));
    assert.deepEqual(summarizeCheckRecord(buildCheckRecord(offline)).counts,
      { total: 41, executed: 0, blocked: 0, breached: 0, notRun: 41 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('화면은 /api/checks 응답 값만 textContent 로 표시한다', () => {
  const page = read('public/index.html');
  for (const word of ["fetch('/api/checks'", 'checksSummaryText(checks)', 'checksSummaryText(report.checks)', '실행하지 않은 시험', '뚫린 공격', '41종 시험 기준']) {
    assert.ok(page.includes(word), word);
  }
  assert.equal(page.includes('innerHTML'), false);
});
