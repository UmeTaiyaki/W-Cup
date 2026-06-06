# フィードバック機能(Discord通知)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アカウントタブから本文＋画像1枚のフィードバックを送信し、Discord Webhook へ通知する機能を追加する。

**Architecture:** フロント(`index.html` 内 `FeedbackForm`)が画像を canvas 圧縮し multipart で `/api/feedback` へ POST。Pages Function がレート制限→Turnstile 検証→バリデーション→`userId` で KV read(name/コード末尾4桁取得)→Discord Webhook へファイルごと転送。純粋ロジックは `functions/_lib/feedback.js` に分離し TDD でテストする。KV 書き込みは 0 件。

**Tech Stack:** Cloudflare Pages Functions(ESM)、KV(`CONFIG`)、Cloudflare Turnstile、React(ブラウザ Babel、インライン JSX)、`node --test`。

参照仕様: `docs/superpowers/specs/2026-06-06-feedback-discord-design.md`

---

## File Structure

- **Create** `functions/_lib/feedback.js` — 純粋ロジック(`maskCode` / `validateFeedbackText` / `buildDiscordPayload`)
- **Create** `functions/_lib/feedback.test.js` — 上記のユニットテスト
- **Create** `functions/api/feedback.js` — `POST /api/feedback` エンドポイント
- **Modify** `public/identity.js` — `window.WC.Feedback.send()` を追加
- **Modify** `public/index.html` — `compressImage` ヘルパ＋`FeedbackForm` コンポーネント追加、`AccountScreen` に統合、呼び出しに `siteKey` を渡す
- **Manual** `.dev.vars` / Cloudflare secret — `DISCORD_WEBHOOK_URL` 設定(ユーザー作業)

---

## Task 1: `maskCode`(純粋ロジック)

**Files:**
- Create: `functions/_lib/feedback.js`
- Test: `functions/_lib/feedback.test.js`

- [ ] **Step 1: Write the failing test**

Create `functions/_lib/feedback.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskCode } from './feedback.js';

test('maskCode は末尾4桁だけ残して ****-XXXX を返す', () => {
  assert.equal(maskCode('ABCD2345'), '****-2345');
});

test('maskCode はハイフン付きコードを正規化してからマスクする', () => {
  assert.equal(maskCode('ABCD-2345'), '****-2345');
});

test('maskCode は4文字以下を **** に潰す', () => {
  assert.equal(maskCode('AB'), '****');
  assert.equal(maskCode('ABCD'), '****');
});

test('maskCode は空・null を - にする', () => {
  assert.equal(maskCode(''), '-');
  assert.equal(maskCode(null), '-');
  assert.equal(maskCode(undefined), '-');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（`Cannot find module './feedback.js'` 等）

- [ ] **Step 3: Write minimal implementation**

Create `functions/_lib/feedback.js`:

```js
// フィードバック機能の純粋ロジック（KV/ネットワークに非依存・テスト可能）。

// 同期コードは実質パスワードのため、Discord には末尾4桁だけマスク表示する。
export function maskCode(code) {
  if (!code || typeof code !== 'string') return '-';
  const c = code.replace(/-/g, '');
  if (c.length <= 4) return '****';
  return '****-' + c.slice(-4);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（maskCode の4テスト）

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/feedback.js functions/_lib/feedback.test.js
git commit -m "feat: フィードバック maskCode（同期コード末尾4桁マスク）"
```

---

## Task 2: `validateFeedbackText`(純粋ロジック)

**Files:**
- Modify: `functions/_lib/feedback.js`
- Test: `functions/_lib/feedback.test.js`

- [ ] **Step 1: Write the failing test**

`functions/_lib/feedback.test.js` の import に `validateFeedbackText` を追加し、末尾にテストを追記:

```js
// import 行を更新:
// import { maskCode, validateFeedbackText } from './feedback.js';

test('validateFeedbackText は trim 済みの本文を返す', () => {
  assert.deepEqual(validateFeedbackText('  こんにちは  '), { ok: true, value: 'こんにちは' });
});

test('validateFeedbackText は空・空白のみを弾く', () => {
  assert.equal(validateFeedbackText('').ok, false);
  assert.equal(validateFeedbackText('   ').ok, false);
  assert.equal(validateFeedbackText(123).ok, false);
});

test('validateFeedbackText は上限超過を弾く', () => {
  const long = 'あ'.repeat(1001);
  assert.equal(validateFeedbackText(long).ok, false);
  assert.equal(validateFeedbackText('あ'.repeat(1000)).ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（`validateFeedbackText is not a function`）

- [ ] **Step 3: Write minimal implementation**

`functions/_lib/feedback.js` に追記:

```js
// 本文のバリデーション。{ ok, value?, error? } を返す。
export function validateFeedbackText(text, { max = 1000 } = {}) {
  if (typeof text !== 'string') return { ok: false, error: '本文を入力してください' };
  const value = text.trim();
  if (!value) return { ok: false, error: '本文を入力してください' };
  if (value.length > max) return { ok: false, error: `本文は${max}文字以内で入力してください` };
  return { ok: true, value };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/feedback.js functions/_lib/feedback.test.js
git commit -m "feat: フィードバック本文バリデーション"
```

---

## Task 3: `buildDiscordPayload`(純粋ロジック)

**Files:**
- Modify: `functions/_lib/feedback.js`
- Test: `functions/_lib/feedback.test.js`

- [ ] **Step 1: Write the failing test**

import に `buildDiscordPayload` を追加し、末尾にテストを追記:

```js
// import 行を更新:
// import { maskCode, validateFeedbackText, buildDiscordPayload } from './feedback.js';

test('buildDiscordPayload は本文と文脈を embed に詰める', () => {
  const p = buildDiscordPayload({
    text: 'バグ報告', userId: 'u_abc', name: 'たろう',
    codeMasked: '****-2345', ua: 'Mozilla/5.0', ts: '2026-06-06T00:00:00.000Z',
  });
  assert.equal(p.embeds[0].description, 'バグ報告');
  assert.equal(p.embeds[0].timestamp, '2026-06-06T00:00:00.000Z');
  const fieldsText = JSON.stringify(p.embeds[0].fields);
  assert.ok(fieldsText.includes('u_abc'));
  assert.ok(fieldsText.includes('たろう'));
  assert.ok(fieldsText.includes('****-2345'));
  assert.ok(fieldsText.includes('Mozilla/5.0'));
});

test('buildDiscordPayload は欠損値に既定を入れる', () => {
  const p = buildDiscordPayload({ text: 'x', ts: '2026-06-06T00:00:00.000Z' });
  const fieldsText = JSON.stringify(p.embeds[0].fields);
  assert.ok(fieldsText.includes('(不明)'));
});

test('buildDiscordPayload は入力オブジェクトを変更しない', () => {
  const input = { text: 'x', ua: 'a'.repeat(2000), ts: '2026-06-06T00:00:00.000Z' };
  const snapshot = JSON.stringify(input);
  buildDiscordPayload(input);
  assert.equal(JSON.stringify(input), snapshot);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL（`buildDiscordPayload is not a function`）

- [ ] **Step 3: Write minimal implementation**

`functions/_lib/feedback.js` に追記:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（feedback.test.js の全テスト）

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/feedback.js functions/_lib/feedback.test.js
git commit -m "feat: Discord embed ペイロード生成"
```

---

## Task 4: API エンドポイント `POST /api/feedback`

**Files:**
- Create: `functions/api/feedback.js`

このタスクは外部 fetch(Discord)と KV を伴うため、既存 `functions/api/*.js`(`user.js` 等)と同じく純粋ロジックを `_lib` に逃がしてある。エンドポイント本体はユニットテスト対象外(既存方針に準拠)。手動確認は Task 6 後にまとめて行う。

- [ ] **Step 1: エンドポイントを実装**

Create `functions/api/feedback.js`:

```js
import { json } from '../_lib/http.js';
import { createRateLimiter } from '../_lib/ratelimit.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { validateUser } from '../_lib/users.js';
import { maskCode, validateFeedbackText, buildDiscordPayload } from '../_lib/feedback.js';

// アイソレート内ソフトレート制限（KV 不使用）。フィードバックは低頻度想定なので絞る。
const limiter = createRateLimiter({ capacity: 5, refillPerSec: 0.1 });
const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'anon';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function readUser(env, id) {
  if (!id) return null;
  try {
    const stored = await env.CONFIG.get(`user:${id}`);
    if (!stored) return null;
    return validateUser(JSON.parse(stored));
  } catch (e) {
    console.error('feedback: user read failed', e);
    return null;
  }
}

// POST /api/feedback  multipart/form-data: text, image?, userId, turnstileToken
export async function onRequestPost({ request, env }) {
  if (!limiter(clientIp(request))) {
    return json(429, { error: '操作が多すぎます。少し待って再度お試しください' });
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json(400, { error: 'リクエストを解釈できませんでした' });
  }

  const token = form.get('turnstileToken');
  const ts = await verifyTurnstile({ secret: env.TURNSTILE_SECRET, token, ip: clientIp(request) });
  if (!ts.ok) return json(403, { error: '確認に失敗しました。ページを更新して再度お試しください' });

  const v = validateFeedbackText(form.get('text'));
  if (!v.ok) return json(400, { error: v.error });

  const image = form.get('image');
  let imageFile = null;
  if (image && typeof image === 'object' && typeof image.arrayBuffer === 'function' && image.size > 0) {
    if (!String(image.type || '').startsWith('image/')) {
      return json(400, { error: '画像ファイルを添付してください' });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return json(400, { error: '画像サイズが大きすぎます（5MBまで）' });
    }
    imageFile = image;
  }

  const userId = form.get('userId') || '';
  const user = await readUser(env, userId);
  const name = user ? user.name : '(不明)';
  const codeMasked = user ? maskCode(user.code) : '-';
  const ua = request.headers.get('user-agent') || '(不明)';

  const webhook = env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    console.error('feedback: DISCORD_WEBHOOK_URL 未設定');
    return json(503, { error: 'ただいま送信できません。時間をおいて再度お試しください' });
  }

  const payload = buildDiscordPayload({
    text: v.value, userId, name, codeMasked, ua, ts: new Date().toISOString(),
  });
  const body = new FormData();
  body.set('payload_json', JSON.stringify(payload));
  if (imageFile) body.set('files[0]', imageFile, imageFile.name || 'image.jpg');

  try {
    const res = await fetch(webhook, { method: 'POST', body });
    if (!res.ok) {
      console.error('feedback: discord webhook failed', res.status);
      return json(502, { error: '送信に失敗しました。時間をおいて再度お試しください' });
    }
  } catch (e) {
    console.error('feedback: discord webhook error', e);
    return json(502, { error: '送信に失敗しました。時間をおいて再度お試しください' });
  }

  return json(200, { ok: true });
}
```

- [ ] **Step 2: 既存テストが壊れていないか確認**

Run: `npm test`
Expected: PASS（全 `_lib/*.test.js`。新規 API はテスト対象外）

- [ ] **Step 3: Commit**

```bash
git add functions/api/feedback.js
git commit -m "feat: POST /api/feedback エンドポイント（Turnstile+レート制限+Discord転送）"
```

---

## Task 5: API クライアント `window.WC.Feedback`

**Files:**
- Modify: `public/identity.js`

- [ ] **Step 1: send 関数を追加**

`public/identity.js` で、既存の `async function postRoom(body) {` 定義の直前に次を追加:

```js
  // フィードバック送信（multipart）。{ ok } を返す。失敗時は error/status を持つ Error。
  async function sendFeedback({ text, imageFile, turnstileToken }) {
    const id = load();
    const fd = new FormData();
    fd.set('text', text || '');
    if (id && id.userId) fd.set('userId', id.userId);
    if (turnstileToken) fd.set('turnstileToken', turnstileToken);
    if (imageFile) fd.set('image', imageFile, imageFile.name || 'image.jpg');
    const res = await fetch('/api/feedback', { method: 'POST', body: fd, cache: 'no-store' });
    if (!res.ok) {
      let msg = '送信に失敗しました';
      const status = res.status;
      try { const e = await res.json(); if (e && e.error) msg = e.error; } catch (e2) {}
      const err = new Error(msg); err.status = status; throw err;
    }
    return res.json();
  }
```

- [ ] **Step 2: window.WC へ公開**

`public/identity.js` の `window.WC.Rooms = { create: createRoom, join: joinRoom, get: getRoom };` の直後に追加:

```js
  window.WC.Feedback = { send: sendFeedback };
```

- [ ] **Step 3: 構文チェック**

Run: `node --check public/identity.js`
Expected: エラーなし(終了コード0)

- [ ] **Step 4: Commit**

```bash
git add public/identity.js
git commit -m "feat: window.WC.Feedback.send クライアント追加"
```

---

## Task 6: フロント `FeedbackForm` と `AccountScreen` 統合

**Files:**
- Modify: `public/index.html`

`index.html` の `AccountScreen` は `<script type="text/babel">` 内のインライン関数。同じスクリプト内に `compressImage` ヘルパと `FeedbackForm` 関数を追加し、`AccountScreen` 内に「フィードバックを送る」セクションを差し込む。さらに呼び出し元から `siteKey` を渡す。

- [ ] **Step 1: 画像圧縮ヘルパと FeedbackForm を追加**

`public/index.html` の `function AccountScreen({ T, me, setMe, onSignOut }) {`(`index.html:122` 付近)の**直前**に、次をまるごと挿入:

```jsx
    // 画像をブラウザ側で縮小・JPEG 再エンコード（Discord 8MB 制限内に収める）。失敗時は原本を返す。
    async function compressImage(file, opts) {
      const maxEdge = (opts && opts.maxEdge) || 1600;
      const quality = (opts && opts.quality) || 0.8;
      if (!file || !String(file.type || '').startsWith('image/')) return file;
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob) return file;
        return new File([blob], 'feedback.jpg', { type: 'image/jpeg' });
      } catch (e) {
        return file; // 圧縮できなくてもサーバ側上限で弾けるので原本で続行
      }
    }

    // フィードバックフォーム（本文必須＋画像任意1枚＋Turnstile）。
    function FeedbackForm({ T, siteKey, onClose }) {
      const [text, setText] = useState('');
      const [imageFile, setImageFile] = useState(null);
      const [preview, setPreview] = useState(null);
      const [token, setToken] = useState(null);
      const [tsKey, setTsKey] = useState(0);
      const [busy, setBusy] = useState(false);
      const [err, setErr] = useState('');
      const [done, setDone] = useState(false);
      const MAX = 1000;
      const remain = MAX - Array.from(text).length;

      async function pickImage(e) {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        if (!String(f.type || '').startsWith('image/')) { setErr('画像ファイルを選んでください'); return; }
        setErr('');
        const compressed = await compressImage(f);
        if (preview) URL.revokeObjectURL(preview);
        setImageFile(compressed);
        setPreview(URL.createObjectURL(compressed));
      }
      function removeImage() {
        if (preview) URL.revokeObjectURL(preview);
        setImageFile(null); setPreview(null);
      }
      async function submit() {
        const t = text.trim();
        if (!t || busy) return;
        if (siteKey && !token) { setErr('「私はロボットではありません」の確認を完了してください'); return; }
        setBusy(true); setErr('');
        try {
          await window.WC.Feedback.send({ text: t, imageFile, turnstileToken: token });
          if (preview) URL.revokeObjectURL(preview);
          setDone(true);
        } catch (e) {
          setErr(e.message || '送信に失敗しました');
          if (siteKey) { setToken(null); setTsKey((k) => k + 1); }
        } finally { setBusy(false); }
      }

      if (done) {
        return (
          <div style={{ background: T.card, borderRadius: 16, padding: '16px', marginTop: 10,
            boxShadow: `inset 0 0 0 1px ${T.line}` }}>
            <div style={{ fontWeight: 800, color: T.text, fontSize: 14.5, marginBottom: 4 }}>
              送信しました。ありがとうございます</div>
            <p style={{ color: T.sub, fontSize: 12.5, lineHeight: 1.5, margin: '0 0 12px' }}>
              いただいた内容は運営が確認します。</p>
            <button onClick={onClose} style={{
              border: 'none', borderRadius: 12, padding: '10px 16px', cursor: 'pointer',
              background: T.panel2, color: T.sub, fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5 }}>
              閉じる</button>
          </div>
        );
      }

      return (
        <div style={{ background: T.card, borderRadius: 16, padding: '16px', marginTop: 10,
          boxShadow: `inset 0 0 0 1px ${T.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea value={text} maxLength={MAX} rows={4}
            onChange={(e) => setText(e.target.value)}
            placeholder="ご意見・不具合など、なんでもどうぞ"
            style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none',
              resize: 'vertical', background: T.panel2, color: T.text, fontSize: 15, fontFamily: 'inherit',
              fontWeight: 600, lineHeight: 1.6, padding: '12px 14px', borderRadius: 12 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              background: T.panel2, color: T.sub, borderRadius: 12, padding: '9px 13px',
              fontWeight: 800, fontSize: 13 }}>
              <Icon name="image" size={15} color={T.sub} sw={2.2} />
              {imageFile ? '画像を変更' : '画像を添付'}
              <input type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} />
            </label>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700,
              color: remain < 0 ? '#FF6B6B' : T.faint }}>{remain}</span>
          </div>
          {preview ? (
            <div style={{ position: 'relative', alignSelf: 'flex-start' }}>
              <img src={preview} alt="添付画像" style={{ maxWidth: '100%', maxHeight: 200,
                borderRadius: 12, display: 'block' }} />
              <button onClick={removeImage} title="削除" style={{ position: 'absolute', top: 6, right: 6,
                border: 'none', borderRadius: 999, width: 28, height: 28, cursor: 'pointer',
                background: 'rgba(0,0,0,0.6)', color: '#fff', fontWeight: 900, fontSize: 14 }}>×</button>
            </div>
          ) : null}
          {siteKey ? (
            <TurnstileWidget key={tsKey} siteKey={siteKey} onToken={setToken}
              theme={T.isDark === false ? 'light' : 'dark'} />
          ) : null}
          {err ? <div style={{ color: '#FF6B6B', fontSize: 12.5, fontWeight: 700 }}>{err}</div> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              border: 'none', borderRadius: 12, padding: '11px 16px', cursor: 'pointer',
              background: T.panel2, color: T.sub, fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5 }}>
              キャンセル</button>
            <button onClick={submit} disabled={!text.trim() || busy} style={{
              flex: 1, border: 'none', borderRadius: 12, padding: '11px 18px',
              cursor: !text.trim() || busy ? 'default' : 'pointer',
              background: !text.trim() || busy ? T.panel2 : T.accent,
              color: !text.trim() || busy ? T.faint : T.accentInk,
              fontFamily: 'inherit', fontWeight: 800, fontSize: 13.5 }}>
              {busy ? '送信中…' : '送信する'}</button>
          </div>
        </div>
      );
    }
```

- [ ] **Step 2: AccountScreen のシグネチャに siteKey を追加**

`public/index.html:122` を変更:

```jsx
    function AccountScreen({ T, me, setMe, onSignOut, siteKey }) {
```

- [ ] **Step 3: AccountScreen にフィードバック開閉 state を追加**

`AccountScreen` 内、`const [nameErr, setNameErr] = useState('');`(`index.html:128` 付近)の直後に追加:

```jsx
      const [showFeedback, setShowFeedback] = useState(false);
```

- [ ] **Step 4: フィードバックセクションを差し込む**

`public/index.html` の「このブラウザからサインアウト」コメント行 `{/* このブラウザからサインアウト */}`(`index.html:214` 付近)の**直前**に、次のブロックを挿入:

```jsx
          {/* フィードバック */}
          <div>
            <Eyebrow T={T}>フィードバック</Eyebrow>
            {!showFeedback ? (
              <button onClick={() => setShowFeedback(true)} style={{
                width: '100%', marginTop: 8, border: 'none', borderRadius: 14, padding: '13px',
                fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                background: T.card, color: T.text, boxShadow: `inset 0 0 0 1px ${T.line}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icon name="chat" size={17} color={T.accent} sw={2.2} />
                フィードバックを送る</button>
            ) : (
              <FeedbackForm T={T} siteKey={siteKey} onClose={() => setShowFeedback(false)} />
            )}
          </div>
```

- [ ] **Step 5: 呼び出し元から siteKey を渡す**

`public/index.html:329` を変更:

```jsx
        if (tab === 'account') return <AccountScreen T={T} me={me} setMe={setMe} onSignOut={onSignOut} siteKey={siteKey} />;
```

- [ ] **Step 6: Icon 名の存在確認(`chat` / `image`)**

Run: `grep -n "name === 'chat'\|name === 'image'\|'chat'\|'image'" public/ui.jsx public/index.html`
Expected: `chat` と `image` のアイコン定義が見つかる。
**見つからない場合**: 既存の定義済みアイコン名に差し替える(例: `chat`→`edit`、`image`→`copy`)。利用可能なアイコン名は `grep -oE "name === '[a-z]+'" public/ui.jsx` で一覧確認できる。

- [ ] **Step 7: ローカルで手動確認**

`.dev.vars` に Discord テスト用 Webhook を一時設定(ユーザー作業。Discord → サーバー設定 → 連携サービス → ウェブフック で URL 発行):

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxx/yyyy
```

Run: `npm run dev`
手順:
1. ブラウザで表示 → アカウントタブを開く
2. 「フィードバックを送る」→ 本文入力＋画像添付 → 送信
3. Discord チャンネルに embed(本文/userId/ニックネーム/コード末尾4桁/UA)＋画像が届くことを確認
4. 本文未入力で送信不可、送信成功で「送信しました」表示を確認

Expected: Discord に通知が届く。`.dev.vars` 未設定時は 503 で優しいエラー表示。

- [ ] **Step 8: Commit**

```bash
git add public/index.html
git commit -m "feat: アカウント画面にフィードバックフォーム（画像圧縮＋Turnstile）"
```

---

## Task 7: シークレット設定とデプロイ手順(ユーザー作業)

**Files:**
- Manual: Cloudflare Pages secret

- [ ] **Step 1: 本番シークレットを設定**

Discord で通知先チャンネルの Webhook URL を発行し、本番に登録:

```bash
npx wrangler pages secret put DISCORD_WEBHOOK_URL --project-name=wcup2026-yosou
```

プロンプトに Webhook URL を貼り付ける。`wrangler.toml` には**載せない**(secret 管理)。

- [ ] **Step 2: デプロイ**

```bash
npm run deploy
```

- [ ] **Step 3: 本番で動作確認**

公開 URL のアカウントタブからフィードバックを送り、Discord に届くことを確認。

---

## Self-Review

**Spec coverage:**
- フォーム項目(本文＋画像1枚) → Task 6 ✓
- 画像クライアント圧縮 → Task 6 `compressImage` ✓
- レート制限＋Turnstile → Task 4 ✓
- 自動付与(userId/ニックネーム/コード末尾4桁/UA/時刻) → Task 3 + Task 4 ✓
- 同期コードマスク → Task 1 `maskCode` ✓
- userId で KV read → Task 4 `readUser` ✓
- Discord 直接 multipart 転送 → Task 4 ✓
- KV 書き込み 0 件 → Task 4(read のみ)✓
- エラーハンドリング(429/403/400/503/502)→ Task 4 ✓
- シークレット管理 → Task 7 ✓
- 純粋ロジックの TDD → Task 1〜3 ✓

**Type consistency:**
- `maskCode` / `validateFeedbackText({ ok, value, error })` / `buildDiscordPayload({ embeds })` は Task 1〜3 で定義、Task 4 で同シグネチャ使用 ✓
- クライアント `WC.Feedback.send({ text, imageFile, turnstileToken })`(Task 5)と `FeedbackForm` の呼び出し(Task 6)が一致 ✓
- フォームフィールド名 `text` / `image` / `userId` / `turnstileToken` がクライアント(Task 5)とサーバ(Task 4)で一致 ✓

**Placeholder scan:** プレースホルダなし。全ステップに実コード/実コマンドを記載 ✓
