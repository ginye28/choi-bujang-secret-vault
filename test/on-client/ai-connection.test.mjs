// 17단계 renderAiConnection·renderExplanation 시험(모의 자료): 점검 전·중·성공·실패 구분, 연결만 점검한 상태와 사건 설명 구분,
// 제공 코드의 실제 오류 코드별 안내, 재점검·idle 시 이전 결과 제거, 비밀 가림, 자동 재요청 없음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-shim.mjs';

installDom();
let requests = 0;
globalThis.fetch = async () => { requests += 1; throw new Error('요청을 보내면 안 됩니다'); };
const { createStudentView } = await import('../../on-client/student/extension.mjs');
const view = createStudentView({ api: { get: async () => { requests += 1; return {}; } }, onChange() {} });

const ai = (over = {}) => ({ status: 'idle', mode: 'connected', checkedAt: '2026-10-19T00:00:00Z', explanationAccepted: false, ...over });
const text = input => view.renderAiConnection(input).textContent;
const okData = (over = {}) => ({ transportChecked: true, audienceAuthorization: 'verified', modelCount: 3, help: 'h', ...over });

test('점검 전·점검 중·확인 불가는 서로 다른 문장이다', () => {
  const idle = text(ai());
  const loading = text(ai({ status: 'loading' }));
  const unknown = text(ai({ status: 'weird' }));
  assert.ok(idle.includes('점검 전') && !idle.includes('점검하는 중'));
  assert.ok(loading.includes('점검하는 중') && !loading.includes('점검 전'));
  assert.ok(unknown.includes('확인 불가'));
  assert.equal(new Set([idle, loading, unknown]).size, 3);
});

test('ok: test 와 verified 를 구분하고 모델 수·시각을 보이며 사건 설명은 아직이라고 적는다', () => {
  const verified = text(ai({ status: 'ok', data: okData() }));
  const test_ = text(ai({ status: 'ok', data: okData({ audienceAuthorization: 'test' }) }));
  assert.ok(verified.includes('(verified)') && !verified.includes('(test)'));
  assert.ok(test_.includes('(test)') && !test_.includes('(verified)'));
  for (const want of ['3', '2026-10-19T00:00:00Z', '사건 설명은 아직 실행하지 않았습니다']) assert.ok(verified.includes(want), want);
  assert.ok(!verified.includes('사건 설명이 되었습니다'));
});

test('제공 코드의 실제 오류 코드는 코드와 메시지를 글자로 보이고 원인별로 다른 안내를 준다', () => {
  const cases = [
    ['ON_AI_PROVISIONING_PENDING', '권한·연결 준비'], ['WB_CLCO_AUTH_REQUIRED', '이용 인증'], ['WB_CLCO_ACCESS_BLOCKED', '이용 권한이 허용되지 않았습니다'],
    ['WB_CLCO_SESSION_CLOSED', '이용 시간'], ['WB_CLCO_COHORT_BUDGET_EXHAUSTED', '사용량이 소진'], ['WB_CLCO_LIMIT_REACHED', '한도에 도달'],
    ['WB_CLCO_RATE_LIMITED', '잠시 제한'], ['WB_CLCO_TIMEOUT', '시간이 초과'], ['WB_CLCO_NETWORK_ERROR', '네트워크'],
    ['WB_CLCO_CANCELLED', '취소했습니다'], ['ON_AI_MODEL_LIST_EMPTY', '사용할 수 있는 모델이 없습니다'], ['ON_AI_AUTHORIZATION_CHANGED', '권한이 바뀌었습니다'],
  ];
  const guides = new Set();
  for (const [code, snippet] of cases) {
    const t = text(ai({ status: 'error', error: { code, message: '안전한 안내 문장' } }));
    assert.ok(t.includes(code) && t.includes('안전한 안내 문장') && t.includes(snippet), `${code} → ${snippet}`);
    guides.add(t.replace(code, ''));
  }
  assert.ok(guides.size >= 11);
  // 모르는 코드도 숨기지 않고 보이며 확인 불가로 안내한다.
  const unknown = text(ai({ status: 'error', error: { code: 'SOMETHING_NEW', message: 'x' } }));
  assert.ok(unknown.includes('SOMETHING_NEW') && unknown.includes('확인 불가'));
});

test('재점검 성공이나 idle 로 돌아가면 이전 오류 안내가 남지 않는다', () => {
  const failed = text(ai({ status: 'error', error: { code: 'WB_CLCO_AUTH_REQUIRED', message: '인증 실패' } }));
  const recovered = text(ai({ status: 'ok', data: okData() }));
  const reset = text(ai({ status: 'idle' }));
  assert.ok(failed.includes('WB_CLCO_AUTH_REQUIRED'));
  for (const gone of ['WB_CLCO_AUTH_REQUIRED', '인증 실패', '점검 실패']) {
    assert.ok(!recovered.includes(gone), `ok: ${gone}`);
    assert.ok(!reset.includes(gone), `idle: ${gone}`);
  }
  assert.ok(!reset.includes('응답 모델 수'));
});

test('열쇠·토큰은 화면에 그대로 나오지 않고 자동으로 다시 점검하지 않는다', () => {
  const t = text(ai({ status: 'error', error: { code: 'WB_CLCO_AUTH_REQUIRED', message: 'Bearer abcdefghijklmnop token: sk-proj-abcdefghijk' } }));
  assert.ok(!t.includes('abcdefghijklmnop') && !t.includes('sk-proj-abcdefghijk'));
  assert.ok(t.includes('[가림]'));
  assert.ok(t.includes('자동으로 다시 점검하지 않습니다'));
  assert.equal(requests, 0);
});

test('NATIVE_HOST_DISABLED·AI_REQUEST_UNVERIFIED 는 학생 잘못이 아니라 담당자 확인이 필요하다고 안내하고 성공처럼 보이지 않는다', () => {
  for (const code of ['NATIVE_HOST_DISABLED', 'AI_REQUEST_UNVERIFIED']) {
    const t = text(ai({ status: 'error', mode: 'disconnected', error: { code, message: '연결할 수 없습니다' } }));
    assert.ok(t.includes(code) && t.includes('담당자') && !t.includes('(verified)') && !t.includes('응답 모델 수'), code);
  }
});

test('demo·disconnected 는 연결된 것처럼 보이지 않는다', () => {
  assert.ok(text(ai({ mode: 'demo', status: 'ok', data: okData() })).includes('실제 연결이 아닙니다'));
  assert.ok(text(ai({ mode: 'disconnected', status: 'loading' })).includes('연결 없음'));
});

test('renderExplanation: 성공일 때만 사건 표시를 붙이고 실패·근거 불일치에는 붙이지 않는다', () => {
  const event = { id: 'evt-7', evidence: [{ id: 'e1', text: '근거 글' }], rules: [{ id: 'r1', text: '규칙 글' }], supportedActions: [], state: { access: 'unknown', session: 'active', device: 'compliant' } };
  const okExplanation = { status: 'ok', data: { summary: '반복 로그인 실패 뒤 성공', evidenceIds: ['e1'], proposals: [], requiresHumanConfirmation: true, executed: false } };
  const ok = view.renderExplanation({ event, explanation: okExplanation, checkedAt: '2026-10-19T00:00:00Z' });
  assert.equal(ok.getAttribute('data-student-explanation-event'), 'evt-7');
  for (const want of ['evt-7', 'AI 설명(참고용)', '반복 로그인 실패 뒤 성공', '근거 e1 — 근거 글', '규칙 r1 — 규칙 글', '접속: 확인 불가(unknown)', '제안이 없습니다(정상)']) assert.ok(ok.textContent.includes(want), want);
  assert.ok(!ok.textContent.includes('세션: 확인 불가'), 'active 세션은 확인 불가로 적지 않는다');
  const failed = view.renderExplanation({ event, explanation: { status: 'error', error: { code: 'WB_CLCO_TIMEOUT', message: '시간 초과' } }, checkedAt: '2026-10-19T00:00:00Z' });
  assert.equal(failed.getAttribute('data-student-explanation-event'), null);
  assert.ok(failed.textContent.includes('WB_CLCO_TIMEOUT') && failed.textContent.includes('그대로'));
  const mismatch = view.renderExplanation({ event, explanation: { status: 'ok', data: { ...okExplanation.data, evidenceIds: ['nope'] } }, checkedAt: '2026-10-19T00:00:00Z' });
  assert.equal(mismatch.getAttribute('data-student-explanation-event'), null);
  assert.equal(view.renderExplanation({ event: null, explanation: okExplanation, checkedAt: 'x' }).getAttribute('data-student-explanation-event'), null);
});

test('renderExplanation 18단계: 오류는 event 가 없어도 먼저 보이고, 실행됐다는 설명·근거 불일치는 쓰지 않는다', () => {
  const event = { id: 'evt-9', evidence: [{ id: 'e1', text: '근거 글' }, { id: 'e2', text: '두 번째 근거' }], rules: [], supportedActions: ['lock_device'], state: { access: 'allowed', session: 'unknown', device: 'unknown' } };
  const data = { summary: '요약', evidenceIds: ['e1', 'e2'], proposals: [], requiresHumanConfirmation: true, executed: false };

  const noEventError = view.renderExplanation({ event: null, explanation: { status: 'error', error: { code: 'ON_AI_PROVISIONING_PENDING', message: '권한 준비 중' } } });
  assert.ok(noEventError.textContent.includes('ON_AI_PROVISIONING_PENDING') && noEventError.textContent.includes('그대로'));
  assert.ok(!noEventError.textContent.includes('먼저 고르세요'));
  assert.ok(view.renderExplanation({ event: null, explanation: { status: 'idle' } }).textContent.includes('먼저 고르세요'));
  assert.ok(view.renderExplanation({ event, explanation: { status: 'loading' } }).textContent.includes('요청 중'));

  const ok = view.renderExplanation({ event, explanation: { status: 'ok', data } });
  assert.equal(ok.getAttribute('data-student-explanation-event'), 'evt-9');
  for (const want of ['세션: 확인 불가(unknown)', '기기: 확인 불가(unknown)', 'AI가 제안한 조치가 없습니다', '표시할 규칙이 없습니다']) assert.ok(ok.textContent.includes(want), want);
  assert.ok(!ok.textContent.includes('접속: 확인 불가'));

  const withProposal = view.renderExplanation({ event, explanation: { status: 'ok', data: { ...data, proposals: [{ action: 'lock_device', reason: '이상 접속', evidenceIds: ['e1'] }] } } });
  assert.ok(withProposal.textContent.includes('lock_device') && withProposal.textContent.includes('실행되지 않았습니다'));
  assert.equal(withProposal.find(n => n.tag === 'button').length, 0, '실행 버튼을 만들지 않는다');

  for (const bad of [{ ...data, executed: true }, { ...data, evidenceIds: ['e1'] }, { ...data, evidenceIds: ['e1', 'zz'] }]) {
    const node = view.renderExplanation({ event, explanation: { status: 'ok', data: bad } });
    assert.equal(node.getAttribute('data-student-explanation-event'), null);
    assert.ok(node.textContent.includes('사용할 수 없습니다') && node.textContent.includes('그대로'));
    assert.ok(!node.textContent.includes('요약'));
  }
  // 다른 기록의 설명(근거 ID 가 이 기록 것이 아님)은 붙이지 않는다.
  const other = view.renderExplanation({ event: { ...event, id: 'evt-10', evidence: [{ id: 'x1', text: '다른 기록' }] }, explanation: { status: 'ok', data } });
  assert.equal(other.getAttribute('data-student-explanation-event'), null);
});
