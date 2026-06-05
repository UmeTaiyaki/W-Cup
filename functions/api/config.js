import { DEFAULT_CONFIG } from '../_lib/defaults.js';
import { validateConfig } from '../_lib/validate.js';
import { json } from '../_lib/http.js';

const KEY = 'config:v1';

export async function onRequestGet({ env }) {
  let stored = null;
  try { stored = await env.CONFIG.get(KEY); } catch (e) { console.error('config GET: KV read failed', e); stored = null; }
  if (!stored) {
    return new Response(JSON.stringify(DEFAULT_CONFIG), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  // 既存KV config に選手名簿(squads)が無い／クラブ情報の無い旧データならデフォルトをマージして補完。
  // 単一の真実は defaults.js。admin がクラブ付きで一度保存すれば再マージは止まり、編集が永続化される。
  let body = stored;
  try {
    const cfg = JSON.parse(stored);
    const lists = cfg.squads && typeof cfg.squads === 'object' ? Object.values(cfg.squads) : [];
    const hasAnyClub = lists.some((l) => Array.isArray(l) && l.some((p) => p && p.club));
    if (!lists.length || !hasAnyClub) {
      body = JSON.stringify({ ...cfg, squads: DEFAULT_CONFIG.squads });
    }
  } catch (e) { console.error('config GET: stored JSON parse failed', e); }
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
  try { input = await request.json(); } catch (e) { console.error('config PUT: invalid json', e); return json(400, { error: 'JSONが不正です' }); }
  const res = validateConfig(input);
  if (!res.ok) return json(400, { error: res.error });
  const value = { ...res.value, version: 1, updatedAt: new Date().toISOString() };
  try {
    await env.CONFIG.put(KEY, JSON.stringify(value));
  } catch (e) {
    console.error('config PUT: KV write failed', e);
    return json(500, { error: '保存に失敗しました' });
  }
  return json(200, { ok: true, updatedAt: value.updatedAt });
}
