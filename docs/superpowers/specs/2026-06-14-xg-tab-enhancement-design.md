# xGタブ強化（フル分析コンパニオン化）設計

- 日付: 2026-06-14
- ブランチ起点: `fix/d1-rows-written-reduction`（D1 rows-written 削減作業の最中。コスト方針と両立必須）
- 対象画面: 試合詳細 `public/screens-detail.jsx` の `XgTab`（[[wcup-xg-analysis-screen]] PR#22 の続き）
- 関連: [[wcup-watch-platform]]（ライブ／分析強化）, [[wcup-livescore-sportmonks]]（type_id・include）, [[wcup-d1-rows-written]]（書き込み制約）, [[wcup-deploy-flow]]（jsx変更時 index.html の ?v=N 必須）

## 1. 目的

開幕戦（MEX-RSA, fixture 19609127）のライブ実機プローブで、SportMonks All-In から xG ファミリ・選手別 xG/xGoT・モメンタム時系列が**ライブ中から取得可能**と確定した。これを使って xG タブを「素人でもわかる、フル分析コンパニオン」に強化する。データは予想／部屋に一切触れず、試合詳細の xG タブのみを拡張する。

## 2. 背景：現状コードの「土台ギャップ」（本設計の核心）

現行ブランチ最新コードを精査した結果（行番号は確認時点）:

1. **xG ファミリは `xgfixture` include にしか来ない**（`statistics` には含まれない＝実機プローブ確認済）。しかし `functions/_lib/sm-ingest.js:155 toStatRows` は `detail.statistics` のみを `sm_stats` に保存する。よって **xGoT(5305)/xGA(9687)/xGD(9684)/npxG(7943)/セットプレー内訳(7940–7945)/xPTS(7939)/GK xGP(9686) は D1 に存在しない**。
2. フロント `XgTab` は `foldStats(detail.stats)`（=sm_stats）から `pick(5305)`・`pick(9687)` 等を引く（`screens-detail.jsx:1379-1396`）。sm_stats に無いため**常に null → xGoT/被xG/xG差/決定力/GK評価セクションは graceful degradation で消灯**。本番で実際に出ているのはチーム合計 xG と選手別 xG のみ。
3. `xgFor`（`sm-ingest.js:67`）は `xg.find(x => x.location === location)` で **type_id を絞らず最初の1件**を拾う。xgfixture は1サイド十数 type_id を含むため、base `home_xg/away_xg` が 5304 以外を拾う潜在バグ。
4. **選手別 details は全 type_id が `sm_player_stats` に保存済**（`toPlayerStatRows`）。選手別 xG(5304)/xGoT(5305)/Shooting Performance(9685) はフロント到達済。
5. **時系列（pressure/trends/periods.statistics）は未 ingest**。

→ 強化は「見た目を足す前に、まず取り込み層を直す」順序が必須。

### プローブで確定した事実（時系列の限界）

- `trends`（772件）は **xG を含まない**（80=パス, 43=攻撃, 45=支配率, 42=シュート, 106=デュエル 等のカウント系のみ）。**真の「累積 xG レース」は再構成不可**。
- `pressure`（124件）は `{minute, participant_id, pressure}` の**勢い指数の時系列**＝モメンタムグラフは本物が作れる。
- `periods.statistics` も xG を持たない見込み → **前後半 xG スプリットは不可**（カウント系の前後半比較なら可）。

## 3. 確定した設計判断

| 論点 | 決定 |
|---|---|
| スコープ | フル（A 土台修正 ＋ B 新静的セクション ＋ C モメンタム/フロー時系列） |
| 表示タイミング | **ハイブリッド**：チーム/選手の xG 系はライブ表示（速報値の注記つき）、重い時系列(8,9)は **FT 後のみ** |
| C 層の実体 | **モメンタム(pressure) ＋ 試合の流れ(trends カウント系)**。xG レース・前後半 xG は無し |
| 説明文 | 各見出し下に**端的な1行解説**。改行して2行目に緑字「例：」（実際の表示値に紐づけ） |
| データ保存 | xgfixture→sm_stats 流し込み（スキーマ無変更）＋ 新 `sm_fixture_series`（1 fixture=1行 JSON, FT時1回書き） |

## 4. type_id リファレンス（実機確定）

- チーム系（xgfixture→sm_stats）: 5304 xG / 5305 xGoT / 7943 npxG / 9687 xGA / 9684 xGD / 9686 xGP(Goals Prevented) / 9685 SP / 7945 xGOP / 7944 xGSP / 7942 xGC / 7941 xGFK / 7940 PK xG / 7939 xPTS
- 選手系（既存 sm_player_stats）: 5304 / 5305 / 9685
- 補助（既存 statistics）: 42 ShotsTotal（xG per shot 用）

## 5. アーキテクチャ

### 5.1 バックエンド（取り込み層）

**ユニット境界を保ち、既存パターンに従う。**

- `functions/_lib/sm-ingest.js`
  - **新 `toXgStatRows(detail)`**: `xgfixture[]` を `{sm_fixture_id, team_id: participant_id, type_id, value}` に変換して返す（`toStatRows` は statistics 専用のまま据置＝責務分離）。呼び出し側（取り込みオーケストレータ）で両者を結合して `sm_stats` に upsert。type_id は元値のまま（5304/5305/… は statistics 系 type_id と衝突しない）。これだけで A/B のチーム系がフロント無改修で点灯。`value` は `x.value ?? x.data?.value`、`location`/`participant_id` 欠落行は skip。
  - **`xgFor` 修正**: `type_id === 5304` かつ `location` 一致で base xG を取る（潜在バグ修正）。
  - **新 `toSeriesRow(detail)`**: `pressure[]`・`trends[]`・`periods[].statistics` から表示用に正規化した1個の JSON を作る。形:
    ```
    {
      pressure: [{minute, home, away}],          // pressure を minute で home/away に畳む
      flow: { shots:[{minute,home,away}], possession:[...], attacks:[...] },  // trends を type_id 別に畳む
      periods: { first:{...countable}, second:{...} }  // 前後半カウント比較（任意）
    }
    ```
    participant_id→home/away は `participantsByLocation` を再利用。
- `functions/_lib/sm-store.js`: `sm_fixture_series` の upsert（1行）。
- `functions/_lib/sm-sync.js`:
  - `FIXTURE_DETAIL_INCLUDE` は現状維持（xGFixture は既に含む）。**時系列 include は通常 detail に足さない**（ライブ payload を太らせない）。
  - **新 `syncFixtureSeries(footballClient, db, fixtureId)`**: `fixtures/{id}?include=pressure;trends;periods.statistics` を**一発取得**→`toSeriesRow`→`sm_fixture_series` へ1行 upsert。
- `worker-watch/src/index.js`: 既存5分 detail サイクル内に、**スコア自己修復と同じパターンで** 「state 5/7/8（終了）かつ `sm_fixture_series` 未保存の fixture」を数件拾って `syncFixtureSeries` を呼ぶ**書き込み一度きり**ステップを追加。
- `functions/_lib/sm-read.js`: `getFixtureDetail` の戻りに `series`（sm_fixture_series の JSON をパースしたもの、無ければ null）を追加。

### 5.2 データモデル

- `sm_stats`（**変更なし**）: `(sm_fixture_id, team_id, type_id, value REAL)` に xgfixture 行が増えるだけ。
- **新規 `db/schema-watch.sql` ＋ マイグレーション `db/0013_sm_fixture_series.sql`**:
  ```sql
  CREATE TABLE IF NOT EXISTS sm_fixture_series (
    sm_fixture_id INTEGER PRIMARY KEY,
    series_json   TEXT NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  ```
- `sm_fixtures.home_xg/away_xg`: 維持（`xgFor` 修正で正確化）。

### 5.3 フロントエンド `public/screens-detail.jsx`（XgTab 再構成）

現 `XgTab` は ~360行で肥大化気味。**小コンポーネントへ抽出**して見通しを保つ:

- 既存維持/点灯: セクション1（xPTS 追加）・2・5(`XgShotQuality`)・6(`XgGkValue`・点灯)・7(`PlayerXgBar` に xGoT オーバーレイ追加)
- 新規コンポーネント: `XgBreakdown`（3 内訳）・`XgNpxg`（4）・`XgMomentum`（8 pressure）・`XgFlow`（9 trends・タブ切替）
- 説明ヘルパ: `XgSectionHead({label, desc, example, badge})` — 全セクションで共通の「見出し＋1行解説＋改行例文」を描画。
- **表示ゲート変更**: 現 `isFinished` ハードゲートを廃し、
  - セクション1–7: チーム xG が存在すれば表示（ライブ可）。ライブ時は上部に「⚡速報値」注記。
  - セクション8–9: `fx.status==="FT"` かつ `detail.series` present のときのみ表示。
  - 各セクションは既存方針どおり **render-if-present**（必要 type_id 欠如で個別に畳む）。
- `index.html` の `screens-detail.jsx?v=N` を bump（jsx 変更ルール）。

### 5.4 セクション順序と説明コピー（確定）

1. **チームxGサマリー**（xG/xGoT/被xG/xG差/xPTS）— 「決定機の“質”の合計。」／例：xG0.43＝この内容なら平均0.4点ペース。実際は2点→効率よく決めた
2. **効率＆決定力** — 「実得点−xGで見る。」／例：2点−0.43＝期待を大きく超えて決めた
3. **xG内訳**(オープン/CK/FK/PK)〈NEW〉— 「好機の出どころ。」／例：オープン0.35＝流れの中で作れた
4. **npxG**(PK除く)〈NEW〉— 「PKを除いたxG＝地力。」／例：xG1.5でもPK1本(0.8)込みなら実力分は0.7
5. **シュートの質**(xG per shot) — 「1本がどれだけ良い形か。」／例：0.06＝遠めの薄い形／0.30＝決定機級
6. **GK評価**(xGP) — 「防いだ失点の量。」／例：+0.58＝0.58点ぶん好セーブ／マイナスは取りこぼし
7. **選手別 xG/xGoT**〈NEW〉— 「誰が好機を作ったか。」／例：0.70＝1人で“ほぼ1点級”の機会を作った
8. **モメンタム**(pressure)〈FTのみ〉— 「押してた時間帯。」／例：山が上側＝その時間はメキシコが攻勢
9. **試合の流れ**(trends・累積シュート/支配率/攻撃のタブ切替, 初期=累積シュート)〈FTのみ〉— 「支配/シュートの推移。」／例：右肩上がり＝後半に圧力を強めた

## 6. D1 書き込みコスト分析（削減方針との整合）

- `sm_stats`: detail sync（5分/最大12 fixture）ごとに xgfixture 約26行/fixture が追加 UPSERT。最大 ~312 UPSERT/サイクル（活動時間帯のみ）。許容範囲。
- `sm_fixture_series`: **1 fixture につき FT 時1回だけ**書き込み（write-once ガード）。大会通算でも ~104 行。
- 時系列 include は通常 detail に足さない → ライブの payload/書き込みを増やさない。
→ rows-written 増は限定的で、削減方針と両立。

## 7. テスト

- ingest 単体（`sm-ingest.test.js`）: xgfixture→stat 行マッピング／`xgFor` が 5304 を選ぶ／`toSeriesRow` が pressure・trends・periods から正しい blob を作る／participant→home/away 畳み込み。
- store 単体（`sm-store.test.js`）: `sm_fixture_series` upsert SQL。
- sync 単体（`sm-sync.test.js`）: `syncFixtureSeries` の include と書き込み一度きりガード。
- read 単体: `getFixtureDetail` が series をパースして返す／無い時 null。
- シード更新 `db/seed-xg-analysis.sql`: xgfixture 由来 sm_stats 行＋`sm_fixture_series` サンプルを追加し、フロント目視ハーネスで 1–9 全点灯・degradation・ライブ/FT 切替を確認。
- `npm test` 全通過を完了条件とする。

## 8. スコープ外（YAGNI）

- 真の xG レース（累積 xG 折れ線）— データ非存在のため不可。
- 前後半 xG スプリット — 同上。
- 座標・ヒートマップ・ショットマップ・パスネットワーク — All-In 非提供（別プロバイダ領域）。
- 予想／部屋／採点ロジックへの変更は一切しない。

## 9. リスクと緩和

- **xgfixture の要素形状揺れ**（`value` vs `data.value`、`location` 欠如）→ ingest で両対応・欠落は skip（既存 `xgFor` の防御を踏襲）。
- **trends/periods の形状未確定部**（type_id マッピング）→ `toSeriesRow` 実装時に開幕戦 fixture で再プローブして確定（`scripts/sportmonks-coverage-probe.sh` 拡張）。
- **ライブ表示の誤解**（変動値）→「⚡速報値」注記で明示。
- **jsx ?v 忘れ**→ チェックリスト化（[[wcup-deploy-flow]]）。
