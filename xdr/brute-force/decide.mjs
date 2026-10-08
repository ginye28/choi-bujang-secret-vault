import { readFile } from 'node:fs/promises';

const PATTERNS_URL = new URL('./patterns.json', import.meta.url);
const JEV_TIMEOUT_MS = 3_000;
const FALLBACK_CONFIDENCE = 0.5;

const patternsPromise = readFile(PATTERNS_URL, 'utf8').then((text) => {
  const document = JSON.parse(text);
  if (document?.moduleKey !== 'brute-force' || !Array.isArray(document.patterns)) {
    throw new Error('brute-force 패턴 파일 형식이 아닙니다.');
  }
  return document.patterns;
});

function toCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function failedCount(description, data) {
  const fromData = toCount(data?.count);
  if (fromData !== null) return fromData;
  const match = description.match(/실패\s*(\d+)\s*건/);
  return match ? Number(match[1]) : null;
}

function shortWindowFailure(description, count, sourceAddress) {
  if (typeof sourceAddress !== 'string' || sourceAddress.length === 0 || count === null) return false;
  const match = description.match(/(\d+)\s*(초|분)\s*(?:안에?|동안|이내)/);
  if (!match) return false;
  const seconds = Number(match[1]) * (match[2] === '분' ? 60 : 1);
  return seconds <= 120 && count >= 10 && /로그인\s*실패|실패/.test(description);
}

function multipleAccounts(alert, description) {
  if (/여러\s*계정|서로\s*다른\s*계정|계정\s*\d+\s*개/.test(description)) return true;
  const accounts = alert?.data?.accounts;
  return typeof accounts === 'string' && accounts.split(',').filter((item) => item.trim()).length > 1;
}

function actionFor(confidence) {
  if (confidence >= 0.85) return 'block';
  if (confidence >= 0.5) return 'alert';
  return 'record';
}

function safeDescription(value) {
  if (typeof value !== 'string') return '';
  const secretLike = /\b(?:password|passwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|authorization)\b\s*[:=]\s*\S+|\bBearer\s+\S+|(?:비밀번호|비밀키|토큰|접근키)\s*[:=]\s*\S+/i;
  return secretLike.test(value) ? '[민감 표현 숨김]' : value.slice(0, 500);
}

function askJev(summary) {
  // Jev 연동은 globalThis.Jev.assess(summary) 어댑터로 주입합니다.
  // 응답은 0~1 숫자 또는 { confidence: 0~1 }이어야 합니다.
  const assess = globalThis.Jev?.assess;
  if (typeof assess !== 'function') return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), JEV_TIMEOUT_MS);
    Promise.resolve()
      .then(() => assess(summary))
      .then(finish, () => finish(null));
  });
}

function responseConfidence(response) {
  const value = typeof response === 'number' ? response : response?.confidence;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

/** 경보의 두 무차별 대입 패턴을 대조하고, 애매한 경우에만 Jev 어댑터에 질의합니다. */
export async function decide(alert) {
  const patterns = await patternsPromise;
  const [shortWindowPattern, passwordSprayPattern] = patterns;
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const data = alert?.data ?? {};
  const count = failedCount(description, data);
  const sourceAddress = data.srcip;
  const isT1110 = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1110');

  if (/같은\s*비밀번호/.test(description) && multipleAccounts(alert, description)) {
    const confidence = 0.98;
    return {
      action: actionFor(confidence),
      confidence,
      reason: passwordSprayPattern.name,
    };
  }

  if (shortWindowFailure(description, count, sourceAddress)) {
    const confidence = 0.95;
    return {
      action: actionFor(confidence),
      confidence,
      reason: shortWindowPattern.name,
    };
  }

  const ruleLevel = alert?.rule?.level;
  if (isT1110
      && Number.isFinite(ruleLevel)
      && ruleLevel >= 10
      && count !== null
      && count >= 20
      && typeof sourceAddress === 'string'
      && sourceAddress.length > 0
      && /실패|대입|시도/.test(description)) {
    const confidence = 0.95;
    return {
      action: actionFor(confidence),
      confidence,
      reason: '고위험 대량 로그인 실패 (T1110)',
    };
  }

  if (!isT1110
      && ruleLevel <= 3
      && count === 1
      && /실패\s*1건.*성공/.test(description)) {
    return {
      action: 'record',
      confidence: 0.95,
      reason: `패턴 미일치: ${shortWindowPattern.name}`,
    };
  }

  const looksLikeFailure = /실패|대입|시도/.test(description) || isT1110 || count !== null;
  if (!looksLikeFailure) {
    return {
      action: 'record',
      confidence: 0.95,
      reason: `패턴 미일치: ${shortWindowPattern.name}`,
    };
  }

  const pattern = multipleAccounts(alert, description) ? passwordSprayPattern : shortWindowPattern;
  const response = await askJev({
    pattern: pattern.name,
    timestamp: typeof alert?.timestamp === 'string' ? alert.timestamp : null,
    ruleLevel: Number.isFinite(alert?.rule?.level) ? alert.rule.level : null,
    description: safeDescription(description),
    failedCount: count,
    accountCount: typeof data.accounts === 'string'
      ? data.accounts.split(',').filter((item) => item.trim()).length
      : null,
    technique: isT1110 ? 'T1110' : null,
  });
  const jevConfidence = responseConfidence(response);
  const confidence = jevConfidence ?? FALLBACK_CONFIDENCE;

  return {
    action: actionFor(confidence),
    confidence,
    reason: jevConfidence === null
      ? `Jev 응답 없음; 근거 패턴: ${pattern.name}`
      : `Jev 확신도 반영; 근거 패턴: ${pattern.name}`,
  };
}
