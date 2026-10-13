import { classifyAttempt } from './attack-check.mjs';

// 12단계 제출 점검 기록: `npm run checks:record` 가 src/attack-check.mjs 를 실제 배포에 실행한 결과를
// docs/check-record.json 에 남깁니다. 기록에는 점검 이름·기대 결과·관측 값(HTTP 상태, method)만 있고
// 요청 주소·응답 본문·토큰은 없습니다(가린 기록).
// 작전실 화면과 /api/checks 의 수치는 이 기록의 각 점검을 classifyAttempt 로 나눠 센 값뿐입니다.
// 기록에 없는 점검을 만들거나 빼기로 미실행을 채우지 않습니다.
export const CHECK_RECORD_SCHEMA = 'aleph.check.record.v1';
export const JUDGE_SUITE_TOTAL = 41;
const ID = /^[a-z0-9][a-z0-9_.-]{0,79}$/iu;

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max).replace(/[\u0000-\u001f\u007f]/gu, ' ') : '');

export function buildCheckRecord(attempts, { checkedAt = new Date() } = {}) {
  return {
    schema: CHECK_RECORD_SCHEMA,
    checkedAt: checkedAt.toISOString(),
    note: 'npm run checks:record 로 실제 배포에 보낸 읽기 요청의 관측 값입니다. 심판의 41종 시험 결과가 아닙니다.',
    attempts: attempts.map(({ attackId, expected, observed }) => ({ attackId, expected, observed })),
  };
}

export function summarizeCheckRecord(record) {
  const attempts = record?.schema === CHECK_RECORD_SCHEMA && Array.isArray(record.attempts) ? record.attempts : [];
  const rows = attempts
    .filter((item) => typeof item?.attackId === 'string' && ID.test(item.attackId))
    .slice(0, 20)
    .map((item) => ({
      attackId: item.attackId,
      expected: text(item.expected, 300),
      observed: text(item.observed, 300),
      result: classifyAttempt(item),
    }));
  const counts = { total: rows.length, blocked: 0, breached: 0, notRun: 0 };
  for (const row of rows) {
    if (row.result === 'blocked') counts.blocked += 1;
    else if (row.result === 'breached') counts.breached += 1;
    else counts.notRun += 1;
  }
  return {
    available: rows.length > 0,
    checkedAt: rows.length > 0 ? text(record.checkedAt, 40) : null,
    counts,
    rows,
    // 심판의 41종 시험 결과는 이 기록에 없습니다. 막음·통과로 세지 않고 미실행으로만 둡니다.
    judgeSuite: { total: JUDGE_SUITE_TOTAL, recorded: 0, status: '미실행' },
  };
}
