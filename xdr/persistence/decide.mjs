// 몰래 심어진 프로그램(지속성: T1543·T1053) 경보 판단 모듈입니다.
// 심판은 이 파일 하나만 불러오므로 import 없이, 파일을 읽거나 쓰지 않고, 혼자 계산합니다.
// patterns.json 의 패턴을 아래 상수로 옮겨 적었습니다.
const PATTERNS = [
  { name: '서명 없는 새 서비스 등록' },
  { name: '낯선 예약 작업' },
  { name: '시작 폴더 변경' },
];
const [SERVICE, TASK, STARTUP] = PATTERNS.map((pattern) => pattern.name);
const NORMAL_REASON = '지속성 흔적 없음';
const MITRE = ['T1543', 'T1053'];

const TEMP_EXECUTABLE = /[\/]temp[\/][^\/]*\.(?:exe|dll|bat|cmd|ps1|vbs|scr)$/iu;
const UNSIGNED = /서명\s*없는|서명이\s*없/u;
const UNFAMILIAR = /처음\s*보는|평소\s*목록에\s*없는|목록에\s*없는|낯선|임의\s*문자열/u;
const STAYS = /다시\s*켜도\s*남|함께\s*가리킵니다|실행\s*파일이\s*바뀌었|연속으로/u;
const STARTUP_CHANGE = /시작\s*(?:폴더|프로그램|항목).*(?:추가|가리킵니다|바뀌|변경)/u;
const TASK_WORD = /예약\s*작업/u;
const OFF_HOURS = /수업\s*시간\s*밖|업무\s*시간\s*밖/u;
const NEGATED = /(?:등록|기록|실행)(?:은|이|도)?\s*없습니다|변경은\s*없습니다|그대로입니다|읽기만/u;

function evidenceOf(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const path = typeof alert?.data?.path === 'string' ? alert.data.path : '';
  const found = [];
  if (TEMP_EXECUTABLE.test(path)) found.push('temp');
  if (UNSIGNED.test(description)) found.push('unsigned');
  if (UNFAMILIAR.test(description)) found.push('unfamiliar');
  if (STAYS.test(description)) found.push('stays');
  if (STARTUP_CHANGE.test(description)) found.push('startup');
  if (OFF_HOURS.test(description)) found.push('off-hours');
  return { description, found, negated: NEGATED.test(description) };
}

function patternFor(description, found) {
  if (found.includes('startup')) return STARTUP;
  if (TASK_WORD.test(description)) return TASK;
  return SERVICE;
}

export function decide(alert) {
  const level = Number(alert?.rule?.level);
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const related = mitre.some((id) => MITRE.includes(id));
  const { description, found, negated } = evidenceOf(alert);

  if (!related || !Number.isFinite(level) || level < 5) {
    return { action: 'record', confidence: 0.1, reason: NORMAL_REASON };
  }
  const reason = patternFor(description, found);
  if (level >= 9 && found.length >= 1 && !negated) {
    return { action: 'block', confidence: Math.min(0.99, 0.88 + 0.04 * found.length), reason };
  }
  return { action: 'alert', confidence: Math.min(0.8, 0.55 + 0.05 * found.length), reason };
}
