# 試合詳細画面（P2）設計

> ステータス: **設計確定（2026-06-10）**。ブランチ `feat/watch-detail`。
> 前提: P0 データ基盤デプロイ済み・P1 ホームのライブ化デプロイ済み（`WATCH_ENABLED=true`）。
> 正本の上位設計: `docs/superpowers/specs/2026-06-09-watch-platform-design.md` §6。

## 1. 目的とトーン

統合観戦プラットフォームの**核となる画面**。1試合の観戦・分析体験を、スコア固定ヘッダー＋タブ切替で提供する。
トーンは**「分析官が見るような」分析的な深さ** — データ厚め、自動の読み解き文、プロらしい見せ方。妥協なく最高品質で作る。

## 2. スコープ（確定）

SportMonks 実データ検証（2026-06-10・公式ドキュメント＋MCP）に基づき確定。

| 要素 | 今回の扱い | データ源 |
|---|---|---|
| ① スコア＆状態 | ✅ 固定ヘッダー | `sm_fixtures`（既存 `/api/live` と同源） |
| ② タイムライン（得点/カード/交代） | ✅ 本実装 | `sm_events` |
| ③ チームスタッツ比較 | ✅ 本実装（多項目＋自動読み解き） | `sm_stats` |
| ④ xG | ✅ 本実装（チーム合計＋効率＋**選手別xG内訳**） | `xGFixture` ＋ `lineups.xGLineup` |
| ⑤ ラインナップ／布陣図 | ✅ **本実装に昇格**（検証で完全取得可と判明） | `lineups`（grid/番号/先発）＋ `lineups.details` |
| ⑥ H2H（過去対戦） | 🔸 準備中枠のみ（後続パス） | （後続：H2H エンドポイント） |
| ⑦ 関連ニュース | ❌ 廃止（タブにしない） | — |

**諦める（データ無し・確定）**: xGレース（時系列の累積xG）、シュートマップ（座標）、シュート単位のxG値。
理由: SportMonks に汎用「シュート」イベント型が無く（イベントは goal/owngoal/penalty/missed-penalty/PK戦/交代/カード/VAR のみ）、シュートは集計カウントとしてのみ存在。`ballCoordinates` は連続ボール追跡（ヒートマップ用）でシュート単位でもxG連動でもなく、W杯での提供保証も無い → 今回は不採用。

## 3. 画面アーキテクチャ

- `public/index.html` の `Home` に `detailFixture` 状態を追加（既存 `roomView` と同型のオーバーレイ）。
- `window.WC.openDetail(fixtureId)` をグローバル登録（`useEffect` で set/cleanup）。ホームのカルーセル・日程タイムライン各行・大会結果のノックアウト表から呼ぶ。
- `detailFixture` が立つと既存タブの上に **`MatchDetailScreen`** を表示。戻るボタンで解除。
- **予想（`input`）／部屋（`rooms`）のコードパスは一切不変。**
- 新規 `public/screens-detail.jsx`（小コンポーネントに分割。1ファイル肥大化を避ける／`coding-style.md` 準拠）。

### タブ構成（固定ヘッダー＋5タブ）

固定ヘッダー: 旗・チーム名・スコア・状態（LIVE 分数 / FT / 未開始は KO 時刻）・会場。

| タブ | 中身 |
|---|---|
| タイムライン | 得点/カード/交代を中央線で左右振り分け（分・選手・交代の in/out） |
| スタッツ | ボール支配/シュート/枠内/コーナー/ファウル/パス成功率 等のミラーバー ＋ 自動の読み解き文 |
| xG | チーム合計xG＋実得点との効率（Over/Under）＋ 選手別xGランキング |
| 布陣 | フォーメーション図（grid配置）＋ 選手タップで個人スタッツ/xG/評価 |
| H2H | 準備中枠（後続でH2Hエンドポイント配線） |

## 4. データフロー & バックエンド追加

### 4.1 xG 取得の修正（重要・既存バグ）

P0 の `sm-ingest.js: xgFor()` は `statistics` 配列から `type_id=5304` を探すが、**SportMonks の xG は `xGFixture` インクルードの `expected[].value`（`location` で home/away 判定）で来る**。statistics には現れない。これが `home_xg/away_xg` が NULL のままになる原因。
→ `xgFor()` を `xGFixture` 読み取りに修正。`sm_fixtures.home_xg/away_xg` が実際に埋まる。

### 4.2 取得 include（`sm-sync.js`）

`FIXTURE_DETAIL_INCLUDE` を拡張:

    participants;scores;statistics;events;events.type;events.player;xGFixture;lineups;lineups.details;lineups.xGLineup

詳細同期は「ライブ中（state_id 2/3/6/9）＋直近終了（5/7/8）」の fixture に対し Cron で実行。ライブ中は既存のポーリング方針に従う（書き込み節約のため state_id で制御）。

### 4.3 スキーマ追加（`db/schema-watch.sql` に追記・既存 `sm_*`/`kv` と物理独立）

- `sm_lineups`: `sm_fixture_id` / `team_id` / `player_id` / `player_name` / `jersey_number` / `position` / `formation_field`(例 "2:3") / `is_start`(1/0) / `xg`(REAL,NULL可)。PK=(fixture,player)。INDEX(fixture)。
- `sm_player_stats`: `sm_fixture_id` / `player_id` / `type_id` / `value`（縦持ち＝項目増でもスキーマ不変）。PK=(fixture,player,type_id)。INDEX(fixture)。

### 4.4 取り込み・保存（P0 と同じ純粋関数＋runBatch 方式）

- `sm-ingest.js`: `toLineupRows(detail)` / `toPlayerStatRows(detail)` 追加、`xgFor()` 修正。
- `sm-store.js`: `sm_lineups` / `sm_player_stats` の upsert 文＋ runBatch 追加。

### 4.5 配信（`functions/api/fixture.js` 新規 ＋ `sm-read.js` 拡張）

- `GET /api/fixture?id=<sm_fixture_id>` → 1試合の詳細 JSON（fixture/events/stats/lineups/player_stats/xg をネスト構造で）。
- `WATCH_ENABLED` ゲート ＋ **障害隔離**（テーブル未作成・クエリ失敗・データ欠落でも 200＋空で返し、既存挙動に波及しない）。
- `sm-read.js` に `getFixtureDetail(db, id)` 追加（複数クエリを束ねてマップ）。

## 5. フロント配線

- `data.js`:
  - `LIVE` 索引に `id`(sm_fixture_id) を追加 → `window.WC.fixtureIdForMatch(match)`（app_codeペアから fixtureId 解決）。
  - `fetchFixtureDetail(id)` 追加。ライブ中のみ 10 秒ポーリング、それ以外は1回取得＋キャッシュ。
- 入口3箇所に `onClick → window.WC.openDetail(id)` を付与（`screens-home.jsx` のカルーセル＆`MatchRow`、`screens-knockout.jsx`/結果ブラケットのカード）。未開始でもプレビューとして開ける。
- `index.html` の jsx 参照 `?v=N` を必ずバンプ（`wcup-deploy-flow.md` のルール）。

## 6. 不変条件（全フェーズ厳守）

1. `kv` テーブル・予想・部屋・同期コードはスキーマも中身もコードパスも不変。
2. 観戦データは別テーブル（`sm_*`）追加のみ。
3. 障害隔離: SportMonks 不調・データ無・テーブル未作成でも既存画面は正常動作。
4. `WATCH_ENABLED` で観戦機能だけ ON/OFF（OFF時は `/api/fixture` も無効を明示）。
5. 別 Worker（`worker-watch`）・別 Cron で既存リソースを圧迫しない。

## 7. 実装順（段階・各段でテスト緑を維持）

1. **P2a バックエンド**: schema(`sm_lineups`/`sm_player_stats`)＋`xgFor()`修正＋`sm-ingest`/`sm-store`/`sm-sync`拡張＋`/api/fixture`＋`sm-read.getFixtureDetail`。単体テスト追加（P0 の既存テスト群に純粋関数テストを追加・`coding-style`/`testing` 準拠）。
2. **P2b 画面土台**: `MatchDetailScreen`＋固定ヘッダー＋タイムライン＋スタッツ＋xG タブ。`window.WC.openDetail` 配線。
3. **P2c 布陣タブ**: フォーメーション図（grid 配置）＋選手タップ詳細。
4. **P2d 入口配線＋仕上げ**: 3 入口・遷移アニメ・空/未開始/ライブ/終了の各状態・分析読み解き文。
5. H2H は準備中枠のまま（後続パス）。

## 8. 検証現実（開発時のデータ）

2026 本番の試合データは開幕（2026-06-11〜）後に発生。開発中は:
- **バックエンド**: 2022 fixture ＋ SportMonks Playground で include/構造を検証（`scripts/sportmonks-xg-probe.sh`）。
- **フロント**: テスト D1 にサンプル fixture を seed して各タブ・各状態を確認。
- xG（5304→xGFixture 修正）と lineups は **2026 実データで最終確認**（プラン All-In の xG 提供を含め）。

## 9. テスト方針

- 新規純粋関数（`toLineupRows`/`toPlayerStatRows`/修正後 `xgFor`/read マッパ）に単体テスト。
- `/api/fixture` の WATCH_ENABLED・障害隔離・空応答を検証。
- 実 sqlite での upsert 冪等・JOIN 検証（P0 と同方式）。
- 既存テスト群を緑のまま維持。

## 10. 関連

- 上位設計: `docs/superpowers/specs/2026-06-09-watch-platform-design.md`
- メモリ: `wcup-watch-platform.md` / `wcup-livescore-sportmonks.md` / `wcup-deploy-flow.md`
- 既存実装: `functions/_lib/sm-ingest.js` `sm-store.js` `sm-sync.js` `sm-read.js` / `functions/api/live.js` / `db/schema-watch.sql` / `worker-watch/`
- 検証ツール: `scripts/sportmonks-xg-probe.sh`（include 可否プローブ）
