// 同期コードを HttpOnly cookie で保持するためのヘルパー（純関数）。
// localStorage は iOS Safari の ITP（script 書き込みストレージの7日上限）で
// 消えることがあるが、サーバー発行の HttpOnly cookie はその対象外。これにより
// localStorage が消えても本人を復元でき、再オンボーディングを避けられる。
// JS から読めないため XSS で盗まれない（localStorage より安全）。

export const ID_COOKIE = 'wc_id';
const MAX_AGE = 60 * 60 * 24 * 400; // 約400日（主要ブラウザの cookie 寿命上限）

// 同期コードを cookie として発行する文字列を組み立てる。
// Path=/api に限定し、静的アセット配信への無駄な送信を避ける。
// secure=false はローカル開発（http）専用。
export function setIdCookie(code, { secure = true } = {}) {
  const base = `${ID_COOKIE}=${code}; Path=/api; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
}

// cookie を即時失効させる文字列（アカウント切替・データ削除時）。
export function clearIdCookie({ secure = true } = {}) {
  const base = `${ID_COOKIE}=; Path=/api; Max-Age=0; HttpOnly; SameSite=Lax`;
  return secure ? `${base}; Secure` : base;
}

// Cookie ヘッダ文字列から指定名の値を取り出す（無ければ null）。
export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
