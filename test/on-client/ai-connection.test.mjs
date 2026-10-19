// 17단계 renderAiConnection·renderExplanation 시험(모의 자료): 점검 전·중·성공·실패 구분, 연결만 점검한 상태와 사건 설명 구분,
// 재점검 성공 뒤 이전 오류 제거, 다시 idle, 비밀 가림, 자동 재요청 없음.
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
  assert.ok(idle.includes('AI 연결 점검 전') && !idle.includes('점검 중'));
  assert.ok(loading.includes('AI 연결 점검 중') && !loading.includes('점검 전'));
  assert.ok(unknown.includes('확인 불가'));
  assert.equal(new Set([idle, loading, unknown]).size, 3);
});

test('ok: test 와 verified 를 구분하고 모델 수·시각을 보이며 사건 설명은 아직이라고 적는다', () => {
  const verified = text(ai({ status: 'ok', data: okData() }));
  const test_ = text(ai({ status: 'ok', data: okData({ audienceAuthorization: 'test' }) }));
  assert.ok(verified.includes('앱 권한 확인 후 점검(verified)') && !verified.includes('시험 연결 점검(test)'));
  assert.ok(test_.includes('시험 연결 점검(test)') && !test_.includes('앱 권한 확인 후 점검(verified)'));
  for (const want of ['3', '2026-10-19T00:00:00Z', '사건 설명은 아직 실행하지 않았습니다']) assert.ok(verified.includes(want), want);
  assert.ok(!verified.includes('사건 설명이 되었습니다'));
});

test('오류는 코드와 메시지를 글자로 보이고 원인별로 다른 안내를 준다', () => {
  const cases = [
    ['AI_PERMISSION_PENDING', '권한 준비 중'], ['AUTH_FAILED', '인증'], ['ACCESS_FORBIDDEN', '접근 제한'],
    ['CLASS_QUOTA_EXCEEDED', '사용량·한도'], ['OUTSIDE_HOURS', '이용 시간'], ['RATE_LIMITED', '요청 제한·시간 초과·네트워크'],
    ['REQUEST_TIMEOUT', '요청 제한·시간 초과·네트워크'], ['NETWORK_ERROR', '요청 제한·시간 초과·네트워크'],
    ['REQUEST_CANCELLED', '취소'], ['NO_MODELS_ALLOWED', '쓸 수 있는 모델 없음'],
    ['WB_CLCO_LIMIT_REACHED', '사용량·한도'], ['WB_CLCO_COHORT_BUDGET_EXHAUSTED', '사용량·한도'], ['WB_CLCO_SESSION_CLOSED', '이용 시간'],
    ['WB_CLCO_ACCESS_BLOCKED', '접근 제한'], ['WB_CLCO_AUTH_REQUIRED', '인증'], ['ON_AI_PROVISIONING_PENDING', '권한 준비 중'],
    ['AI_MODEL_LIST_EMPTY', '쓸 수 있는 모델 없음'], ['AI_AUTHORIZATION_CHANGED', '권한 변경'], ['WB_CLCO_SERVER_UNAVAILABLE', '요청 제한·시간 초과·네트워크'],
  ];
  const seen = new Set();
  for (const [code, title] of cases) {
    const t = text(ai({ status: 'error', error: { code, message: '안전한 안내 문장' } }));
    assert.ok(t.includes(code) && t.includes('안전한 안내 문장') && t.includes(title), `${code} → ${title}`);
    seen.add(t.match(/AI 연결 점검 실패: ([^\n]+?)오류 코드/u)?.[1] ?? t);
  }
  assert.ok(seen.size >= 8);
  assert.ok(text(ai({ status: 'error', error: { code: 'WHAT', message: 'x' } })).includes('확인 불가'));
});

test('재점검 성공이나 idle 로 돌아가면 이전 오류 안내가 남지 않는다', () => {
  const failed = text(ai({ status: 'error', error: { code: 'AUTH_FAILED', message: '인증 실패' } }));
  const recovered = text(ai({ status: 'ok', data: okData() }));
  const reset = text(ai({ status: 'idle' }));
  assert.ok(failed.includes('AUTH_FAILED'));
  for (const gone of ['AUTH_FAILED', '인증 실패', '점검 실패']) {
    assert.ok(!recovered.includes(gone), `ok: ${gone}`);
    assert.ok(!reset.includes(gone), `idle: ${gone}`);
  }
  assert.ok(!reset.includes('3') || reset.includes('점검 전'));
  assert.ok(!reset.includes('사용할 수 있는 모델 수'));
});

test('열쇠·토큰은 화면에 그대로 나오지 않고 자동으로 다시 점검하지 않는다', () => {
  const t = text(ai({ status: 'error', error: { code: 'AUTH_FAILED', message: 'Bearer abcdefghijklmnop token: sk-proj-abcdefghijk' } }));
  assert.ok(!t.includes('abcdefghijklmnop') && !t.includes('sk-proj-abcdefghijk'));
  assert.ok(t.includes('[가림]'));
  assert.ok(t.includes('자동으로 다시 점검하지 않습니다'));
  assert.equal(requests, 0);
});

test('demo·disconnected 는 연결된 것처럼 보이지 않는다', () => {
  assert.ok(text(ai({ mode: 'demo', status: 'ok', data: okData() })).includes('실제 연결이 아닙니다'));
  assert.ok(text(ai({ mode: 'disconnected', status: 'idle' })).includes('연결 없음'));
});

test('renderExplanation: 성공일 때만 사건 표시를 붙이고 실패에는 붙이지 않는다', () => {
  const event = { id: 'evt-7' };
  const ok = view.renderExplanation({ event, explanation: { status: 'ok', data: { summary: '반복 로그인 실패 뒤 성공' } }, checkedAt: '2026-10-19T00:00:00Z' });
  assert.equal(ok.getAttribute('data-student-explanation-event'), 'evt-7');
  assert.ok(ok.textContent.includes('evt-7') && ok.textContent.includes('반복 로그인 실패 뒤 성공'));
  const failed = view.renderExplanation({ event, explanation: { status: 'error', error: { code: 'AI_TIMEOUT', message: '시간 초과' } }, checkedAt: '2026-10-19T00:00:00Z' });
  assert.equal(failed.getAttribute('data-student-explanation-event'), null);
  assert.ok(failed.textContent.includes('AI_TIMEOUT') && failed.textContent.includes('그대로'));
  assert.equal(failed.querySelector?.('[data-student-explanation-event]') ?? null, null);
});
