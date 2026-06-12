---
title: 試合詳細「ハイライト」タブ（YouTube公式チャンネル自動紐付け）
date: 2026-06-12
status: draft
branch: feat/match-highlights（main から切る）
flag: HIGHLIGHTS_ENABLED
---

## Summary

終了した試合（FT）の試合詳細画面に「ハイライト」タブを追加し、YouTube公式チャンネル
（DAZN Japan / FIFA）にアップされたハイライト動画を自動で紐付けて埋め込み表示する。
`worker-watch` が FT を検知したら各公式チャンネルの uploads プレイリストを読み（quota 1単位/回）、
試合名でタイトルマッチングして最良の videoId を D1 にキャッシュする。手動指定で上書き可能。
SportMonks の `highlights` include は現状ほぼ空（実APIで確認済み）だが、将来本番で
データが来た場合のフォールバック源として最下位優先で取り込む口だけ用意する。

## Context

- 設計合意: ブレストで案B-2（チャンネルホワイトリスト方式）に収束。
  ユーザー情報「DAZNは毎回同じチャンネルにハイライトを上げる」「FIFA公式にもある」が決め手。
- 既存の構造的前例:
  - **AI分析** (`functions/_lib/ai-match.js` `maybeGenerateMatchAi`, `worker-watch/src/index.js:114-141`)
    = 検知駆動・`AI_MATCH_ENABLED` フラグゲート・障害隔離。ハイライトはこれを踏襲する。
  - **テーブル** `sm_match_ai`（PK `(sm_fixture_id, phase)`, `attempts`/`updated_at` でリトライ制御）
    = `sm_highlights` の雛形。
- 関連メモリ: watch-platform（env flag ゲート慣習 `WATCH_ENABLED`/`CHEER_ENABLED`）、
  deploy-flow（jsx変更は index.html の `?v=N` 必須）。

### SportMonks highlights 実APIテスト結果（このセッションで検証）
- `include=highlights` は**権限あり**で通る（auth error なし）が、返るのは**空 `highlights:[]`**。
  - fixture 19146701 (Estonia vs Norway): `[]`
  - fixture 19380491 (Liverpool vs Crystal Palace, プレミア主要試合): `[]`
- → **SportMonks のハイライトは当てにできない**。YouTube が本命。SM は最下位フォールバックの口だけ。

## Key Decisions

- **データソース優先順位（上が勝ち）:** `manual` > `dazn` > `fifa` > `sportmonks`。
  日本向けアプリなので日本語実況の DAZN を自動の第一候補に。手動指定は品質担保の最終保険で最優先。
- **取得手段:** 各チャンネルの uploads プレイリストを `playlistItems.list`（**quota 1単位/回**）で読む。
  `search.list`（100単位/回）は使わない。チャンネル固定なので誤動画リスクはほぼゼロ。
- **マッチング言語:** DAZN=日本語チーム名、FIFA=英語チーム名。両方の名称が必要（後述 Task 3）。
- **取得タイミング:** `worker-watch` の毎分 cron 内、FT検知駆動。ハイライトは試合直後に上がらない
  ことがあるため、未取得の直近FT試合を `attempts` 付きでリトライ（バックオフ）。
- **quota節約:** 「ハイライト未取得のFT候補が1件以上ある時だけ」チャンネルを読む。候補ゼロなら API を叩かない。
- **テーブル形:** `(sm_fixture_id, source)` 複合PK。読み取り時に優先順位で1本に解決。
  手動と自動が共存でき、各ソースが何を見つけたかも残る（`sm_match_ai` の (fixture,phase) 流儀）。
- **タブ表示:** FT試合のみ「ハイライト」タブを出す。動画未取得なら「ハイライト準備中」表示（graceful degradation）。
- **埋め込み:** `youtube-nocookie.com/embed/{videoId}` の iframe（プライバシー強化ドメイン）。

## フェーズ構成（手動先行 → 自動化）

ユーザー方針: **まず手動運用（管理者がYouTube URLを貼って紐付け）で開始 → 後からAPI自動化**。

### Phase 1 — 手動運用（YouTube APIキー不要・先に完成させる）
管理アプリ `public/admin/` から、試合に YouTube URL を貼って紐付ける。`sm_highlights` の
`source='manual'` 行として保存。試合詳細にハイライトタブを出して埋め込み再生。
- **Task 1**（DB `sm_highlights`）
- **Task M1**（URL→videoId 抽出・純粋関数）★Phase 1 新規
- **Task M2**（管理API `/api/highlight` 認証付き保存／削除）★Phase 1 新規
- **Task M3**（管理アプリ `admin.jsx` にハイライト登録セクション）★Phase 1 新規
- **Task 5**（`/api/fixture` に `highlight` 追加）
- **Task 6**（フロント ハイライトタブ）
- **Task 7-a**（フラグ `HIGHLIGHTS_ENABLED` で段階公開）

これだけで「手動でURLを登録 → ユーザーに表示」が完結。YouTube APIキー・チャンネルID・
チーム名マッチングは一切不要。

### Phase 2 — API自動化（YouTube Data API キー調達後）
worker-watch が FT 検知で公式チャンネルを走査し `source='dazn'|'fifa'` 行を自動生成。
手動(manual)は最優先のまま温存され、自動が来ても上書きされない。
- **Task 2**（チーム名 日英＋別名 静的表）
- **Task 3**（YouTubeクライアント＋タイトルマッチング）
- **Task 4**（Worker `maybeFetchHighlights` 自動取得）
- **Task 7-b**（実データでマッチ精度調整・本番ON）

読み取り側（Task 5）の優先順位解決は最初から manual>dazn>fifa>sportmonks で実装するので、
Phase 2 は「自動で行を増やす」だけで Phase 1 の表示はそのまま活きる。

---

## Open Items（実装前に確定が必要）

1. **YouTube Data API v3 キー** — 既存GCPプロジェクト（Vertex AI 稼働中）で API 有効化 → APIキー発行。
   `worker-watch` の secret `YT_API_KEY` に格納（`wrangler secret put`）。**ユーザー手配**。
   手順案内はこちらで出す。キー未調達でも DB/UI/手動上書きの骨格は先行実装可。
2. **チャンネルID** — DAZN Japan / FIFA 公式の `channelId`（`UC...`）を確定。
   API有効化後に `channels.list?forHandle=` 等で1回引いて config に固定値で埋める。
3. **チーム名ソースの確認** — `sm_teams.name`（"解決済み国名"）が日本語か英語か、
   および app_code 起点の日英名マッピングの所在（`public/data.js` 想定）を Task 3 で確定。

## Tasks

### Task 1: DB — `sm_highlights` テーブル
**Goal:** 試合×ソース単位でハイライト動画候補を保持し、優先順位解決の土台を作る。

**Files:**
- `db/schema-watch.sql` — 末尾に追加（`sm_match_ai` の直後）。

**Steps:**
1. 以下を追加:
   ```sql
   -- 10) 試合ハイライト動画（YouTube公式チャンネル自動紐付け＋手動上書き）
   --     source 優先順位: manual > dazn > fifa > sportmonks。読み取りで1本に解決。
   CREATE TABLE IF NOT EXISTS sm_highlights (
     sm_fixture_id INTEGER NOT NULL,
     source        TEXT    NOT NULL,        -- 'manual' | 'dazn' | 'fifa' | 'sportmonks'
     video_id      TEXT,                    -- YouTube videoId（未取得は NULL）
     title         TEXT,                    -- 動画タイトル（マッチ根拠の記録）
     channel_id    TEXT,                    -- 取得元 channelId
     confidence    REAL,                    -- マッチ確度（手動=1.0）
     published_at  INTEGER,                 -- 動画公開 epoch秒（任意）
     attempts      INTEGER NOT NULL DEFAULT 0,
     updated_at    INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (sm_fixture_id, source)
   );
   CREATE INDEX IF NOT EXISTS idx_sm_highlights_fixture ON sm_highlights (sm_fixture_id);
   ```
2. 本番/テスト両 D1 に適用（deploy-flow 手順に従う。`wrangler d1 execute`）。

**Success:** 両環境で `sm_highlights` が存在し、手動 INSERT→SELECT が通る。
**Dependencies:** none

---

### Task M1: URL→videoId 抽出（純粋関数・Phase 1）
**Goal:** 管理者が貼る各種 YouTube URL 形式から videoId を堅牢に抽出する。

**Files:**
- 追加: `functions/_lib/youtube-url.js` — `parseYoutubeId(input): string | null`。

**Steps:**
1. 対応形式: `https://www.youtube.com/watch?v=ID`、`https://youtu.be/ID`、
   `https://www.youtube.com/embed/ID`、`https://m.youtube.com/...`、`shorts/ID`、
   余分なクエリ(`&t=`, `&list=`)付き、前後空白、生の11文字ID直入力。
2. videoId は `[A-Za-z0-9_-]{11}` で検証。該当しなければ `null`。
3. URLパースは `URL` API を使う（手書き正規表現の取りこぼし回避＝coding-style: 構造化パーサ優先）。

**Success:** 各形式・不正入力の単体テストが緑（`functions/_lib/youtube-url.test.js`）。
**Dependencies:** none

---

### Task M2: 管理API `/api/highlight`（認証付き保存・削除・Phase 1）
**Goal:** 管理アプリから fixtureId＋YouTube URL を受け、`source='manual'` 行を upsert / 削除する。

**Files:**
- 追加: `functions/api/highlight.js` — `onRequestPost`（保存）/`onRequestDelete`（削除）。
- 参照（雛形）: `functions/api/config.js`（`verifySession(env.CONFIG, Bearer)`＋`json()`＋レート制限）。

**Steps:**
1. 認証: `Authorization: Bearer <token>` を `verifySession(env.CONFIG, token)` で検証（config.js:77-82 と同形）。
   `WATCH_ENABLED`/`HIGHLIGHTS_ENABLED` ゲートも確認。
2. POST body `{ fixtureId, url }`: `parseYoutubeId(url)` で videoId 抽出（null は 400）。
   fixtureId が `sm_fixtures` に存在するか軽く検証。`sm_highlights` に
   `source='manual', confidence=1.0, title=任意, updated_at=now` で upsert（D1）。
3. DELETE `{ fixtureId }`: manual 行を削除（自動行は残す）。
4. ソフトレート制限（config.js の `createRateLimiter` 流用）。`json()` で返す。

**Success:** ログイン済トークンで POST→manual行が入り、DELETE→消える。未認証は 401。不正URLは 400。
**Dependencies:** Task 1, M1

---

### Task M3: 管理アプリにハイライト登録セクション（Phase 1）
**Goal:** `admin.jsx` に「試合ハイライト」セクションを足し、URLを貼って保存できるUIにする。

**Files:**
- 変更: `public/admin/admin.jsx` — 認証後パネルにセクション追加（既存 `api()` helper＋Bearerトークン使用）。
- 確認: 既存セクションのレイアウト/保存ボタン作法に合わせる。

**Steps:**
1. 試合選択（`/api/results` or `/api/live` の fixture 一覧から FT 試合を選ぶプルダウン）＋
   YouTube URL 入力欄＋「保存」「クリア」ボタン。
2. 保存: `api('/api/highlight', { method:'POST', headers:{Authorization:'Bearer '+token, ...}, body })`。
   成功/失敗トースト。既存 manual 値があれば初期表示。
3. クリア: DELETE 呼び出し。

**Success:** 管理アプリでFT試合にURLを貼って保存→試合詳細に即（CDN TTL内）反映。
**Dependencies:** Task M2

---

### Task 2: チーム名 日英＋別名マッピング（Worker側 静的テーブル・**必須**）【Phase 2】
**Goal:** マッチングに使う「日本語名（DAZN用）」「英語名（FIFA用）」「別名」を fixture から引く。

> **レビュー反映（Critical）:** `sm_teams.name` は**英語のみ**（`sm-ingest.js:83-88` が SportMonks の
> `p.name` をそのまま格納。`seed-team-map.sql:9-56` のコメントが全英語名で実証）。**日本語名は
> DB に存在せず**、唯一のソースは `public/data.js` の `TEAMS`（`ja` フィールド・フロント専用・
> `worker-watch` からアクセス不可）。よって「静的表は必要なら」ではなく**必須**。
> Worker 側に `app_code → { ja, en, aliases }` の静的マッピングを新規に持つ。

**Files:**
- 追加: `functions/_lib/team-names.js` — `app_code → { ja, en, aliases: string[] }` 静的表＋
  `resolveTeamNames(appCode|smTeamId)` ヘルパー。fixture からは `sm_teams.app_code` 経由で引く。
- 参照（コピー元）: `public/data.js` の `TEAMS`（`ja`）、`seed-team-map.sql`（英語名）。

**Steps:**
1. `data.js` の `TEAMS`（app_code→ja）と SportMonks 英語名（seed-team-map.sql 由来）を突き合わせ、
   48カ国分の `{ app_code, ja, en }` を静的表に固定値で書き出す。
2. **別名（aliases）を具体リストで定義**（Task 3 のテスト前提なので最低限を確定）:
   例 `KOR: ["韓国","大韓民国","コリア・リパブリック","Korea Republic","South Korea"]`,
   `USA: ["アメリカ","アメリカ合衆国","United States","USA"]`,
   `BIH: ["ボスニア・ヘルツェゴビナ","Bosnia and Herzegovina"]` 等、表記ゆれの大きい国を網羅。
3. `resolveTeamNames` は `{ ja, en, aliases }` を返す。マッチングは ja/en/aliases を OR で照合。

**Success:** 任意の fixture から home/away の ja/en/aliases が取れる単体テストが緑。48カ国網羅。
**Dependencies:** none（Task 3/4 が依存）

---

### Task 3: YouTube クライアント＋タイトルマッチング（純粋ロジック）【Phase 2】
**Goal:** チャンネルの uploads を読み、試合に合致する動画を選ぶロジックを純粋関数として実装・テスト。

**Files:**
- 追加: `functions/_lib/youtube.js` — API クライアント（`playlistItems.list` ラッパ、DI可能な fetch）。
- 追加: `functions/_lib/highlight-match.js` — `pickBestHighlight(items, { homeNames, awayNames, kickoffTs })` 純粋関数。

**Steps:**
1. `youtube.js`:
   - **uploads playlistId は静的 config に直書き**（`UC→UU` の先頭2文字置換は非公式でブランド
     アカウント等で壊れ得る＝レビュー指摘）。Open Item 2 でチャンネル確定時に
     `channels.list?part=contentDetails` を**1回**叩いて `uploadsPlaylistId` を確定し、
     `const CHANNELS = { dazn: { playlistId:"UU…" }, fifa: { playlistId:"UU…" } }` に固定値で埋める。
   - `listUploads(playlistId, { maxResults=50, pages=1 })` … `playlistItems.list?part=snippet`。quota 1単位/ページ。
     **maxResults=50**（25では同日多試合＝グループ最終節最大16試合/日で取りこぼす恐れ＝レビュー指摘）。
     同日試合が多い日は `nextPageToken` で 2 ページ目まで追えるようにする（quota は +1 のみ）。
   - 障害隔離: 失敗時は空配列＋error（例外を投げない）。sm-sync の流儀に合わせる。
2. `highlight-match.js` `pickBestHighlight`:
   - 各 item のタイトルに home/away 両チーム名（言語別・別名含む）が含まれるか判定。
   - スコア = 名称一致強度 + 公開日が kickoff 以降かつ近いほど加点。
   - しきい値未満は不採用（null 返し）。返り値 `{ video_id, title, confidence, published_at } | null`。
3. 単体テスト: 実際のDAZN/FIFAタイトル例（日英）でマッチ/非マッチ/誤検出回避を検証。

**Success:** タイトル配列を渡すと正しい videoId を選び、紛らわしい別試合を弾くテストが緑。
**Dependencies:** Task 2

---

### Task 4: Worker — `maybeFetchHighlights` 検知駆動取得【Phase 2】
**Goal:** FT検知時に未取得FT試合へハイライトを紐付け、`sm_highlights` にキャッシュ（リトライ付き）。

**Files:**
- 追加: `functions/_lib/highlights.js` — `maybeFetchHighlights(db, now, { listUploads, channels, teamNames })`。
- 変更: `worker-watch/src/index.js` — else枝（live同期側）に AI分析と同じ並びで呼び出し追加。
- 変更: `worker-watch/wrangler.toml` — `HIGHLIGHTS_ENABLED`（var）。secret `YT_API_KEY` は別途 `wrangler secret put`。
- 追加: channel config（DAZN/FIFA の channelId）を `highlights.js` 内 const か env で。

**Steps:**
1. `maybeFetchHighlights`:
   - 候補抽出: `state_id ∈ FINISHED` かつ（`sm_highlights` に manual/dazn/fifa の video_id 行が無い）
     かつ 直近48h以内 かつ `attempts < CAP(例:30)`。候補ゼロなら**即return（API叩かない）**。
     ※このクエリは `selectFixturesForDetailSync`/`DETAIL_CAP=12`（詳細同期側）とは**完全に独立**。
     ハイライト専用の独自クエリを持つ（既存の同期上限に巻き込まれない＝レビュー指摘）。
   - チャンネルごとに uploads を**1回だけ**読む（候補が複数でも使い回し）。
   - 各候補 fixture について `pickBestHighlight` → 採用なら該当 source 行を upsert。
     不採用でも `attempts++`・`updated_at` 更新（バックオフ管理）。
   - DAZN優先で試し、無ければ FIFA。両方走らせて両 source 行を残してよい（読みで解決）。
   - 全体 try/catch で障害隔離（cron の他処理を止めない）。
2. `worker-watch/src/index.js`: `AI_MATCH_ENABLED` ブロックと並列に
   `if (env.HIGHLIGHTS_ENABLED === "true" && env.YT_API_KEY) { ... maybeFetchHighlights ... }`。
3. 手動上書き HTTP アクション（既存の `/?action=` 群に追加, index.js:145-）:
   `/?action=highlight&id=<fixtureId>&video=<videoId>` → source=manual 行を confidence=1.0 で upsert。
   削除は `&video=` 空 or `&clear=1`。
   **既存の `WATCH_CRON_KEY` 認証を必ず踏襲**（index.js:160-163 と同じ。認証漏れ注意＝レビュー指摘）。

**Success:** ローカル/preview で FT 試合に対し videoId がキャッシュされる。候補ゼロ時に YouTube API を
叩かないことをログで確認。手動アクションで manual 行が入る。
**Dependencies:** Task 1, 3（手動アクションは Task 1 のみ）

---

### Task 5: API — 配信に highlights を追加
**Goal:** `/api/fixture` の返却に解決済みハイライトを含める。

**Files:**
- 変更: `functions/_lib/sm-read.js` — `getFixtureDetail` に highlights 解決を追加。
- 確認: `functions/api/fixture.js`（返却をそのまま流すだけなら変更不要）。

**Steps:**
1. `getFixtureDetail` 内で `sm_highlights` を読み、source優先（manual>dazn>fifa>sportmonks）で
   `video_id IS NOT NULL` の最上位を1本選ぶ。返り値に `highlight: { video_id, source, title } | null` を追加。
2. 障害隔離（読み失敗は `highlight:null`）。FT以外でも null で問題なし。

**Success:** highlight 行がある fixture の `/api/fixture?id=` が `highlight` を返す。無い試合は null。
**Dependencies:** Task 1

---

### Task 6: フロント — 「ハイライト」タブ
**Goal:** FT試合に「ハイライト」タブを出し、YouTube埋め込み or 準備中表示。

> **レビュー反映（Critical）:** `DETAIL_TABS` はモジュールトップの不変 `const`（7-14）で、
> `DetailTabBar`（367行）は `DETAIL_TABS.map` をハードコード（`tabs` を props で受けない）。
> よって(a)`DetailTabBar` のシグネチャ変更と(b)タブ残留バグ対策が必須。

**Files:**
- 変更: `public/screens-detail.jsx` — `DETAIL_TABS`/`renderTabBody`、`DetailTabBar` シグネチャ、
  `MatchDetailScreen` のタブstate、`HighlightTab` 追加。
- 変更: `public/index.html` — jsx の `?v=N` バンプ（deploy-flow 必須）。

**Steps:**
1. FT時のみ「ハイライト」タブを表示。`MatchDetailScreen` で `fx.status==="FT"` に応じて
   タブ配列を動的生成し、**`DetailTabBar({ T, tab, setTab, tabs })` に `tabs` を渡すよう
   シグネチャ変更**（現状の `DETAIL_TABS.map` ハードコードをやめ props 参照へ）。位置はタイムライン隣。
2. **タブ残留バグ対策:** `MatchDetailScreen` に `useEffect(() => setTab("timeline"), [fixtureId])` を追加
   （同一インスタンスで FT→NS 試合に遷移した際 `tab==="highlight"` が残らないように）。
   または存在しないタブ選択時は先頭タブにフォールバック。
3. `HighlightTab`: `detail.highlight?.video_id` があれば
   `<iframe src="https://www.youtube-nocookie.com/embed/{id}" allowfullscreen>` をレスポンシブ枠（16:9）で。
   無ければ「ハイライト準備中」プレースホルダ（既存 placeholder のテーマ流儀に合わせる）。
4. `renderTabBody` に `if (tab === "highlight") return <HighlightTab .../>` 追加。

**Success:** FT試合の詳細でタブが出て、videoId があれば動画が再生でき、無ければ準備中が出る。
FT→別試合へ画面遷移してもタブ残留しない。ハーネス/本番両方で表示崩れなし。
**Dependencies:** Task 5

> **キャッシュTTL（レビュー指摘）:** `functions/api/fixture.js:30-33` は `s-maxage=15,
> stale-while-revalidate=60`。FT直後に Worker が取得しても、ユーザーに届くまで最大~75秒は
> 「ハイライト準備中」が出得る。これは許容（準備中フォールバックがあるため）。Task 7 で確認項目に含める。

---

### Task 7: フラグ既定 OFF でデプロイ → 実データ検証 → 段階ON
**Goal:** 無害に出して実環境で挙動確認後、本番で有効化。

**Steps:**
1. `HIGHLIGHTS_ENABLED` 既定 OFF。DB/UI/API は入っても表示は空（準備中のみ）で無害。
2. `YT_API_KEY` 設定後、preview で 1〜2 試合に手動アクション or 自動取得を確認。
3. タイトルマッチ精度を実 DAZN/FIFA タイトルで確認 → しきい値調整。
4. 本番 `HIGHLIGHTS_ENABLED=true`。開幕後に実 W杯試合でカバレッジ確認。

**Success:** 本番でFT試合にハイライトが自動表示。誤動画ゼロ。quota が想定内。
**Dependencies:** Task 1–6

## Verification（全体）
- 単体: Task 3（マッチング）, Task 2（名称解決）。
- 結合: worker のローカル実行で候補抽出→取得→キャッシュ、候補ゼロ時 API 不呼び出し。
- E2E相当: preview の試合詳細でタブ表示・埋め込み再生・準備中フォールバック。
- 非機能: YouTube quota（2ch × 候補有時のみ/分）が 10k/日 内に収まること。

## Risks
- **DAZN/FIFA が W杯ハイライトを実際に上げるか・タイトル形式**は本番まで完全確証なし
  → 手動上書き（Task 4-3）が保険。フラグで即停止可。
- **タイトル表記ゆれ**（別名・装飾）→ Task 2 の別名配列＋しきい値で吸収、要実データ調整。
- **YT_API_KEY 未調達**だと自動取得は動かない → 手動上書きのみで運用開始も可能。
- **埋め込み禁止/地域制限動画** → 公式チャンネルは基本埋め込み可だが、稀に不可。準備中フォールバックで吸収。
