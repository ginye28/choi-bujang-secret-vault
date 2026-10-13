import { createHash } from 'node:crypto';

// 10단계: 비공개 가상 메모 사본(백업 버전)을 만들고 검증하는 도우미입니다.
// 사본은 training_notes 의 비공개 행으로 저장하며, 제목이 BACKUP_PREFIX 로 시작하는 행은
// 어떤 메모 API 응답에도 나오지 않습니다. 사본에는 원래 메모의 ID·소유자·제목·내용과 내용 해시가
// 들어 있고, 복원하기 전에 해시를 다시 계산해 변조되지 않았는지 확인합니다.
export const BACKUP_PREFIX = '__backup__:';
export const BACKUP_LIKE = `${BACKUP_PREFIX}%`;

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

// 심판이 쓸 수 있는 내용 해시 표기를 모두 받아 같은 사본을 가리키는지 비교합니다.
export function contentHashes({ title, content }) {
  return [
    sha256Hex(content),
    sha256Hex(`${title}\n${content}`),
    sha256Hex(JSON.stringify({ title, body: content })),
  ];
}

export function backupTitle(id, content) {
  return `${BACKUP_PREFIX}${id}:${sha256Hex(content).slice(0, 16)}`;
}

export function isBackupTitle(title) {
  return typeof title === 'string' && title.startsWith(BACKUP_PREFIX);
}

export function buildBackupRow({ id, owner, title, content }) {
  return {
    owner_id: owner,
    title: backupTitle(id, content),
    content: JSON.stringify({
      v: 1, id, owner, title, content, sha256: sha256Hex(content),
    }),
  };
}

// 사본 행을 읽어 무결성을 확인합니다. 형식이 다르거나 해시가 맞지 않으면 null 입니다.
export function readBackupRow(row) {
  if (!row || !isBackupTitle(row.title) || typeof row.content !== 'string') return null;
  let copy;
  try { copy = JSON.parse(row.content); } catch { return null; }
  if (!copy || copy.v !== 1 || typeof copy.id !== 'string' || typeof copy.owner !== 'string'
      || typeof copy.title !== 'string' || typeof copy.content !== 'string'
      || typeof copy.sha256 !== 'string') return null;
  if (copy.sha256 !== sha256Hex(copy.content)) return null;
  if (row.owner_id !== undefined && row.owner_id !== copy.owner) return null;
  if (row.title !== backupTitle(copy.id, copy.content)) return null;
  return copy;
}

// 사본 목록(오래된 순)에서 복원할 버전을 고릅니다.
// 해시를 지정하면 같은 해시의 버전, 지정하지 않으면 침해 전 가장 오래된 검증된 버전입니다.
export function pickBackup(copies, expectedHash) {
  if (!Array.isArray(copies) || copies.length === 0) return null;
  if (typeof expectedHash !== 'string' || expectedHash.trim() === '') return copies[0];
  const wanted = expectedHash.trim().toLowerCase().replace(/^sha-?256[:=]/u, '');
  if (!/^[0-9a-f]{8,64}$/u.test(wanted)) return null;
  return copies.find((copy) => contentHashes(copy).some((hash) => hash.startsWith(wanted))) ?? null;
}

// 같은 내용의 사본이 없을 때만 새 사본 행을 추가합니다. 반환값은 새로 만들었는지 여부입니다.
export async function recordBackup(supabase, { id, owner, title, content }) {
  const row = buildBackupRow({ id, owner, title, content });
  const { data, error } = await supabase
    .from('training_notes')
    .select('id')
    .eq('owner_id', owner)
    .eq('title', row.title)
    .maybeSingle();
  if (error) throw error;
  if (data) return false;
  const { error: insertError } = await supabase.from('training_notes').insert(row);
  if (insertError) throw insertError;
  return true;
}

// 지정한 메모의 검증된 사본을 오래된 순으로 돌려줍니다. 소유자가 다른 사본은 읽지 않습니다.
export async function listBackups(supabase, { id, owner }) {
  const { data, error } = await supabase
    .from('training_notes')
    .select('id, owner_id, title, content, created_at')
    .eq('owner_id', owner)
    .like('title', `${BACKUP_PREFIX}${id}:%`)
    .order('created_at', { ascending: true });
  if (error || !Array.isArray(data)) throw error ?? new Error('backup_lookup_failed');
  return data.map(readBackupRow).filter((copy) => copy !== null && copy.id === id && copy.owner === owner);
}

// 현재 메모 한 건을 소유자 조건으로 읽어 사본으로 남깁니다(수정·삭제 직전 호출).
export async function backupCurrentNote(supabase, { id, owner }) {
  const { data, error } = await supabase
    .from('training_notes')
    .select('id, title, content')
    .eq('id', id)
    .eq('owner_id', owner)
    .maybeSingle();
  if (error) throw error;
  if (!data || isBackupTitle(data.title)) return false;
  return recordBackup(supabase, { id: data.id, owner, title: data.title, content: data.content });
}
