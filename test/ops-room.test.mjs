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

test('가린 복구 요약은 메모 사본만 세고 본문·전체 ID·기기 기록은 제외한다', () => {
  const id = '0b2f9d3e-6a14-4a39-8f0e-3d1c7a9b5e21';
  const summary = summarizeRecovery([
    { title: `__backup__:${id}:0123456789abcdef`, created_at: '2026-10-13T01:00:00Z', content: '비밀 본문' },
    { title: '__backup__:device:abcdef0123456789', created_at: '2026-10-13T02:00:00Z', content: '기기 기록' },
    { title: '일반 메모 제목', created_at: '2026-10-13T03:00:00Z' },
  ]);
  assert.equal(summary.versionCount, 1);
  assert.equal(summary.noteCount, 1);
  assert.equal(summary.versions[0].noteRef, '0b2f9d3e…');
  const text = JSON.stringify(summary);
  assert.equal(text.includes(id), false);
  assert.equal(text.includes('비밀 본문'), false);
  assert.equal(text.includes('기기 기록'), false);
  assert.equal(text.includes('일반 메모'), false);
});

test('실제 배포 API 기록과 코드 직접 호출 결과의 출처를 구별하며 나머지 서버 필드는 제외한다', async () => {
  const rows = await runLocalChecks();
  const deployed = [{
    id: 'd12_probe', stage: '12', scenario: '가린 경로 확인', expected: 'HTTP 401', actual: 'HTTP 401',
    requestId: 'vercel-request-1', checkedAt: '2026-10-13T01:00:00Z', status: STATUS_RAN_MATCHED,
    serverBody: '가상 메모 본문', secretHeader: 'secret-token',
  }];
  const report = buildOpsReport({ rows, deployedRows: deployed, recovery: [], devices: [] });
  const directRow = report.verification.rows.find((item) => item.id === rows[0].id);
  const deployedRow = report.verification.rows.find((item) => item.id === 'd12_probe');
  assert.equal(directRow.source, '코드 직접 호출');
  assert.equal(deployedRow.source, '배포 API 응답');
  assert.equal(report.verification.executed, rows.length + deployed.length);
  assert.equal(report.verification.matched, report.verification.rows.filter((item) => item.status === STATUS_RAN_MATCHED).length);
  assert.equal(report.verification.mismatched, report.verification.rows.length - report.verification.matched);
  assert.equal(report.verification.notRun, report.verification.pending.length);
  const json = JSON.stringify(report);
  assert.equal(json.includes('가상 메모 본문'), false);
  assert.equal(json.includes('secret-token'), false);
});

test('복구 수치는 메모 사본만 집계하고, 기기 상태 수치 합은 전체와 일치한다', () => {
  const summary = summarizeRecovery([
    { title: '__backup__:note-identifier-123456:0123456789abcdef', created_at: '2026-10-13T01:00:00Z', content: '가상 본문 제외' },
    { title: '__backup__:device:abcdef0123456789', created_at: '2026-10-13T02:00:00Z', content: '기기 기록 제외' },
  ]);
  assert.equal(summary.versionCount, 1);
  assert.equal(summary.noteCount, 1);
  const json = JSON.stringify(summary);
  assert.equal(json.includes('note-identifier-123456'), false);
  assert.equal(json.includes('가상 본문 제외'), false);
  assert.equal(json.includes('기기 기록 제외'), false);
  assert.deepEqual(
    summarizeDevices([{ status: 'approved' }, { status: 'pending' }, { status: 'x' }, null]),
    { approved: 1, pending: 1, other: 2, total: 4 },
  );
});

test('화면은 보호된 /api/ops 응답을 textContent로 표시하고 가상 메모 본문 및 브라우저 저장소를 쓰지 않는다', () => {
  const page = read('public/index.html');
  assert.ok(page.includes('탈환 작전실'));
  assert.ok(page.includes("'/api/ops'"));
  assert.ok(page.includes('events.recordedTotal'));
  assert.ok(page.includes('judge.status'));
  assert.ok(page.includes('item.route'));
  assert.ok(page.includes('item.reason'));
  assert.equal(page.includes('localStorage'), false);
  assert.equal(page.includes('sessionStorage'), false);
  assert.equal(page.includes('indexedDB'), false);
  assert.equal(page.includes('innerHTML'), false);
  const api = read('api/ops.js');
  assert.ok(api.includes('checkDeviceProof'));
  assert.equal(/\.select\([^)]*content/u.test(api), false, '작전실 API는 복구용 content 열을 읽지 않는다');
});

test('설정에 12단계와 작전실 경로가 들어 있다', () => {
  const config = JSON.parse(read('aleph.config.json'));
  assert.equal(config.step, 12);
  assert.ok(config.allowedRoutes.includes('GET /api/ops'));
});
