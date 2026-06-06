// 管理者認証の共通ロジック。auth.js（ログイン）と config.js（PUT）の両方から使う。
// 方針:
//   - パスワード照合はタイミング安全比較（length も早期 return しない）で行う。
//   - ログイン成功時に高エントロピーなセッショントークンを発行し KV に保存する。
//     以降の管理操作はこのトークンで認証し、生パスワードを使い回さない。
//   - トークンの失効は KV の expirationTtl に任せる（クリーンアップ書き込み不要で
//     無料枠の書き込み 1,000/日 を消費しない）。

// セッションの有効期間（秒）。試合結果の編集作業を想定して 12 時間。
export const SESSION_TTL_SEC = 12 * 60 * 60;

const SESSION_PREFIX = 'session:';
// セッショントークンのバイト長（256bit）。総当たり不可能な空間を確保する。
const TOKEN_BYTES = 32;

// タイミング安全な文字列比較。長さが違う場合も早期 return せず、長さリークを避ける。
// crypto.timingSafeEqual は Workers に無いため自前実装（XOR 累積）。
export function timingSafeEqual(a, b) {
  const sa = a == null ? '' : String(a);
  const sb = b == null ? '' : String(b);
  const len = Math.max(sa.length, sb.length);
  let diff = sa.length ^ sb.length;
  for (let i = 0; i < len; i++) {
    diff |= (sa.charCodeAt(i) || 0) ^ (sb.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// 管理パスワードの照合。ADMIN_PASSWORD 未設定なら常に false（誤って無認証にしない）。
export function verifyPassword(env, password) {
  if (!env || !env.ADMIN_PASSWORD) return false;
  return timingSafeEqual(password, env.ADMIN_PASSWORD);
}

// 暗号学的乱数で 16進トークンを生成する純粋寄り関数（crypto に依存）。
export function generateToken(bytes = TOKEN_BYTES) {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) out += buf[i].toString(16).padStart(2, '0');
  return out;
}

// セッションを発行し KV に保存してトークンを返す。
// 値には発行時刻のみ保持（失効自体は expirationTtl が担う）。
export async function createSession(kv, { ttlSec = SESSION_TTL_SEC, now = () => Date.now() } = {}) {
  const token = generateToken();
  const value = JSON.stringify({ iat: now() });
  await kv.put(SESSION_PREFIX + token, value, { expirationTtl: ttlSec });
  return token;
}

// トークンが有効なセッションか検証する。空トークンは即 false。
// KV にキーが残っていれば有効（期限切れは KV が自動削除している）。
export async function verifySession(kv, token) {
  if (!token || typeof token !== 'string') return false;
  try {
    const stored = await kv.get(SESSION_PREFIX + token);
    return stored != null;
  } catch (e) {
    console.error('admin-auth: session read failed', e);
    return false;
  }
}

// 明示ログアウト用。存在しなくてもエラーにしない。
export async function deleteSession(kv, token) {
  if (!token || typeof token !== 'string') return;
  try { await kv.delete(SESSION_PREFIX + token); }
  catch (e) { console.error('admin-auth: session delete failed', e); }
}
