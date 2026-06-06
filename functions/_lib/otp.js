// 管理ログインのメールOTP（ワンタイムコード）チャレンジ。
// パスワード照合の後段に置く2要素目。codes.js（crypto 生成）と admin-auth.js（KV+TTL運用）を踏襲。
//
// チャレンジは KV に otp:<challengeId> = { codeHash, attempts } を expirationTtl 付きで保存する。
// 失効は KV に委譲（クリーンアップ書き込み不要）。OTP は平文で保存せず SHA-256 ハッシュで持つ。
import { timingSafeEqual, generateToken } from './admin-auth.js';

export const OTP_TTL_SEC = 600;      // チャレンジ有効期間（10分）
export const OTP_MAX_ATTEMPTS = 5;   // 1チャレンジあたりの照合試行上限（総当たり遮断）
export const OTP_LENGTH = 6;         // メールから打ちやすい6桁数字

const OTP_PREFIX = 'otp:';

// 6桁（既定）の数字OTPを暗号学的乱数で生成する。
export function generateOtp(len = OTP_LENGTH) {
  const buf = new Uint8Array(len);
  globalThis.crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += String(buf[i] % 10);
  return out;
}

// チャレンジ用の不透明ID（256bit hex）。admin-auth の generateToken を再利用。
export function generateChallengeId() {
  return generateToken();
}

// OTP のハッシュ（challengeId をソルト代わりに連結して SHA-256 hex）。
// 同じコードでも challenge ごとに異なるハッシュになり、KV から平文を復元できない。
export async function hashOtp(challengeId, code) {
  const data = new TextEncoder().encode(`${challengeId}:${code}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// チャレンジを KV に保存する。codeHash は hashOtp の結果。
export async function storeChallenge(kv, id, { codeHash, ttlSec = OTP_TTL_SEC } = {}) {
  const value = JSON.stringify({ codeHash, attempts: 0 });
  await kv.put(OTP_PREFIX + id, value, { expirationTtl: ttlSec });
}

// チャレンジを照合する。
// 返り値: { ok:true } | { ok:false, reason:'expired'|'too_many_attempts'|'mismatch' }
//  - 取得不可（失効・未知ID）        → expired
//  - attempts が上限以上            → too_many_attempts（チャレンジ削除）
//  - ハッシュ不一致                  → mismatch（attempts++ を書き戻し、上限到達なら削除）
//  - 一致                           → ok（チャレンジ削除）
export async function verifyChallenge(kv, id, code) {
  if (!id || typeof id !== 'string') return { ok: false, reason: 'expired' };
  let raw;
  try { raw = await kv.get(OTP_PREFIX + id); }
  catch (e) { console.error('otp: challenge read failed', e); return { ok: false, reason: 'expired' }; }
  if (raw == null) return { ok: false, reason: 'expired' };

  let rec;
  try { rec = JSON.parse(raw); } catch (e) { console.error('otp: challenge parse failed', e); return { ok: false, reason: 'expired' }; }

  const attempts = Number(rec && rec.attempts) || 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await deleteChallenge(kv, id);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const candidate = await hashOtp(id, String(code == null ? '' : code));
  if (timingSafeEqual(candidate, rec.codeHash)) {
    await deleteChallenge(kv, id);
    return { ok: true };
  }

  // 不一致: 試行回数を進める。上限に達したらチャレンジを失効させる。
  const nextAttempts = attempts + 1;
  if (nextAttempts >= OTP_MAX_ATTEMPTS) {
    await deleteChallenge(kv, id);
    return { ok: false, reason: 'too_many_attempts' };
  }
  try {
    await kv.put(OTP_PREFIX + id, JSON.stringify({ ...rec, attempts: nextAttempts }), { expirationTtl: OTP_TTL_SEC });
  } catch (e) { console.error('otp: attempts write failed', e); }
  return { ok: false, reason: 'mismatch' };
}

export async function deleteChallenge(kv, id) {
  if (!id || typeof id !== 'string') return;
  try { await kv.delete(OTP_PREFIX + id); }
  catch (e) { console.error('otp: challenge delete failed', e); }
}
