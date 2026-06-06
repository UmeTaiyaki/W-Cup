import { DEFAULT_CONFIG } from '../_lib/defaults.js';
import { validateConfig } from '../_lib/validate.js';
import { json } from '../_lib/http.js';

const KEY = 'config:v1';
// エッジキャッシュのTTL（秒）。config は全利用者共通の不変寄りデータ（試合結果・名簿）。
// この秒数だけ Cloudflare のエッジで配信し、起動ごとの KV 読み取り(無料枠 10万/日)を節約する。
// admin が PUT で更新したらキャッシュを破棄するので、反映遅延は最大このTTL。
const EDGE_TTL = 60;

// キャッシュキーは安定した正規URLで作る（クエリ等の揺れでキャッシュが分散しないように）。
const cacheKeyFor = (request) => new Request(new URL('/api/config', request.url).toString(), { method: 'GET' });

export async function onRequestGet(context) {
  const { env, request, waitUntil } = context;
  const cache = caches.default;
  const cacheKey = cacheKeyFor(request);

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let stored = null;
  try { stored = await env.CONFIG.get(KEY); } catch (e) { console.error('config GET: KV read failed', e); stored = null; }

  let body;
  if (!stored) {
    body = JSON.stringify(DEFAULT_CONFIG);
  } else {
    // 既存KV config に選手名簿(squads)が無い／クラブ情報の無い旧データならデフォルトをマージして補完。
    // 単一の真実は defaults.js。admin がクラブ付きで一度保存すれば再マージは止まり、編集が永続化される。
    body = stored;
    try {
      const cfg = JSON.parse(stored);
      const lists = cfg.squads && typeof cfg.squads === 'object' ? Object.values(cfg.squads) : [];
      const hasAnyClub = lists.some((l) => Array.isArray(l) && l.some((p) => p && p.club));
      if (!lists.length || !hasAnyClub) {
        body = JSON.stringify({ ...cfg, squads: DEFAULT_CONFIG.squads });
      }
    } catch (e) { console.error('config GET: stored JSON parse failed', e); }
  }

  // クライアントに渡す公開設定として Turnstile サイトキーを同梱する（サイトキーは公開前提の値）。
  // 未設定なら field を足さず、フロントは「Turnstile なし」として素通りする。
  const siteKey = env.TURNSTILE_SITE_KEY || null;
  if (siteKey) {
    try { body = JSON.stringify({ ...JSON.parse(body), turnstileSiteKey: siteKey }); }
    catch (e) { console.error('config GET: site key inject failed', e); }
  }

  const resp = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // ブラウザでは都度検証、Cloudflareエッジでは EDGE_TTL 秒キャッシュ。
      'cache-control': `public, max-age=0, s-maxage=${EDGE_TTL}`,
    },
  });
  // レスポンスをエッジキャッシュへ保存（応答はブロックしない）。
  if (waitUntil) waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

export async function onRequestPut(context) {
  const { request, env, waitUntil } = context;
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
  // 更新したらエッジキャッシュを破棄し、次の GET で最新を取り直させる。
  const purge = caches.default.delete(cacheKeyFor(request));
  if (waitUntil) waitUntil(purge); else await purge;
  return json(200, { ok: true, updatedAt: value.updatedAt });
}
