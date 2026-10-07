import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
let services;

function getServices() {
  if (services) return services;

  const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()
      || typeof supabaseSecretKey !== 'string' || !supabaseSecretKey.trim()) {
    throw new Error('server_not_configured');
  }

  const verifyLogin = createLoginVerifier({ config, supabaseSecretKey });
  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  services = { verifyLogin, supabase };
  return services;
}

function queryId(request) {
  if (request.query && Object.hasOwn(request.query, 'id')) {
    return typeof request.query.id === 'string' ? request.query.id : null;
  }
  try {
    const url = new URL(request.url, 'http://localhost');
    return url.searchParams.has('id') ? url.searchParams.get('id') : undefined;
  } catch {
    return undefined;
  }
}

function requestBody(request) {
  let body = request.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body;
}

function isNoteBody(body) {
  return body && typeof body.title === 'string' && typeof body.body === 'string';
}

function noteFromRow(row) {
  return { id: row.id, title: row.title, body: row.content };
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  let currentServices;
  try {
    currentServices = getServices();
  } catch {
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }

  let identity;
  try {
    identity = await currentServices.verifyLogin(request.headers?.authorization);
  } catch {
    identity = null;
  }
  if (!identity?.userId) {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const id = queryId(request);
  const hasId = id !== undefined;
  if (hasId && (typeof id !== 'string' || !UUID.test(id))) {
    return response.status(400).json({ error: 'INVALID_ID' });
  }

  const { method } = request;
  const supabase = currentServices.supabase;

  try {
    if (method === 'GET' && !hasId) {
      const { data, error } = await supabase
        .from('training_notes')
        .select('id, title, content')
        .eq('owner_id', identity.userId);
      if (error || !Array.isArray(data)) {
        return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      }
      return response.status(200).json(data.map(noteFromRow));
    }

    if (method === 'GET' && hasId) {
      const { data, error } = await supabase
        .from('training_notes')
        .select('id, title, content')
        .eq('id', id)
        .maybeSingle();
      if (error) return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      if (!data) return response.status(404).json({ error: 'NOT_FOUND' });
      return response.status(200).json(noteFromRow(data));
    }

    if (method === 'POST' && !hasId) {
      const body = requestBody(request);
      if (!isNoteBody(body)) return response.status(400).json({ error: 'INVALID_BODY' });
      if (body.id !== undefined && (typeof body.id !== 'string' || !UUID.test(body.id))) {
        return response.status(400).json({ error: 'INVALID_ID' });
      }

      const idToCreate = body.id ?? randomUUID();
      const { data, error } = await supabase
        .from('training_notes')
        .insert({
          id: idToCreate,
          owner_id: identity.userId,
          title: body.title,
          content: body.body,
        })
        .select('id')
        .single();
      if (error || !data) {
        return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      }
      return response.status(201).json({ id: data.id });
    }

    if (method === 'PUT' && hasId) {
      const body = requestBody(request);
      if (!isNoteBody(body)) return response.status(400).json({ error: 'INVALID_BODY' });
      const { data, error } = await supabase
        .from('training_notes')
        .update({ title: body.title, content: body.body })
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      if (!data) return response.status(404).json({ error: 'NOT_FOUND' });
      return response.status(200).json({ id: data.id });
    }

    if (method === 'DELETE' && hasId) {
      const { data, error } = await supabase
        .from('training_notes')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      if (!data) return response.status(404).json({ error: 'NOT_FOUND' });
      return response.status(200).json({ id: data.id });
    }

    response.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch {
    return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }
}
