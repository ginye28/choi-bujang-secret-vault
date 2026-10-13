import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';

const NOTE_ID = '0b2f9d3e-6a14-4a39-8f0e-3d1c7a9b5e21';

function request(method, path, route, overrides = {}) {
  return {
    schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture',
    projectId: 'project_fixture', subjectId: 'learner_fixture', deviceId: 'a'.repeat(16),
    service: path.split('/')[1], method, path, route,
    queryLength: 0, querySha256: createHash('sha256').update('').digest('hex'),
    at: new Date().toISOString(), policyRevision: 1, deviceRegistered: true,
    stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
    ...overrides,
  };
}

const outcome = async (r) => {
  const out = await decide(r);
  return { decision: out.decision, reasonCode: out.reasonCode, ruleIds: out.ruleIds };
};

test('자기 메모 읽기·수정은 허용된다', async () => {
  for (const [method, path, route] of [
    ['GET', `/notes/${NOTE_ID}`, 'GET /notes/:id'],
    ['PUT', `/notes/${NOTE_ID}`, 'PUT /notes/:id'],
    ['GET', '/notes/demo', 'GET /notes/:id'],
  ]) {
    const out = await outcome(request(method, path, route));
    assert.equal(out.decision, 'allow', `${route} ${path}`);
    assert.ok(out.ruleIds.every((id) => RULE_IDS.includes(id)));
  }
});

test('목록·생성·삭제는 구역 규칙이 열지 않고, 쿼리가 붙은 자료 경로도 거부한다', async () => {
  for (const [method, path, route] of [
    ['GET', '/notes', 'GET /notes'],
    ['POST', '/notes', 'POST /notes'],
    ['DELETE', `/notes/${NOTE_ID}`, 'DELETE /notes/:id'],
  ]) {
    const out = await outcome(request(method, path, route));
    assert.deepEqual([out.decision, out.reasonCode], ['deny', 'route_not_allowed'], `${route}`);
  }

  for (const [method, path, route] of [
    ['GET', `/notes/${NOTE_ID}`, 'GET /notes/:id'],
    ['GET', '/notes', 'GET /notes'],
    ['PUT', `/notes/${NOTE_ID}`, 'PUT /notes/:id'],
  ]) {
    const out = await outcome(request(method, path, route, { queryLength: 14 }));
    assert.deepEqual([out.decision, out.reasonCode], ['deny', 'query_not_allowed'], `${route} ?query`);
  }
});

test('ID에 소유자 표지가 있으면 subjectId와 일치하는 메모만 허용한다', async () => {
  const own = await outcome(request('GET', '/notes/memo_learner_fixture_note', 'GET /notes/:id'));
  assert.deepEqual([own.decision, own.reasonCode], ['allow', 'approved']);

  const other = await outcome(request('GET', '/notes/memo_learner_other_note', 'GET /notes/:id'));
  assert.deepEqual([other.decision, other.reasonCode], ['deny', 'zone_other_owner']);

  const unmarked = await outcome(request('GET', '/notes/memo_without_owner_marker', 'GET /notes/:id'));
  assert.deepEqual([unmarked.decision, unmarked.reasonCode], ['allow', 'approved']);
});

test('공지는 읽을 수 있고 일반 학생의 공지 수정은 거부된다', async () => {
  const read = await outcome(request('GET', '/announcements/announcement_1', 'GET /announcements/:id'));
  assert.equal(read.decision, 'allow');
  for (const [method, path, route] of [
    ['PUT', '/announcements/announcement_1', 'PUT /announcements/:id'],
    ['PATCH', '/announcements/announcement_1', 'PATCH /announcements/:id'],
    ['DELETE', '/announcements/announcement_1', 'DELETE /announcements/:id'],
    ['POST', '/announcements', 'POST /announcements'],
    ['PUT', '/notes/announcement_1', 'PUT /notes/:id'],
  ]) {
    const out = await outcome(request(method, path, route));
    assert.deepEqual([out.decision, out.reasonCode], ['deny', 'announcement_write_denied'], route);
  }
});

test('알 수 없는 경로·기능 단어·깊이가 다른 경로는 거부된다', async () => {
  for (const [method, path, route] of [
    ['GET', '/notes/export', 'GET /notes/:id'],
    ['GET', `/notes/${NOTE_ID}/export`, 'GET /notes/:id/export'],
    ['GET', `/notes/${NOTE_ID}/export`, 'GET /notes/:id'],
    ['GET', '/admin', 'GET /admin'],
    ['GET', '/notes/a%2Fb', 'GET /notes/:id'],
    ['PUT', '/notes', 'PUT /notes'],
  ]) {
    const out = await outcome(request(method, path, route));
    assert.equal(out.decision, 'deny', `${route} ${path}`);
    assert.equal(out.reasonCode, 'route_not_allowed', `${route} ${path}`);
  }
});

test('미등록 기기는 구역과 관계없이 먼저 거부되고 이전 규칙은 유지된다', async () => {
  const unregistered = await outcome(request('GET', `/notes/${NOTE_ID}`, 'GET /notes/:id',
    { deviceRegistered: false }));
  assert.deepEqual([unregistered.decision, unregistered.reasonCode], ['deny', 'device_not_registered']);

  const suspicious = await outcome(request('GET', `/notes/${NOTE_ID}`, 'GET /notes/:id', {
    signals: { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 },
    recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }],
  }));
  assert.deepEqual([suspicious.decision, suspicious.reasonCode], ['step_up', 'step_up_required']);
});
