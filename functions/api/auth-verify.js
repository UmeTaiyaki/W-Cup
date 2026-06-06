import { json } from '../_lib/http.js';
import { createRateLimiter } from '../_lib/ratelimit.js';
import { createSession, SESSION_TTL_SEC } from '../_lib/admin-auth.js';
import { verifyChallenge } from '../_lib/otp.js';

// 管理ログイン（2段目=OTP照合）のソフトレート制限。
const limiter = createRateLimiter({ capacity: 10, refillPerSec: 0.1 });
const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'anon';

// チャレンジ側にも attempts 上限があるが、フロント任意のメッセージ用に reason を返す。
const REASON_MESSAGE = {
  expired: 'コードの有効期限が切れました。最初からやり直してください',
  too_many_attempts: '試行回数が上限に達しました。最初からやり直してください',
  mismatch: 'コードが違います',
};

// POST /api/auth-verify  { challengeId, code } → { ok, token, expiresIn } | { ok:false, reason }
// OTP 照合に成功したら、ここで初めてセッショントークンを発行する（以降は従来運用と同形）。
export async function onRequestPost({ request, env }) {
  if (!limiter(clientIp(request))) {
    return json(429, { ok: false, error: '試行が多すぎます。少し待って再度お試しください' });
  }
  let body;
  try { body = await request.json(); } catch (e) { console.error('auth-verify: invalid json', e); return json(400, { ok: false }); }

  const challengeId = body && body.challengeId;
  const code = body && body.code;
  const res = await verifyChallenge(env.CONFIG, challengeId, code);
  if (!res.ok) {
    return json(401, { ok: false, reason: res.reason, error: REASON_MESSAGE[res.reason] || 'コードが違います' });
  }

  let token;
  try {
    token = await createSession(env.CONFIG);
  } catch (e) {
    console.error('auth-verify: session create failed', e);
    return json(500, { ok: false, error: 'セッションの作成に失敗しました' });
  }
  return json(200, { ok: true, token, expiresIn: SESSION_TTL_SEC });
}
