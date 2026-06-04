// 同期コード/参加コードの生成・整形・正規化（純関数）。
// 紛らわしい文字 0 1 I L O U を除外した30文字。8文字で約39bit。
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;

// 整数列をアルファベットの文字列へ（剰余で範囲内に丸める）。テスト容易性のため分離。
export function codeFromInts(ints) {
  const n = CODE_ALPHABET.length;
  return (Array.isArray(ints) ? ints : [])
    .map((v) => CODE_ALPHABET[((v % n) + n) % n])
    .join('');
}

// 暗号学的乱数でコード生成。Web Crypto が無ければ Math.random にフォールバック。
export function generateCode(len = CODE_LENGTH) {
  const n = CODE_ALPHABET.length;
  const out = [];
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    const buf = new Uint8Array(len);
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) out.push(CODE_ALPHABET[buf[i] % n]);
  } else {
    for (let i = 0; i < len; i++) out.push(CODE_ALPHABET[Math.floor(Math.random() * n)]);
  }
  return out.join('');
}

// 表示用にハイフンで二分（8文字 → XXXX-XXXX）。
export function formatCode(code) {
  const c = String(code || '');
  if (c.length <= 4) return c;
  const mid = Math.ceil(c.length / 2);
  return c.slice(0, mid) + '-' + c.slice(mid);
}

// 入力を正規化：大文字化し、アルファベット外（ハイフン・空白等）を除去。
export function normalizeCode(input) {
  return String(input || '')
    .toUpperCase()
    .split('')
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join('');
}
