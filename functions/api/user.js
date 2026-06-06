import { json } from '../_lib/http.js';
import { makeUser, validateUser, publicUser, normalizeName, USER_LIMITS } from '../_lib/users.js';
import { validatePred } from '../_lib/predictions.js';
import { generateCode, normalizeCode } from '../_lib/codes.js';
import { createRateLimiter } from '../_lib/ratelimit.js';
import { verifyTurnstile } from '../_lib/turnstile.js';

const uKey = (id) => `user:${id}`;
const ucKey = (code) => `usercode:${code}`;

// アイソレート内 soft レートリミッタ（KVを消費しない連打抑制）。
const limiter = createRateLimiter({ capacity: 30, refillPerSec: 1 });
const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'anon';

async function readUser(env, id) {
  if (!id) return null;
  let stored = null;
  try {
    stored = await env.CONFIG.get(uKey(id));
  } catch (e) {
    console.error('user: KV read failed', e);
    return null;
  }
  if (!stored) return null;
  try {
    return validateUser(JSON.parse(stored));
  } catch (e) {
    console.error('user: stored JSON parse failed', e);
    return null;
  }
}

// 既存 usercode と衝突しないコードを採番（最大5回試行）。
async function uniqueUserCode(env) {
  for (let i = 0; i < 5; i++) {
    const c = generateCode();
    try {
      if (!(await env.CONFIG.get(ucKey(c)))) return c;
    } catch (e) {
      console.error('user: code uniqueness check failed', e);
      return c;
    }
  }
  return generateCode();
}

// GET /api/user?id=...  → User 取得
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const user = await readUser(env, url.searchParams.get('id'));
  if (!user) return json(404, { error: 'ユーザーが見つかりません' });
  // 秘密の同期コードは返さない（id を知るだけの第三者に漏らさない）。
  return json(200, publicUser(user));
}

// POST /api/user  { op: 'create' | 'setPred' | 'sync', ... }
export async function onRequestPost({ request, env }) {
  if (!limiter(clientIp(request))) {
    return json(429, { error: '操作が多すぎます。少し待って再度お試しください' });
  }
  const cl = Number(request.headers.get('content-length') || 0);
  if (cl > USER_LIMITS.postBytes) return json(413, { error: 'データが大きすぎます' });

  let input;
  try {
    input = await request.json();
  } catch (e) {
    console.error('user POST: invalid json', e);
    return json(400, { error: 'JSONが不正です' });
  }

  const op = input && input.op;

  if (op === 'create') {
    // bot による大量アカウント作成（書き込み枠の枯渇）を防ぐ。secret 未設定時は素通り。
    const verdict = await verifyTurnstile({ secret: env.TURNSTILE_SECRET, token: input.turnstileToken, ip: clientIp(request) });
    if (!verdict.ok) return json(403, { error: '人間確認に失敗しました。もう一度お試しください' });
    const code = await uniqueUserCode(env);
    const user = makeUser(input.name, code);
    if (!user) return json(400, { error: '名前を入力してください' });
    try {
      await env.CONFIG.put(uKey(user.id), JSON.stringify(user));
      await env.CONFIG.put(ucKey(code), user.id);
    } catch (e) {
      console.error('user create: KV write failed', e);
      return json(500, { error: '保存に失敗しました' });
    }
    return json(200, { userId: user.id, code, user });
  }

  if (op === 'setPred') {
    const user = await readUser(env, input.userId);
    if (!user) return json(404, { error: 'ユーザーが見つかりません' });
    // 本人確認（IDOR防止）: 同期コードの所持を要求する。
    // クライアントは自分の code を保持しているため UX は変わらない。
    if (normalizeCode(input.code) !== user.code) {
      return json(403, { error: '本人確認に失敗しました' });
    }
    const next = { ...user, pred: validatePred(input.pred).value, updatedAt: new Date().toISOString() };
    try {
      await env.CONFIG.put(uKey(user.id), JSON.stringify(next));
    } catch (e) {
      console.error('user setPred: KV write failed', e);
      return json(500, { error: '保存に失敗しました' });
    }
    // 応答に code は含めない（本人は既に保持している）。
    return json(200, publicUser(next));
  }

  if (op === 'setName') {
    const user = await readUser(env, input.userId);
    if (!user) return json(404, { error: 'ユーザーが見つかりません' });
    // 本人確認（IDOR防止）: setPred と同様に同期コードの所持を要求する。
    if (normalizeCode(input.code) !== user.code) {
      return json(403, { error: '本人確認に失敗しました' });
    }
    const nm = normalizeName(input.name);
    if (!nm) return json(400, { error: '名前を入力してください' });
    const next = { ...user, name: nm, updatedAt: new Date().toISOString() };
    try {
      await env.CONFIG.put(uKey(user.id), JSON.stringify(next));
    } catch (e) {
      console.error('user setName: KV write failed', e);
      return json(500, { error: '保存に失敗しました' });
    }
    return json(200, publicUser(next));
  }

  if (op === 'sync') {
    const code = normalizeCode(input.code);
    if (!code) return json(400, { error: 'コードを入力してください' });
    let id = null;
    try {
      id = await env.CONFIG.get(ucKey(code));
    } catch (e) {
      console.error('user sync: KV read failed', e);
      return json(500, { error: '読み込みに失敗しました' });
    }
    const user = await readUser(env, id);
    if (!user) return json(404, { error: 'コードに該当するユーザーがいません' });
    return json(200, { userId: user.id, code, user });
  }

  return json(400, { error: '不明な操作です' });
}
