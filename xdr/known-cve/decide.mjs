// 알려진 취약점(CVE-2021-44228 형태) 악용 경보 판단 모듈입니다.
// 심판은 이 파일 하나만 불러오므로 import 없이, 파일을 읽거나 쓰지 않고, 혼자 계산합니다.
// patterns.json 의 패턴을 아래 상수로 옮겨 적었습니다.
const PATTERNS = [
  { name: '요청 머리글·인자의 JNDI 원격 조회 구문', confidence: 0.95 },
  { name: '알려진 취약점 점검 도구의 흔적', confidence: 0.75 },
  { name: 'jndi 조회 구문 조각', confidence: 0.7 },
  { name: '취약점 이름 언급과 높은 경보 수준', confidence: 0.55 },
];
const [STRONG, SCANNER, FRAGMENT, MENTION] = PATTERNS;
const NORMAL_CONFIDENCE = 0.1;
const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

const REMOTE_LOOKUP = /\$\{\s*jndi\s*:\s*(?:ldaps?|rmi|dns|iiop|nis|corba|https?)\s*:\/\//iu;
const JNDI_FRAGMENT = /\$\{\s*jndi\b|\bjndi\s*:/iu;
const SCANNER_TRACE = /nuclei|log4j-?scan|log4shell|interactsh|oast\.(?:pro|live|site|online|fun|me)|dnslog|burpcollaborator|canarytokens/iu;

function unfold(text) {
  let current = String(text);
  for (let step = 0; step < 6; step += 1) {
    let next = current;
    try { next = decodeURIComponent(next); } catch { /* 깨진 퍼센트 표기는 그대로 둡니다 */ }
    next = next
      .replace(/\$\{\s*(?:lower|upper)\s*:\s*([^${}]*)\}/giu, '$1')
      .replace(/\$\{[^${}:]*:-([^${}]*)\}/gu, '$1');
    if (next === current) break;
    current = next;
  }
  return current;
}

function textFields(alert) {
  const data = alert && typeof alert.data === 'object' && alert.data !== null ? alert.data : {};
  const fields = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'srcip' || key === 'count') continue;
    if (typeof value === 'string') fields.push(unfold(value));
  }
  return fields;
}

function repeatCount(alert) {
  const raw = alert?.data?.count;
  const count = typeof raw === 'number' ? raw : Number(typeof raw === 'string' ? raw.trim() : NaN);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

export function decide(alert) {
  const fields = textFields(alert);
  const strongFields = fields.filter((value) => REMOTE_LOOKUP.test(value)).length;
  const level = Number(alert?.rule?.level);
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];

  if (strongFields > 0) {
    const repeated = strongFields > 1 || repeatCount(alert) >= 3;
    return { action: 'block', confidence: repeated ? 0.98 : STRONG.confidence, reason: STRONG.name };
  }
  if (fields.some((value) => SCANNER_TRACE.test(value))) {
    return { action: 'alert', confidence: SCANNER.confidence, reason: SCANNER.name };
  }
  if (fields.some((value) => JNDI_FRAGMENT.test(value))) {
    return { action: 'alert', confidence: FRAGMENT.confidence, reason: FRAGMENT.name };
  }
  if (Number.isFinite(level) && level >= 5 && mitre.includes('T1190')) {
    return { action: 'alert', confidence: MENTION.confidence, reason: MENTION.name };
  }
  return { action: 'record', confidence: NORMAL_CONFIDENCE, reason: '알려진 악용 형태 없음' };
}

export const THRESHOLDS = Object.freeze({ block: BLOCK_AT, alert: ALERT_AT });
