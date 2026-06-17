# 試合前カード H2H（過去対戦成績）差し替え 設計

- 日付: 2026-06-17
- ブランチ: 既存作業ブランチ（`feat/home-news-gnews`）からは独立させる想定。新規 `feat/prematch-h2h` を推奨。
- 関連メモリ: [[wcup-pre-match-cheer]] / [[wcup-watch-platform]] / [[wcup-livescore-sportmonks]] / [[wcup-deploy-flow]]

## 目的

ホームのカルーセルの**キックオフ前カード**にある「ご当地応援バトル」のうち、
**応援ボタン（演出）はそのまま維持**し、「押すと増えるカウント＋比率バー」を
**両チームの通算対戦成績（H2H: Win-Draw-Loss）バー**に差し替える。

## スコープ

### やること
- SportMonks H2H API から、直近の未開始 fixture について両代表の通算 W-D-L を事前取得し D1 に保存（daily Cron）。
- `/api/h2h` で fixture_id 群の集計を配信（`cheer` と同形のフラグ付きエンドポイント）。
- フロントの `CheerBar`（`public/screens-home.jsx`）で、比率バー＋カウント行を **W-D-L バー**に差し替え。
- 応援ボタン・ご当地演出（`celebrate`）・シェアボタンは維持。タップ時の D1 カウント書き込みは停止。

### やらないこと（YAGNI）
- 直近 N 戦の結果リスト表示（`last_meetings` も保存しない）。今回は通算 W-D-L のみ。
- 試合詳細タブの `H2HPlaceholder`（別画面）の置き換え。本件はカルーセル試合前カードに限定。
- 応援カウントのバックエンド（D1 `cheer_counts` テーブル / `/api/cheer`）の削除。**温存**し、フロントから書き込まないだけ。将来復活が容易。

## アーキテクチャ

既存 `cheer` と同じ「Cron 事前取得 → D1 → API → クライアントプール → 描画」パターンに合わせ、一貫性を最大化する。

```
worker-watch (daily Cron 0 3 * * *)      D1                /api/h2h           CheerBar(改)
──────────────────────────────     ──────────────     ─────────────      ─────────────
未開始(NS)かつ窓内の sm_fixtures を走査   sm_h2h          fixtures=ID[] →     fixtureId → fetch
 └ SportMonks H2H 取得・home視点で集計  (fixture_id PK)   集計をJSON返却 ──→  W-D-L バー描画
 └ sm_teams で app_code 解決して保存                                         応援ボタン/演出/シェアは維持
```

- フラグ `H2H_ENABLED`（`worker-watch/wrangler.toml` の Cron 側、および Pages Functions 側 `wrangler.toml`）。OFF で `/api/h2h` は `{enabled:false}` を返し、フロントはバー領域を出さない（ボタンは出す）。

## データ取得（Cron Worker）

`worker-watch/src/index.js` の **daily ブランチ（`event.cron === "0 3 * * *"`）** に H2H 同期を追加する。
H2H は変化が遅い（対象は未開始試合の歴史的対戦＝ほぼ静的）ため 1 日 1 回で十分。

- 対象 fixture: `sm_fixtures` のうち `state` が未開始（NS 相当）かつ `starting_at` が現在〜一定窓内（既定 7 日）。少数なので API コールは軽い。
- 各 fixture の `home_team_id` / `away_team_id` で SportMonks H2H を取得。
  - エンドポイント: `GET /fixtures/head-to-head/{team1}/{team2}`（All-In 契約。実レスポンス形は実装時に `scripts/` で probe して確定する）。
- **集計（home 視点 W-D-L）**: 返却された過去 fixtures を走査し、各試合のスコアから
  `home_team_id` から見た 勝 / 分 / 敗 を数える。PK 戦・中止等は通常の 90/120 分結果で判定（probe で要確認、不明分はスキップ）。
- `sm_teams` で `home_team_id`/`away_team_id` を `app_code` に解決して保存（フロントの向き判定用）。
- 保存先 D1 テーブル:

```sql
CREATE TABLE IF NOT EXISTS sm_h2h (
  fixture_id  INTEGER PRIMARY KEY,   -- sm_fixtures.sm_fixture_id
  home_code   TEXT,                  -- sm_teams.app_code（home_team_id 由来）
  away_code   TEXT,                  -- sm_teams.app_code（away_team_id 由来）
  home_wins   INTEGER NOT NULL DEFAULT 0,
  draws       INTEGER NOT NULL DEFAULT 0,
  away_wins   INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT
);
```

- 障害隔離: テーブル未作成・API 失敗・解決不能（app_code 欠落）の fixture は **スキップしてログのみ**。他 fixture や既存 cron 処理を止めない。

## API（`functions/api/h2h.js`）

`functions/api/cheer.js` を範として実装する。

- `GET /api/h2h?fixtures=ID1,ID2,...`
- `H2H_ENABLED !== "true"` → `{ enabled: false }`。
- 正常時 → `{ enabled: true, h2h: { [fixture_id]: { home_code, away_code, home_wins, draws, away_wins, total } } }`。
- 該当行が無い fixture はキー自体を含めない（フロントは「初対戦」扱い）。
- 読み出しロジックは `functions/_lib/sm-h2h.js`（集計純関数＋D1 read）に切り出し、単体テスト可能にする。

## フロント描画（`public/screens-home.jsx` の `CheerBar`）

### クライアントプール `public/h2h-core.js`（新規）
- `cheer-core.js` と同形の `window.WC.h2h`：`fetch(ids)` / `get(fixtureId)` / `subscribe(fn)` / `enabled`。
- 楽観的更新やバッチ送信は不要（読み取り専用）。`get` は `{home_code, away_code, home_wins, draws, away_wins, total}` または `null`。
- `index.html` に `<script src=".../h2h-core.js?v=N">` を追加（jsx 同様 `?v=` バンプ）。

### `CheerBar` の変更
- 購読対象を `window.WC.cheer` → `window.WC.h2h` に置換（fetch/subscribe 同形）。
- 「比率バー＋カウント行」を **W-D-L バー**に差し替え:
  - データ `h = window.WC.h2h.get(fixtureId)`。
  - 向き判定: `h.home_code === a.code` なら a=home 視点、そうでなければ反転して a 視点に揃える。
    こうして「左(a) 勝 / 分 / 右(b) 勝」を a/b 基準で表示する。
  - バー: 3 セグメント（a 勝＝ピンク / 分＝グレー / b 勝＝ブルー）を `total` 比で分割。`total===0` は描画しない。
  - 数値行: 左 `{a.code} ◯勝 △分 ✕敗 {b.code}` 右。小見出し「通算対戦成績」。
- 応援ボタン（`onCheer`）・演出（`celebrate`）・`userSide`（シェア推し＆ボタン強調）は維持。
  - `onCheer` から `window.WC.cheer.tap(...)` を**除去**（D1 書き込み停止、演出のみ）。
- シェアボタンは維持。シェア画像はカウント表示を外す（後述）。

### シェア（`public/cheer-share.js` / `share-model`）
- `share` 呼び出しから `counts` を渡さない。シェア画像のレイアウトからカウント数値を除去し、「推しチーム＋ラウンド」中心の構図に調整。
- 既存テスト（`share-model.test.js`）はカウント非表示に合わせて最小修正。

## エラー処理 / エッジケース

| ケース | 挙動 |
| --- | --- |
| `H2H_ENABLED` OFF（`enabled:false`） | バー領域を出さない。応援ボタン＋演出＋シェアは出す。 |
| fixture に H2H 行なし / `total===0` | バーの代わりに小さく「初対戦（過去対戦データなし）」を表示。ボタンは維持。 |
| `fixtureId` 未解決（live 未マッチ） | 既存どおり該当領域は静かに非表示。ボタン部はカード側の試合前分岐に従う。 |
| Cron 取得失敗 / テーブル未作成 | 空配信で graceful degradation（cheer と同じ隔離思想）。 |

## テスト

- `functions/_lib/sm-h2h.test.js`: SportMonks H2H payload → home 視点 W-D-L 集計の純関数テスト（home 勝/分/敗、引き分け、PK・異常データのスキップ、空配列）。
- `functions/api/h2h.test.js`: `cheer.test.js` 準拠。`enabled:false`（フラグ OFF）/ 空 / 正常 / 不正 `fixtures` パラメータ。
- worker 側 H2H 同期関数（対象抽出 → 集計 → upsert）の単体テスト（`sm-sync` 系のテストパターンに合わせる）。
- 既存 `cheer.test.js` 等はバックエンド温存のため基本そのまま。フロントのカウント書き込み停止に伴う `share-model.test.js` のみ調整。

## デプロイ / 運用

1. D1 マイグレーション `schema/00NN_sm_h2h.sql` を追加。`npx wrangler d1 execute wcup2026-db --remote --file=...` で本番へ作成（cheer と同じ運用）。
2. `worker-watch` に `H2H_ENABLED="true"` を設定し再デプロイ（Cron 有効化）。
3. Pages 側 `wrangler.toml` に `H2H_ENABLED="true"`、`index.html` の `?v=` バンプ。
4. PR → preview 確認 → main マージで本番（[[wcup-deploy-flow]] 準拠）。
5. 大会後は `H2H_ENABLED` を OFF にして Cron 負荷を落とす。

## リスク / 未確定

- **SportMonks H2H のレスポンス形と代表戦カバレッジ**は実装前に probe で確定する（`scripts/` に使い捨て probe を置く）。カバレッジが薄い場合でも「初対戦」表示で graceful に倒れるため、機能としては成立する。
- 代表チームの `sm_team_id ↔ app_code` 解決漏れがあると向き判定不能 → その fixture はスキップ（バー非表示）。マッピングは既存 `sm_teams` に依存。
