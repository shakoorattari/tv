const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

async function requestGoogle(url, fields) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: new URLSearchParams(fields),
      redirect: 'error',
      signal: controller.signal,
    });
    return {ok: response.ok, data: await response.json()};
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request, env) {
    const origin = env.STRAND_WEB_ORIGIN || 'https://shakoorattari.com';
    if (request.headers.get('Origin') !== origin) return new Response(null, {status: 403});
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
    };
    const respond = (data, status = 200) => Response.json(data, {headers, status});
    const path = new URL(request.url).pathname;
    if (!['/start', '/poll'].includes(path)) return respond({error: 'not_found'}, 404);
    if (request.method === 'OPTIONS') return new Response(null, {headers, status: 204});
    if (request.method !== 'POST') return respond({error: 'method_not_allowed'}, 405);
    const client_id = env.GOOGLE_DEVICE_CLIENT_ID;
    const client_secret = env.GOOGLE_DEVICE_CLIENT_SECRET;
    if (!client_id || !client_secret) return respond({error: 'unavailable'}, 503);

    try {
      if (path === '/start') {
        const {ok, data} = await requestGoogle(DEVICE_CODE_URL, {client_id, scope: 'openid email profile'});
        if (!ok) return respond({error: data.error === 'rate_limit_exceeded' ? 'busy' : 'unavailable'}, 503);
        return respond({
          device_code: data.device_code,
          user_code: data.user_code,
          verification_url: data.verification_url || data.verification_uri,
          expires_in: data.expires_in,
          interval: data.interval,
        });
      }
      // A device code is opaque to the relay. Cap input before forwarding it to Google.
      let bytes = 0;
      const code = await new Response(request.body?.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > 1024) throw new Error('Invalid device code');
          controller.enqueue(chunk);
        },
      }))).text();
      if (!/^[!-~]{10,1024}$/.test(code)) return respond({error: 'invalid_code'}, 400);
      const {ok, data} = await requestGoogle(TOKEN_URL, {
        client_id, client_secret, device_code: code, grant_type: DEVICE_GRANT,
      });
      if (ok && typeof data.id_token === 'string') return respond({id_token: data.id_token});
      if (['authorization_pending', 'slow_down', 'expired_token', 'access_denied'].includes(data.error)) {
        return respond({status: data.error});
      }
      return respond({error: 'unavailable'}, 502);
    } catch {
      return respond({error: 'unavailable'}, 502);
    }
  },
};
