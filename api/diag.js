import { createClient } from '@supabase/supabase-js';
import { readDiag } from '../src/diag-log.mjs';

// 임시 진단 조회(10단계 판정 원인 확인용). 요청 모양과 상태만 돌려주며 확인 뒤 지웁니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return response.status(200).json({ events: await readDiag(supabase) });
}
