# 大会結果のSportMonks自動反映 設計

- 日付: 2026-06-11
- ブランチ: `feat/results-auto-sync`
- 関連: [watch-platform](2026-06-09-watch-platform-design.md) / [live-results-scorers](2026-06-03-live-results-scorers-design.md) / [admin-tournament-config](2026-06-03-admin-tournament-config-design.md)

## 目的

現状、大会の確定結果（グループ順位・得点王・優勝/準優勝・ブラケット）は管理画面から手入力で `config.result` / `groupResult` / `groupMatches` に入れている。これを SportMonks から取得した `sm_*` データから自動導出し、**大会結果タブにリアルタイム反映**する。採点・ランキングの正解データにも連動させる。

## 確定した方針（ブレインストーミングで決定）

1. **自動優先＋手動上書き可**: 表示/採点に使う値 = `手動上書き(非空) ?? 自動導出値`。管理画面の手入力は「上書きレイヤー」として温存し、API誤報・遅延時の保険にする。
2. **得点王 = SportMonks topscorers API**（新テーブル `sm_topscorers`）。fixtures からは導出できないため専用取得。
3. **更新頻度 = ライブ中だけポーリング**（30〜60秒）。非ライブはタブ表示時に1回。
4. **採点・ランキングにも連動**。ただし誤採点を防ぐ安全装置を設ける（後述「FT確定ルール」）。

## アーキテクチャ

```
SportMonks API ──(Cron: 毎分 + 日次)──> D1 sm_fixtures / sm_topscorers
                                              │
                                  GET /api/results (導出のみ・短期キャッシュ)
                                              │
                public/data.js で 1点マージ: 手動config(非空) ?? 自動導出
                                              │
              アプリ内の正準 config オブジェクト（無改修の各画面・scoring.js が読む）
```

- **採用: クライアント1点マージ（`public/data.js`）＋ 導出専用 `/api/results`**
  - 理由: キャッシュ設計が素直（`/api/config` は長期 / `/api/results` は短期）。既存の各画面・`scoring.js` は無改修。管理画面は生 config を読むため自動値が混ざらない（意図しない焼き込みを防ぐ）。
- 代替（不採用）: `/api/config` GET でサーバ側オーバーレイし `?raw=1` で管理用 — マージ箇所が増え、`/api/config` が短キャッシュを強制される。

## コンポーネント

### A. 導出モジュール `functions/_lib/sm-results.js`（純関数）

`sm_*` 由来の行データを入力に、採点が読む `result` 型へ変換する。サーバ・クライアント双方から import 可能な純粋ロジック。

主関数（シグネチャは計画時に確定）:
- `deriveGroupMatches(fixtures, groups)` → `groupMatches`（順位表表示用、ライブ込み）
- `deriveResult(fixtures, topscorers, groups)` → `{ champion, runnerUp, topScorer, groupResult, knockout, bracket }`（採点用、FT確定ルール適用）
- `mergeResult(manual, derived)` → フィールド単位で `手動(非空) ?? 自動`

導出ルール:

| 導出先 | 元データ | ルール |
|---|---|---|
| `groupMatches` | グループ戦 fixtures（両 `app_code` が同一グループ） | **ライブ込み**でスコア反映（順位表が試合中に動く） |
| `groupResult[group]`（上位3コード） | 同上 | **当該グループ全6試合がFTのときのみ確定**。未完は空配列（未採点） |
| `champion` / `runnerUp` | 決勝 fixture | **FTのみ**。勝者→`champion`、敗者→`runnerUp` |
| `knockout[r32/r16/qf/sf]`（到達コード群） | 各ノックアウト round の fixtures 参加チーム | そのラウンドに登場した `app_code` 群 |
| `bracket`（表示用） | ノックアウト fixtures | ラウンド別の勝者コード |
| `topScorer` | `sm_topscorers` 先頭 | `"名前 (CODE)"` 形式（採点 `resolve()`/`canonicalKey()` と整合） |

**ラウンド対応付け**: SportMonks の `round_name`（"Round of 32" / "Round of 16" / "Quarter-finals" / "Semi-finals" / "Final" 等）→ アプリの `r32/r16/qf/sf/final` へマッピングする変換表を `sm-results.js` 内に持ち、単体テストで固定する。グループ判定は `round_name` に依存せず `config.groups` のメンバーシップ（両 `app_code` が同一グループか）で行う（より堅牢）。

**FT確定ルール（採点の安全装置）**:
- 順位表の**表示**はライブスコアを含めリアルタイムに動く。
- 採点に効く確定値（`champion`/`runnerUp`/`groupResult`/`knockout`/`topScorer`）は **FT（試合終了, `statusFromState`==="FT"）のデータからのみ**確定する。ライブ中の暫定スコアで予想が誤採点されない。
- グループ順位は全6試合FTで初めて `groupResult` に出す。

### B. 取り込み層（Cron / `worker-watch`）

既存の `scheduled` ハンドラに **topscorers 同期ステップを1つ追加**する。スコア・ブラケット系は既存の `sm_fixtures` で充足（追加取得不要）。

- `syncTopscorers(football, DB, SEASON_2026)`: `GET /seasons/26618/topscorers`（include で player / team）→ `sm_topscorers` に upsert。
- 実行タイミング: **日次 03:00 と ライブ毎分の両方**（得点王は試合中も動くためライブ追従を優先）。
- 追加物:
  - `db/schema-watch.sql` に `sm_topscorers` テーブル（`season_id`, `player_id`, `player_name`, `team_id`, `app_code`, `goals`, `position`(順位), `updated_at`。`player_id` で upsert）。
  - `sm-ingest.js` に `toTopscorerRows(json)`（純変換）。
  - `sm-store.js` に topscorers の upsert ステートメント生成 + バッチ。
  - `sm-sync.js` に `syncTopscorers()`。

### C. 配信 `functions/api/results.js`

- `GET /api/results`: `WATCH_ENABLED !== 'true'` または `DB` 無のとき `{ enabled:false, result:null, groupMatches:null }`。
- 有効時: `sm_fixtures`（+`sm_teams` JOIN）と `sm_topscorers` を読み、`sm-results.js` で **導出のみ**を返す（手動マージはしない）。`{ enabled:true, result, groupMatches, updatedAt }`。
- `Cache-Control: max-age=30`（edge キャッシュ短期）。
- 既存方針踏襲のエラー隔離: クエリ失敗・データ欠落でも例外を投げず、自動分を空にして返す（クライアント側で手動 config にフォールバック）。

### D. クライアント統合 `public/data.js`

- 既存の config 読み込みに加え、`WATCH_ENABLED` 相当が有効なら `/api/results` を取得。
- **1点マージ**: `mergeResult(manualConfig, derived)` でアプリ内の正準 config オブジェクトに重ねる（`手動(非空) ?? 自動`）。`groupMatches` も同様に上書きマージ。
- 以降、既存の各画面（`screens-grouprank.jsx` 等）・`scoring.js`・ランキング計算は**無改修**でマージ後データを読む。
- 結果タブ: ライブ fixture がある間（`/api/live` の存在判定を再利用）`/api/results` を 30〜60 秒ポーリング。非ライブはタブ表示時に1回。
- `/api/results` が落ちても従来の手動 config 表示にフォールバック（結果タブが壊れない）。

## サーバ側採点の確認（計画フェーズの必須タスク）

ランキングがサーバ側でも計算されている箇所（rooms 等）があるかを実コードで確認する。存在する場合は、同じ `sm-results.js` をそのサーバ経路にも適用してマージする（クライアント1点マージだけではカバーされないため）。存在しなければクライアントマージのみで完結。

## テスト

- `sm-results.js`（純関数）の単体テスト: グループ順位（ライブ暫定 vs FT確定）/ 決勝→優勝・準優勝 / ノックアウト到達 / 得点王整形 / `round_name` マッピング / `mergeResult` のフィールド単位上書き。
- `toTopscorerRows` / topscorers upsert の単体テスト（既存 `sm-ingest`/`sm-store` テストに倣う）。
- `syncTopscorers` の同期テスト（既存 `sm-sync.test.js` に倣いモック fetch）。
- `/api/results` の配信テスト（`enabled` フラグ・JOIN 実データ・フォールバック）。

## 既存への影響・互換性

- `sm_*` テーブル・`/api/results`・`WATCH_ENABLED` ゲートにより、フラグ OFF 時は完全に従来挙動（手動 config のみ）。
- 管理画面の手入力フロー・`config.result` の保存形式は不変（生 config を編集）。
- 採点ロジック `scoring.js` は無改修。入力 `result` がマージ後になるだけ。

## リスク・未確定

1. **`round_name` の実値**: SportMonks の WC2026 ノックアウト round 名称は本番データで要確認。マッピング表＋テストで吸収するが、初回は実データで検証する。
2. **サーバ側採点の有無**: 上記「計画フェーズの必須タスク」で確定。
3. **得点王毎分取得のAPIコール増**: ライブ追従を優先。負荷次第で日次のみへ縮退可能（フラグ化検討）。
4. **誤採点リスク**: API 誤報が採点に直結しうるが、FT確定ルール＋手動上書きで担保。
