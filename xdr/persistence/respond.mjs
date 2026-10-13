import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncDenyRules } from '../respond-core.mjs';
import { decide } from './decide.mjs';

const MIN_BLOCK_CONFIDENCE = 0.95;
const PERSISTENCE_PATTERNS = new Set([
  '서명 없는 새 서비스 등록',
  '낯선 예약 작업',
  '시작 폴더 변경',
]);
const PERSISTENCE_TECHNIQUES = new Set(['T1543', 'T1053']);

// decide.mjs 는 그대로 두고, 이 연결에서만 엄격한 차단 기준을 적용합니다.
// 현재 decide는 서로 다른 신호가 둘 이상일 때 confidence가 0.95 이상이므로,
// 신호 하나뿐인 block은 규칙으로 내보내지 않고 alert로 낮춥니다.
function decideForResponse(alert) {
  const result = decide(alert);
  const hasTechnique = Array.isArray(alert?.rule?.mitre)
    && alert.rule.mitre.some((technique) => PERSISTENCE_TECHNIQUES.has(technique));
  const isStrongCandidate = result?.action === 'block'
    && Number.isFinite(result.confidence)
    && result.confidence >= MIN_BLOCK_CONFIDENCE
    && Number.isFinite(alert?.rule?.level)
    && alert.rule.level >= 9
    && hasTechnique
    && PERSISTENCE_PATTERNS.has(result.reason);

  return result?.action === 'block' && !isStrongCandidate
    ? { ...result, action: 'alert' }
    : result;
}

// 엄격한 기준을 통과한 차단 후보만 만료 시각·근거 경보 번호가 있는 별도
// ZTNA 거부 규칙으로 기록하고, 알림은 xdr/alerts.log 에 한 줄씩 누적합니다.
// 같은 출발 주소에서 정상(record) 판정 경보가 있으면 respond-core가 해당 주소를 제외합니다.
export function respond(options = {}) {
  return syncDenyRules({ ...options, moduleKey: 'persistence', decide: decideForResponse });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await respond();
  console.log(JSON.stringify({
    counts: out.counts, addedRules: out.addedRules.length, notifications: out.notificationsAppended,
  }));
}
