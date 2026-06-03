import { DEFAULT_CONFIG } from '../_lib/defaults.js';
import { validateConfig } from '../_lib/validate.js';
import { json } from '../_lib/http.js';

const KEY = 'config:v1';

export async function onRequestGet({ env }) {
  let stored = null;
  try { stored = await env.CONFIG.get(KEY); } catch (e) { stored = null; }
  const body = stored || JSON.stringify(DEFAULT_CONFIG);
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function onRequestPut({ request, env }) {
  const auth = request.headers.get('authorization') || '';
  const pass = auth.replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_PASSWORD || pass !== env.ADMIN_PASSWORD) {
    return json(401, { error: 'パスワードが違います' });
  }
  let input;
  try { input = await request.json(); } catch (e) { return json(400, { error: 'JSONが不正です' }); }
  const res = validateConfig(input);
  if (!res.ok) return json(400, { error: res.error });
  const value = { ...res.value, version: 1, updatedAt: new Date().toISOString() };
  try {
    await env.CONFIG.put(KEY, JSON.stringify(value));
  } catch (e) {
    return json(500, { error: '保存に失敗しました' });
  }
  return json(200, { ok: true, updatedAt: value.updatedAt });
}
