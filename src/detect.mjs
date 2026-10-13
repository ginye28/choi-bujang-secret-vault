// 9단계 도플갱어 탐지 함수입니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
// 입력에서는 가명 사용자(identity.sub), 요청 종류(method), 시각(at), 확인된 기기 번호(deviceId)만
// 읽습니다. 메모 내용·토큰·실명은 읽지도 저장하지도 출력하지도 않습니다.
// 결과는 접속 허용/거부 응답(src/decider.mjs)과 별도이며, 회수 API를 호출하거나 기기 권한을 바꾸지
// 않고 심판이 확인할 "회수 제안"만 돌려줍니다.
const WINDOW_MS = 10 * 60 * 1000;
const BURST_THRESHOLD = 120; // 같은 사용자의 GET 이 한 구간에서 이 값을 넘어야 합니다(정확히 120건은 제외).
const DEVICE_ID = /^[0-9a-f]{16}$/u;

function readEvent(event) {
  if (event === null || typeof event !== 'object') return null;
  const method = typeof event.method === 'string' ? event.method.toUpperCase() : '';
  const subject = event.identity !== null && typeof event.identity === 'object'
    && typeof event.identity.sub === 'string' ? event.identity.sub.trim() : '';
  const time = typeof event.at === 'string' ? Date.parse(event.at) : Number.NaN;
  if (method !== 'GET' || subject === '' || !Number.isFinite(time)) return null;
  const device = typeof event.deviceId === 'string' && DEVICE_ID.test(event.deviceId)
    ? event.deviceId : null;
  return { subject, time, device };
}

function mostFrequentDevice(items) {
  const counts = new Map();
  for (const item of items) {
    if (item.device !== null) counts.set(item.device, (counts.get(item.device) ?? 0) + 1);
  }
  let best = null;
  for (const [device, count] of counts) {
    if (best === null || count > best.count) best = { device, count };
  }
  return best === null ? null : best.device;
}

// 같은 사용자의 GET 사건을 시각순으로 훑으며, 처음으로 120건을 넘기는 10분 구간을 찾습니다.
function findBurst(reads) {
  const bySubject = new Map();
  for (const read of reads) {
    if (!bySubject.has(read.subject)) bySubject.set(read.subject, []);
    bySubject.get(read.subject).push(read);
  }
  let found = null;
  for (const [subject, items] of bySubject) {
    items.sort((a, b) => a.time - b.time);
    let start = 0;
    for (let end = 0; end < items.length; end += 1) {
      while (items[end].time - items[start].time > WINDOW_MS) start += 1;
      if (end - start + 1 > BURST_THRESHOLD) {
        const candidate = { subject, at: items[end].time, window: items.slice(start, end + 1) };
        if (found === null || candidate.at < found.at) found = candidate;
        break;
      }
    }
  }
  return found;
}

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const reads = events.map(readEvent).filter((item) => item !== null);
  const burst = findBurst(reads);
  if (burst === null) return { action: 'observe' };

  const proposal = { action: 'propose_revocation', reasonCode: 'burst_read', subject: burst.subject };
  // 대상은 확인된 가상 기기 한 개로 한정합니다. 사건에 기기 번호가 있을 때만 덧붙입니다.
  const device = mostFrequentDevice(burst.window);
  if (device !== null) proposal.deviceId = device;
  return proposal;
}
