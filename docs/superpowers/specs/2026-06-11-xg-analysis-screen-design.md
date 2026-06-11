# xG分析画面（C′案）設計

- **日付**: 2026-06-11
- **ブランチ（予定）**: `feat/xg-analysis-screen`
- **対象**: 試合詳細 `public/screens-detail.jsx` の **xGタブ拡張**
- **位置づけ**: [[wcup-watch-platform]] P2 試合詳細のさらなる強化。既存xGタブ（合計xG／効率／選手別xG）を「分析官が使い切る」フル分析ビューへ進化させる。
- **スコープ厳守**: 予想タブ・部屋タブは一切触らない（描画もデータも不変）。

---

## 1. 背景と目的

既存の試合詳細xGタブは「チーム合計xG・効率判定・選手別xG」の3要素のみ。SportMonks All-In で取れる xG系派生指標（xGoT・xGA・npxG）とスタッツ（シュート/枠内）を組み合わせ、**1試合の得点期待値を多面的に読み解く分析ビュー**にする。外部データ（トラッキング・座標・シュートマップ）は All-In スコープ外で取得不可（検証済み）。**All-in完結型**で取れるものだけを使い切る。

## 2. データ可用性（実APIプローブ確定・2026-06-11）

`scripts/sportmonks-xgot-probe.sh`（fixture 18452339 = 2022 Morocco-Spain）で検証。

| 指標 | type_id | カタログ実在 | 当該2022 fixtureでの充填 | 取得経路 |
|---|---|---|---|---|
| xG | 5304 | ✓ | ✗（2022シーズン未充填） | `xgfixture[].value`（location別）→ `sm_fixtures.home_xg/away_xg` |
| xGoT | 5305 | ✓ (`EXPECTED_GOALS_ON_TARGET`) | ✗ | 未確定（statistics or xgfixture） |
| xGA | 9687 | ✓ (`EXPECTED_GOALS_AGAINST`) | ✗ | 相手xGから導出可、または直接 |
| npxG | 7943 | ✓ (`EXPECTED_NON_PENALTY_GOALS`) | ✗ | 未確定 |
| 選手別xG | — | ✓ | ✗ | `lineups.xglineup.value` → `sm_lineups.xg` |
| 選手別xGoT | — | **lineupsに存在せず** | — | **取得不可** |
| シュート総数 | 42 | ✓ | ✓ | `sm_stats`（縦持ち）|
| 枠内シュート | 86 | ✓ | ✓ | `sm_stats` |

**結論**:
- xGoT/xGA/npxG は**カタログ上の正式指標**だが、**実充填は2026の試合終了まで確認不能**（All-Inはleague_id=732＝W杯のみ＝他大会で代替検証不可、初戦は6/11 19:00）。2022 W杯シーズンは base xG すら未充填。
- したがって **xGoT系をハード依存にしない**。「取れたら出す（graceful degradation）」を必須アーキテクチャとする。
- **選手別xGoTは lineups に存在しない**ため、当初構想の⑤白線（選手xGoT水準）は**廃止**。

## 3. アーキテクチャ

### 3.1 配置
- 新規画面は作らず、`screens-detail.jsx` の `XgTab`（現 858行〜）を全面的に書き換える。タブ定義（10行 `{ id: "xg", label: "xG" }`）は不変。
- 既存の `PlayerXgBar`（455行）は再利用（白線=xGoT描画は除去）。
- 分析文ヘルパ（698行〜）は xGoT が存在する時のみ「決定力」言及を追加。

### 3.2 データソース（重要・改修最小化）
- `sm-read.getFixtureDetail` は既に `SELECT * FROM sm_stats`（type_id縦持ち全行）と `sm_lineups` を返している。
- よって **xGoT(5305)/xGA(9687)/npxG(7943) が statistics 経由で来れば、バックエンド改修ゼロでフロントに到達**する。フロントは `detail.stats` を type_id で引くだけ。
- `detail.home.xg / away.xg`（`sm_fixtures` 列）は base xG の確定経路として維持。
- **唯一のバックエンド追加候補**: xG系が `xgfixture` 経由でしか来ない場合に備え、ingest（`xgFor`）を xG-family（5304/5305/9687/7943）も拾って `sm_stats` 相当へ流す拡張。**実装の第1タスクで2026実データの所在を確認してから**、必要時のみ着手（不要なら frontend のみで完結）。

### 3.3 2層構成（確実層 / xGoT依存層）

| | セクション | 確実層（base xG＋stats で動く） | xGoT依存層（5305充填時のみ点灯） |
|---|---|---|---|
| ① | チームxGサマリー | xG・被xG(xGA=相手xG)・xG差 | xGoT セル |
| ② | 効率＆フィニッシュの質 | 「実得点 vs xG」自動解析文 | 「xGoT−xG」決定力文 |
| ③ | シュートの質 | xG per shot（xG÷shots[42]）＋シュート内訳バー | — |
| ④ | GK評価 | （xGoT無しでは不成立） | 相手xGoT−失点＝“防いだ失点”（両GK） |
| ⑤ | 選手別 | 選手別xG 横バー（既存・xglineup） | （白線は廃止） |

### 3.4 状態出し分け（3状態）

**A案の核は main に実装済み**（commit `aa8ab04` "xGタブは終了(FT)した試合のみ表示"）。`XgTab`（879行）で `isFinished = fx.status === "FT"`、未終了 or 両xG null なら「xGデータは試合後に表示されます」プレースホルダに早期return。**この既存FTゲートを土台に再利用**し、FT分岐の中身を本仕様の5セクションへ拡張する。

- **未開始 (NS)**: 既存プレースホルダ（任意でキックオフ時刻を併記）。
- **ライブ中 (INPLAY)**: **A案＝プレースホルダのみ**（既存挙動を踏襲）。xG確定値は出さず、シュート速報はスタッツタブに委ねる。任意で「xGは試合後に確定します」と文言を明確化。
- **試合後 (FT)**: ①〜⑤フル表示。xGoT依存層は 5305 が充填され次第、自動で点灯。
- 状態判定は `statusFromState`（sm-read）で既に NS/LIVE/FT が出ており `detail.status`（`fx.status`）を使う。

## 4. graceful degradation の原則（必須）

- 各指標は**値が存在する時だけ描画**。`null` の指標はセル/行ごと畳む（レイアウトを崩さない）。
- セクション単位の生死:
  - ① は base xG が `null` の間はセクション全体を NS と同じプレースホルダに。
  - ② は base xG があれば「実得点 vs xG」だけ表示、xGoT があれば決定力文を追記。
  - ③ は base xG ＋ shots(42) が揃った時のみ。どちらか欠ければ非表示。
  - ④ は**xGoT依存**。xGoT が `null` の間はセクションごと非表示（プレースホルダも出さない＝存在を匂わせない）。
- 「データが無い＝壊れる」を絶対に作らない。最悪でも既存3要素相当（①核＋②＋⑤）は成立する。

## 5. コンポーネント分割

`screens-detail.jsx` 内で、既存 `XgTab` の FT分岐に節を追加していく（`StatsTab`/`foldStats` と同じインライン関数コンポーネント方針。ビルド無しのブラウザBabel UMD読み込みのため、外部モジュール分離はしない）:

- `XgTab`（オーケストレータ）: 既存FTゲート（879行）→ FT時に①〜⑤を描画。
- 各節は小さなインライン関数コンポーネント（`XgTeamSummary`①/`XgEfficiency`②/`XgShotQuality`③/`XgGkValue`④）として `XgTab` 直前に定義。⑤は既存 `PlayerXgBar` 並びを維持（白線は未実装＝追加しない）。
- `XgGkValue`④ は xGoT欠如時に `null` を返し、`XgTab` 側で非描画。
- **新ヘルパは作らない**: xGoT(5305)/xGA(9687)/shots(42)/枠内(86) は既存 `foldStats(detail.stats, homeTeamId, awayTeamId)` の戻り `{ [type_id]: {home, away} }` から引く（DRY）。xGA は相手xGからの導出を基本とし、9687 が来ていれば優先。

各節は detail のスナップショットを props で受け取るだけで fetch/状態を持たない。

## 6. テスト（このリポジトリの実態に合わせる）

- テストランナーは **`node --test 'functions/**/*.test.js'`**（Vitestではない）。**対象は `functions/_lib/` のバックエンド純粋モジュールのみ**。`public/*.jsx` はビルド無しのブラウザ読み込みで、現状フロントの自動単体テストは無い（`foldStats`/`statInsight` も同様にインライン・未カバー）。
- **フロント（本仕様の主作業）の検証＝Playwright ハーネス＋seed**（確立パターン）: `db/seed-detail-live.sql` を FT＋xGoT/xGA/shots 入りに拡張 → 使い捨て `public/_detail-harness.html`（React18 UMD+Babel+data.js+ui.jsx+screens-detail.jsx・`?fx=...`、確認後削除）で5セクション＋3状態＋degradationを目視。手順は `--port 8799`＋`service_workers="block"`（[[wcup-watch-platform]]）。
- **degradation確認**: seed を 3パターン（base xGのみ / base+xGoT / xG全欠如）に切り替え、各セクションの描画/非描画と「壊れない」ことを確認。
- **バックエンド改修が発生した場合のみ** `node:test` で TDD（`sm-ingest.test.js` 等の既存パターン）。
- **既存テスト緑維持**（現状286+ を `npm test` で確認）。

## 7. 開幕後の確認タスク（実装第1ステップ）

2026実データ（season 26618）が充填され次第、以下を確定:
1. **xGoT(5305)/xGA(9687)/npxG(7943) の所在**: statistics か xgfixture か。statistics なら frontend のみで完結、xgfixture なら ingest 拡張（3.2）。
2. base xG(5304) が2026 W杯で実際に充填されるか（2022は未充填だった）。
3. 充填されない指標があれば、degradation により自動で畳まれることを本番で確認。

この確認結果でバックエンド改修の要否が確定する。**改修が不要なケース（statistics経由）を最良とし、まず frontend 完結で組む**。

## 8. やらないこと（YAGNI）

- ライブxG（別アドオン・不採用）。
- シュートマップ／xGレース時系列／座標（All-Inで取得不可・確定）。
- 選手別xGoT（lineupsに存在せず）。
- 外部データソース統合（コスト・スコープ外）。
- 大会横断のxG集約（別企画。本仕様は1試合の詳細に限定）。

## 9. デプロイ

- `screens-detail.jsx` 変更 → `public/index.html` の `?v=N` を必ずインクリメント（[[wcup-deploy-flow]]）。
- バックエンド改修が発生した場合のみ schema migration ＋ worker-watch 再デプロイ。frontend完結なら Pages デプロイのみ。
