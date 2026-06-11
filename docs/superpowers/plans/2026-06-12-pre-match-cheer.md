# 試合前ご当地応援バトル 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。チェックボックスで進捗管理。

**Goal:** カルーセルの試合前カードに「ご当地応援バトル（何回でも応援・バトルバー・ご当地演出・シェア画像）」を追加する。

**Architecture:** D1集計テーブル `cheer_counts` ＋ Pages Functions `/api/cheer`（graceful degradation）。フロントは楽観的更新＋バッチ送信。`CHEER_ENABLED` フラグ。LIVE開始で全消え。

**Tech Stack:** Cloudflare Pages Functions, D1, 素のReact(UMD)＋Babel standalone, Canvas 2D, node:test。

---

## ファイル構成
- Create `schema/0012_cheer_counts.sql` — 集計テーブル
- Create `functions/_lib/cheer.js` — 純粋ヘルパ（clampDelta/側検証/fixtures parse/行→counts集約）
- Create `functions/_lib/cheer.test.js` — 上記のユニット
- Create `functions/api/cheer.js` — GET/POSTハンドラ（D1, フラグ, 開始済み拒否, 障害隔離）
- Create `functions/api/cheer.test.js` — ハンドラ（フェイクD1/env）
- Create `public/cheer-theme.js` — ご当地テーマ＋DEFAULT_THEME＋getTheme
- Create `public/cheer-core.js` — window.WC.cheer（counts/optimistic/batch/beacon/poll）
- Create `public/cheer-share.js` — Canvasシェア画像生成＋共有/保存
- Modify `public/screens-home.jsx` — CheerBar＋演出を試合前分岐に追加（?v=11へ）
- Modify `public/index.html` — cheer-*.js のscript追加、screens-home ?v 更新
- Modify `wrangler.toml` — `CHEER_ENABLED="true"`

## Task 1: D1マイグレーション
- [ ] `schema/0012_cheer_counts.sql` に spec §3 の CREATE TABLE を記述
- [ ] コミット

## Task 2: 純粋ヘルパ（TDD）
- [ ] `functions/_lib/cheer.test.js`: clampDelta(0→1,5→5,99→20,負→1)、isSide('home'/'away'true,他false)、parseFixtures("1,2,x"→[1,2])、rowsToCounts([{fixture_id,side,count}])→{ "1":{home,away} } で欠側0
- [ ] 失敗確認 `npm test`
- [ ] `functions/_lib/cheer.js` 実装（MAX_DELTA=20）
- [ ] `npm test` 緑
- [ ] コミット

## Task 3: APIハンドラ（TDD）
- [ ] `functions/api/cheer.test.js`: フェイクD1/env で
  - CHEER_ENABLED未設定→GET/POST {enabled:false}
  - GET fixtures指定→counts集約、prepare失敗時 counts:{} で200（障害隔離）
  - POST 正常→increment後の{home,away}、delta>20はクランプ
  - POST side不正/ fixtureId非整数→400
  - POST 開始済み(state_id!=1)→加算せず現値（startedガード）
- [ ] 失敗確認
- [ ] `functions/api/cheer.js` 実装（onRequestGet/onRequestPost、`json` from _lib/http、UPSERT `INSERT ... ON CONFLICT(fixture_id,side) DO UPDATE SET count=count+?`、sm_fixtures.state_id 参照、try/catch で空フォールバック）
- [ ] `npm test` 緑 → コミット

## Task 4: ご当地テーマ
- [ ] `public/cheer-theme.js`: `window.WC.cheerTheme = { THEME, DEFAULT_THEME, get(code,team) }`。JPN/BRA/ARG/FRA/ESP/GER/ENG/POR/MEX/USA など主要国＋デフォルト（spec §7形）
- [ ] コミット

## Task 5: コア（optimistic＋batch）
- [ ] `public/cheer-core.js`: `window.WC.cheer` に
  - `state[fixtureId]={home,away}` キャッシュ
  - `fetch(fixtureIds)` → GET /api/cheer、stateへマージ（ローカル保留分は保持）
  - `tap(fixtureId, side)` → 即 state++＆購読者通知、`pending[fixtureId][side]+=1`
  - `flush()` → pendingごとに POST、2秒デバウンス＆保留合計>=10で即時、`pagehide/visibilitychange`で `sendBeacon`
  - `subscribe(fn)` 簡易pub/sub
- [ ] コミット（フロントロジックは preview で目視確認＝手動E2E）

## Task 6: シェア画像
- [ ] `public/cheer-share.js`: `window.WC.cheerShare.build({match, side, counts, theme})` → 1080×1350 canvas 描画（spec §8）→ `share()`：`navigator.canShare({files})`なら`navigator.share`、否ならPNGダウンロード
- [ ] コミット

## Task 7: UI 結線
- [ ] `screens-home.jsx`: `CheerBar({T, match, a, b})` を新設。バー（比率）＋両国数＋「応援」ボタン×2＋「シェア」ボタン、押下で `window.WC.cheer.tap` ＋ ご当地演出オーバーレイ（紙吹雪/モチーフ/国文字/rays）。`MatchCarousel` の **`live` が無い試合前分岐にのみ** 描画。マウント時 `cheer.fetch([fixtureId])`、`cheer.subscribe`で再描画
- [ ] `index.html`: `cheer-theme.js?v=1` `cheer-core.js?v=1` `cheer-share.js?v=1` を screens-home より前に追加、`screens-home.jsx?v=10`→`?v=11`
- [ ] ローカルプレビューで目視確認 → コミット

## Task 8: フラグ＋デプロイ
- [ ] `wrangler.toml [vars]` に `CHEER_ENABLED = "true"`
- [ ] `npm test` 緑
- [ ] コミット → push -u → PR作成（→ GitHub Actions が preview `pr-<番号>` をデプロイ）
- [ ] 共有D1へテーブル作成コマンドを利用者に案内（CF認証が必要なため `!` で実行してもらう）:
      `npx wrangler d1 execute wcup2026-db --remote --file=schema/0012_cheer_counts.sql`

## 検証
- `npm test`（API/ヘルパ）緑
- preview URL でカルーセル試合前カードに応援UI表示・連打でバー移動・ご当地演出・シェア画像・LIVE試合に非表示、を目視
