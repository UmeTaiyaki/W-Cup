# 試合詳細タイムライン：PK戦セクション 設計

- 日付: 2026-07-01
- ブランチ: `feat/detail-timeline-pk-shootout`
- 対象: `public/screens-detail.jsx`（`TimelineTab`）＋ 累積スコア算出の純粋関数化とその単体テスト

## 背景 / 目的

ノックアウトの延長でも決着せずPK戦（ペナルティシュートアウト）に入った試合で、試合詳細「タイムライン」タブが PK戦を通常のインプレーイベントと区別せず、同じリストに時系列で混ぜて表示している。区切りも「PK戦」見出しも、蹴るごとの累積スコア（1-0, 1-1, 2-1…）も無く、勝敗の流れが読み取れない。

これを、通常タイムラインの下に独立した「PK戦」セクションとして描画し、蹴った順に成功/失敗と累積スコアを見せる。

## 現状（調査で確定済み・データ層は既に完成）

- **type マッピング**: `functions/_lib/sm-ingest.js` の `EVENT_TYPE_NAMES` で SportMonks `type_id 22 → "pen_shootout_miss"` / `23 → "pen_shootout_goal"`。個別イベントは `sm-ingest.js` の `toEventRows` で `{ type, team_id, player_name, minute, extra_minute, sort_order, sm_event_id, ... }` として供給される。
- **PK戦スコア**: `fx.home.pen_score` / `fx.away.pen_score` は D1（`home_pen`/`away_pen`）から `sm-read.js` 経由で供給済み。非PK戦は null。
- **ヘッダー**: 試合詳細ヘッダーは既に `PK 3 - 2` を表示済み（`screens-detail.jsx:123-126`）。
- **アイコン**: `TimelineTab` の `eventIcon()` は既に `pen_shootout_goal → IcoSoccerBall` / `pen_shootout_miss → IcoMissedPen`（くすんだボール＋赤×）を返す。ただし通常イベントと同じ一本ソートに混ざるだけで、区別・累積スコアが無い。

つまり本タスクはフロント（`TimelineTab`）の描画変更が主で、バックエンド／データ層の改修は不要。

## スコープ外（やらないこと）

- 通常PK（インプレーの `penalty` / `missed_penalty`）の扱いは変更しない。これらは PK戦ではないので従来通り本編タイムラインに残す。
- データ層・ingest・D1・API の変更はしない。
- R16以降のライブ連動やKOスロット解決など他機能への波及はしない。

## 設計

### A. イベントの振り分け

`TimelineTab` 冒頭で `events` を2群に分割する。

- `SHOOTOUT_TYPES = new Set(["pen_shootout_goal", "pen_shootout_miss"])`
- **通常タイムライン群**: `type` が `SHOOTOUT_TYPES` に含まれない全イベント。従来の並び（`minute → extra_minute → sort_order`）でソートし、既存の描画をそのまま使う。
- **PK戦群**: `type` が `SHOOTOUT_TYPES` のイベントだけ。蹴った順にソートする（下記 C）。

### B. PK戦セクションの描画

通常タイムラインの**下**に配置する。

1. 区切り＋見出しチップ: `── PK戦 {home_pen}-{away_pen} ──`。`pen_score` は `fx.home.pen_score` / `fx.away.pen_score` を使う（ホーム–アウェイ視点）。
2. 蹴った順に1行ずつ、既存タイムラインと同じ左右レイアウト・中心線様式で描画:
   - ホーム側の蹴り＝左、アウェイ側＝右（`ev.team_id === homeTeamId` で判定）。
   - アイコン: 成功=`IcoSoccerBall` / 失敗=`IcoMissedPen`（既存 `eventIcon()` を流用可）。
   - 中心チップ: 分表示の代わりに**その行時点の累積スコア**（例 `1-0`, `1-1`, `2-1`）をホーム–アウェイ視点で表示。
   - 選手名: 既存 `playerStyle` を流用。失敗は視覚的に弱める（既存の own_goal/cancelled と同様のトーンダウンを踏襲）。

### C. 蹴った順の決定

SportMonks の PK戦イベントは `sort_order` を持つ。よって PK戦群は `sort_order` 昇順でソートする。`sort_order` が無い/同値の場合の安定化キーとして `sm_event_id` 昇順を第2キーにする。`minute` は PK戦では意味を持たない（延長終了時刻など一定値が入りうる）ため主キーにしない。

### D. 振り分け＋累積スコア算出（純粋関数として切り出し・単一正本・テスト対象）

描画から独立した純粋関数を `public/lib/shootout.js`（新規・ES module）に置く。**これはテストとブラウザの単一正本**であり、二重管理は発生しない。当リポジトリの既存パターン（`public/lib/schedule-view.js` を `functions/_lib/schedule-view.test.js` が `import "../../public/lib/schedule-view.js"` でテストし、ブラウザへは index.html のインライン `<script type="module">` が import して `window.WC` に載せ、`text/babel` の jsx が `window.WC.xxx` で参照する）にそのまま乗る。

```
// events（生の全イベント）と homeTeamId を受け取り、PK戦のみを抽出・蹴った順にソートし、
// 各行に「その時点の累積スコア」を添えて返す。振り分け・ソート・累積を1関数に閉じる。
buildShootoutTimeline(events, homeTeamId) -> [{ ev, running: {home, away} }, ...]
//  - 抽出: ev.type ∈ {"pen_shootout_goal","pen_shootout_miss"}
//  - ソート: sort_order 昇順 → sm_event_id 昇順（minute は主キーにしない）
//  - 累積: 成功(pen_shootout_goal)のみ蹴ったチーム側を+1。running[i]=i本目直後の {home,away}
//  - 純粋・副作用なし。壊れた入力（null/未知 type/欠損 team_id）でもカウントを崩さない。
```

- ブラウザ公開: index.html のインラインモジュールで `import { buildShootoutTimeline } from './lib/shootout.js';` → `Object.assign(window.WC, { buildShootoutTimeline })`。
- 参照: `TimelineTab` は `window.WC.buildShootoutTimeline(events, homeTeamId)` を呼ぶ（既存の `window.WC.xxx` 参照様式に一致）。
- テスト: `functions/_lib/shootout.test.js` が `import "../../public/lib/shootout.js"` で単体テスト（`node --test` 対象、既存 schedule-view と同一手法）。

### E. エッジケース（graceful degradation — 本アプリ必須方針）

- **PK戦なし**（`pen_score` 両方 null かつ PK戦イベント0件）: セクションごと非表示。従来と完全に同一の見た目。
- **集計先行・個別遅延**（`pen_score` はあるが PK戦イベントが0件）: 見出し `── PK戦 3-2 ──` だけ表示し明細は空。最終スコアは必ず見える。
- **イベントはあるが `pen_score` が null**（稀）: 見出しのスコアは明細の最終累積スコアでフォールバック表示、または `pen_score` 欠損時はスコアを出さず見出し `── PK戦 ──` のみ。→ **採用: `pen_score` があればそれを、無ければ明細の最終累積スコアを見出しに使う。**
- 空配列・欠損フィールドで例外を投げない（既存 `TimelineTab` の防御姿勢を踏襲）。

## テスト

- **新規**: `functions/_lib/shootout.test.js` が `../../public/lib/shootout.js` を import し `buildShootoutTimeline` を検証:
  - PK戦以外のイベントは除外される。
  - `sort_order` 昇順で蹴った順に並ぶ（順不同入力を与えて確認）。
  - 全成功（交互）→ 各行の累積 {home,away} が期待通り。
  - 失敗混在（`pen_shootout_miss` ではスコアが増えない）。
  - 空配列／PK戦0件 → 空配列。
  - 未知 type / null team_id / 欠損 sort_order を投げても例外なし・カウント不変。
- **手動/probe**: 実PK戦データは R32 以降でのみ発生。開幕後に実 fixture で描画確認（メモリの probe 運用に従う）。

## リリース

- `public/index.html` の `screens-detail.jsx` 読み込み `?v=N` を必ずバンプ（jsx 変更のため。デプロイ運用メモ準拠）。
- 通常デプロイフロー（main push → 本番 / PR → preview）に従う。

## 影響ファイル

- `public/lib/shootout.js` — 振り分け＋累積スコア算出の純粋関数（単一正本・新規 ES module）。
- `functions/_lib/shootout.test.js` — 上記の単体テスト（新規・`node --test` 対象）。
- `public/screens-detail.jsx` — `TimelineTab` にPK戦振り分け・専用セクション描画を追加（算出は `window.WC.buildShootoutTimeline` を参照）。
- `public/index.html` — インラインモジュールで `shootout.js` を import し `window.WC` へ公開＋`screens-detail.jsx?v=44` へバンプ。
