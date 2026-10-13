import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  actorRef, attackTagOf, buildEvent, maskedRoute, outcomeOf, requestIdOf, summarizeEvents, TOTAL_ATTACKS,
  withEventLog,
} from '../src/event-log.mjs';
import { buildOpsReport, runLocalChecks } from '../src/ops-room.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function jwtFor(sub) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ sub })}.${'a'.repeat(20)}`;
}

test('점검 이름과 요청 ID 는 안전한 형식만 받는다', () => {
  assert.equal(attackTagOf({ 'x-aleph-attack-id': 'Anonymous_Notes_List_Rejected' }), 'anonymous_notes_list_rejected');
  assert.equal(attackTagOf({ 'x-attack-id': 'ok.id-1' }), 'ok.id-1');
  assert.equal(attackTagOf({ 'x-attack-id': '../etc/passwd' }), null);
  assert.equal(attackTagOf({}), null);
  assert.equal(requestIdOf({ 'x-request-id': 'my_check' }), 'my_check');
  assert.match(requestIdOf({ 'x-request-id': 'bad id!' }), /^[0-9a-f-]{36}$/u);
});

test('경로의 자료 ID 는 가려서 기록한다', () => {
  assert.equal(maskedRoute({ url: '/api/notes/0b2f9d3e-6a14-4a39-8f0e-3d1c7a9b5e21' }), '/api/notes/:id');
  assert.equal(maskedRoute({ url: '/api/notes?id=abc', query: { id: 'abc' } }), '/api/notes/:id');
  assert.equal(maskedRoute({ url: '/api/notes' }), '/api/notes');
  assert.equal(maskedRoute({ url: '/api/ops?x=1' }), '/api/ops');
});

test('기록에는 토큰·이메일·본문 없이 가린 값만 남는다', () => {
  const token = jwtFor('11111111-2222-3333-4444-555555555555');
  const event = buildEvent({
    request: {
      method: 'put', url: '/api/notes/secret-note-id', headers: { authorization: `Bearer ${token}`, 'x-attack-id': 'probe_one' },
      body: { title: '비밀 제목', body: '비밀 본문' },
    },
    status: 403, body: { error: 'FORBIDDEN', message: '메모 본문 abc' }, requestId: 'req-1',
    now: new Date('2026-10-13T00:00:00Z'),
  });
  assert.deepEqual(event.actor, { kind: 'authenticated', ref: actorRef('11111111-2222-3333-4444-555555555555') });
  assert.equal(event.outcome, 'blocked');
  assert.equal(event.reason, 'FORBIDDEN');
  assert.equal(event.attackId, 'probe_one');
  assert.equal(event.route, '/api/notes/:id');
  const text = JSON.stringify(event);
  for (const secret of [token, '비밀', 'secret-note-id', '11111111-2222']) assert.equal(text.includes(secret), false, secret);
  assert.equal(outcomeOf(200), 'allowed');
  assert.equal(outcomeOf(401), 'blocked');
  assert.equal(outcomeOf(500), 'error');
});

test('요약: 최근 50줄, 규칙별 거부 수, 막음 n / 41 과 미실행을 실제 기록으로만 센다', () => {
  const make = (index, extra) => ({
    v: 1, requestId: `r${index}`, at: `2026-10-13T00:${String(index % 60).padStart(2, '0')}:00Z`, method: 'GET',
    route: '/api/notes', status: 401, outcome: 'blocked', reason: 'LOGIN_REQUIRED', attackId: null,
    actor: { kind: 'anonymous', ref: null }, ...extra,
  });
  const events = [];
  for (let index = 0; index < 60; index += 1) events.push(make(index));
  events.push(make(100, { attackId: 'a_one' }), make(101, { attackId: 'a_one' }), make(102, { attackId: 'a_two' }));
  events.push(make(103, { attackId: 'a_three', status: 200, outcome: 'allowed', reason: null, actor: { kind: 'authenticated', ref: 'me000000' } }));
  events.push(make(104, { attackId: 'a_other', status: 200, outcome: 'allowed', reason: null, actor: { kind: 'authenticated', ref: 'someoneelse' } }));
  const summary = summarizeEvents(events, 'me000000');
  assert.equal(summary.recent.length, 50);
  assert.equal(summary.assault.total, TOTAL_ATTACKS);
  assert.equal(summary.assault.blocked, 2);
  assert.equal(summary.assault.allowed, 1);
  assert.equal(summary.assault.notRun, TOTAL_ATTACKS - 3);
  assert.deepEqual(summary.denyByRule[0], { rule: 'LOGIN_REQUIRED', count: 63 });
  // 다른 사용자의 로그인 기록은 보이지 않는다.
  assert.equal(summary.recordedTotal, events.length - 1);
  assert.equal(JSON.stringify(summary).includes('someoneelse'), false);
  assert.equal(summarizeEvents([], null).assault.notRun, TOTAL_ATTACKS);
});

test('기록 성공 여부를 모르는 상태는 명시적으로 헤더에 구분한다', async () => {
  const headers = {};
  const sent = [];
  const response = {
    setHeader: (name, value) => { headers[name] = value; },
    status(code) { sent.push(['status', code]); return this; },
    json(body) { sent.push(['json', body]); return this; },
  };
  const wrapped = withEventLog(async (_request, res) => res.status(401).json({ error: 'UNAUTHORIZED', reason: 'LOGIN_REQUIRED' }));
  await wrapped({ method: 'GET', url: '/api/notes', headers: { 'x-request-id': 'probe_two' } }, response);
  assert.equal(headers['X-Request-Id'], 'probe_two');
  // 테스트 프로세스에는 서버 DB 클라이언트가 없으므로 실제 기록 성공으로 표시하지 않습니다.
  assert.equal(headers['X-Event-Logged'], 'no-client');
  assert.deepEqual(sent, [['status', 401], ['json', { error: 'UNAUTHORIZED', reason: 'LOGIN_REQUIRED' }]]);
});

test('작전실은 가린 서버 기록과 일치하는 요약만 제공하고 화면 수치는 그 응답을 렌더링한다', async () => {
  const rows = await runLocalChecks();
  const secretId = 'secret-virtual-note-id';
  const event = buildEvent({
    request: {
      method: 'GET', url: `/api/notes/${secretId}?private=query`, headers: { 'x-aleph-attack-id': 'anonymous_note_probe' },
      body: { title: '가상 제목', body: '가상 메모 본문' },
    },
    status: 401, body: { error: 'UNAUTHORIZED', reason: 'LOGIN_REQUIRED' },
    requestId: 'server-request-42', now: new Date('2026-10-13T00:00:00Z'),
  });
  const events = { ...summarizeEvents([event], null), available: true };
  const report = buildOpsReport({ rows, recovery: [], devices: [], events });
  assert.equal(report.events.recordedTotal, 1);
  assert.equal(report.events.recent.length, 1);
  assert.equal(report.events.recent[0].route, '/api/notes/:id');
  assert.equal(report.events.recent[0].requestId, 'server-request-42');
  assert.equal(report.events.denyByRule.find((item) => item.rule === 'LOGIN_REQUIRED')?.count, 1);
  assert.deepEqual(report.events.assault, { total: 41, blocked: 1, allowed: 0, errors: 0, notRun: 40 });
  const json = JSON.stringify(report.events);
  assert.equal(json.includes(secretId), false);
  assert.equal(json.includes('private=query'), false);
  assert.equal(json.includes('가상 메모 본문'), false);
  const page = read('public/index.html');
  for (const label of ['최근 사건 50줄', '규칙별 거부 수', '총공세 막음']) assert.ok(page.includes(label), label);
  assert.ok(page.includes('events.recordedTotal'));
  assert.ok(page.includes('assault.blocked'));
  assert.ok(page.includes('item.route'));
  assert.ok(page.includes('item.reason'));
  assert.equal(page.includes('innerHTML'), false);
  for (const name of ['notes', 'announcements', 'restore', 'device', 'ops']) {
    assert.ok(read(`api/${name}.js`).includes('withEventLog(handler)'), name);
  }
});

test('작전실 기록을 읽지 못했을 때는 서버 기록 상태와 공격 미실행을 따로 표시한다', async () => {
  const rows = await runLocalChecks();
  const report = buildOpsReport({ rows, recovery: [], devices: [] });
  assert.equal(report.events.available, false);
  assert.equal(report.events.assault.notRun, TOTAL_ATTACKS);
  assert.equal(report.events.assault.blocked, 0);
  const page = read('public/index.html');
  assert.ok(page.includes('서버 요청 기록을 읽지 못했습니다(미실행).'));
});

test('제출 묶음 점검은 읽기 요청만 보내고 점검 이름을 붙인다', () => {
  const source = read('src/attack-check.mjs');
  assert.equal(/method:\s*'(?:POST|PUT|PATCH|DELETE)'/u.test(source), false);
  assert.ok(source.includes("'x-aleph-attack-id': attackId"));
});
