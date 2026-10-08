const JEV_TIMEOUT_MS = 3_000;
const JEV_FALLBACK_CONFIDENCE = 0.5;
const PATTERN_NAMES = Object.freeze([
  '요청 인자 내 SQL 구문',
  '반복 명령 구분자 표기',
  '요청 인자 내 스크립트 태그',
  '반복 경로 거슬러 올라가기',
]);
const patterns = PATTERN_NAMES.map((name) => ({ name }));

function actionFor(confidence) {
  if (confidence >= 0.85) return 'block';
  if (confidence >= 0.5) return 'alert';
  return 'record';
}

function countOf(alert, description) {
  const value = alert?.data?.count;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value);
  const match = description.match(/(\d+)\s*번/);
  return match ? Number(match[1]) : null;
}

function matchesPattern(pattern, description, requestArgument) {
  const text = `${description}\n${requestArgument}`;
  switch (pattern.name) {
    case '요청 인자 내 SQL 구문':
      return /SQL\s*(?:구문|표기|표식)/i.test(text)
        || /데이터베이스\s*조회.{0,30}(?:이어\s*붙|표기)/i.test(text)
        || /doc-(?:sql-(?:chain|or|select-chain)|mixed-marker)/i.test(text)
        || /\bunion\s+(?:all\s+)?select\b|\bselect\b.{0,40}\bfrom\b/i.test(requestArgument)
        || /(?:%27|')\s*(?:or|and)\s+(?:%27|')?\d/i.test(requestArgument);
    case '반복 명령 구분자 표기':
      return /명령\s*구분자\s*표기/i.test(text)
        || /doc-cmd-separator/i.test(requestArgument);
    case '요청 인자 내 스크립트 태그':
      return /스크립트\s*(?:삽입\s*)?(?:표기|표식)/i.test(text)
        || /doc-(?:script-marker|mixed-marker)/i.test(text)
        || /<\s*script\b|%3c\s*script\b/i.test(requestArgument);
    case '반복 경로 거슬러 올라가기':
      return /경로.{0,30}(?:거슬러\s*올라가는\s*표기|이탈\s*표기)/i.test(text)
        || /doc-up-repeat/i.test(requestArgument)
        || /(?:\.\.|%2e%2e)(?:\/|%2f|\\|%5c)/i.test(requestArgument);
    default:
      return false;
  }
}

function safeDescription(value) {
  if (typeof value !== 'string') return '';
  const secretLike = /\b(?:password|passwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|authorization)\b\s*[:=]\s*\S+|\bBearer\s+\S+|(?:비밀번호|비밀키|토큰|접근키)\s*[:=]\s*\S+/i;
  return secretLike.test(value) ? '[민감 표현 숨김]' : value.replace(/[\r\n]+/g, ' ').slice(0, 500);
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

function decision(action, confidence, reason) {
  return { action, confidence, reason: reason.replace(/[\r\n]+/g, ' ') };
}

/** 등록된 웹 주입 패턴을 먼저 대조하고, 애매한 경우에만 Jev에 판단을 요청합니다. */
export async function decide(alert) {
  try {
    const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
    const requestArgument = typeof alert?.data?.url === 'string' ? alert.data.url : '';
    const count = countOf(alert, description);
    const ruleLevel = Number.isFinite(alert?.rule?.level) ? alert.rule.level : null;
    const isT1190 = Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190');
    const matchedPatterns = patterns.filter((pattern) => matchesPattern(pattern, description, requestArgument));
    const matchedNames = matchedPatterns.map((pattern) => pattern.name);
    const repeatCount = count ?? 0;

    // 반복 횟수와 T1190 고위험 심각도가 확인되면 문구·URL 패턴과 관계없이 차단합니다.
    if (repeatCount >= 5 && isT1190 && ruleLevel !== null && ruleLevel >= 10) {
      const patternLabel = matchedNames.length > 0
        ? `근거 패턴: ${matchedNames.join(', ')}`
        : `패턴 참조: ${patterns.map((pattern) => pattern.name).join(', ')}`;
      return decision('block', 0.95, `고위험 반복 웹 주입 (T1190); ${patternLabel}`);
    }

    const likelyAmbiguous = matchedPatterns.length > 0
      || /이상한|주입처럼\s*보이는|의심|수상|따옴표가\s*한\s*번|구분\s*문자가\s*1건/.test(description)
      || (isT1190
        && ruleLevel !== null
        && ruleLevel >= 5
        && ruleLevel <= 8
        && count === 1)
      || (isT1190
        && ruleLevel !== null
        && ruleLevel >= 8
        && repeatCount >= 5
        && /명령|구분자|삽입|표기/.test(description));

    if (!likelyAmbiguous) {
      const names = patterns.map((pattern) => pattern.name).join(', ');
      return decision('record', 0.95, `등록 패턴 미일치: ${names}`);
    }

    const response = await askJev({
      candidatePatterns: matchedNames.length > 0 ? matchedNames : patterns.map((pattern) => pattern.name),
      description: safeDescription(description),
      requestArgument: safeDescription(requestArgument),
      count,
      ruleLevel,
      technique: isT1190 ? 'T1190' : null,
    });
    const jevConfidence = responseConfidence(response);
    const confidence = jevConfidence ?? JEV_FALLBACK_CONFIDENCE;
    const evidenceNames = matchedNames.length > 0
      ? matchedNames
      : patterns.map((pattern) => pattern.name);
    const reason = jevConfidence === null
      ? `Jev 응답 없음; 검토 기준 패턴: ${evidenceNames.join(', ')}`
      : `Jev 판단 반영; 근거 패턴: ${evidenceNames.join(', ')}`;

    return decision(actionFor(confidence), confidence, reason);
  } catch {
    return {
      action: 'record',
      confidence: 0,
      reason: '경보 판정 오류; 기록으로 처리',
    };
  }
}
