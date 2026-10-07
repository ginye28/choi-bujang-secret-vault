const DEFAULT_SUPABASE_URL = 'https://ldtrdbdsxzppjwnvbdgf.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_amnYNFLw-nOpHU0iCIaXrQ_drb3gIzL';

function requestBody(request) {
  let body = request.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body;
}

function failure(response, action, status = 400) {
  const signup = action === 'signup';
  return response.status(status).json({
    error: signup ? 'SIGNUP_FAILED' : 'LOGIN_FAILED',
    message: signup ? '회원가입 정보를 확인해 주세요.' : '로그인 정보를 확인해 주세요.',
  });
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const body = requestBody(request);
  const action = body?.action;
  const signup = action === 'signup';
  if (!body || (action !== 'login' && !signup)
      || typeof body.email !== 'string' || !body.email.trim()
      || typeof body.password !== 'string' || !body.password) {
    return failure(response, signup ? 'signup' : 'login');
  }

  const supabaseUrl = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/u, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY;
  const endpoint = signup
    ? `${supabaseUrl}/auth/v1/signup`
    : `${supabaseUrl}/auth/v1/token?grant_type=password`;

  let authResponse;
  let authResult;
  try {
    authResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email: body.email.trim(), password: body.password }),
    });
    try { authResult = await authResponse.json(); } catch { authResult = null; }
  } catch {
    return failure(response, signup ? 'signup' : 'login');
  }

  if (!authResponse.ok) {
    return failure(response, signup ? 'signup' : 'login', authResponse.status === 401 ? 401 : 400);
  }

  const accessToken = typeof authResult?.access_token === 'string' ? authResult.access_token : null;
  if (!signup && !accessToken) {
    return failure(response, 'login');
  }

  return response.status(200).json({
    access_token: accessToken,
    email: typeof authResult?.user?.email === 'string' ? authResult.user.email : body.email.trim(),
  });
}
