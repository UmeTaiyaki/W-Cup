# H2H データソースを API-Football へ置換（ハイブリッド）設計

- 日付: 2026-06-18
- ブランチ: `feat/h2h-apifootball`（`main` から独立）
- 関連メモリ: [[wcup-prematch-h2h]] / [[wcup-livescore-sportmonks]] / [[wcup-deploy-flow]]
- 前提: 既存 H2H 機能（[[wcup-prematch-h2h]]・PR#85/#86）は本番稼働中。本設計は**そのデータ取得層のみ**を差し替える。

## 背景・目的

既存 H2H は SportMonks の `/fixtures/head-to-head` を使うが、**契約カバレッジ内の試合しか返さない**ため、ほとんどの代表対戦が「初対戦（0戦）」になる（例: ドイツ vs オランダが 0 戦）。

API-Football 無料枠の実測（2026-06-18）では同じ対戦が二桁戦返る:

| 対戦 | API-Football | SportMonks |
|---|---|---|
| ドイツ vs オランダ | 11戦 (2012〜2026) | 0戦 |
| フランス vs ドイツ | 9戦 (2014〜2025) | 1戦 |
| イングランド vs ドイツ | 6戦 (2010〜2022) | 1戦 |
| スペイン vs ドイツ | 8戦 (2008〜2024) | 2戦 |
| アルゼンチン vs ブラジル | 12戦 (2015〜2025) | 9戦 |
| 日本 vs アメリカ | 2戦 (2022〜2025) | 0戦 |

**目的**: H2H 取得を API-Football へ完全置換し、「初対戦だらけ」を解消する。下流（`sm_h2h` / `/api/h2h` / フロント `CheerBar`）は無改修。

## スコープ

### やること
- H2H 取得経路を SportMonks → **API-Football** に完全置換。
- `app_code → API-Football team id` の静的マップ（48代表）を生成・コミット。
- API-Football H2H レスポンスのパース純関数を追加。
- `syncH2H` を「未キャッシュの NS×7日窓 試合のみ・レート制御付き」で API-Football から取得する形に書き換え。
- worker-watch に `APIFOOTBALL_TOKEN` シークレット追加。

### やらないこと（無改修）
- `sm_h2h` スキーマ、`functions/api/h2h.js`、`public/h2h-core.js`、`CheerBar`（`public/screens-home.jsx`）、シェア画像。
- 応援ボタン・ご当地演出。
- SportMonks 連携の他用途（ライブ/詳細/順位等）には一切触れない。

## データソースの方針: 完全置換

- H2H 取得は API-Football 一本。SportMonks の H2H 取得経路（旧 `syncH2H` の SportMonks fetch）は停止。
- 失敗・未マッピング・0戦は**従来どおり「初対戦」表示で graceful**。SportMonks へのフォールバックは行わない（SM 側はほぼ 0 戦で実利が小さく、2 経路維持は複雑化するため）。

## API-Football 仕様（確定値・実測）

- ホスト: `https://v3.football.api-sports.io`（api-football.com ダッシュボード直契約）
- 認証ヘッダ: `x-apisports-key: <APIFOOTBALL_TOKEN>`
- H2H: `GET /fixtures/headtohead?h2h={teamId1}-{teamId2}`
  - レスポンス: `{ response: [ { fixture:{date,...}, teams:{home:{id,winner}, away:{id,winner}}, goals:{home,away} }, ... ] }`
  - `goals.home/away` が最終スコア、`teams.home/away.winner` は true/false/null（引分 null）。
- チーム解決: `GET /teams?search={name}` → `response[].team.{id,name,national}`。**国代表は `national===true`**。
- レート制限: **100 リクエスト/日**（00:00 UTC リセット）＋**約10 リクエスト/分**。超過時 `status=429` かつ `errors.rateLimit` を返す。

## コンポーネント設計

### 1. `functions/_lib/af-team-map.js`（新規・静的）
- `export const AF_TEAM_ID = { GER: 25, NED: 1118, ... }`（48代表ぶん、`app_code → API-Football team id`）。
- 生成: `scripts/h2h-probe/build-af-map.mjs`（後述）で素案を作り、**手動検証してコミット**。
- 未収録の app_code は単に存在しない → 呼び出し側でスキップ（初対戦）。

### 2. `functions/_lib/apifootball-h2h.js`（新規・純関数）
- `extractAfH2HResult(fixture)`: API-Football の 1 fixture から正規化結果へ。
  - `teams.home.id`/`teams.away.id` を `Number()` 強制で `home_team_id`/`away_team_id`。
  - `goals.home`/`goals.away` を `Number()` 強制で `home_score`/`away_score`。
  - いずれか欠損なら `null`（集計でスキップ）。
- 出力形は既存 `sm-h2h.js` の `extractH2HResult` と**同一**（`{home_team_id, away_team_id, home_score, away_score}`）→ 集計を共有できる。

### 3. `functions/_lib/sm-h2h.js`（リファクタ）
- 現状 `aggregateH2H(homeTeamId, fixtures)` は内部で SportMonks 専用 `extractH2HResult` を呼ぶ。これを**ソース非依存に分離**:
  - `aggregateResults(homeTeamId, results)`: 既に正規化された結果配列から W-D-L 集計（現行ループのテスト済みロジックを流用）。
  - 呼び出し側が `fixtures.map(extractor)` してから渡す。
- SportMonks 専用 `extractH2HResult` は**削除**（完全置換でデッドコード化）。関連テストも更新。
- `rowsToH2H`・`H2H_WINDOW_DAYS` は維持。

### 4. `functions/_lib/apifootball-client.js`（新規・薄いラッパ）
- `makeAfClient(token)` → `{ get(path) }`。`x-apisports-key` 付与、JSON 返却、`status`/`errors` を呼び出し側に渡す。
- 既存 `sm-ingest` の footballClient とは別系統（ホスト/ヘッダが異なるため独立）。

### 5. `functions/_lib/sm-sync.js` `syncH2H`（書き換え）
- 対象選択（**未キャッシュのみ** = 一度取得キャッシュ）:
  ```sql
  SELECT f.sm_fixture_id, f.home_team_id, f.away_team_id
  FROM sm_fixtures f
  LEFT JOIN sm_h2h h ON h.fixture_id = f.sm_fixture_id
  WHERE f.state_id = 1 AND f.starting_at_ts IS NOT NULL
    AND f.starting_at_ts BETWEEN ? AND ?
    AND h.fixture_id IS NULL
  ORDER BY f.starting_at_ts
  LIMIT ?    -- H2H_MAX_PER_RUN（既定8、手動時は max= で上書き）
  ```
- 各対象: 既存どおり `sm_teams.app_code` を解決 → `AF_TEAM_ID[app_code]` で API-Football id。どちらか未マッピングなら**スキップ**。
- API-Football へ `fixtures/headtohead?h2h={afHome}-{afAway}`。`status===429` なら**その実行を即停止**（部分コミット）し次回 Cron で継続。
- `extractAfH2HResult` → `aggregateResults(afHome, results)`（home の app_code に対応する af id 視点）→ `h2hStatement` で upsert（`home_code/away_code` は app_code、現状と同一）。
- レート: 既定 `H2H_MAX_PER_RUN=8`（< 10/分なので sleep 不要）。daily Cron の新規流入は通常数件なので十分。

### 6. worker-watch
- `APIFOOTBALL_TOKEN` を `wrangler secret put` で追加。
- `daily` ブロックの `syncH2H` 呼び出し配線は既存のまま。`clients(env)` に API-Football クライアント生成を追加（or `syncH2H` 内で `makeAfClient(env.APIFOOTBALL_TOKEN)`）。
- 手動トリガ `?action=h2h&max=N`（既存 PR#86 を踏襲、`max` 受理を追加）。

## 初期バックフィル
- 既存の SportMonks 由来 `sm_h2h` 行（28行・大半 total=0）は**一旦クリア**（`DELETE FROM sm_h2h` を 1 回）。以降は未キャッシュのみ取得するので API-Football で再充填される。
- **Worker 内では sleep しない**。手動 `?action=h2h&max=28` を叩くと、per-minute(≈10) に達した時点で `429` を受けて**部分コミットして即停止**する（例: 1回で約8〜10件投入）。残りは**1分ほど空けて同じトリガを再実行**して継続（約28件なら 3 回程度）。
- daily Cron は既定 `max=8`（未指定）で動き、通常の新規流入（数件/日）を 1 tick で吸収する。

## レート制御の整理
- **書込キャッシュ**で再取得を最小化（行があれば叩かない）。
- **per-run 上限**（既定8）で per-minute(≈10) 超過を回避。
- **429 即停止**で日次上限(100)も自然に保護。次回継続。
- ID マップ生成（48 search コール・一度きり）も per-minute を考慮しスロットリング。

## エラー処理 / graceful degradation（現状保証を維持）
- `H2H_ENABLED!=="true"` / `APIFOOTBALL_TOKEN` 未設定 → `syncH2H` は `{count:0}` で no-op。
- 未マッピング・API 失敗・429・テーブル無し → 当該試合は行を作らない → フロントは「初対戦」。5xx を出さない。
- `goals`/`id` の文字列型は `Number()` 強制（既存方針踏襲）。

## ID マップ生成スクリプト（一度きり）
`scripts/h2h-probe/build-af-map.mjs`:
- 入力: 本番 `sm_teams` の `app_code, name`（48代表）。
- 各 name で `/teams?search=` → `national===true` かつ国一致で 1 件に絞る。スロットリング（≈7s 間隔、48件で約6分・100/日内）。
- 出力: `app_code → {af_id, af_name}` の JSON（人手検証用に名前も）。
- **手動検証ポイント**: USA（女子代表を拾わない・男子=2384）、Korea Republic、Côte d'Ivoire 等。検証後 `af-team-map.js` に確定値をコミット。

## テスト
- `apifootball-h2h.test.js`: `extractAfH2HResult` を API-Football 実レスポンス（probe 出力）を fixture に。欠損/文字列型/引分(winner=null) を網羅。
- `sm-h2h.test.js`: `aggregateResults`（分離後）の既存ケースを移植。home がどちら側でも正答すること。
- `sm-sync.test.js`: `syncH2H` の (a) 未キャッシュ選択（LEFT JOIN で既存行を除外）、(b) 未マッピング skip、(c) 429 即停止・部分コミット、(d) per-run 上限。D1 はモック。
- 既存 550+ テストは維持。SportMonks `extractH2HResult` 削除に伴う該当テストのみ更新/削除。

## デプロイ・運用
- worker-watch は **CI 対象外** → `cd worker-watch && npx wrangler deploy` 手動。
- Pages 側は H2H 取得に無関係（`/api/h2h` は読みのみ）だが、`functions/_lib` 共有のため念のためデプロイ整合を確認。
- `APIFOOTBALL_TOKEN` シークレットを worker-watch に登録。
- 初期化: `DELETE FROM sm_h2h` → 手動 `?action=h2h` でバックフィル → 行数・サンプル検証。
- 大会後: `H2H_ENABLED` OFF（既存運用）。

## 注意・残リスク
- データ深度は概ね 2008〜2015 年以降（全時代の通算ではない）。それでも現状比で大幅改善。
- 無料枠 ToS（キャッシュ/利用条件）は実装前に軽く確認。問題があれば方針再検討。
- API-Football の team id は本設計時点の実測値（独=25, 蘭=1118 等）。マップ生成時に再確認。
