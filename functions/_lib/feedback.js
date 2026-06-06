// フィードバック機能の純粋ロジック（KV/ネットワークに非依存・テスト可能）。

// 同期コードは実質パスワードのため、Discord には末尾4桁だけマスク表示する。
export function maskCode(code) {
  if (!code || typeof code !== 'string') return '-';
  const c = code.replace(/-/g, '');
  if (c.length <= 4) return '****';
  return '****-' + c.slice(-4);
}

// 本文のバリデーション。{ ok, value?, error? } を返す。
export function validateFeedbackText(text, { max = 1000 } = {}) {
  if (typeof text !== 'string') return { ok: false, error: '本文を入力してください' };
  const value = text.trim();
  if (!value) return { ok: false, error: '本文を入力してください' };
  if (value.length > max) return { ok: false, error: `本文は${max}文字以内で入力してください` };
  return { ok: true, value };
}

// Discord Webhook の embed ペイロードを新規生成（mutation しない）。
// Discord 制限: description ≤ 4096、field value ≤ 1024。
export function buildDiscordPayload({ text, userId, name, codeMasked, ua, ts } = {}) {
  return {
    embeds: [
      {
        title: '📩 フィードバック',
        description: String(text || '').slice(0, 4000),
        color: 0xff8a3d,
        fields: [
          { name: 'ニックネーム', value: name || '(不明)', inline: true },
          { name: 'userId', value: userId || '(不明)', inline: true },
          { name: '同期コード', value: codeMasked || '-', inline: true },
          { name: 'UA', value: String(ua || '(不明)').slice(0, 1000), inline: false },
        ],
        timestamp: ts || '',
      },
    ],
  };
}
