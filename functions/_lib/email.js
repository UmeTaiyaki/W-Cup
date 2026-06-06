// メール送信（Resend）。管理ログインのOTP配信に使う。
// feedback.js の外部送信スタイル（env からシークレット取得・try/catch・未設定は明示エラー）を踏襲。
// Resend は単なる HTTPS API なので追加依存なし（fetch のみ）。

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
// DNS(SPF/DKIM)検証前でも動く既定差出人。検証後は wrangler.toml の OTP_FROM_EMAIL で上書き。
const DEFAULT_FROM = 'onboarding@resend.dev';

// Resend API 用のペイロードを組み立てる純関数（テスト対象）。
export function buildOtpEmail({ to, from, code, ttlMin = 10 }) {
  const subject = `【W杯2026予想 管理】認証コード ${code}`;
  const text = [
    '管理画面ログインの認証コードです。',
    '',
    `認証コード: ${code}`,
    `有効期限: ${ttlMin}分`,
    '',
    'このメールに心当たりがない場合は破棄してください。',
  ].join('\n');
  const html = [
    '<div style="font-family:sans-serif;line-height:1.6">',
    '<p>管理画面ログインの認証コードです。</p>',
    `<p style="font-size:28px;font-weight:800;letter-spacing:4px;margin:16px 0">${code}</p>`,
    `<p style="color:#666">有効期限: ${ttlMin}分</p>`,
    '<p style="color:#999;font-size:12px">このメールに心当たりがない場合は破棄してください。</p>',
    '</div>',
  ].join('');
  return { from: from || DEFAULT_FROM, to: [to], subject, text, html };
}

// OTP メールを送信する。env.RESEND_API_KEY 未設定は送信不可（呼び出し側で 503 を返す）。
// 返り値: { ok:true } | { ok:false, reason }
export async function sendOtpEmail(env, { to, code, ttlMin = 10 }) {
  if (!env || !env.RESEND_API_KEY) {
    console.error('email: RESEND_API_KEY 未設定');
    return { ok: false, reason: 'not_configured' };
  }
  if (!to) {
    console.error('email: 宛先(ADMIN_EMAIL)未設定');
    return { ok: false, reason: 'no_recipient' };
  }
  const payload = buildOtpEmail({ to, from: env.OTP_FROM_EMAIL, code, ttlMin });
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env.RESEND_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('email: resend send failed', res.status, detail);
      return { ok: false, reason: 'send_failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('email: resend send error', e);
    return { ok: false, reason: 'send_error' };
  }
}
