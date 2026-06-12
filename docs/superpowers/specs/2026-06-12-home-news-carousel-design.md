# ホーム ニュースカルーセル 設計書

- 日付: 2026-06-12
- ブランチ: `feat/home-news-carousel`
- スコープ: ホームタブ（`summary` = HomeScreen）に、SportMonks の W杯ニュースを
  日本語訳＋licensedヒーロー画像付きのカルーセルとして追加する。
- 関連メモリ: watch-platform（P3 日本語ニュース）, livescore-sportmonks, deploy-flow

## 1. ゴールと非ゴール

**ゴール**
- ホームの試合カルーセルの下に「ニュース」カルーセルを新設。
- W杯（season_id=26618）の pre-match プレビュー / post-match レポートを横スクロール表示。
- カードは **日本語タイトル ＋ licensedヒーロー画像（得点者写真→venue→エンブレム）**。
- タップで **日本語本文** をシート/モーダル展開。「試合を見る」で既存試合詳細へ。
- フラグ `NEWS_ENABLED` で ON/OFF。OFF/失敗/空時はカルーセルごと非表示＝既存ホームと完全同一。

**非ゴール（今回やらない）**
- 予想タブ・部屋タブには一切触れない（不可侵）。
- 外部メディア（日本語記事）の OGP 転載・リンクアウト（法務リスク・離脱のため不採用）。
- D1 スキーマ追加・Cron Worker 変更（オンデマンド＋キャッシュで完結）。
- ニュースの詳細画面タブ復活（過去に廃止済み・据え置き）。

## 2. データソース（実APIで検証済み 2026-06-12）

すべて現契約（World Cup 2026 / All-In）で取得可。News add-on は不要だった。
レート枠は `NewsItem` 専用で既存 Fixture 枠を食わない。

| 用途 | エンドポイント | 返却 |
|---|---|---|
| 一覧(pre) | `GET /football/news/pre-match/seasons/26618` | `{id, fixture_id, league_id, title, type:"prematch"}` |
| 一覧(post) | `GET /football/news/post-match/seasons/26618` | `{...type:"postmatch"}` |
| 本文 | `GET /football/fixtures/{id}?include={pre,post}matchNews.lines` | `lines[]={id,newsitem_id,text,type:"line"}` |
| 画像 | `GET /football/fixtures/{id}?include=participants;venue;events.player` | crest=`participants[].image_path` / venue=`venue.image_path` / 得点者=`events[].player.image_path` |

**既知の癖**: `lines[]` の並びは時系列でも id 順でもない（API側順序が乱れる）。
→ v1 は **返却配列順そのまま**表示（1行目は概ね概要文）。整列はしない（YAGNI）。

一覧はタイトルのみ（本文・画像なし）。本文と画像は fixture 単位で別取得。

## 3. アーキテクチャ（非破壊・既存パターン踏襲）

`/api/player.js` と同型の Pages Function を新設。すべて障害隔離（throw しない・既存に波及させない）。

### 3.1 エンドポイント
- `GET /api/news`
  - 一覧モード（`id` なし）: pre/post を統合 → 各記事に `fixture_id`・`type`・日本語タイトル・
    ヒーロー画像メタ（後述）・チーム app_code を付与した配列を返す。
  - 本文モード（`?id=<fixtureId>&type=pre|post`）: 当該 fixture の `lines` を取得→日本語訳→返す。
- ゲート: `env.NEWS_ENABLED !== "true"` なら `{enabled:false, items:[]}` を即返し。
- トークン欠如（`SPORTMONKS_TOKEN` / `GEMINI_API_KEY` 無し）: `enabled:true` だが
  翻訳なし（英語フォールバック）/ 画像のみ等、段階的に縮退。決して 500 にしない。
- キャッシュ: レスポンスに `cache-control: public, s-maxage=...`（一覧=1800s, 本文=21600s）。

### 3.2 新規ファイル
- `functions/api/news.js` — HTTP ハンドラ（ゲート・入力検証・キャッシュ・障害隔離）。
- `functions/_lib/sm-news.js` — **純関数**:
  - `mergeNewsList(preData, postData)`: 統合・重複排除・並び（post新着→pre予定の順, 各 fixture の
    starting_at で安定ソート。starting_at は一覧に無いので fixture_id 昇順を二次キー）。
  - `pickHero({events, venue, participants, type})`: 得点者写真→venue→エンブレム の優先で
    `{kind:'player'|'venue'|'crest', url, alt}` を返す（純関数）。
  - `joinLines(lines)`: `lines[].text` を整形連結（空除去・trim）。
  - `translationCacheKey(newsitemId, target='ja')`: KV キー生成。
- `functions/_lib/sm-news-i18n.js`（or sm-news.js 内）— 翻訳:
  - 既存 `callGeminiText({apiKey, model:'gemini-2.5-pro', prompt})` を再利用（grounding不要）。
  - `translateText(text, {kv, apiKey, callAi})`: KV `news:tr:<hash>` を読み、無ければ翻訳→KV保存→返す。
    失敗時は原文（英語）を返す（縮退）。翻訳1回・再翻訳しない。

### 3.3 翻訳キャッシュ（KV・スキーマ変更ゼロ）
- バインドは既存 `env.CONFIG`（KV）。キー `news:tr:<newsitemId or textハッシュ>`。
- 値 = 日本語訳テキスト。TTL なし（記事内容は不変）。
- 書き込み量: W杯1日あたり数十記事程度 → KV 1,000/日枠に十分余裕。
- 一覧のタイトル翻訳・本文翻訳の両方をこの層で 1 回だけ実施。

### 3.4 画像取得の最小化
- 一覧で全 fixture の画像を引くとコール増。**v1 は一覧では画像メタを引かず**、
  各 fixture から取れる範囲（既存 `TEAM_LOGOS`＝app_code→crest）で**エンブレム＋スコア**を即描画。
- 得点者写真・venue は **本文モード（タップ時）** に `events.player;venue` を併せて取得し、
  展開ビューのヒーローに使用。→ 一覧は軽量、詳細は映える。
  - ※将来、一覧サムネにも得点者写真を出したくなったら別 fixture 一括取得を検討（v2）。
- フォールバック階層: 得点者写真 → venue → 両エンブレムVS → 無地グラデーション。

## 4. フロントエンド

### 4.1 データ層 `public/data.js`
- `window.WC.fetchNews()`（一覧）/ `fetchNewsBody(fixtureId, type)`（本文）を追加。
  失敗/OFF/空は `[]`/`null`（既存に波及させない）。`/api/player` の実装に倣う。

### 4.2 画面 `public/screens-home.jsx`
- `NewsCarousel`（新規・MatchCarousel と同様の横スクロール）を `HomeScreen` の
  `<MatchCarousel/>` と `<DayTimeline/>` の **間** に挿入。
- `items.length === 0` または取得失敗時は **何も描画しない**（既存挙動を完全維持）。
- `NewsCard`: ヒーロー（エンブレム＋スコア or VS）＋日本語タイトル＋種別バッジ（プレビュー/レポート）。
- タップ → `NewsSheet`（既存 `ui.jsx` の `Sheet` / PlayerSheet と同じ createPortal パターン）を開き、
  `fetchNewsBody` で本文取得→日本語本文＋ヒーロー写真表示。フッターに「試合を見る」→
  既存 `window.WC.openDetail(fixtureId)`（無ければ非表示）。
- `index.html` の `?v=N` を必ずインクリメント（jsx 変更のため）。

### 4.3 トーンとスタイル
- 既存ホームのカード・トークン（T）に合わせる。LIVEバッジ等のハードコード色踏襲。
- 英語本文しか得られない場合でもレイアウトは成立（翻訳縮退時の英語表示を許容）。

## 5. フィーチャーフラグ / シークレット
- `NEWS_ENABLED`（Pages 環境変数）: 既定 OFF。Preview で true、本番は確認後に true。
- `GCP_SERVICE_ACCOUNT`（Pages secret・JSON）: 翻訳用。**新規キーは作らず、worker-watch で本番稼働中の
  GCP サービスアカウントを Pages にも登録して流用**。トークン発行は既存 `mintGcpAccessToken` 再利用、
  Vertex AI(grounding 無し・gemini-2.5-flash)で翻訳。未設定/発行失敗なら英語フォールバックで動作継続。
  任意で `GCP_PROJECT`（既定は SA の project_id）/`GCP_LOCATION`（既定 global）/`NEWS_TRANSLATE_MODEL`。
- `SPORTMONKS_TOKEN`（既存 Pages secret）: 流用。

## 6. テスト（80%+ 目標・純関数中心）
- `sm-news.test.js`: mergeNewsList（統合/重複排除/安定ソート/空入力）、pickHero（優先順位/全欠損）、
  joinLines（空除去/連結/順序保持）、translationCacheKey。
- `sm-news-i18n` 相当: KV ヒット/ミス、翻訳失敗時の英語フォールバック、再翻訳しないこと（callAi 呼び出し回数）。
- `news.test.js`: NEWS_ENABLED オフ→enabled:false、トークン欠如の縮退、入力検証（不正 id/type）、
  fetch 注入での一覧/本文整形、キャッシュヘッダ。
- フロントは純ロジック（カード用整形）をユニット、表示は Preview 目視（Playwright）で確認。

## 7. デプロイ & 検証フロー（ユーザー要望）
1. 実装＋テスト緑 → コミット → PR 作成（base=main）。
2. `deploy.yml` は main宛PR/push で発火 → **Preview URL（pr-N.wcup2026-yosou.pages.dev）** が出る。
3. Preview の Pages 環境で `NEWS_ENABLED=true`＋`GEMINI_API_KEY` を設定し、
   実 SportMonks データ（開幕後＝post-match あり）でカルーセル・翻訳・ヒーロー画像を目視。
4. 問題なければ本番（main マージ＋本番 Pages の `NEWS_ENABLED=true`/secret）で適用判断。
- ⚠️ Pages secret は「次回デプロイ時」に取り込まれる（livescore メモリの既知ハマり）→
  secret 設定後は再デプロイ必須。

## 8. リスクと縮退
- 翻訳レイテンシ: 一覧タイトルは短文・KVキャッシュで2回目以降即時。本文はタップ時遅延ロード。
- `lines` 順序の乱れ: v1 は配列順許容（概要が先頭に来る傾向）。
- 画像 404: `<img onerror>` で次段フォールバック（venue→crest→無地）。既存 `Flag` パターン踏襲。
- ニュース未充填の時間帯（開幕前など）: 空配列→カルーセル非表示で自然。
- すべての外部失敗は握りつぶし、ホーム本体に波及させない。

## 9. オープン事項（実装中に確定）
- `pre-match` の本文 `prematchNews.lines` の実フィールド検証（post と同型と仮定、開幕前要確認）。
- Gemini 翻訳プロンプト（固有名詞=チーム/選手名の日本語表記をどこまで統一するか。v1 は素直訳）。
