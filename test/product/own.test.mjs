// 직접 만든 시험: 공개 시험이 확인하지 않는 경계·실패·동시성을 새 값과 새 순서로 확인합니다.
// 공개 시험의 값에 맞춘 것이 아니라 계약의 문장을 하나씩 따로 확인합니다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setup, rng, PROJECT_ID } from '../public/harness.mjs';
import { BACKUP_FORMAT, buildBackup, canonicalJson, policyDigest, sha256Text, utf8Length } from '../../vendor/defense-product-contracts/index.mjs';

const snap = (rules, revision = 1) => ({ schema: 'aleph.product.policy.v1', projectId: PROJECT_ID, revision, rules });
const OPEN = { id: 'open', effect: 'allow', match: { zone: 'notes' } };

async function note(env, who, zone = 'notes') {
  const r = await env.call(who, 'POST', `/resources/${zone}`, { data: { n: who } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}

async function readBurst(env, subject, count, startIso, stepMs, prefix) {
  const t0 = Date.parse(startIso);
  const events = Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, at: new Date(t0 + i * stepMs).toISOString(), kind: 'read', subject }));
  const r = await env.call('OP', 'POST', '/events', { events });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return events;
}

async function incidentFor(env, subject = env.users.B.userId, count = 125) {
  await env.activate([OPEN], 0);
  await readBurst(env, subject, count, '2026-10-20T05:00:00.000Z', 1000, 'inc');
  const [incident] = (await env.call('OP', 'GET', '/incidents')).body.items;
  return incident;
}
const order = (env, incident, over = {}) => ({ operationKey: randomUUID(), incidentId: incident.id, target: `subject:${env.users.B.userId}`, action: 'block_subject', payload: { reason: 'burst_read' }, ...over });
const applies = env => env.baseExecutor.log.filter(x => x.kind === 'apply').length;

// ── D1 정책 ──────────────────────────────────────────────────────────────────

test('D1 읽기와 쓰기 권한 나누기: method·role 규칙만으로 표현된다(5차 변경 요구 유형 1 대비)', async () => {
  const env = await setup();
  await env.activate([
    { id: 'hr-read-all', effect: 'allow', match: { zone: 'hr', method: 'GET' } },
    { id: 'hr-write-op', effect: 'allow', match: { zone: 'hr', method: 'POST', role: 'operator' } },
    { id: 'notes-open', effect: 'allow', match: { zone: 'notes' } },
  ], 0);
  const hrByOp = (await env.call('OP', 'POST', '/resources/hr', { data: { x: 1 } }));
  assert.equal(hrByOp.status, 201);
  assert.equal((await env.call('A', 'GET', `/resources/hr/${hrByOp.body.id}`)).status, 200);
  const memberWrite = await env.call('A', 'POST', '/resources/hr', { data: {} });
  assert.equal(memberWrite.status, 403);
  assert.equal(memberWrite.body.error.code, 'policy_denied');
  assert.equal(memberWrite.headers['x-aleph-decision'], 'deny');
  assert.equal((await env.call('A', 'POST', '/resources/notes', { data: {} })).status, 201);
  assert.equal((await env.call('A', 'POST', '/resources/fin', { data: {} })).status, 403, '다른 구역은 바뀌지 않는다');
});

test('D1 높은 priority 가 이기고, 정책을 새 판으로 바꾸면 다음 요청부터 달라진다', async () => {
  const env = await setup();
  await env.activate([{ id: 'base', effect: 'allow', match: { zone: 'notes' } }], 0);
  const id = await note(env, 'A');
  assert.equal((await env.call('B', 'GET', `/resources/notes/${id}`)).status, 200);
  await env.activate([{ id: 'base', effect: 'allow', match: { zone: 'notes' } }, { id: 'lock', effect: 'deny', priority: 9, match: { zone: 'notes', owner: 'other' } }], 1);
  const denied = await env.call('B', 'GET', `/resources/notes/${id}`);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers['x-aleph-rule-ids'], 'lock');
  assert.equal(denied.headers['x-aleph-policy-revision'], '2');
  assert.equal((await env.call('A', 'GET', `/resources/notes/${id}`)).status, 200);
});

test('D1 정책 검사: 모르는 match 항목·이상한 값·중복 id·다른 프로젝트·모양 오류는 422', async () => {
  const env = await setup();
  const draft = snapshot => env.call('OP', 'POST', '/policy/drafts', { snapshot });
  for (const [rules, code] of [
    [[{ id: 'a', effect: 'allow', match: { zone: 'notes', color: 'red' } }], 'policy_rules'],
    [[{ id: 'a', effect: 'allow', match: { method: 'TELEPORT' } }], 'policy_rules'],
    [[{ id: 'a', effect: 'allow', match: { owner: 'mine' } }], 'policy_rules'],
    [[{ id: 'a', effect: 'allow', match: { zone: 'no spaces allowed' } }], 'policy_rules'],
    [[{ id: 'a', effect: 'allow', priority: 1.5 }], 'policy_rules'],
    [[{ id: 'a', effect: 'allow' }, { id: 'a', effect: 'deny' }], 'policy_rule_duplicate'],
  ]) {
    const r = await draft(snap(rules));
    assert.equal(r.status, 422, JSON.stringify(rules));
    assert.equal(r.body.error.code, code);
  }
  assert.equal((await draft({ ...snap([OPEN]), extra: 1 })).body.error.code, 'policy_extra_field');
  assert.equal((await draft(null)).status, 422);
  assert.equal((await draft(snap([OPEN]))).status, 201);
  assert.equal((await env.call('OP', 'POST', '/policy/drafts', null)).status, 422, '초안 본문이 비어 있으면 모양 오류');
});

test('D1 활성화·되돌리기 입력 검사와 기록', async () => {
  const env = await setup();
  const act = body => env.call('OP', 'POST', '/policy/activate', body);
  assert.equal((await act({ draftId: 'nope', expectedRevision: 0 })).status, 404);
  assert.equal((await act({ expectedRevision: 0 })).status, 400);
  const d = (await env.call('OP', 'POST', '/policy/drafts', { snapshot: snap([OPEN], 77) })).body;
  assert.equal((await act({ draftId: d.draftId, expectedRevision: -1 })).status, 400);
  assert.equal((await act({ draftId: d.draftId, expectedRevision: '0' })).status, 400);
  const ok = await act({ draftId: d.draftId, expectedRevision: 0 });
  assert.equal(ok.body.revision, 1, '초안에 적힌 판 번호가 아니라 지금 판 + 1');
  const active = (await env.call('A', 'GET', '/policy')).body;
  assert.equal(active.active.revision, 1);
  assert.equal(active.digest, ok.body.digest);
  assert.equal(active.digest, policyDigest(active.active));
  const rb = n => env.call('OP', 'POST', '/policy/rollback', { toRevision: n, expectedRevision: 1 });
  assert.equal((await rb(9)).status, 404);
  assert.equal((await rb(0)).status, 400);
  assert.equal((await env.call('OP', 'POST', '/policy/rollback', { toRevision: 1, expectedRevision: 5 })).status, 409);
  for (const who of ['A', 'B']) {
    assert.equal((await env.call(who, 'POST', '/policy/activate', { draftId: d.draftId, expectedRevision: 1 })).status, 403);
    assert.equal((await env.call(who, 'POST', '/policy/rollback', { toRevision: 1, expectedRevision: 1 })).status, 403);
  }
  assert.equal((await env.call('OP', 'GET', '/policy/history?limit=1')).body.items.length, 1);
});

test('D1 판 번호 경합: 여럿이 동시에 활성화해도 하나만 성공하고 판 번호는 건너뛰지 않는다', async () => {
  const env = await setup();
  await env.activate([OPEN], 0);
  const drafts = [];
  for (let i = 0; i < 5; i += 1) drafts.push((await env.call('OP', 'POST', '/policy/drafts', { snapshot: snap([{ id: `r${i}`, effect: 'allow' }], 2) })).body.draftId);
  const results = await Promise.all(drafts.map(draftId => env.call('OP', 'POST', '/policy/activate', { draftId, expectedRevision: 1 })));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 4);
  const hist = (await env.call('OP', 'GET', '/policy/history')).body.items;
  assert.deepEqual(hist.map(h => h.revision), [2, 1]);
});

// ── 보호 자원 ────────────────────────────────────────────────────────────────

test('보호 자원: 소유자는 본문이 아니라 토큰으로, 없는 자원은 허용될 때만 404, 거부되면 존재 여부를 흘리지 않는다', async () => {
  const env = await setup();
  await env.activate([{ id: 'own', effect: 'allow', match: { zone: 'notes', owner: 'self' } }, { id: 'w', effect: 'allow', match: { zone: 'notes', method: 'POST' } }], 0);
  const forged = await env.call('A', 'POST', '/resources/notes', { owner: env.users.B.userId, data: { x: 1 } });
  assert.equal(forged.status, 201);
  assert.equal((await env.call('B', 'GET', `/resources/notes/${forged.body.id}`)).status, 403, '본문의 owner 는 믿지 않는다');
  assert.equal((await env.call('A', 'GET', `/resources/notes/${forged.body.id}`)).status, 200);
  // 없는 자원: owner 'self' 만 허용하는 정책에서는 누구에게나 403(존재 여부를 알려 주지 않음)
  assert.equal((await env.call('A', 'GET', '/resources/notes/missing-1')).status, 403);
  await env.activate([OPEN], 1);
  assert.equal((await env.call('A', 'GET', '/resources/notes/missing-1')).status, 404);
  assert.equal((await env.call('A', 'GET', '/resources/not%20ok/x')).status, 400);
  assert.equal((await env.call('A', 'POST', '/resources/notes', { data: () => 1 }).catch(() => ({ status: 400 }))).status >= 200, true);
});

test('차단된 사용자는 정책과 관계없이 읽기·쓰기 모두 403 blocked 이고, 해제하면 돌아온다', async () => {
  const env = await setup();
  const incident = await incidentFor(env);
  const noteB = await note(env, 'B');
  const o = order(env, incident);
  await env.call('OP', 'POST', '/responses', o);
  await env.call('OP', 'POST', `/responses/${o.operationKey}/approve`);
  for (const r of [await env.call('B', 'GET', `/resources/notes/${noteB}`), await env.call('B', 'POST', '/resources/notes', { data: {} })]) {
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'blocked');
  }
  assert.equal((await env.call('A', 'POST', '/resources/notes', { data: {} })).status, 201);
  await env.call('OP', 'POST', `/responses/${o.operationKey}/release`);
  assert.equal((await env.call('B', 'GET', `/resources/notes/${noteB}`)).status, 200);
});

// ── D2 사건 ──────────────────────────────────────────────────────────────────

test('D2 형식 검사: 없는 날짜·시각 형식 오류·빈 문자열·인증값 키는 400 이고 아무것도 저장하지 않는다', async () => {
  const env = await setup();
  const good = { id: 'g-1', at: '2026-10-20T00:00:00.000Z', kind: 'read', subject: 'u' };
  for (const bad of [
    { ...good, at: '2026-02-31T00:00:00.000Z' },
    { ...good, at: '2026-10-20 00:00:00' },
    { ...good, at: 1760918400000 },
    { ...good, id: '' },
    { ...good, kind: '' },
    { ...good, subject: undefined },
    { ...good, token: 'x' },
    { ...good, nested: { Pass_Word: 'x' } },
    'not-an-object',
    null,
  ]) {
    const r = await env.call('OP', 'POST', '/events', { events: [good, bad] });
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.body.error.code, 'event_invalid');
  }
  assert.equal((await env.call('OP', 'POST', '/events', { events: 'x' })).status, 400);
  assert.equal((await env.call('OP', 'POST', '/events', {})).status, 400);
  assert.deepEqual((await env.call('OP', 'GET', '/events')).body.items, []);
});

test('D2 시간대가 달라도 같은 순간이면 시각 순으로 정렬하고, from·to·kind·subject 로 거른다', async () => {
  const env = await setup();
  const events = [
    { id: 'b', at: '2026-10-20T09:00:00+09:00', kind: 'read', subject: 's1' }, // = 00:00Z
    { id: 'a', at: '2026-10-20T00:00:00Z', kind: 'write', subject: 's1' }, // = 00:00Z (id 순으로 a 가 먼저)
    { id: 'c', at: '2026-10-20T00:00:01.5Z', kind: 'read', subject: 's2' },
    { id: 'd', at: '2026-10-19T23:59:59Z', kind: 'read', subject: 's1' },
  ];
  assert.equal((await env.call('OP', 'POST', '/events', { events })).body.accepted, 4);
  const ids = path => env.call('OP', 'GET', path).then(r => r.body.items.map(e => e.id));
  assert.deepEqual(await ids('/events'), ['d', 'a', 'b', 'c']);
  assert.deepEqual(await ids('/events?from=2026-10-20T00:00:00Z&to=2026-10-20T00:00:01Z'), ['a', 'b']);
  assert.deepEqual(await ids('/events?kind=read&subject=s1'), ['d', 'b']);
  assert.equal((await env.call('OP', 'GET', '/events?from=yesterday')).status, 400);
  assert.equal((await env.call('OP', 'GET', '/events?limit=0')).status, 400);
  assert.equal((await env.call('OP', 'GET', '/events?limit=1001')).status, 400);
  assert.equal((await env.call('OP', 'GET', '/events?cursor=%25%25')).status, 400);
  assert.equal((await env.call('A', 'GET', '/events')).status, 403);
  assert.equal((await env.call('A', 'GET', '/incidents')).status, 403);
});

test('D2 사건을 나눠 읽을 때(limit 1) 같은 시각이어도 빠짐·겹침이 없다', async () => {
  const env = await setup();
  const events = ['e', 'b', 'd', 'a', 'c'].map(id => ({ id, at: '2026-10-20T00:00:00.000Z', kind: 'read', subject: 'u' }));
  await env.call('OP', 'POST', '/events', { events });
  const seen = [];
  let cursor;
  for (let i = 0; i < 10; i += 1) {
    const page = (await env.call('OP', 'GET', `/events?limit=1${cursor ? `&cursor=${cursor}` : ''}`)).body;
    seen.push(...page.items.map(e => e.id));
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  assert.deepEqual(seen, ['a', 'b', 'c', 'd', 'e']);
});

test('D2 burst_read 경계: 정확히 600초 간격·섞인 순서·다른 kind·여러 번에 나눠 들어와도 규칙대로', async () => {
  const env = await setup();
  const r = rng(99);
  // 121건이 정확히 600,000ms 에 걸침 → 같은 구간이 아님
  await readBurst(env, 'edge', 121, '2026-10-20T00:00:00.000Z', 5000, 'e');
  // 121건이 599,999ms 안에 들어감(마지막 간격만 줄임)
  const t0 = Date.parse('2026-10-20T01:00:00.000Z');
  const tight = Array.from({ length: 121 }, (_, i) => ({ id: `t-${i}`, at: new Date(t0 + (i === 120 ? 599_999 : i * 4000)).toISOString(), kind: 'read', subject: 'tight' }));
  // 섞어서 두 번에 나눠 보냄
  const shuffled = [...tight].sort(() => r() - 0.5);
  await env.call('OP', 'POST', '/events', { events: shuffled.slice(0, 60) });
  assert.equal((await env.call('OP', 'GET', '/incidents')).body.items.length, 0, '60건만으로는 묶음이 없다');
  await env.call('OP', 'POST', '/events', { events: shuffled.slice(60) });
  // write 121건은 세지 않는다
  const writes = Array.from({ length: 150 }, (_, i) => ({ id: `w-${i}`, at: new Date(t0 + i * 1000).toISOString(), kind: 'write', subject: 'writer' }));
  await env.call('OP', 'POST', '/events', { events: writes });
  const items = (await env.call('OP', 'GET', '/incidents')).body.items;
  assert.deepEqual(items.map(i => i.subject), ['tight']);
  assert.equal(items[0].eventIds.length, 121);
  assert.equal(items[0].firstAt, tight[0].at);
  assert.equal(items[0].lastAt, tight[120].at);
});

test('D2 묶음은 사건이 더 들어오면 같은 id 로 고쳐지고, 다시 넣어도 늘지 않고, 정책 판 번호는 만들 때의 것이다', async () => {
  const env = await setup();
  await env.activate([OPEN], 0);
  await readBurst(env, 'u1', 122, '2026-10-20T00:00:00.000Z', 1000, 'a');
  const first = (await env.call('OP', 'GET', '/incidents')).body.items[0];
  assert.equal(first.policyRevision, 1);
  await env.activate([OPEN, { id: 'x', effect: 'deny' }], 1);
  await readBurst(env, 'u1', 10, '2026-10-20T00:05:00.000Z', 1000, 'b');
  const items = (await env.call('OP', 'GET', '/incidents')).body.items;
  assert.equal(items.length, 1);
  assert.equal(items[0].id, first.id);
  assert.equal(items[0].eventIds.length, 132);
  assert.equal(items[0].policyRevision, 1);
});

// ── D3 대응 ──────────────────────────────────────────────────────────────────

test('D3 승인을 다섯 번 동시에 눌러도 집행은 한 번이고 모두 같은 결과를 돌려준다', async () => {
  const env = await setup();
  const incident = await incidentFor(env);
  const o = order(env, incident);
  await env.call('OP', 'POST', '/responses', o);
  const results = await Promise.all(Array.from({ length: 5 }, () => env.call('OP', 'POST', `/responses/${o.operationKey}/approve`)));
  assert.ok(results.every(r => r.status === 200 && r.body.state === 'succeeded'), JSON.stringify(results.map(r => r.body)));
  assert.equal(applies(env), 1);
  assert.equal((await env.call('OP', 'POST', `/responses/${o.operationKey}/approve`)).body.state, 'succeeded');
  assert.equal(applies(env), 1, '이미 끝난 작업을 다시 승인해도 집행하지 않는다');
});

test('D3 거절한 제안은 승인할 수 없고 집행되지 않으며, 거절은 한 번 더 해도 같은 결과', async () => {
  const env = await setup();
  const incident = await incidentFor(env);
  const o = order(env, incident);
  await env.call('OP', 'POST', '/responses', o);
  assert.equal((await env.call('OP', 'POST', `/responses/${o.operationKey}/reject`)).status, 200);
  assert.equal((await env.call('OP', 'POST', `/responses/${o.operationKey}/reject`)).status, 200);
  const late = await env.call('OP', 'POST', `/responses/${o.operationKey}/approve`);
  assert.equal(late.status, 409);
  assert.equal(late.body.error.code, 'operation_rejected');
  assert.equal(applies(env), 0);
  assert.equal((await env.call('OP', 'GET', `/responses/${o.operationKey}`)).body.approval, 'rejected');
});

test('D3 해제: 집행 전에는 409, 일반 사용자는 403, 두 번 해제해도 같은 결과, 실제 차단이 풀렸는지 확인한 뒤에만 기록한다', async () => {
  const env = await setup();
  const incident = await incidentFor(env);
  const o = order(env, incident);
  await env.call('OP', 'POST', '/responses', o);
  assert.equal((await env.call('OP', 'POST', `/responses/${o.operationKey}/release`)).status, 409);
  await env.call('OP', 'POST', `/responses/${o.operationKey}/approve`);
  assert.equal((await env.call('A', 'POST', `/responses/${o.operationKey}/release`)).status, 403);
  const one = await env.call('OP', 'POST', `/responses/${o.operationKey}/release`);
  const two = await env.call('OP', 'POST', `/responses/${o.operationKey}/release`);
  assert.deepEqual([one.status, one.body], [two.status, two.body]);
  assert.equal(env.baseExecutor.log.filter(x => x.kind === 'release').length, 1);
  const got = (await env.call('OP', 'GET', `/responses/${o.operationKey}`)).body;
  assert.equal(got.state, 'released');
  assert.ok(got.releasedAt && got.executedAt);
  assert.equal(await env.baseExecutor.isBlocked(o.target), false);
});

test('D3 보류된 작업은 다시 승인하면 이어서 집행하고, 이미 집행됐으면 다시 집행하지 않는다', async () => {
  const env = await setup({ faults: ['busy', 'busy', 'busy'] });
  const incident = await incidentFor(env);
  const o = order(env, incident);
  await env.call('OP', 'POST', '/responses', o);
  const held = await env.call('OP', 'POST', `/responses/${o.operationKey}/approve`);
  assert.equal(held.body.state, 'pending');
  assert.equal(held.body.attempts, 3);
  assert.equal(applies(env), 0);
  env.advance(120_000);
  const resumed = await env.call('OP', 'POST', `/responses/${o.operationKey}/approve`);
  assert.equal(resumed.body.state, 'succeeded');
  assert.equal(resumed.body.attempts, 4);
  assert.equal(applies(env), 1);
});

test('D3 응답이 없었던 요청(timeout)은 집행되지 않았음을 확인하고 다시 보내며, 429 는 안내한 시간만큼 기다린다', async () => {
  const timeout = await setup({ faults: ['timeout'] });
  const i1 = await incidentFor(timeout);
  const a = order(timeout, i1);
  await timeout.call('OP', 'POST', '/responses', a);
  const r1 = await timeout.call('OP', 'POST', `/responses/${a.operationKey}/approve`);
  assert.equal(r1.body.state, 'succeeded');
  assert.equal(r1.body.attempts, 2);
  assert.equal(applies(timeout), 1);
  assert.deepEqual(timeout.slept, [1000]);

  const limited = await setup({ faults: ['limited'] });
  const i2 = await incidentFor(limited);
  const b = order(limited, i2);
  await limited.call('OP', 'POST', '/responses', b);
  const r2 = await limited.call('OP', 'POST', `/responses/${b.operationKey}/approve`);
  assert.equal(r2.body.state, 'succeeded');
  assert.deepEqual(limited.slept, [1500], '429 의 대기 안내(1.5초)가 기본 간격(1초)보다 길면 그만큼 기다린다');
});

test('D3 제안 검사: 일반 사용자 403, 작업 키·대상·행동 형식 오류 400, 없는 incident 404, 없는 작업 404', async () => {
  const env = await setup();
  const incident = await incidentFor(env);
  const post = body => env.call('OP', 'POST', '/responses', body);
  assert.equal((await env.call('B', 'POST', '/responses', order(env, incident))).status, 403);
  assert.equal((await post(order(env, incident, { operationKey: 'abc' }))).status, 400);
  assert.equal((await post(order(env, incident, { target: 'user:1' }))).status, 400);
  assert.equal((await post(order(env, incident, { action: 'delete_everything' }))).status, 400);
  assert.equal((await post(order(env, incident, { action: 'block_device' }))).status, 400, 'subject 대상에 device 행동은 맞지 않는다');
  assert.equal((await post(order(env, incident, { incidentId: 'inc-none' }))).status, 404);
  assert.equal((await env.call('OP', 'GET', `/responses/${randomUUID()}`)).status, 404);
  assert.equal((await env.call('OP', 'POST', `/responses/${randomUUID()}/approve`)).status, 404);
  assert.equal((await env.call('OP', 'GET', '/responses/not-a-key')).status, 400);
  const dev = await post(order(env, incident, { target: 'device:abc123', action: 'block_device' }));
  assert.equal(dev.status, 201);
});

// ── D4 복구 ──────────────────────────────────────────────────────────────────

test('D4 일부만 백업·복원: 정책만, 사건만. 사건만 복원하면 정책 판 번호는 그대로', async () => {
  const env = await setup();
  await env.activate([OPEN], 0);
  await env.call('OP', 'POST', '/events', { events: [{ id: 'k-1', at: '2026-10-21T00:00:00.000Z', kind: 'login', subject: 'u' }] });
  const onlyEvents = (await env.call('OP', 'POST', '/backups', { items: ['selected-events.json'] })).body;
  assert.deepEqual(Object.keys(onlyEvents.payload), ['selected-events.json']);
  const onlyPolicy = (await env.call('OP', 'POST', '/backups', { items: ['policy.json'] })).body;
  assert.deepEqual(Object.keys(onlyPolicy.payload), ['policy.json']);
  assert.equal((await env.call('OP', 'POST', '/backups', { items: ['audit.json'] })).status, 400);
  assert.equal((await env.call('OP', 'POST', '/backups', { items: [] })).status, 400);
  const fresh = await setup();
  const r = await fresh.call('OP', 'POST', '/restore', { backup: onlyEvents });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { revision: 0, restored: ['selected-events.json'] });
  assert.equal((await fresh.call('A', 'GET', '/policy')).body.active, null);
  assert.equal((await fresh.call('OP', 'GET', '/events')).body.items.length, 1);
  const again = await fresh.call('OP', 'POST', '/restore', { backup: onlyEvents });
  assert.equal(again.status, 200, '같은 백업을 다시 복원해도 같은 사건은 중복일 뿐 충돌이 아니다');
  assert.equal((await fresh.call('OP', 'GET', '/events')).body.items.length, 1);
});

test('D4 정책이 없으면 정책 백업은 409, 감사 기록은 백업에 담기지 않는다', async () => {
  const env = await setup();
  assert.equal((await env.call('OP', 'POST', '/backups', {})).status, 200, '정책이 없어도 사건 항목은 만들 수 있다');
  assert.equal((await env.call('OP', 'POST', '/backups', { items: ['policy.json'] })).status, 409);
  await env.activate([OPEN], 0);
  const text = JSON.stringify((await env.call('OP', 'POST', '/backups', {})).body);
  assert.ok(!/policy\.activate|events\.ingest|userId/u.test(text), '감사 기록의 내용이 섞이지 않았다');
  assert.equal((await env.call('A', 'POST', '/backups', {})).status, 403);
});

test('D4 복원 도중 충돌이 나면 앞서 처리한 사건과 정책 모두 반영되지 않는다(부분 복원 없음)', async () => {
  const src = await setup();
  await src.activate([{ id: 'src', effect: 'allow' }], 0);
  await src.call('OP', 'POST', '/events', { events: [
    { id: 'm-1', at: '2026-10-21T00:00:00.000Z', kind: 'read', subject: 'u' },
    { id: 'm-2', at: '2026-10-21T00:00:01.000Z', kind: 'read', subject: 'u' },
  ] });
  const backup = (await src.call('OP', 'POST', '/backups', {})).body;
  const dst = await setup();
  await dst.activate([OPEN], 0);
  await dst.call('OP', 'POST', '/events', { events: [{ id: 'm-2', at: '2026-10-21T00:00:01.000Z', kind: 'WRITE', subject: 'u' }] });
  const r = await dst.call('OP', 'POST', '/restore', { backup });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'restore_conflict');
  assert.deepEqual((await dst.call('OP', 'GET', '/events')).body.items.map(e => e.id), ['m-2'], 'm-1 도 저장되지 않았다');
  assert.equal((await dst.call('A', 'GET', '/policy')).body.active.rules[0].id, 'open');
  assert.equal((await dst.call('OP', 'GET', '/policy/history')).body.items.length, 1);
});

test('D4 허용하지 않은 항목·금지 내용·다른 프로젝트·계약 밖 정책 규칙이 든 백업은 422', async () => {
  const env = await setup();
  const withToken = structuredClone(buildBackup({ projectId: PROJECT_ID, items: { 'selected-events.json': [] } }));
  const mk = items => buildBackup({ projectId: PROJECT_ID, items });
  // 계약의 buildBackup 은 금지 내용을 만들어 주지 않으므로, 해시까지 맞춘 나쁜 백업을 손으로 만듭니다.
  const raw = items => {
    const payload = Object.fromEntries(Object.entries(items).map(([name, value]) => [name, canonicalJson(value)]));
    return { format: BACKUP_FORMAT, manifest: { projectId: PROJECT_ID, items: Object.entries(payload).map(([name, text]) => ({ name, sha256: sha256Text(text), bytes: utf8Length(text) })) }, payload };
  };
  const cases = [
    [JSON.stringify({ ...withToken, payload: { 'audit.json': '[]' } }), 'backup_item_unknown'],
    [raw({ 'policy.json': snap([{ id: 'p', effect: 'allow', match: { zone: 'x', token: 'y' } }]) }), 'backup_forbidden_content'],
    [raw({ 'selected-events.json': [{ id: 'e', at: '2026-10-21T00:00:00Z', kind: 'read', subject: 'u', password: 'x' }] }), 'backup_forbidden_content'],
    [mk({ 'policy.json': snap([{ id: 'p', effect: 'allow', match: { teleport: true } }]) }), 'policy_rules'],
    [mk({ 'selected-events.json': [{ id: 'e', at: '2026-10-21T00:00:00Z', kind: 'read', subject: 'u' }] }), null],
  ];
  for (const [backup, code] of cases) {
    const r = await env.call('OP', 'POST', '/restore', { backup });
    if (code === null) { assert.equal(r.status, 200); continue; }
    assert.equal(r.status, 422, JSON.stringify(r.body));
    assert.equal(r.body.error.code, code);
  }
  assert.equal((await env.call('OP', 'POST', '/restore', {})).status, 422);
  assert.equal((await env.call('OP', 'POST', '/restore', { backup: 'not json' })).status, 422);
  assert.equal((await env.call('A', 'POST', '/restore', { backup: 'x' })).status, 403);
});

test('D4 복원한 사건으로 burst_read 묶음도 다시 만들어지고, 감사 기록은 어떤 경우에도 줄지 않는다', async () => {
  const src = await setup();
  await src.activate([OPEN], 0);
  await readBurst(src, 'u-burst', 125, '2026-10-20T00:00:00.000Z', 1000, 'z');
  const backup = (await src.call('OP', 'POST', '/backups', {})).body;
  const dst = await setup();
  const before = (await dst.store.list('audit')).length;
  const r = await dst.call('OP', 'POST', '/restore', { backup });
  assert.equal(r.status, 200);
  assert.equal((await dst.call('OP', 'GET', '/incidents')).body.items.length, 1);
  const mid = (await dst.store.list('audit')).length;
  assert.ok(mid > before);
  await dst.call('OP', 'POST', '/restore', { backup: { format: 'zip' } });
  assert.equal((await dst.store.list('audit')).length, mid);
});

// ── 감사 기록 ────────────────────────────────────────────────────────────────

test('감사 기록: 정책·사건·대응·복구 변경이 남고, 토큰·비밀번호 값은 담기지 않는다', async () => {
  const env = await setup();
  const incident = await incidentFor(env);
  const o = order(env, incident);
  await env.call('OP', 'POST', '/responses', o);
  await env.call('OP', 'POST', `/responses/${o.operationKey}/approve`);
  await env.call('OP', 'POST', `/responses/${o.operationKey}/release`);
  await env.call('OP', 'POST', '/backups', {});
  const actions = (await env.store.list('audit')).map(r => r.value.action);
  for (const want of ['policy.edit', 'events.ingest', 'response.create', 'response.approve', 'response.succeeded', 'response.release', 'backup.create']) {
    assert.ok(actions.includes(want), `${want} 가 감사 기록에 있어야 합니다: ${actions}`);
  }
  const text = JSON.stringify(await env.store.list('audit'));
  for (const u of Object.values(env.users)) assert.ok(!text.includes(u.token), '토큰이 감사 기록에 있으면 안 됩니다');
});
