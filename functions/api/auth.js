import { json } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { console.error('auth: invalid json', e); return json(400, { ok: false }); }
  const ok = !!env.ADMIN_PASSWORD && body && body.password === env.ADMIN_PASSWORD;
  return json(ok ? 200 : 401, { ok });
}
