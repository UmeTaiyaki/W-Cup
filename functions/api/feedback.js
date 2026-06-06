import { json } from '../_lib/http.js';
import { createRateLimiter } from '../_lib/ratelimit.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { validateUser } from '../_lib/users.js';
import { maskCode, validateFeedbackText, buildDiscordPayload } from '../_lib/feedback.js';

// アイソレート内ソフトレート制限（KV 不使用）。フィードバックは低頻度想定なので絞る。
const limiter = createRateLimiter({ capacity: 5, refillPerSec: 0.1 });
const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'anon';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function readUser(env, id) {
  if (!id) return null;
  try {
    const stored = await env.CONFIG.get(`user:${id}`);
    if (!stored) return null;
    return validateUser(JSON.parse(stored));
  } catch (e) {
    console.error('feedback: user read failed', e);
    return null;
  }
}

// POST /api/feedback  multipart/form-data: text, image?, userId, turnstileToken
export async function onRequestPost({ request, env }) {
  if (!limiter(clientIp(request))) {
    return json(429, { error: '操作が多すぎます。少し待って再度お試しください' });
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json(400, { error: 'リクエストを解釈できませんでした' });
  }

  const token = form.get('turnstileToken');
  const ts = await verifyTurnstile({ secret: env.TURNSTILE_SECRET, token, ip: clientIp(request) });
  if (!ts.ok) return json(403, { error: '確認に失敗しました。ページを更新して再度お試しください' });

  const v = validateFeedbackText(form.get('text'));
  if (!v.ok) return json(400, { error: v.error });

  const image = form.get('image');
  let imageFile = null;
  if (image && typeof image === 'object' && typeof image.arrayBuffer === 'function' && image.size > 0) {
    if (!String(image.type || '').startsWith('image/')) {
      return json(400, { error: '画像ファイルを添付してください' });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return json(400, { error: '画像サイズが大きすぎます（5MBまで）' });
    }
    imageFile = image;
  }

  const userId = form.get('userId') || '';
  const user = await readUser(env, userId);
  const name = user ? user.name : '(不明)';
  const codeMasked = user ? maskCode(user.code) : '-';
  const ua = request.headers.get('user-agent') || '(不明)';

  const webhook = env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    console.error('feedback: DISCORD_WEBHOOK_URL 未設定');
    return json(503, { error: 'ただいま送信できません。時間をおいて再度お試しください' });
  }

  const payload = buildDiscordPayload({
    text: v.value, userId, name, codeMasked, ua, ts: new Date().toISOString(),
  });
  const body = new FormData();
  body.set('payload_json', JSON.stringify(payload));
  if (imageFile) body.set('files[0]', imageFile, imageFile.name || 'image.jpg');

  try {
    const res = await fetch(webhook, { method: 'POST', body });
    if (!res.ok) {
      console.error('feedback: discord webhook failed', res.status);
      return json(502, { error: '送信に失敗しました。時間をおいて再度お試しください' });
    }
  } catch (e) {
    console.error('feedback: discord webhook error', e);
    return json(502, { error: '送信に失敗しました。時間をおいて再度お試しください' });
  }

  return json(200, { ok: true });
}
