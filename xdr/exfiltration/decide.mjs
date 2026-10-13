// 자료 빼돌리기(T1041·T1048) 경보 판단 모듈입니다.
// 심판은 이 파일 하나만 불러오므로 import 없이, 파일을 읽거나 쓰지 않고, 혼자 계산합니다.
// patterns.json 의 패턴을 아래 상수로 옮겨 적었습니다.
const PATTERNS = [
  { name: '처음 보는 목적지로 대용량 전송' },
  { name: '업무 시간 밖 압축 파일 반출' },
];
const [BULK, ARCHIVE] = PATTERNS.map((pattern) => pattern.name);
const NORMAL_REASON = '유출 흔적 없음';
const MITRE = ['T1041', 'T1048'];
const BIG_BYTES = 50_000_000;
const MANY_FILES = 50;

const ARCHIVE_WORD = /압축\s*파일/u;
const OFF_HOURS = /수업\s*시간\s*밖|업무\s*시간\s*밖/u;

function numberOf(value) {
  const number = typeof value === 'number' ? value : Number(typeof value === 'string' ? value.trim() : NaN);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function decide(alert) {
  const level = Number(alert?.rule?.level);
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const bytes = numberOf(alert?.data?.bytes);
  const files = numberOf(alert?.data?.files);
  const repeats = numberOf(alert?.data?.count);
  const related = mitre.some((id) => MITRE.includes(id));

  if (!related || !Number.isFinite(level) || level < 5) {
    return { action: 'record', confidence: 0.1, reason: NORMAL_REASON };
  }
  const reason = ARCHIVE_WORD.test(description) && OFF_HOURS.test(description) ? ARCHIVE : BULK;
  const big = bytes >= BIG_BYTES || files >= MANY_FILES;
  if (level >= 10 && big) {
    const scale = Math.min(1, Math.log10(Math.max(bytes, 1) / BIG_BYTES + 1) / 1.2);
    const repeated = repeats >= 3 ? 0.02 : 0;
    return { action: 'block', confidence: Math.min(0.99, 0.9 + 0.06 * scale + repeated), reason };
  }
  return { action: 'alert', confidence: big ? 0.75 : 0.6, reason };
}
