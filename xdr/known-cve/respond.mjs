import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncDenyRules } from '../respond-core.mjs';
import { decide } from './decide.mjs';

// decide 결과 가운데 확신도 높은 차단 후보만 ZTNA 거부 규칙(만료 시각·근거 경보 번호 포함)으로 넣고,
// 알림은 xdr/alerts.log 에 한 줄씩 쌓습니다. decide.mjs 는 판단만 하고 파일을 쓰지 않습니다.
export function respond(options = {}) {
  return syncDenyRules({ ...options, moduleKey: 'known-cve', decide });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await respond();
  console.log(JSON.stringify({
    counts: out.counts, addedRules: out.addedRules.length, notifications: out.notificationsAppended,
  }));
}
