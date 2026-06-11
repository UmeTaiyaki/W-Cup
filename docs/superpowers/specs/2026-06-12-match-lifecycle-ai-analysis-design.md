# 試合ライフサイクル連動 AI分析 設計

- 日付: 2026-06-12
- ブランチ: `feat/match-ai-analysis`
- 関連: チームAI分析（`scripts/gen-ai-teams.mjs` / `public/data/ai-teams.json`）、観戦プラットフォーム（`worker-watch` / `sm_*` / `/api/fixture`）、xG分析画面（`screens-detail.jsx`）

## 目的

試合の進行イベント（スタメン発表 / ハーフタイム / フルタイム）に追従して、AIによる短い分析を自動生成し、試合詳細画面の新設「AI」タブに表示する。

既存のチームAI分析は **オフライン手動バッチ**（焼き込み）だが、本機能は **試合ライフサイクルのイベント駆動** で、常駐 Cron Worker（`worker-watch`）から自動生成する点が決定的に異なる。

### スコープ外（YAGNI）

- 管理画面からの手動生成/承認フロー（完全自動で進める）
- SportMonks 未取り込み include（予想勝率 / pressure index / 天候 / H2H / 主審）の追加取り込み
- 外部API / MCP の追加連携
- セクション構造の長文レポート（数行サマリーに限定）

## 用語・前提

- **フェーズ**: `lineup`（スタメン発表時）/ `ht`（ハーフタイム）/ `ft`（フルタイム）の3種。
- **state_id**（`sm_fixtures`）: `1`=未開始(NS) / `3`=ハーフタイム(HT) / `2,6,9`=その他インプレー / `5,7,8`=終了(FT)。（`functions/_lib/sm-read.js` の `statusFromState` 準拠。HT は `3` を個別判定する。）
- `worker-watch` は毎分 `syncLive` ＋ ±36h 窓の fixture に `syncFixtureDetail`（lineups / xGFixture / statistics / events を取り込み）を実行済み。本機能はその直後にフックする。

## 決定事項（ブレスト合意）

1. **トリガー**: 完全自動（Cron検知）。スタメンは約1h前に発表されるため、検知点は「両チームのスタメン11人が揃った瞬間」とする。
2. **AI基盤**: Gemini Developer API（`gemini-2.5-pro` ＋ `google_search` グラウンディング）を `GEMINI_API_KEY` で利用。チームAIと**同一モデル・同一グラウンディング**を、常駐Workerに無理のないAPIキー認証で実現する（本物のVertex OAuthは採らない）。
3. **分析の深さ**: 簡潔サマリー（数行）。
4. **UI**: 試合詳細に専用「AI」タブを新設。
5. **データ二層**: 数値（スコア・xG・統計）は `sm_*` の確定値を**正**とし、Google検索グラウンディングは**文脈・話題の肉付けのみ**に制約する。新規外部ソースは足さない。

## アーキテクチャ

```
worker-watch (毎分 scheduled)
  └─ 既存: syncLive → syncFixtureDetail(±36h窓)
        └─ 新規: maybeGenerateMatchAi(env, db, now)
              ├─ 検知: selectFixturesForAi(rows, existing) → [{fixture_id, phase}]
              ├─ 1tick上限3件
              └─ 各件: getFixtureDetail → buildMatchPrompt(phase, detail)
                       → callGeminiText(GEMINI_API_KEY) → upsert sm_match_ai

/api/fixture?id= (Pages Functions)
  └─ getFixtureDetail(db, id) に ai: [...] を同梱（sm_match_ai 読み込み）

public/screens-detail.jsx
  └─ タブに { id:"ai", label:"AI" } 追加 → AiTab が detail.ai を時系列描画
```

## コンポーネント

### 1. データ保存: D1 テーブル `sm_match_ai`

`db/schema-watch.sql` に既存 `sm_*` 規約で追加。フェーズごと1行・冪等。

```sql
CREATE TABLE IF NOT EXISTS sm_match_ai (
  sm_fixture_id INTEGER NOT NULL,
  phase         TEXT    NOT NULL,        -- 'lineup' | 'ht' | 'ft'
  summary       TEXT,                    -- 成功まで NULL（数行サマリー本文）
  model         TEXT,                    -- 'gemini-2.5-pro'
  attempts      INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER,                 -- epoch秒
  PRIMARY KEY (sm_fixture_id, phase)
);
CREATE INDEX IF NOT EXISTS idx_sm_match_ai_fixture ON sm_match_ai (sm_fixture_id);
```

- `summary IS NULL` ＝ 未生成。
- `attempts` でリトライ上限管理（失敗時も upsert してカウント、3回で打ち切り＝無限課金防止）。
- スキーマ移行は別 `.sql`（`schema/00NN_sm_match_ai.sql`）として用意し、本番反映手順に従う。

### 2. 検知ロジック: `selectFixturesForAi`（純関数, `functions/_lib/`）

毎分の詳細同期の直後、±36h 窓の fixture 行と「既存 `sm_match_ai`（fixture, phase, summary, attempts）」を入力に、生成すべき `{fixture_id, phase}` を返す純関数。

発火条件（フェーズ別）:

| phase | 条件 |
|---|---|
| `lineup` | `state_id == 1`（未開始）かつ 両チームの先発（`sm_lineups.is_start=1`）が **各11名＝計22名揃っている** かつ 未生成可能 |
| `ht` | `state_id == 3`（ハーフタイム）かつ 未生成可能 |
| `ft` | `state_id ∈ {5,7,8}`（終了）かつ 未生成可能 |

「未生成可能」＝ 当該 (fixture, phase) 行が無い、または `summary IS NULL AND attempts < 3`。

- 冪等＆自己リトライ（未生成なら翌分に再挑戦）。
- **1tick あたり生成上限 3 件**でバースト抑制（残りは次分）。上限超過分は `log()` で可視化（黙ってドロップしない）。

### 3. 生成モジュール: `functions/_lib/ai-match.js`

I/O と純関数を分離（`ai-team-prompt.mjs` / `gen-ai-teams.mjs` のスタイル踏襲）。

- `buildMatchPrompt(phase, detail) -> string`（純関数）
  - 共通の制約文: 「数値（スコア・xG・統計）は与えたデータを正とせよ。Web検索は文脈・話題の補足のみに使い、数値を上書きしないこと。日本語で数行（〜3文）。」
  - **lineup**: 両チーム名・布陣（formation_field）・先発（pos / 名前 / クラブ）→「注目の対決と勝敗の鍵」
  - **ht**: スコア・前半のチーム統計（xG / シュート / 支配率 / 枠内）・主なイベント →「前半の流れ＋後半の見どころ」
  - **ft**: 最終スコア・フル統計・イベント →「勝敗の要因＋MVP」
  - 欠損データ（xG 未充填等）はプロンプト側で畳む＝**graceful degradation**（HT/FT が破綻しない）。
- `callGeminiText({ apiKey, model, prompt }) -> string`
  - main 版 `gen-ai-teams.mjs` の `callGemini` を移植。`generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`、`tools:[{google_search:{}}]`、応答抽出は共通ロジック（`extractGeminiText` 相当）。
- `generateMatchAi({ db, fixtureId, phase, apiKey, model, now })`
  - `getFixtureDetail` → `buildMatchPrompt` → `callGeminiText` → 成功で `summary/model/updated_at` を upsert、失敗で `attempts+1/updated_at` を upsert。

### 4. worker-watch フック

`worker-watch/src/index.js` の `scheduled` 内、詳細同期 try/catch の**外側に独立した try/catch**で `maybeGenerateMatchAi(env, db, now)` を呼ぶ。

- ゲート: `env.AI_MATCH_ENABLED === "true"` かつ `env.GEMINI_API_KEY` がある場合のみ実行。
- AI 失敗は live / detail 同期に**波及しない**（既存の障害隔離方針と同じ）。
- `log` 例: `watch-cron: ai generated lineup=1 ht=0 ft=1 (capped 0)`。

### 5. 配信: `/api/fixture` 拡張

- `getFixtureDetail(db, id)` の戻り値に `ai` を追加:
  ```js
  ai: rows of sm_match_ai WHERE sm_fixture_id=? AND summary IS NOT NULL
      → [{ phase, summary, model, generated_at }]
  ```
- `WATCH_ENABLED` ゲートは既存のまま（OFF時は `detail:null`）。`ai` が空配列でも既存挙動に影響しない。

### 6. UI: 「AI」タブ（`public/screens-detail.jsx`）

- タブ配列に `{ id: "ai", label: "AI" }` を追加（既存 timeline / xg / lineup / stats と並ぶ）。
- `AiTab({ T, detail })`:
  - `detail.ai` を時系列順（`lineup → ht → ft`）に並べ、各フェーズをカード表示（見出し＋数行サマリー＋生成時刻）。見出し例: 「スタメン分析」「ハーフタイム分析」「試合総括」。
  - 1件も無ければプレースホルダ「AI分析は試合の進行に合わせて表示されます」（xG タブの FT 限定メッセージと同じ作法）。
- **FT分析＝結果タブ側の詳細**: 結果タブも同一 `MatchDetailScreen` を再利用するため、終了試合では AI タブに `ft` カードが自然に出る（別配線不要）。実装時に再利用経路を確認する。
- `index.html` の `?v=N` を更新（jsx 変更の本番反映に必須）。

## データフロー（フェーズ別の入力）

| データ（`sm_*`） | lineup | ht | ft |
|---|:--:|:--:|:--:|
| `sm_lineups`（布陣・先発・クラブ・選手別xG） | ✅ | ✅ | ✅ |
| `sm_events`（ゴール/カード/交代） | — | ✅ | ✅ |
| `sm_stats`（xG/シュート/支配率/枠内…） | — | ✅ | ✅ |
| `sm_fixtures`（スコア/ラウンド/状態） | ✅ | ✅ | ✅ |
| Google検索グラウンディング（文脈の肉付けのみ） | ✅ | ✅ | ✅ |

## エラー処理 / 障害隔離

- AI 生成は detail 同期とは別 try/catch。AI 失敗はライブ/詳細同期に波及しない。
- 生成失敗は `attempts+1` を記録し 3 回で打ち切り（無限リトライ＝無限課金を防止）。
- Gemini 応答が空/不正パース時はエラー扱い（`summary` を書かない）。
- フロントは `detail.ai` 欠如/空に耐える（プレースホルダ表示）。

## コスト / フィーチャーゲート

- 書き込みは **D1 のみ**（KV 1,000/日のボトルネックに**不干渉**）。
- Gemini 呼び出しは全大会で約 64 試合 × 3 フェーズ ≒ 190 回程度（1日あたり数件）。`google_search` グラウンディング込みでも総量は僅少。
- secret/vars: `GEMINI_API_KEY`（secret）、`AI_MATCH_ENABLED`（生成の独立トグル）。UI/API は既存 `WATCH_ENABLED` を流用。

## テスト

- `buildMatchPrompt`: フェーズ別の出力、xG 等欠損時の graceful（プロンプトに欠損項目を出さない）。
- `selectFixturesForAi`: state_id（1/3/5/7/8）× lineup 件数（<22 / =22）× 既存行（無 / summary有 / attempts>=3）の組合せ。1tick 上限 3 件の切り出し。
- `getFixtureDetail`: `ai` 同梱（`summary IS NOT NULL` のみ）。
- `AiTab` 描画: 全フェーズ有 / 一部 / 無（プレースホルダ）。
- `callGeminiText`: ネットワークはモック（課金・通信なし）。

## 段階リリース

1. スキーマ移行（`sm_match_ai`）＋ `selectFixturesForAi` / `buildMatchPrompt` / `callGeminiText`（純関数＋ユニットテスト先行）。
2. `generateMatchAi` ＋ worker-watch フック（`AI_MATCH_ENABLED=false` で投入 → 手動トリガで 1 試合検証）。
3. `/api/fixture` の `ai` 同梱 ＋ `AiTab` ＋ タブ追加（`?v=N` 更新）。
4. `AI_MATCH_ENABLED=true` で本番有効化。検証用 fixture で lineup → ht → ft の3カードを確認。
