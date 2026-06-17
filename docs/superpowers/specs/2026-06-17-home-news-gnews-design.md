# ホーム ニュースカルーセル（サッカー専門メディアRSS版）設計

**日付**: 2026-06-17
**ブランチ**: `feat/home-news-gnews`（base=main）
**置き換え対象**: PR#53 `feat/home-news-carousel`（SportMonks+Vertex翻訳版）→ クローズ

> **改訂 (2026-06-17・最終)**: 当初はGNews APIで実装したが、ユーザー要望「サッカー専門メディア（Goal等）に絞りたい」を受け、**RSS直接取得に全面切替**。理由＝GNews無料プランの日本語インデックスにサッカー専門メディアが無く（実APIで確認：「サッカー」検索でも一般紙のみ）ソース指定もできないため。現行実装は **サッカーキング／フットボールチャンネル／ゲキサカ のRSSをマージ**（`functions/_lib/rss.js`）。GNewsの知見（2系統マージ等）は下記に履歴として残すが、コードはRSS版が正。`GNEWS_API_KEY` secret は不要。以下のGNews記述は歴史的経緯。

## 背景・方針

ホームタブ（HomeScreen）の試合カルーセルの下に、W杯関連ニュースを横スクロールカルーセルで表示する。

当初はSportMonksのニュース＋Vertex AI日本語訳＋licensedヒーロー画像で実装中（PR#53）だったが、**その構成を完全に廃止**し、**GNews API**（gnews.io）に置き換える。GNewsは `lang=ja` で日本語記事を直接返せるため、**翻訳レイヤー（Vertex/GCP_SERVICE_ACCOUNT）・fixture紐づけ・本文展開シートがすべて不要**になり、データ層が大幅に単純化される。

採用アプローチ: **「UIの殻は流用・データ層は総入れ替え」**。PR#53のカルーセルUI（横スクロール・カード）は流用し、バックエンド（SportMonks/翻訳）は捨ててGNews直叩き＋KVキャッシュの最小データ層に置き換える。

却下した代替案:
- **Cron事前取得（別Worker→KV/D1蓄積）**: 無料プラン100req/日ならオンデマンド＋KVキャッシュで十分。Cron運用は過剰。
- **ゼロから作り直し**: カルーセルUIは流用できるため車輪の再発明になる。

## 決定事項（ユーザー確認済み）

- **タップ挙動**: 外部記事URLを別タブで開く（`window.open(url, '_blank', 'noopener')`）。アプリ内に本文を持たず、出典明記＋リンク誘導で法務リスク最小。本文展開シートは廃止。
- **言語・検索**: 日本語記事のみ（`lang=ja`）。翻訳不要。
- **APIキー**: 未取得 → 無料プラン前提で設計（100リクエスト/日・最大10件・本文truncated。本文は外部リンクで開くためtruncatedは無関係）。
- **git運用**: PR#53はクローズし、`feat/home-news-gnews` を新規に切ってクリーン実装。

## アーキテクチャ

main にはニュース関連コードが一切無い（PR#53は未マージ）ため、本ブランチはクリーンな新規追加。既存ホームへの影響はゲートOFF/失敗/空ですべて非表示（既存と完全同一）に縮退する非破壊設計。

### バックエンド（新規）

**`functions/_lib/gnews.js`**
- GNews `https://gnews.io/api/v4/search` を叩き、記事配列を正規化して返す純関数的モジュール。
- クエリパラメータ:
  - `q`: 既定 `"ワールドカップ" OR "W杯"`（env `GNEWS_QUERY` で上書き可）
  - `lang`: 既定 `ja`（env `GNEWS_LANG`）
  - `sortby`: `publishedAt`（新着順）
  - `max`: `10`（無料プラン上限）
  - `apikey`: secret `GNEWS_API_KEY`
- 正規化: 各記事を `{ id, title, description, url, image, source, publishedAt }` に整形。
  - `id`: 記事URL（重複排除・Reactキー用。安定一意）。
  - `source`: `article.source.name`（出典名）。
  - 不正・欠損フィールドはスキップまたは安全な既定値で防御。
- テストシーム: `env.__fetchImpl`（既存慣用）でfetchを差し替え可能。
- `GNEWS_API_KEY` 未設定時は空配列を返す（呼び出し側で縮退）。

**`functions/api/news.js`**（/api/player と同型・障害隔離）
- `NEWS_ENABLED` ゲート。OFF時は `{ enabled: false }` を返す。
- KVキャッシュ（`env.CONFIG`）:
  - キー: `news:gnews:ja:v1`
  - TTL: 1800秒（30分）
  - ヒット時はGNewsを叩かず即返却 → 100req/日を確実に遵守（30分間隔なら最大48fetch/日）。
- ミス時: `gnews.js` でfetch→正規化→KVに `{ items, cachedAt }` を保存→返却。
- レスポンス形: `{ enabled: true, items: [...] }`。
- 障害隔離: 全体を try-catch。GNews失敗・例外・空 → `{ enabled: true, items: [] }`（カルーセル非表示）。ホーム全体には波及しない。

### フロント

**`public/screens-home.jsx`**
- `NewsCarousel`（PR#53から流用）: `MatchCarousel` と `DayTimeline` の間に挿入。`fetchNews()` で取得、空なら何もレンダリングしない。
- `NewsCard`（流用・簡素化）: ヒーロー画像（GNews提供 image URL）＋タイトル＋出典名＋公開日。タップで `window.open(item.url, '_blank', 'noopener')`。
- **削除**: `NewsSheet`、`NewsHero`（本文展開UIは不要）。
- `window.WC` エクスポートから `NewsSheet`/`NewsHero` を除去。

**`public/data.js`**
- `fetchNews`: 維持。`/api/news` を叩き `{ enabled, items }` の `items` を返す（失敗/OFF/空は `[]`）。
- **削除**: `fetchNewsBody`。

**`public/index.html`**
- `screens-home.jsx`・`data.js` の `?v=N` をバンプ（jsx変更時の必須運用）。

### 設定 / シークレット

- `wrangler.toml [vars]`:
  - `NEWS_ENABLED = "true"`
  - `GNEWS_QUERY = "\"ワールドカップ\" OR \"W杯\""`
  - `GNEWS_LANG = "ja"`
- secret: `GNEWS_API_KEY`
  - `.dev.vars` に追加（ローカル/テスト）
  - Cloudflare Pages の **Preview / Production 両方**に設定（Previewは本番secretを継承しないためダッシュボード必須）。

## データフロー

```
HomeScreen mount
  → fetchNews()                       (public/data.js)
  → GET /api/news                     (functions/api/news.js)
      NEWS_ENABLED OFF → {enabled:false}
      KVヒット          → {enabled:true, items}   (GNews叩かない)
      KVミス            → fetchGnews()             (functions/_lib/gnews.js)
                          → GNews v4/search (lang=ja)
                          → 正規化 → KV保存(TTL30m) → {enabled:true, items}
      失敗/例外/空      → {enabled:true, items:[]}
  → items 空 → カルーセル非レンダリング
  → items あり → NewsCarousel → NewsCard×N
  → カードタップ → window.open(article.url, '_blank', 'noopener')
```

## エラー処理

| 状況 | 挙動 |
|---|---|
| `NEWS_ENABLED=false` | `{enabled:false}` → カルーセル非表示 |
| `GNEWS_API_KEY` 未設定 | gnews.js が空配列 → `items:[]` → 非表示 |
| GNews APIエラー/タイムアウト/不正JSON | try-catch → `items:[]` → 非表示 |
| 記事0件 | `items:[]` → 非表示 |
| 個別記事のフィールド欠損 | その記事をスキップ／安全既定値 |

いずれも既存ホームと完全同一の見た目に縮退（非破壊）。

## テスト（`node --test`／node:test + node:assert）

**`functions/_lib/gnews.test.js`**
- 正常レスポンスの正規化（`{id,title,description,url,image,source,publishedAt}`）。
- 空 `articles` → `[]`。
- APIエラー（非200）→ `[]`。
- 不正JSON / フィールド欠損 → 防御（スキップ）。
- `GNEWS_API_KEY` 未設定 → `[]`。
- URL組み立て（lang/q/max/sortby）の検証。

**`functions/api/news.test.js`**
- `NEWS_ENABLED` OFF → `{enabled:false}`。
- KVミス → fetch→正規化→KV保存→`{enabled:true, items}`。
- KVヒット → GNews叩かず即返却（`__fetchImpl` が呼ばれないことを確認）。
- GNews失敗 → `{enabled:true, items:[]}`。

すべて `env.__fetchImpl`（fetch差替）＋モックKVで実施。全体スイート（`node --test 'functions/**/*.test.js'`）緑を確認。

## 法務メモ

GNews無料プランは利用規約上「商用利用」の扱いに制約があり得る。表示はタイトル＋要約＋**出典名明記＋元記事への直接リンク**に留め、画像はGNews提供 image URL を表示。公開前にgnews.ioのプラン条件を確認推奨。

## デプロイ手順

1. PR#53（`feat/home-news-carousel`）をクローズ。
2. `feat/home-news-gnews` で実装→テスト緑→PR作成。
3. `.dev.vars` に `GNEWS_API_KEY` 追加（ローカル検証）。
4. Pages Preview に `GNEWS_API_KEY`（ダッシュボード）→ Preview目視。
5. main merge前に Production に `GNEWS_API_KEY` 設定。`NEWS_ENABLED` は merge で本番ON。

## 関連メモ

- [[wcup-home-news-carousel]]（旧SportMonks+Vertex版・本設計で置き換え）
- [[wcup-deploy-flow]]（?vバンプ必須・Preview/Prod secret別管理）
- [[wcup-livescore-sportmonks]]
