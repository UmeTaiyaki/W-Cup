# PMSR（FIFA公式マッチレポート）取り込み

FIFA Training Centre が試合ごとに公開する **Post-Match Summary Report (PMSR)** PDF から、
数値スタッツと図表を取り込み、試合詳細の「レポート」タブに表示する機能。

- ソース: https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php
- 出典表記とPDFリンク併記は **必須**（FIFA公式の著作物。図表は画像のまま掲載）。

## アーキテクチャ

```
[FIFA hub/PDF] → (CI: Node+Chrome) ingest → dist/ → publish ─┬─→ R2  : 図表PNG
                                                              └─→ D1  : sm_pmsr(数値+図表manifest)
[利用者] → /api/fixture?id= → getFixtureDetail → detail.pmsr ──→ UI「レポート」タブ
                              /api/pmsr-figure?m=&k=  → R2 から図表PNGをstream配信
```

- **図表レンダリングは Cloudflare Workers では動かない**（ヘッドレスブラウザ不可）。
  そのため取得・図表生成は CI/ローカルの Node+Chrome（pdf.js を CDP 制御）で実行し、
  Worker は生成済みの D1/R2 を配信するだけにしている。
- D1 書き込みは試合確定時の1試合1行のみ＝極小（rows-written 問題に影響しない）。

## コード

| 領域 | 場所 |
|---|---|
| インジェスト（取得→抽出→図表PNG→dist） | `scripts/pmsr/ingest.mjs`（+ `parse-stats` `figures` `hub` `chrome` `render-app.html`） |
| publish（dist→R2/D1） | `scripts/pmsr/publish.mjs` |
| D1スキーマ | `db/0014_sm_pmsr.sql` |
| 図表配信 | `functions/api/pmsr-figure.js`（R2 binding `PMSR_FIGS`） |
| API統合 | `functions/_lib/sm-read.js`（`getFixtureDetail` の `pmsr`）／`functions/api/fixture.js`（`PMSR_ENABLED` ゲート） |
| UI | `public/screens-detail.jsx`（`ReportTab` / 「レポート」タブ） |
| CI | `.github/workflows/pmsr-ingest.yml` |

## 本番化手順（要 Cloudflare アカウント操作）

0. **R2 を有効化**（アカウントで一度だけ。要 課金カード登録）: Cloudflare ダッシュボード → R2 → 有効化。
   ※ 未有効だと `wrangler r2 ...` が `code: 10042` で失敗する。
1. **R2 バケット作成**
   ```sh
   wrangler r2 bucket create wcup2026-pmsr
   ```
2. **D1 マイグレーション適用**（本番）— ※済んでいれば不要（IF NOT EXISTS で冪等）
   ```sh
   wrangler d1 execute wcup2026-db --remote --file db/0014_sm_pmsr.sql
   ```
3. **R2 バインディングを有効化**: `wrangler.toml` の `[[r2_buckets]] ... PMSR_FIGS` の3行のコメントを外す
   （バケット作成後に行うこと）。`PMSR_ENABLED = "true"` を確認して Pages をデプロイ。
4. **初回インジェスト**（ローカルから本番へ。`wrangler login` 済みであること）
   ```sh
   npm ci
   node scripts/pmsr/ingest.mjs --all --resolve-d1   # fixture_idはD1のトリコードで解決
   node scripts/pmsr/publish.mjs --remote
   ```
5. **CI 自動化を有効化**: リポジトリ Secrets に `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
   （Pages デプロイと同じもの）。`pmsr-ingest.yml` が 6時間ごとに追従する。
   - 注意: APIトークンに **R2 書き込み権限** と **D1 書き込み権限** が必要。
6. **大会終了後**: `pmsr-ingest.yml` を無効化/削除。

## ローカル開発・検証

```sh
# 1試合だけ取得して dist/ を作る（fixture_idは手動指定）
node scripts/pmsr/ingest.mjs --match 11 --fixture-id <sm_fixture_id>

# ローカル D1/R2 へ反映して往復確認
wrangler d1 execute wcup2026-db --local --file db/0014_sm_pmsr.sql
node scripts/pmsr/publish.mjs --local
wrangler d1 execute wcup2026-db --local --command "SELECT sm_fixture_id, match_no FROM sm_pmsr"

# UIの見た目検証（実コンポーネントをモックでレンダリング）
node scripts/pmsr/_verify-ui.mjs   # scripts/pmsr/_report-tab.png を出力（gitignore）
```

## 取り込み内容

- **数値スタッツ（テキスト抽出）**: 支配率・xG・シュート・パス・ライン突破・走行距離・スプリント・
  デュエル・トランジション率 等（Key Statistics + Phases of Play、全32指標）。
- **図表（画像切り出し）**: シュートマップ／攻撃時・守備時のライン高&チーム長／クロス分布。
  ヒートマップ/パスネットワーク等のデータ化できない可視化を公式PDFのページ画像として掲載。
- 図表ページは**見出しテキストで動的特定**（試合ごとのページズレに耐性）。
- 旧フォーマット（M01/M02 はファイル名がスペース区切り）も `hub.mjs` が吸収。

## 既知の注意点

- `fixture_id` 解決はトリコード一致（`sm_teams.short_code`）。SportMonks 側のコードが
  FIFAトリコードと食い違う稀なケースは `--fixture-map <json>` で上書きできる。
- 「Passing Networks」ページは図ではなくマトリクス表のため図表対象外（数値は取り込み対象）。
- 図表PNGは確定後不変前提で `immutable` キャッシュ。再生成時は同キー上書き＋キャッシュ自然失効。
