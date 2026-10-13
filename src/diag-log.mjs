// 임시 진단 기록(11단계 판정 원인 확인용): 요청의 모양(경로·헤더 이름·값 종류와 길이)과 응답 상태만 남깁니다.
// 메모 제목·내용·토큰·헤더 값은 기록하지 않습니다. 확인이 끝나면 이 파일과 api/diag.js 를 지웁니다.
const DIAG_PREFIX = '__backup__:diag:';

export function describeValue(value, depth = 0) {
  if (typeof value === 'string') return `str(${value.length})`;
  if (typeof value === 'number' || typeof value === 'boolean') return typeof value;
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return depth < 2 ? value.slice(0, 3).map((item) => describeValue(item, depth + 1)) : 'array';
  if (typeof value === 'object') {
    if (depth >= 2) return 'object';
    return Object.fromEntries(Object.keys(value).slice(0, 12).map((key) => [key.slice(0, 40), describeValue(value[key], depth + 1)]));
  }
  return typeof value;
}

export function describeRequest(request, extra = {}) {
  const url = String(request.url ?? '').split('?')[0].slice(0, 80);
  const headerNames = Object.keys(request.headers ?? {})
    .filter((name) => !/^(x-vercel|x-forwarded|x-real|host|accept-encoding|connection|content-length|traceparent|forwarded)/u.test(name))
    .sort().slice(0, 30);
  return {
    at: new Date().toISOString(), method: request.method, url, headers: headerNames,
    query: Object.keys(request.query ?? {}), body: describeValue(request.body),
    ua: String(request.headers?.['user-agent'] ?? '').slice(0, 50), ...extra,
  };
}

export async function writeDiag(supabase, event) {
  try {
    await supabase.from('training_notes').insert({
      owner_id: '00000000-0000-4000-8000-000000000000',
      title: `${DIAG_PREFIX}${new Date().toISOString()}:${Math.random().toString(36).slice(2, 6)}`,
      content: JSON.stringify(event).slice(0, 3000),
    });
  } catch {
    // 진단 기록 실패는 응답에 영향을 주지 않습니다.
  }
}

export async function readDiag(supabase, limit = 80) {
  const { data, error } = await supabase
    .from('training_notes')
    .select('content, created_at')
    .like('title', `${DIAG_PREFIX}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => { try { return JSON.parse(row.content); } catch { return null; } }).filter(Boolean);
}
