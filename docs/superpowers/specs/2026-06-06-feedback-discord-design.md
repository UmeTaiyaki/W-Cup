# フィードバック機能(Discord 通知)設計

- 日付: 2026-06-06
- 対象: W杯2026 予想アプリ(Cloudflare Pages `wcup2026-yosou`)
- ステータス: 設計確定(実装計画へ)

## 目的

アカウントタブから、ユーザーが**本文＋画像1枚**でフィードバックを送れるようにする。送信内容は **Discord Webhook** に通知され、運営が受け取れる。匿名アプリのため、運営が問い合わせ対応できるよう最小限のユーザー文脈(userId・ニックネーム・コード末尾・UA)を自動付与する。

## 確定した要件

| 項目 | 決定 |
|---|---|
| フォーム項目 | 本文(必須)＋画像(任意・1枚)。カテゴリ・連絡先欄は無し |
| 画像上限 | 最大1枚。クライアント圧縮で Discord の 8MB 制限内に収める |
| スパム対策 | アイソレート内レート制限 ＋ Turnstile(token 必須) |
| 自動付与情報 | userId ＋ ニックネーム ＋ 同期コード末尾4桁(`****-1234`) ＋ UA ＋ 送信時刻 |
| 画像の届け方 | Discord Webhook へ直接 multipart 転送(ストレージ不使用) |

## セキュリティ上の決定: 同期コードはマスクする

同期コードは**アカウント復元キー＝実質パスワード**であり、`functions/api/user.js` でも「秘密の同期コードは返さない」と明示されている。フルコードを Discord に流すと閲覧者によるなりすまし・乗っ取りが可能になるため、**Discord には末尾4桁のみマスク表示(`****-1234`)**する。本人特定は `userId`(KV キー、復元不可)で行う。

クライアントはコードをサーバへ送らない。**サーバが `userId` から KV を read** してニックネームとコード末尾を取得する(read のみ＝書き込み枠に無関係、かつクライアント改ざん不可)。

## アーキテクチャ

```
[AccountScreen / FeedbackForm]
  本文 + 画像(canvas圧縮) + Turnstileトークン
        │ multipart/form-data
        ▼
[window.WC.Feedback.send()]  (identity.js)
        │ POST /api/feedback  (text, image?, userId, turnstileToken)
        ▼
[functions/api/feedback.js]
  1. ソフトレート制限 (createRateLimiter, IP単位, KV不使用)
  2. Turnstile 検証 (verifyTurnstile, token必須)
  3. formData() パース + バリデーション
  4. userId で KV read → name / code末尾4桁
  5. Discord Webhook へ multipart POST (payload_json + files[0])
        │
        ▼
[Discord チャンネル]  embed(本文/userId/ニックネーム/コード末尾/UA/時刻) + 画像添付
```

**KV 書き込みは 0 件**(user の read 1回のみ)。スケーリングロードマップの無料枠ハードニング方針(KV write 1,000/日がボトルネック)と整合。

## コンポーネント

### 1. フロント: `FeedbackForm`(`public/index.html` 内、`AccountScreen` に統合)

- 配置: アカウント画面の「サインアウト」セクションの手前に「フィードバックを送る」セクションを追加。既存の名前変更編集と同じ**インライン展開**パターンで UI を統一する。
- フィールド:
  - 本文 `textarea`(必須・最大1000字・残り字数表示)
  - 画像添付ボタン(任意・1枚)。選択でプレビュー＋削除ボタン表示。
  - Turnstile ウィジェット(既存 `ui.jsx` の `TurnstileWidget` を再利用、`siteKey` 連携)
  - 送信ボタン(送信中は disabled・スピナー表記 `…`)
- 状態: 送信中 / 成功(フォームを畳み「送信しました。ありがとうございます」) / 失敗(エラー文言を赤字表示)。
- 画像圧縮: `canvas` で長辺最大 1600px へリサイズ、JPEG(quality ~0.8)で再エンコード。目標 ~3MB 以下。MIME が画像でない場合は拒否。

### 2. API クライアント: `window.WC.Feedback`(`public/identity.js`)

- `send({ text, imageFile, turnstileToken })`:
  - `FormData` を組み立て `text` / `image`(任意) / `userId`(`load()` から) / `turnstileToken` を付与。
  - `fetch('/api/feedback', { method: 'POST', body: formData, cache: 'no-store' })`。
  - 失敗時は `postOp` と同様に `error` メッセージと `status` を持つ `Error` を throw。
- `window.WC.Feedback = { send }` として公開。

### 3. バックエンド: `functions/api/feedback.js`

`onRequestPost({ request, env })`:

1. **レート制限**: `createRateLimiter({ capacity, refillPerSec })` をモジュールスコープで生成、`CF-Connecting-IP` 単位。超過は 429。
2. **Turnstile**: `verifyTurnstile({ secret: env.TURNSTILE_SECRET, token, ip })`。`ok=false` は 403。secret 未設定時は既存方針どおり skip(通す)。
3. **パース**: `await request.formData()`。`text`(文字列)、`image`(File、任意)、`userId`、`turnstileToken` を取り出す。
4. **バリデーション**:
   - `validateFeedbackText(text)` — trim・空でない・最大1000字。
   - 画像があれば MIME が `image/*`、サイズ ≤ 5MB。違反は 400。
5. **ユーザー文脈**: `userId` で KV(`CONFIG`)を read。取得できれば `name`、`maskCode(code)`。取れない場合も送信は継続(`name='(不明)'`、`code='-'`)。UA は `request.headers.get('user-agent')`。
6. **Discord 送信**: `env.DISCORD_WEBHOOK_URL` へ multipart POST。
   - `payload_json` = `buildDiscordPayload({ text, userId, name, codeMasked, ua, ts })`(embed 構造)。
   - 画像があれば `files[0]` として添付。
   - webhook URL 未設定時は 503(ローカル開発で安全)。送信失敗は 502。
7. 成功は 200 `{ ok: true }`。

### 4. 純粋ロジック: `functions/_lib/feedback.js` ＋ `functions/_lib/feedback.test.js`

小さくテスト可能な単位に分離(coding-style: many small files / immutable):

- `maskCode(code)` → 末尾4桁を残し `****-1234` 形式。短い/空コードも安全に処理。
- `validateFeedbackText(text, { max = 1000 } = {})` → `{ ok, value, error }`。trim・空・長さ。
- `buildDiscordPayload({ text, userId, name, codeMasked, ua, ts })` → Discord embed の JSON オブジェクトを**新規生成**(mutation しない)。

## データフロー(送信1件)

1. ユーザーが本文入力＋(任意)画像選択 → クライアント圧縮 → Turnstile トークン取得。
2. `WC.Feedback.send` が multipart で `/api/feedback` へ POST。
3. サーバがレート制限→Turnstile→バリデーション→KV read→Discord 転送。
4. 成功でフロントがフォームを畳み完了表示。

## エラーハンドリング

| 状況 | HTTP | ユーザー向け文言(例) |
|---|---|---|
| レート超過 | 429 | 操作が多すぎます。少し待って再度お試しください |
| Turnstile 失敗 | 403 | 確認に失敗しました。ページを更新して再度お試しください |
| 本文未入力/長すぎ | 400 | 本文を入力してください / 長すぎます |
| 画像が画像でない/大きすぎ | 400 | 画像を確認してください |
| Webhook 未設定 | 503 | ただいま送信できません(運営側設定待ち) |
| Webhook 送信失敗 | 502 | 送信に失敗しました。時間をおいて再度お試しください |

サーバ側は `console.error` で詳細を記録し、ユーザーには内部情報を漏らさない優しい文言を返す(既存 `http.js` / `user.js` の方針に準拠)。

## シークレット / 設定

- `DISCORD_WEBHOOK_URL`: **secret**。`wrangler pages secret put DISCORD_WEBHOOK_URL` で設定。`wrangler.toml` には載せない。
- ローカル開発: `.dev.vars` に `DISCORD_WEBHOOK_URL`(任意。未設定なら 503 でスキップ)。
- 既存 `TURNSTILE_SECRET` / `TURNSTILE_SITE_KEY` を再利用。

## テスト(TDD)

- `functions/_lib/feedback.test.js`(先に RED):
  - `maskCode`: 通常コード→末尾4桁マスク / 短いコード / 空・null の安全処理。
  - `validateFeedbackText`: 空 / 空白のみ / 上限超過 / 正常(trim 結果)。
  - `buildDiscordPayload`: 必須フィールドが embed に含まれる / 入力を mutation しない / 欠損値の既定。
- 既存の `_lib/*.test.js` と同じ実行基盤に追加。

## スコープ外(YAGNI)

- カテゴリ分類、連絡先欄、複数画像、管理画面でのフィードバック一覧、R2 永続化、メール通知。将来必要になれば別仕様で。

## 既存方針との整合

- KV write 0 件 → スケーリングロードマップ(無料枠ハードニング)に整合。
- Turnstile＋アイソレート内レート制限 → 既存 create 系と同じ防御パターン。
- 純粋ロジックを `_lib` に分離しユニットテスト → 既存テスト構成と一貫。
