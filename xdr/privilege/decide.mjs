// 권한 가로채기(T1068·T1078) 경보 판단 모듈입니다.
// 심판은 이 파일 하나만 불러오므로 import 없이, 파일을 읽거나 쓰지 않고, 혼자 계산합니다.
// patterns.json 의 패턴을 아래 상수로 옮겨 적었습니다.
const PATTERNS = [
  { name: '관리자 그룹 추가' },
  { name: '처음 보는 관리자 명령' },
  { name: '업무 시간 밖 권한 사용' },
];
const [GROUP_ADD, ADMIN_COMMAND, OFF_HOURS_USE] = PATTERNS.map((pattern) => pattern.name);
const NORMAL_REASON = '권한 상승 흔적 없음';
const MITRE = ['T1068', 'T1078'];

const ADMIN_GROUP_ADD = /관리자\s*그룹에\s*(?:추가|들어|다시)|관리자\s*그룹에서\s*빠진.*다시\s*관리자/u;
const ADMIN_COMMAND_TEXT = /관리자\s*명령을?\s*실행|권한\s*명령을?\s*실행|관리자\s*권한으로\s*바뀌/u;
const UNFAMILIAR_SOURCE = /처음\s*보는\s*주소|원격\s*주소|요청\s*주소는\s*처음/u;
const OTHER_ACCOUNT = /다른\s*계정의\s*권한/u;
const OFF_HOURS = /수업\s*시간\s*밖|업무처럼\s*보이지\s*않는|업무\s*시간\s*밖/u;
const MINOR = /취소됐습니다|실패\s*\d+건|읽은\s*뒤|조회한\s*뒤|한\s*번\s*실행됐습니다|평소\s*주소/u;

function signalsOf(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const group = typeof alert?.data?.group === 'string' ? alert.data.group.toLowerCase() : '';
  const found = [];
  if (ADMIN_GROUP_ADD.test(description) || (group === 'administrators' && /추가|들어/u.test(description))) found.push('group');
  if (ADMIN_COMMAND_TEXT.test(description)) found.push('command');
  if (UNFAMILIAR_SOURCE.test(description)) found.push('source');
  if (OTHER_ACCOUNT.test(description)) found.push('account');
  if (OFF_HOURS.test(description)) found.push('off-hours');
  return { found, minor: MINOR.test(description) };
}

export function decide(alert) {
  const level = Number(alert?.rule?.level);
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const related = mitre.some((id) => MITRE.includes(id));
  const { found, minor } = signalsOf(alert);

  if (!related || !Number.isFinite(level) || level < 5) {
    return { action: 'record', confidence: 0.1, reason: NORMAL_REASON };
  }
  const reason = found.includes('off-hours') ? OFF_HOURS_USE
    : found.includes('group') ? GROUP_ADD
      : ADMIN_COMMAND;
  const strong = found.some((item) => item === 'group' || item === 'command' || item === 'account');
  if (level >= 10 && strong && !(minor && found.length < 2)) {
    return { action: 'block', confidence: Math.min(0.99, 0.88 + 0.03 * found.length), reason };
  }
  return { action: 'alert', confidence: Math.min(0.8, 0.55 + 0.05 * found.length), reason };
}
