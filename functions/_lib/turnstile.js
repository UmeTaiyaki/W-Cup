// Cloudflare Turnstile（無料CAPTCHA）のサーバー側検証。
// 目的: 認証なしの create 系エンドポイント（ユーザー作成・部屋作成）を bot から守り、
// KV 書き込み枠（無料 1,000回/日）の枯渇を防ぐ。siteverify への外部 fetch 1回のみで
// KV は消費しない。
//
// 重要: secret 未設定なら検証をスキップ（skipped:true で通す）。これにより鍵を用意する
// 前でも安全にデプロイでき、ダッシュボードで TURNSTILE_SECRET を設定した瞬間に有効化される。
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// 返り値: { ok, skipped, reason?, codes? }
//   ok=false なら呼び出し側で 403 を返す想定。
export async function verifyTurnstile({ secret, token, ip, fetchImpl } = {}) {
  if (!secret) return { ok: true, skipped: true };               // 未設定 → 無効化（通す）
  if (!token || typeof token !== 'string') {
    return { ok: false, skipped: false, reason: 'missing-token' };
  }
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return { ok: false, skipped: false, reason: 'no-fetch' };

  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (ip) form.set('remoteip', ip);
    const res = await doFetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await res.json();
    return {
      ok: !!(data && data.success),
      skipped: false,
      reason: data && data.success ? null : 'verify-failed',
      codes: data ? data['error-codes'] : undefined,
    };
  } catch (e) {
    // 検証システム自体の通信障害でユーザーを締め出さない（fail-open）。
    // bot は success:false で弾かれる（fail-closed）。fail-open はあくまで siteverify が
    // 落ちている等の例外時のみで、ログを残す。レート制限/WAF が二重の防御になる。
    console.error('turnstile: verify request failed', e);
    return { ok: true, skipped: true, reason: 'verify-error' };
  }
}
