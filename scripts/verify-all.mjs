import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PENDING_CHECKS, runLocalChecks, STATUS_CODE_MATCHED, STATUS_NOT_RUN, STATUS_RAN_MATCHED, STATUS_RAN_MISMATCHED } from '../src/ops-room.mjs';

// 12단계 점검 기록 만들기: node scripts/verify-all.mjs [--deployed]
// - 항상: 판정기·탐지·정책 사본·기기 서명 코드를 직접 호출한 결과(실행)
// - --deployed: 배포 주소에 로그인 없이 보내는 요청의 HTTP 상태(요청 ID는 x-vercel-id)
// 로그인 토큰이 필요한 호출과 운영 자료를 바꾸는 호출은 보내지 않고 "미실행"으로 남깁니다.
// 결과는 docs/verification-log.json 과 docs/VERIFICATION.md 에 씁니다. 토큰·메모 본문은 기록하지 않습니다.
const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(root, 'aleph.config.json'), 'utf8'));
const withDeployed = process.argv.includes('--deployed');

async function probe(app, spec) {
  const checkedAt = new Date();
  let actual;
  let requestId = '응답 없음';
  let matched = false;
  try {
    const target = spec.absolute ? new URL(spec.path) : new URL(spec.path, app);
    const response = await fetch(target, {
      method: spec.method, redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: { ...(spec.headers ?? {}), ...(spec.absolute ? {} : { 'x-aleph-attack-id': spec.id, 'x-request-id': spec.id }) },
    });
    requestId = response.headers.get('x-vercel-id') ?? response.headers.get('x-request-id') ?? '헤더 없음';
    actual = `HTTP ${response.status}`;
    matched = spec.expected.includes(response.status);
  } catch {
    actual = '요청 실패';
  }
  return {
    id: spec.id, stage: spec.stage, scenario: spec.scenario,
    expected: spec.expected.map((code) => `HTTP ${code}`).join(' 또는 '), actual, requestId,
    checkedAt: checkedAt.toISOString(), status: matched ? STATUS_RAN_MATCHED : STATUS_RAN_MISMATCHED,
  };
}

const probes = [
  { id: 'd2_data_json', stage: '2', method: 'GET', path: '/data.json', expected: [404], scenario: '공개 /data.json 직접 요청' },
  { id: 'd3_notes_list', stage: '3', method: 'GET', path: '/api/notes', expected: [401], scenario: '로그인 없는 GET /api/notes' },
  { id: 'd3_notes_post', stage: '3', method: 'POST', path: '/api/notes', expected: [401], scenario: '로그인 없는 POST /api/notes' },
  { id: 'd4_fake_token', stage: '4', method: 'GET', path: '/api/notes', headers: { Authorization: 'Bearer aaaa.bbbb.cccc' }, expected: [401], scenario: '가짜 Bearer 토큰 GET /api/notes' },
  { id: 'd5_note_item', stage: '5', method: 'GET', path: '/api/notes/00000000-0000-4000-8000-000000000000', expected: [401], scenario: '로그인 없는 메모 상세 조회' },
  { id: 'd5_note_put', stage: '5', method: 'PUT', path: '/api/notes/00000000-0000-4000-8000-000000000000', expected: [401], scenario: '로그인 없는 메모 수정' },
  { id: 'd5_original_api', stage: '5', method: 'GET', absolute: true, path: config.originalApiUrl, expected: [401, 403], scenario: '키 없는 원본 API 직접 요청' },
  { id: 'd8_announcement_post', stage: '8', method: 'POST', path: '/api/announcements', expected: [401, 403], scenario: '로그인 없는 공지 등록' },
  { id: 'd10_restore', stage: '10', method: 'POST', path: '/api/restore', expected: [401], scenario: '로그인 없는 POST /api/restore' },
  { id: 'd11_device', stage: '11', method: 'GET', path: '/api/device', expected: [401], scenario: '로그인 없는 GET /api/device' },
  { id: 'd11_installed_marker', stage: '11', method: 'GET', path: '/api/notes', headers: { 'x-aleph-app': 'installed' }, expected: [401], scenario: '설치 표시만 붙인 로그인 없는 요청' },
  { id: 'd12_ops', stage: '12', method: 'GET', path: '/api/ops', expected: [401], scenario: '로그인 없는 GET /api/ops' },
];

const executed = await runLocalChecks();
let deployed = [];
if (withDeployed) {
  const app = new URL(config.publicAppUrl);
  deployed = [];
  for (const spec of probes) deployed.push(await probe(app, spec));
}

const log = {
  schema: 'aleph.verification.log.v1', generatedAt: new Date().toISOString(),
  note: '학생이 직접 실행한 점검만 담았습니다. 심판의 41종 시험 결과가 아니며, 미실행 항목은 통과로 세지 않습니다.',
  deployedAt: withDeployed ? config.publicAppUrl : null,
  localRows: executed, deployedRows: deployed, pending: PENDING_CHECKS.map((item) => ({ ...item, status: STATUS_NOT_RUN })),
};
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'verification-log.json'), `${JSON.stringify(log, null, 2)}\n`, 'utf8');

const cell = (text) => String(text).replace(/\|/gu, '\\|');
const table = (rows) => ['| 단계 | 시험 | 기대 결과 | 실제 결과 | 요청 ID | 확인 시각 | 상태 |', '|---|---|---|---|---|---|---|',
  ...rows.map((item) => `| ${item.stage} | ${cell(item.scenario)} | ${cell(item.expected)} | ${cell(item.actual)} | ${cell(item.requestId)} | ${item.checkedAt} | ${item.status} |`)].join('\n');
const md = [
  '# 12단계 점검 기록', '',
  `생성: ${log.generatedAt}`, '',
  '학생이 직접 실행한 점검입니다. 심판의 41종 시험 결과를 대신하지 않으며, 미실행 항목은 통과로 세지 않습니다.', '',
  '## 코드 시험(판정기·탐지·정책 사본·기기 서명을 코드로 직접 호출)', '',
  '실제 배포 API 결과가 아닙니다. 41종 시험의 막음·통과로 세지 않으며, 실제 API 로는 미실행입니다.', '', table(executed), '',
  '## 실제 배포 API 요청(로그인 없는 요청)', '',
  deployed.length ? table(deployed) : '`node scripts/verify-all.mjs --deployed` 를 실행하지 않아 미실행입니다.', '',
  '## 미실행', '',
  '| 단계 | 시험 | 기대 결과 | 이유 |', '|---|---|---|---|',
  ...PENDING_CHECKS.map((item) => `| ${item.stage} | ${cell(item.scenario)} | ${cell(item.expected)} | ${cell(item.reason)} |`), '',
].join('\n');
writeFileSync(join(root, 'docs', 'VERIFICATION.md'), md, 'utf8');

const bad = [...executed.filter((item) => item.status !== STATUS_CODE_MATCHED), ...deployed.filter((item) => item.status !== STATUS_RAN_MATCHED)];
process.stdout.write(`점검 기록 작성: 실제 API ${deployed.length}건, 코드 시험 ${executed.length}건(실제 API 미실행), 미실행 ${PENDING_CHECKS.length}건, 불일치 ${bad.length}건\n`);
for (const item of bad) process.stdout.write(`불일치: ${item.id} 기대 ${item.expected} / 실제 ${item.actual}\n`);
process.exitCode = bad.length ? 1 : 0;
