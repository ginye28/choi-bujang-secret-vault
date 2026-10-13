import { createClient } from '@supabase/supabase-js';
import { diagTitle, readDiag } from '../src/diag-log.mjs';

// 임시 진단 조회(10단계 판정 원인 확인용). 요청 모양과 상태만 돌려주며 확인 뒤 지웁니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  let probe = null;
  if (String(request.url).includes('probe=1')) {
    const { error } = await supabase.from('training_notes').insert({
      owner_id: '00000000-0000-4000-8000-000000000000', title: diagTitle(),
      content: JSON.stringify({ at: new Date().toISOString(), route: 'probe' }),
    });
    probe = error ? { code: error.code ?? null, message: String(error.message).slice(0, 200) } : 'ok';
  }
  return response.status(200).json({ probe, events: await readDiag(supabase) });
}
