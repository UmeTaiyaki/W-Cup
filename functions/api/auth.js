import { json } from '../_lib/http.js';
import { createRateLimiter } from '../_lib/ratelimit.js';
import { verifyPassword } from '../_lib/admin-auth.js';
import { generateOtp, generateChallengeId, hashOtp, storeChallenge, OTP_TTL_SEC } from '../_lib/otp.js';
import { sendOtpEmail } from '../_lib/email.js';

// 管理ログイン（1段目）のソフトレート制限。総当たり＆メール送信濫用の抑止。
// capacity=5 / refillPerSec=0.05 ≒ 平均 20 秒に 1 回、瞬間 5 回まで。
const limiter = createRateLimiter({ capacity: 5, refillPerSec: 0.05 });
const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'anon';

// POST /api/auth  { password } → { ok, requiresOtp, challengeId, expiresIn }
// パスワード照合に成功したら OTP を生成して管理者メールへ送信し、チャレンジIDを返す。
// セッショントークンはこの段階では発行せず、2段目（/api/auth-verify）で確定する。
export async function onRequestPost({ request, env }) {
  if (!limiter(clientIp(request))) {
    return json(429, { ok: false, error: '試行が多すぎます。少し待って再度お試しください' });
  }
  let body;
  try { body = await request.json(); } catch (e) { console.error('auth: invalid json', e); return json(400, { ok: false }); }
  if (!verifyPassword(env, body && body.password)) {
    return json(401, { ok: false });
  }

  const challengeId = generateChallengeId();
  const code = generateOtp();
  const ttlMin = Math.round(OTP_TTL_SEC / 60);

  const sent = await sendOtpEmail(env, { to: env.ADMIN_EMAIL, code, ttlMin });
  if (!sent.ok) {
    // メールを送れなければチャレンジを作らない（無効なチャレンジを残さない）。
    const status = sent.reason === 'not_configured' || sent.reason === 'no_recipient' ? 503 : 502;
    return json(status, { ok: false, error: '認証コードを送信できませんでした。時間をおいて再度お試しください' });
  }

  try {
    const codeHash = await hashOtp(challengeId, code);
    await storeChallenge(env.CONFIG, challengeId, { codeHash });
  } catch (e) {
    console.error('auth: challenge store failed', e);
    return json(500, { ok: false, error: '認証の準備に失敗しました' });
  }

  return json(200, { ok: true, requiresOtp: true, challengeId, expiresIn: OTP_TTL_SEC });
}
