import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

// 읽기 전용 확인 모듈입니다. 출력에는 가명 사용자·기기, 유형, 판정만 남깁니다.
// 가명 키는 이번 읽기 동안만 메모리에 있고, 원본 식별자나 다른 경보 필드는 기록하지 않습니다.
const FIXTURE = new URL('../fixtures/exfiltration.json', import.meta.url);
const ACTIONS = new Set(['block', 'alert', 'record']);
const REQUEST_TYPES = Object.freeze({
  '유출 흔적 없음': 'routine',
  '처음 보는 목적지로 대용량 전송': 'data_transfer',
  '업무 시간 밖 압축 파일 반출': 'after_hours_archive',
});

function aliasFor(namespace, key) {
  return (value) => {
    if (typeof value !== 'string' || value.trim() === '') return `${namespace}-unavailable`;
    // 매 호출마다 새 키를 써 원본 식별자를 보관하지 않으면서 같은 읽기 안에서는 연결합니다.
    const digest = createHmac('sha256', key).update(value.trim(), 'utf8').digest('hex').slice(0, 16);
    return `${namespace}-${digest}`;
  };
}

function safeRow(alert, pseudonymizeUser, pseudonymizeDevice) {
  const result = decide(alert);
  const action = ACTIONS.has(result?.action) ? result.action : 'record';
  const requestType = Object.hasOwn(REQUEST_TYPES, result?.reason)
    ? REQUEST_TYPES[result.reason]
    : 'other';

  return {
    user: pseudonymizeUser(alert?.data?.srcuser),
    device: pseudonymizeDevice(alert?.agent?.name),
    requestType,
    decision: action,
  };
}

/** 가상 경보에서 승인된 네 항목만 뽑습니다. 원본 설명·주소·내용·토큰 등은 반환하지 않습니다. */
export async function readAlerts(path = FIXTURE) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'exfiltration'
      || !Array.isArray(fixture.alerts)) {
    throw new Error('exfiltration 경보 묶음 형식이 아닙니다.');
  }

  // 무작위 키는 요청 범위 안에서만 사용하며 디스크나 결과 객체에 쓰지 않습니다.
  const userKey = randomBytes(32);
  const deviceKey = randomBytes(32);
  const pseudonymizeUser = aliasFor('user', userKey);
  const pseudonymizeDevice = aliasFor('device', deviceKey);
  return fixture.alerts.map((alert) => safeRow(alert, pseudonymizeUser, pseudonymizeDevice));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = await readAlerts();
  for (const row of rows) console.log(JSON.stringify(row));
}
