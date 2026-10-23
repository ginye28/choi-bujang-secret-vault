// 20단계 renderVulnerabilities 시험(모의 자료): 조회 전·중·실패·결과 구분, 전체 조회 상태 원래 값, lock 정보,
// 정확한 설치 버전 행 속성, 취약점 id·modified, 일부 실패에서 받은 ID 유지, 미조회·실패를 취약점 없음으로 보이지 않음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-shim.mjs';

installDom();
let requests = 0;
globalThis.fetch = async () => { requests += 1; throw new Error('요청을 보내면 안 됩니다'); };
const { createStudentView } = await import('../../on-client/student/extension.mjs');
const view = createStudentView({ api: { get: async () => { requests += 1; return {}; } }, onChange() {} });

const SOURCE = 'https://api.osv.dev/v1/querybatch';
const pkg = (over = {}) => ({ name: 'jose', version: '6.2.12', status: 'none_found', vulnerabilities: [], source: SOURCE, checkedAt: '2026-10-23T08:00:00Z', ...over });
const scan = (data, over = {}) => view.renderVulnerabilities({ status: 'ok', mode: 'connected', data: { lockfileVersion: 3, lockfileHash: 'sha256-abc123', checkedAt: '2026-10-23T08:00:00Z', packages: [], ...data }, ...over });

test('조회 전·중·실패는 서로 다른 문장이고 이전 표를 남기지 않는다', () => {
  const idle = view.renderVulnerabilities({ status: 'idle', mode: 'connected' });
  const loading = view.renderVulnerabilities({ status: 'loading', mode: 'connected' });
  const error = view.renderVulnerabilities({ status: 'error', mode: 'connected', error: { code: 'CANCELLED', message: '패키지 조회를 취소했습니다.' } });
  assert.ok(idle.textContent.includes('조회 전'));
  assert.ok(loading.textContent.includes('조회 중'));
  assert.ok(error.textContent.includes('조회 실패: 패키지 조회를 취소했습니다.') && error.textContent.includes('취약점 없음이 아닙니다'));
  for (const node of [idle, loading, error]) assert.equal(node.find(n => n.attrs['data-student-package-name']).length, 0);
});

test('전체 조회 상태를 원래 값과 함께 보이고, 미조회는 취약점 없음으로 보이지 않는다', () => {
  const labels = { complete: '모두 조회(complete)', partial: '일부 조회 실패(partial)', not_checked: '(not_checked)', not_configured: '(not_configured)', unverifiable: 'lock 파일 확인 불가(unverifiable)' };
  for (const [status, want] of Object.entries(labels)) assert.ok(scan({ status }).textContent.includes(want), status);
  const notChecked = scan({ status: 'not_checked' }).textContent;
  assert.ok(notChecked.includes('취약점 없음으로 해석하지 마세요'));
  const complete = scan({ status: 'complete', packages: [pkg()] }).textContent;
  for (const want of ['3', 'sha256-abc123', '2026-10-23T08:00:00Z', SOURCE, '알려진 항목 없음(none_found)', '안전하다는 보장은 아닙니다']) assert.ok(complete.includes(want), want);
});

test('행마다 정확한 설치 버전과 취약점 id·modified, 일부 실패에서 받은 ID 를 유지한다', () => {
  const node = scan({ status: 'partial', packages: [
    pkg({ name: '@supabase/supabase-js', version: '2.117.2', status: 'known_vulnerabilities', vulnerabilities: [{ id: 'GHSA-aaaa-bbbb-cccc', modified: '2026-10-01T00:00:00Z' }] }),
    pkg({ name: 'jose', version: '6.2.12', status: 'unverifiable', vulnerabilities: [{ id: 'OSV-2026-1', modified: '2026-09-01T00:00:00Z' }] }),
  ] });
  const rows = node.find(n => n.attrs['data-student-package-name']);
  assert.deepEqual(rows.map(r => [r.attrs['data-student-package-name'], r.attrs['data-student-package-version']]), [['@supabase/supabase-js', '2.117.2'], ['jose', '6.2.12']]);
  const text = node.textContent;
  for (const want of ['GHSA-aaaa-bbbb-cccc', '2026-10-01T00:00:00Z', '알려진 항목 있음(known_vulnerabilities)', 'OSV-2026-1', '일부 확인·전체 조회 확인 불가(unverifiable)', '이미 받은 취약점 ID는']) assert.ok(text.includes(want), want);
  assert.ok(!text.includes('^'), '버전 범위를 쓰지 않는다');
});

test('새 결과마다 새로 그리고 요청·버튼을 만들지 않는다', () => {
  const first = scan({ status: 'complete', packages: [pkg({ name: 'old-pkg' })] });
  const second = scan({ status: 'complete', lockfileHash: 'sha256-new', packages: [pkg({ name: 'new-pkg' })] });
  assert.notEqual(first, second);
  assert.ok(!second.textContent.includes('old-pkg') && second.textContent.includes('sha256-new'));
  assert.equal(second.find(n => n.tag === 'button').length, 0);
  assert.equal(requests, 0);
});
