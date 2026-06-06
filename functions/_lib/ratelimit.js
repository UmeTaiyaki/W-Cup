// プロセス内（= Cloudflare Workers アイソレート内）の軽量レートリミッタ（トークンバケット）。
// あえて KV を使わない: レート計測のたびに KV へ書くと無料枠の書き込み(1,000回/日)を
// 食い潰し本末転倒になるため。アイソレートは分散・短命なので、これは「素朴な連打」を抑える
// soft guard。本格的・恒久的な制限は Cloudflare WAF の Rate Limiting Rules
// （ダッシュボードで設定・コード不要・無料枠でも1ルール利用可）で行う方針。
//
// capacity      : バケットの最大トークン数（瞬間的な許容回数）
// refillPerSec  : 1秒あたりの回復トークン数（平均許容レート）
// now           : 時刻取得関数（テストで差し替え可能）
export function createRateLimiter({ capacity = 30, refillPerSec = 0.5, now = () => Date.now() } = {}) {
  const buckets = new Map();
  return function allow(key) {
    const k = key == null ? 'anon' : String(key);
    const t = now();
    let b = buckets.get(k);
    if (!b) {
      b = { tokens: capacity, ts: t };
      buckets.set(k, b);
    }
    const elapsed = Math.max(0, (t - b.ts) / 1000);
    b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
    b.ts = t;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };
}
