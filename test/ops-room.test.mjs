import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildOpsReport, PENDING_CHECKS, runLocalChecks, STATUS_NOT_RUN, STATUS_RAN_MATCHED, summarizeDevices,
  summarizeRecovery,
} from '../src/ops-room.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('코드 직접 호출 점검 전부가 실행·일치이고 요청 ID와 시각이 있다', async () => {
  const rows = await runLocalChecks();
  assert.ok(rows.length >= 19);
  for (const item of rows) {
    assert.equal(item.status, STATUS_RAN_MATCHED, `${item.id}: ${item.actual}`);
    assert.ok(item.requestId && item.checkedAt && item.expected && item.actual);
  }
  const stages = new Set(rows.map((item) => item.stage));
  for (const stage of ['6', '7', '8', '9', '10', '11', '12']) assert.ok(stages.has(stage), `단계 ${stage}`);
});

test('총공세 세 가지: 연속 조회·회수 신원 재전송·복구 뒤 서명 없는 변경', async () => {
  const rows = await runLocalChecks();
  for (const id of ['s12_auth_then_other', 's12_unregistered_then_revoked', 's12_after_restore']) {
    assert.equal(rows.find((item) => item.id === id)?.status, STATUS_RAN_MATCHED, id);
  }
});

test('미실행 점검은 통과로 세지 않고 이유를 남긴다', async () => {
  const rows = await runLocalChecks();
  const report = buildOpsReport({ rows, recovery: [], devices: [] });
  assert.equal(report.verification.notRun, PENDING_CHECKS.length);
  assert.equal(report.verification.executed, rows.length);
  assert.equal(report.verification.matched + report.verification.mismatched, rows.length);
  for (const item of report.verification.pending) {
    assert.equal(item.status, STATUS_NOT_RUN);
    assert.ok(item.reason.length > 5);
  }
  assert.equal(report.judgeSuite.total, 41);
  assert.equal(report.judgeSuite.runByStudent, 0);
  assert.equal(report.detection.engineConnected, false);
});

test('복구 버전 요약은 메모 ID를 가리고 제목·본문을 담지 않는다', () => {
  const id = '0b2f9d3e-6a14-4a39-8f0e-3d1c7a9b5e21';
  const summary = summarizeRecovery([
    { title: `__backup__:${id}:0123456789abcdef`, created_at: '2026-10-13T01:00:00Z', content: '비밀 본문' },
    { title: '__backup__:device:abcdef0123456789', created_at: '2026-10-13T02:00:00Z' },
    { title: '일반 메모 제목', created_at: '2026-10-13T03:00:00Z' },
  ]);
  assert.equal(summary.versionCount, 1);
  assert.equal(summary.noteCount, 1);
  assert.equal(summary.versions[0].noteRef, '0b2f9d3e…');
  const text = JSON.stringify(summary);
  assert.equal(text.includes(id), false);
  assert.equal(text.includes('비밀 본문'), false);
  assert.equal(text.includes('일반 메모'), false);
});

test('기기 상태 요약은 승인·대기·기타를 센다', () => {
  assert.deepEqual(
    summarizeDevices([{ status: 'approved' }, { status: 'pending' }, { status: 'x' }, null]),
    { approved: 1, pending: 1, other: 2, total: 4 },
  );
});

test('화면은 /api/ops 응답만 쓰고 브라우저 저장소를 쓰지 않는다', () => {
  const page = read('public/index.html');
  assert.ok(page.includes('탈환 작전실'));
  assert.ok(page.includes("'/api/ops'"));
  assert.equal(page.includes('localStorage'), false);
  assert.equal(page.includes('sessionStorage'), false);
  assert.equal(page.includes('indexedDB'), false);
  assert.equal(page.includes('innerHTML'), false);
  const api = read('api/ops.js');
  assert.ok(api.includes('checkDeviceProof'));
  assert.equal(/\.select\([^)]*content/u.test(api), false, '작전실 API 는 메모 본문 열을 읽지 않는다');
});

test('설정에 12단계와 작전실 경로가 들어 있다', () => {
  const config = JSON.parse(read('aleph.config.json'));
  assert.equal(config.step, 12);
  assert.ok(config.allowedRoutes.includes('GET /api/ops'));
});
