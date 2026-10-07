import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) {
    return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase
      .from('training_notes')
      .select('title, content');

    if (error || !Array.isArray(data)) {
      return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
    }

    return response.status(200).json({
      notes: data.map(({ title, content }) => ({ title, content })),
    });
  } catch {
    return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }
}
