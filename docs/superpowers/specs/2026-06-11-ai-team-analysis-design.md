# チームAI分析タブ 設計

- 日付: 2026-06-11
- ステータス: 設計確定（実装計画前）
- 対象ブランチ（予定）: `feat/ai-team-analysis`
- 関連: `docs/superpowers/specs/2026-06-09-watch-platform-design.md` / `db/schema-watch.sql` / `public/screens-teams.jsx`

## 1. 目的とスコープ

チーム詳細（チームタブ）に **「分析」サブタブ** を追加し、各出場国の **読み物プロフィール** をAIで生成して表示する。

- 性格: **読み物（中立的な紹介）**。「優勝確率◯%」「突破濃厚」のような断定的な勝敗予想はしない。
- 既存の「メンバー / 日程」タブ、予想・部屋・同期などの機能には一切影響を与えない（追加のみ）。

### スコープ外（YAGNI）

- 生成の自動化（Cron 等）。実行は手動。
- ランタイムでのAI呼び出し / オンデマンド生成。
- web検索グラウンディング（外部APIへ移行する場合の将来拡張として記録のみ）。
- 選手個人のAI分析・対戦カード単位のAI分析（今回はチーム単位のみ）。

## 2. 全体アーキテクチャ（完全静的・焼き込み方式）

```
[開発者のマシン]
  scripts/gen-ai-teams.mjs   ← 手動実行（節目ごと）
    ├─ 入力: /api/config（teams/squads/groups/schedule の正本）
    │        ＋ 任意で D1 の sm_* 結果（大会中、--with-live 指定時のみ）
    ├─ プロンプト組立: チームごとに実データを注入
    ├─ AI呼び出し: 48回（第1段は Workers AI REST、無料枠）
    └─ 出力: public/data/ai-teams.json（スキーマ検証後に書き込み）
  → git commit & push → GitHub Actions 自動デプロイ

[ランタイム / ブラウザ]   ※AIもD1も呼ばない
  チーム詳細を開く → /data/ai-teams.json を遅延fetch（初回のみ、以降キャッシュ）
  → 「分析」タブに該当チームのセクションを描画
```

### 設計上の含意

- **本番に秘密情報ゼロ**: AI APIキー／アカウントトークンはスクリプト実行時のローカル環境変数（`.dev.vars` 相当）にのみ置く。本番には配置しない。
- **ランタイム障害点ゼロ**: 配信するのは静的JSON 1枚のみ。AIバインディング不要。
- **「ライブ反映」の意味**: 大会の進行は **スクリプトを再実行して焼き直し → commit → デプロイ** で反映する。開幕直後の初回は `--with-live` なし＝プロフィールのみ。

## 3. AIサービス方針（段階的）

1. **第1段（無料枠で試作）**: Cloudflare **Workers AI REST API**（`@cf/meta/llama-3.3-70b-instruct` 等）。無料枠 = 10,000 Neurons/日。48チームの一括生成は1日分の無料枠で収まらない場合があり、その際は `--only` で分割実行 or 翌日に分ける。
2. **第2段（品質不足なら外部API）**: スクリプト内のAI呼び出しを **薄いアダプタ**（`callModel(prompt) -> text`）として抽象化し、Claude / GPT / Gemini へ差し替え可能にする。外部APIに移ればweb検索グラウンディングも選択肢になる（将来拡張）。

判断基準: 第1段の出力を実機で確認し、日本語の自然さ・事実の正確さ（特に注目選手の評）が読み物として十分かで決める。

## 4. 「分析」タブのコンテンツ構成

`DetailTabs` に3つ目 `{ id: "analysis", label: "分析" }` を追加。本文は構造化JSON（§5）を、モバイル可読なセクションカードとして描画する。

| セクション | id | 根拠データ | 内容 |
|---|---|---|---|
| ひとこと | （summary） | AI知識 | 2〜3文。このチームは何者か |
| チームの横顔 | `profile` | AI知識 | 歴史・W杯実績・国内での位置づけ |
| プレースタイル | `style` | AI知識 | フォーメーション傾向・攻守の特徴 |
| 注目選手 | `players` | **実名簿(SQUADS)で固定** ＋ AIの評 | 名簿から2〜3名を選び、なぜ注目か |
| 今大会の構図 | `context` | GROUPS/SCHEDULE固定 ＋ AIの読み | 所属グループ・対戦相手 ＋「鍵となるのは〜」（断定予想なし） |
| ここまでの歩み | `journey` | D1 `sm_*` | 結果があれば要約。**無ければセクション自体を省略** |

- 名簿の各選手は `{ pos, name, club }`（主力フラグなし）。クラブ名は選手同定の手掛かりとしてプロンプトに含める。
- **注目選手のハルシネーション防止**: プロンプトで「名簿に実在する `name` のみ挙げよ」と縛り、生成後に **名簿に存在しない選手名を含む場合は検証で弾く / 再試行**する。
- 最下部に **AI生成の注記**（情報が古い場合あり・特に監督名）と **生成日時「◯月◯日時点」** を表示。

## 5. 出力JSONスキーマ（`public/data/ai-teams.json`）

```json
{
  "generatedAt": "2026-06-11T09:00:00Z",
  "model": "@cf/meta/llama-3.3-70b-instruct",
  "teams": {
    "JPN": {
      "summary": "string",
      "sections": [
        { "id": "profile", "heading": "チームの横顔",   "body": "string" },
        { "id": "style",   "heading": "プレースタイル", "body": "string" },
        { "id": "players", "heading": "注目選手",       "body": "string", "picks": ["S. GIMENEZ", "RAÚL"] },
        { "id": "context", "heading": "今大会の構図",   "body": "string" }
      ]
    }
  }
}
```

- `teams` のキーはアプリのチームコード（`JPN` 等）。
- `sections[].body` は短い段落テキスト（軽量レンダラで描画。外部Markdownライブラリは導入しない）。
- `players` セクションのみ `picks`（採用選手名の配列）を持つ。各要素は **そのチーム名簿の `name` と完全一致**。フロントはチップ表示にも使える。
- `journey` セクションは大会中のみ存在しうる（任意）。

### スキーマ検証ルール

- トップレベルに `generatedAt`(ISO文字列) / `model`(文字列) / `teams`(オブジェクト) が存在。
- 各チームに `summary`(非空文字列) と `sections`(配列) が存在。
- 各 section に `id` / `heading` / `body`(非空) が存在。
- `players` セクションの `picks[]` は各要素がそのチーム名簿の `name` と完全一致すること（名簿外を1件でも検出したら不合格）。

## 6. 生成スクリプト（`scripts/gen-ai-teams.mjs`）

既存 `scripts/*.mjs`（`fetch-third-allocation.mjs` 等）の流儀に合わせる。

- **入力取得**: `--base <url>` で `/api/config` を fetch（既定はローカル開発URL）。teams/squads/groups/schedule を取得。
- **プロンプト組立**: 純ロジックを別モジュールに切り出してテスト可能にする（`scripts/lib/ai-team-prompt.mjs` もしくは `functions/_lib` 下）。チームの **日本語名・所属グループ・対戦相手・実名簿（pos/name/club）** を注入。
- **AI呼び出し**: `callModel(prompt) -> text` アダプタ経由。第1段は Workers AI REST（`CF_ACCOUNT_ID` / `CF_AI_TOKEN` を環境変数から）。
- **堅牢性**:
  - チームごとに try/catch ＋ 軽いリトライ（最大2回）。
  - **部分マージ**: 既存 `ai-teams.json` を読み、成功したチームのみ上書き。1チーム失敗で全滅しない。
  - 出力は **§5のスキーマ検証を通過してから** 書き込み。
  - `--only JPN,BRA` で個別チームの再生成。
  - `--with-live` 指定時のみ D1 `sm_*` を引いて `journey` を付与（無指定なら省略）。
  - 失敗チームは標準エラーに一覧で残す（黙って欠落させない）。

## 7. フロント実装

- **`public/lib/ai-analysis.js`**（純ロジック・テスト対象）: `ai-teams.json` の fetch・メモリキャッシュ・`getTeamAnalysis(code)`・空判定。`window.WC.AI_ANALYSIS` に保持。
- **`public/screens-teams.jsx`**:
  - `DetailTabs` の `tabs` に `{ id: "analysis", label: "分析" }` を追加。
  - `subtab === "analysis"` の描画ブロックを追加（セクションカード ＋ 生成日時 ＋ AI注記）。
  - 初回表示時に遅延 fetch（タブ初期表示やチーム詳細マウント時）。
- **`public/index.html`**: `screens-teams.jsx?v=2` → **`?v=3` にバンプ**（jsx変更時の鉄則）。

### フロントのエラー処理

- JSON未配置 / fetch失敗 / 該当チーム無し → 「分析はまだありません」を穏当に表示（クラッシュさせない・他タブに影響させない）。
- `journey` セクションが無ければ単に描画しない。

## 8. テスト方針（既存文化に準拠 / 目標80%）

- **プロンプト組立**: チームデータ注入が正しいか（名簿・対戦相手が含まれるか）をユニットテスト。
- **スキーマ検証**: 正常 / 必須欠落 / 名簿外選手 を検出できるかをユニットテスト。
- **フロント純ロジック**（`public/lib/ai-analysis.js`）: fetch（モック）・キャッシュ・空判定・該当チーム取得をユニットテスト。
- AI呼び出し自体（`callModel`）はモックし、ネットワーク・課金を伴うテストはしない。

## 9. リスクと対策

| リスク | 対策 |
|---|---|
| AIの知識が古い（監督名・最新フォーム） | 事実部分は実データ注入で固定。AIには知識依存部分を限定。注記で明示 |
| 注目選手のハルシネーション | 名簿内の名前のみ許可＋検証で弾く |
| 無料枠（10,000 Neurons/日）超過 | `--only` で分割実行 or 翌日 |
| 日本語長文の品質不足 | 第2段で外部APIへ差し替え（アダプタ化済み） |
| JSONが肥大化 | 48チーム×短文なら数十〜100KB程度。遅延fetchで初期表示に影響させない |

## 10. 段取り（実装計画で詳細化）

1. 出力JSONスキーマ ＋ 検証ロジック（テスト先行）
2. プロンプト組立ロジック（テスト先行）
3. `scripts/gen-ai-teams.mjs`（callModel アダプタ＝Workers AI REST、部分マージ、`--only`/`--with-live`）
4. 初回生成（プロフィールのみ）→ `public/data/ai-teams.json` をコミット
5. `public/lib/ai-analysis.js`（fetch/キャッシュ/空判定＋テスト）
6. `public/screens-teams.jsx` に「分析」タブ追加 ＋ `index.html` の `?v` バンプ
7. 実機確認 → 品質判定（無料枠で十分か / 外部API移行か）
