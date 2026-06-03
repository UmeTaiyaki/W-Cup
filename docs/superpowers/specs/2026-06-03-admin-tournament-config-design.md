# 管理画面（大会設定の共有）設計ドキュメント

- 日付: 2026-06-03
- 対象: W杯2026 予想アプリ（Cloudflare Pages `wcup2026-yosou`）
- フェーズ: Phase 2 の第一歩（大会設定の共有バックエンド＋管理画面）

## 1. 目的とスコープ

仲間内の管理者が、別ページの**管理画面**から「出場国・トーナメント組み合わせ・正解（勝敗）・得点王候補・試合日程」を設定し、その内容を**全参加者の予想アプリに反映**できるようにする。

現状の課題: アプリは100%静的フロント＋`localStorage`で、共有バックエンドが無い。正解データ（`RESULT`）も出場国（`TEAMS`）も `data.js` にハードコードされており、変更にはコード修正＋再デプロイが必要。

### スコープ内
- Cloudflare KV に「大会設定JSON 1ドキュメント」を保存する共有バックエンド。
- 公開GET / 認証付きPUT の API（Cloudflare Pages Functions）。
- パスワード保護された管理画面 `/admin`。
- 予想アプリ本体が起動時に設定を取得し、ハードコード値を上書き（取得失敗時はデフォルトで動作）。

### スコープ外（将来フェーズ）
- **全選手名簿＋プルダウン選択**（得点王をロースターから選ぶ）。今は得点王「候補名リスト」のみ。スキーマは将来拡張しやすい形にしておく。
- **予想データの全員共有／本物のランキング**（D1導入時に対応）。今は予想は端末ローカルのまま。
- 試合日程の予想アプリ本体への表示（今は管理画面で入力＋設定として保存するのみ。参考データ）。
- 配点（`SCORING`）の管理画面編集。当面コード側固定。

## 2. アーキテクチャ

```
public/
  index.html        … 予想アプリ（既存）。起動時に /api/config を取得して上書き
  data.js           … 既存ハードコード値を「デフォルト/フォールバック」に格下げ＋fetchConfig追加
  admin/index.html  … 【新規】管理画面 /admin（パスワードゲート）
  admin/admin.jsx   … 【新規】管理UI（React+Babel CDN、既存と同一スタック）
functions/
  api/config.js     … 【新規】onRequestGet=設定取得(公開) / onRequestPut=保存(要認証)
  api/auth.js       … 【新規】onRequestPost=パスワード照合（管理ログイン用）
wrangler.toml       … 【新規】pages_build_output_dir + KVバインド
```

- ホスティング: 既存の Cloudflare Pages プロジェクト `wcup2026-yosou` をそのまま使用。Pages Functions（`functions/`）とKVバインドを追加。
- ストレージ: **Cloudflare KV**。単一ドキュメント用途のため KV が最適。D1 は予想共有フェーズで導入。

## 3. データモデル（KV: key = `config:v1`）

```jsonc
{
  "version": 1,
  "updatedAt": "2026-06-03T00:00:00.000Z",
  "teams":   [{ "code": "BRA", "ja": "ブラジル", "flag": "🇧🇷", "c": "#FBE14B" }],
  "r16Teams": ["BRA","MAR","POR","USA","ARG","JPN","NED","MEX",
               "FRA","URU","ESP","CRO","ENG","BEL","GER","COL"],
  "scorerSuggest": ["ムバッペ","ハーランド","メッシ"],
  "result": {
    "champion": "ARG", "runnerUp": "FRA", "topScorer": "ムバッペ",
    "bracket": { "r16": ["BRA","POR","ARG","NED","FRA","ESP","ENG","GER"],
                 "qf": ["BRA","ARG","FRA","ENG"], "sf": ["ARG","FRA"], "final": ["ARG"] }
  },
  "schedule": [
    { "date": "2026-06-11", "round": "GL", "a": "MEX", "b": "TBD", "note": "開幕戦" }
  ]
}
```

- `r16Teams` は16コード（8試合ぶん、左→右・上から）。`R16_TEAMS` と同形式。
- `result` は既存 `RESULT` と同形式（採点ロジックがそのまま使える）。
- `scorerSuggest` が現状の「出場選手（=得点王候補）」。将来は `players`/`rosters` を追加してプルダウン化。
- `schedule` は参考データ（`round`: GL=グループリーグ / R16 / QF / SF / F など）。

### デフォルト設定
`data.js` の現行ハードコード値（TEAMS / R16_TEAMS / SCORER_SUGGEST / RESULT）を「デフォルト設定」として保持。KVが空のときのGETフォールバック、および管理画面の初期表示・初回保存のシードに使う。

## 4. API（Cloudflare Pages Functions）

### `GET /api/config`（公開）
- KV `config:v1` を読む。存在すればそれを返す。無ければデフォルト設定を返す（アプリは常に完全な設定を受け取れる）。
- レスポンス: `200 { ...config }`。`Cache-Control: no-store`（最新を返す）。

### `PUT /api/config`（要認証）
- `Authorization: Bearer <password>` を `env.ADMIN_PASSWORD` と照合。不一致は `401`。
- ボディJSONを検証（後述）。不正なら `400 { error }`。
- `updatedAt` をサーバーで付与し KV に保存。`200 { ok: true, updatedAt }`。

### `POST /api/auth`（ログイン照合）
- ボディ `{ password }` を `env.ADMIN_PASSWORD` と照合。`200 { ok: true }` / `401 { ok: false }`。
- 管理画面がエディタ表示前にパスワードを確認するため。

### 入力検証（PUT）
- `teams`: 配列。各要素 `code`(必須・英字)/`ja`(必須)/`flag`/`c`。`code` 重複不可。
- `r16Teams`: 文字列配列・長さ16・各コードは `teams` に存在。
- `result.champion`/`runnerUp`: `teams` のコード or null。`topScorer`: 文字列。
- `result.bracket.{r16,qf,sf,final}`: コード配列（`teams` 内）。
- `scorerSuggest`: 文字列配列。`schedule`: オブジェクト配列（緩めに許容）。
- 検証失敗時は具体的な `error` メッセージを返す。

## 5. 認証・セキュリティ

- 管理パスワードは Cloudflare の Secret（`ADMIN_PASSWORD`）に保存。クライアントへ送出しない。
- 書き込みは必ずサーバー側で検証（クライアントゲートだけに依存しない）。
- 管理画面はログイン後、パスワードを `sessionStorage` に保持し PUT 時にヘッダ送信（タブを閉じれば消える）。
- 照合は固定文字列比較（タイミング攻撃は仲間内アプリのため許容。必要なら定数時間比較に変更可）。
- レート制限は当面なし（必要なら Cloudflare 側 WAF で追加）。

## 6. 予想アプリ本体の変更（`data.js` / `index.html`）

- `data.js`: 現行ハードコードを `DEFAULTS` として保持。`window.WC` に以下を追加。
  - `window.WC.fetchConfig()`: `GET /api/config` を取得し、成功時に `TEAMS/TEAM/R16_TEAMS/RESULT/SCORER_SUGGEST/SCHEDULE` を上書き。失敗時はデフォルト維持。
  - 既存の `load/save/scoreMember` 等はそのまま（採点は上書き後の `RESULT` を参照）。
- `index.html` の `App`: マウント時に `fetchConfig()` を呼び、完了したら再レンダー（`useEffect`＋state）。取得前はデフォルトで描画されるため初期表示は壊れない。
- 予想（members/preds）は引き続き `localStorage`。
- エッジケース: 管理者が予想済みチームを削除しても採点が一致しなくなるだけで破綻はしない。

## 7. 管理画面 `/admin`（`public/admin/`）

- 構成: 既存と同じ React + Babel(standalone) CDN。`public/admin/index.html` → `/admin` でアクセス。
- フロー: パスワード入力 → `POST /api/auth` 成功 → `GET /api/config` で現在値ロード → 編集 → 保存（PUT）。
- セクション:
  1. **出場国**: 行リスト。追加/削除、`code`/`ja`/`flag`/`c`(カラー) 編集。
  2. **R16 組み合わせ**: 8試合×2スロット。`teams` から選択（select）。
  3. **正解（勝敗）**: 優勝・準優勝（select）、得点王（テキスト、候補サジェスト）、各ラウンド勝ち上がり（組み合わせ由来の候補からチェック選択）。
  4. **得点王候補**: チップ追加/削除（将来の選手名簿の足場）。
  5. **日程**: 行リスト。`date`/`round`/`a`/`b`/`note` 追加・削除。
  6. **保存**: PUT 実行、成功/失敗トースト表示。未保存変更の離脱警告。
- スタイル: 既存ダークテーマのトークンを流用。管理ツールとして実用本位。

## 8. 設定・デプロイ手順

1. KV 名前空間作成（例 `wcup2026_config`）。
2. `wrangler.toml` に `pages_build_output_dir = "public"` と `[[kv_namespaces]]`（binding 例 `CONFIG`）を記述。
3. Secret 設定: `wrangler pages secret put ADMIN_PASSWORD`（または Cloudflare ダッシュボード）。
4. `wrangler pages deploy public`（`functions/` は自動でデプロイ対象）。

## 9. テスト方針

- ローカル: `wrangler pages dev public`（Functions＋ローカルKV、`--binding ADMIN_PASSWORD=...`）。
  - `GET /api/config` がデフォルト→保存後は保存値を返す。
  - `PUT` がパスワード不一致で401、不正ボディで400、正常で200＋KV反映。
  - `POST /api/auth` の成否。
- 結合: 管理画面で出場国・正解を変更→保存→予想アプリ再読込で反映・採点が更新されること。
- フォールバック: API停止/オフライン時にデフォルトで予想アプリが動作すること。

## 10. 未決事項 / 将来拡張

- 全選手名簿（`players`/`rosters`）と得点王プルダウン（次フェーズ）。
- 予想データの全員共有・本物のランキング（D1 導入フェーズ）。
- 日程の予想アプリ本体への表示。
- 管理操作の監査ログ・複数管理者・ロール。
