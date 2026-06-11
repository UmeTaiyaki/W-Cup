# 得点王エイリアス解決層 — 設計

> ステータス: 設計確定（2026-06-11・ユーザー承認）。canonical=ハイブリッドC（正規化文字列＋任意のsmPlayerId枠）。
> 対象: 得点王の採点照合（`scoreMember`）のみ。予想/部屋/他部門は不変。

## 1. 目的 / スコープ

SportMonks 表記（例: `Mbappé`）を名簿・正解側に採用したい一方で、既存ユーザー予想（`"MBAPPE (FRA)"` 形式で保存済み）を1バイトも壊さずに採点一致を保つ。

動機は **両方**:
- ① 名簿（SQUADS）の選手名を SportMonks 正式表記に直したい（表示目的）→ 名簿リネームで旧予想と新正解がズレる問題を吸収する。
- ② 得点王の正解を SportMonks API から自動取り込みしたい（watch-platform 連携）→ API が返す表記が名簿選択値と一致しない問題を吸収する。

**非破壊が最優先**: migration（既存予想の書き換え）は採らない。エイリアスは比較時だけ効く参照テーブルとし、予想・正解の保存データには触れない。

### スコープ範囲
- 含む: 正規化関数・`resolve` 解決層・`scoreMember` への組み込み・エイリアス表（config blob）・スキーマ検証・管理画面の手動編集/手動突合UI。
- 含まない（YAGNI）: SportMonks からの正解自動取り込み配線（Cron/API 呼び出し）そのもの。本設計は「エイリアスにレコードを足す関数」までを用意し、呼び出し側は watch-platform 側の別タスクで後付けする。
- 触らない: 予想タブ・部屋・優勝/準優勝/グループ順位/ノックアウトの採点。得点王以外は元々 `(CODE)` 結合または安全な照合なので対象外。

## 2. 現状の事実（コード根拠）

- 採点はクライアント実行。`public/index.html:94`:
  `window.WC.scoreMember = (pred) => scoreMember(pred, window.WC.RESULT, SCORING)`
  呼び出しは `app-shell.jsx:329` / `screens-rank.jsx:206` が `window.WC.scoreMember(pred)`。
- 現状の照合は生文字列の完全一致（`public/lib/scoring.js:16-19`）:
  `pred.topScorer.trim() === result.topScorer.trim()`
- 得点王の予想も正解も**同じ名簿 SQUADS から選ぶドロップダウン**で入力。保存値は `scorerValue = ${name} (${code})`（`public/ui.jsx:899`）。自由入力ではない。
  → ズレは「名簿の選手名を後から書き換えたとき」か「SportMonks API 由来の別表記が来たとき」に限られる。`(CODE)` 部分は安定で、ズレるのは名前部分のみ。
- squad の選手スキーマは `{ name, pos, club }` で **player_id を持たない**（`functions/_lib/validate.js:207`）。
  → canonical を player_id に一本化するには全選手 id 紐付けという別コストが先に必要。よってハイブリッドCを採用。

## 3. 解決層とデータモデル（コア）

### 3.1 normalize(s) — public/lib/scoring.js（純関数）
- 大文字化 + アクセント除去（`String.prototype.normalize("NFD")` → 結合文字 `̀-ͯ` 削除）+ 連続空白を1つに畳む + trim。
- 例: `"Mbappé (FRA)"` → `"MBAPPE (FRA)"`、`"MBAPPE (FRA)"` → `"MBAPPE (FRA)"`。
- **この正規化だけで大文字/アクセント/空白差はエイリアス表なしで一致する。** `(FRA)` を保持するため同名別人の誤一致も起きにくい。

### 3.2 resolve(input, aliasMap) — public/lib/scoring.js（純関数）
1. `norm = normalize(input)`
2. `aliasMap[norm]` があれば canonical を返す。
3. なければ `norm` 自身を返す（＝フォールバックは従来の完全一致相当）。

### 3.3 scoreMember の変更（public/lib/scoring.js）
- シグネチャに第4引数を追加: `scoreMember(pred = {}, result = {}, scoring = SCORING, aliasMap = {})`。
- 得点王の照合を差し替え:
  ```js
  const topScorer =
    pred.topScorer && result.topScorer &&
    resolve(pred.topScorer, aliasMap) === resolve(result.topScorer, aliasMap)
      ? scoring.topScorer : 0;
  ```
- `aliasMap` 省略時 `{}` → 全入力が `normalize` フォールバックになり、大文字/アクセント差以外は従来挙動と同一。

### 3.4 エイリアス表スキーマ（config blob に追加）
```js
aliases: [
  {
    canonical: "BRA::VINICIUS JUNIOR",          // CODE::正規化名
    variants: ["VINI JR. (BRA)", "Vinícius Júnior", "Vinicius"],
    smPlayerId: 12345                            // 任意。今は格納のみ・採点未使用（ハイブリッドCの将来枠）
  }
]
```
- ランタイムは起動時に `aliases` から `aliasMap`（`normalize(variant) → canonical`）を構築。canonical 自身も `normalize` した上でキー化し、自分自身→自分自身を確実にカバーする。
- **正解 `result.topScorer` は従来どおり名簿値 `"NAME (CODE)"` のまま保存。** エイリアスは比較時だけ効くので既存予想・既存正解ともに無変更。

### 3.5 配信経路
- `functions/_lib/validate.js`: `aliases` フィールドのスキーマ検証を追加（配列・各レコードの型: `canonical` 非空文字列、`variants` 文字列配列、`smPlayerId` は数値または省略）。未指定時は `aliases: []`。
- `functions/api/config.js` / `public/data.js`: `RESULT` と同様に config から生のエイリアス配列を `window.WC.ALIASES` に格納し、`public/data.js` が `normalize(variant) → canonical` の `window.WC.ALIAS_MAP` を構築する（aliasMap 構築は data.js の責務に一本化）。
- `public/index.html`: ラッパで aliasMap を構築し第4引数として渡す:
  `window.WC.scoreMember = (pred) => scoreMember(pred, window.WC.RESULT, SCORING, window.WC.ALIAS_MAP)`

## 4. 管理画面とSportMonks自動突合

### 4.1 エイリアス編集UI（public/admin/admin.jsx 新セクション「得点王エイリアス」）
- レコードの一覧・追加・編集・削除。
- 1レコード = canonical（名簿から選手を選ぶ → `CODE::正規化名` を自動生成）＋ variants（自由入力で複数）＋ smPlayerId（任意）。
- 既存の `result.topScorer（旧データ）`表示（`admin.jsx:428`）と整合: 旧表記が来たら「エイリアスに登録」ボタンで即追加できる導線を付ける。

### 4.2 SportMonks自動突合フロー（driver ②・関数のみ用意）
正解取り込み時に SportMonks 得点王（name + player_id）を受けて:
1. `normalize(smName)` を aliasMap / 名簿正規化名と照合。
2. **一致 → 自動でエイリアス投入**（variant に smName を追加、smPlayerId を記録）。`result.topScorer` は対応する名簿値をセット。
3. **不一致 → 管理画面で手動紐付け**（運営が名簿選手を選ぶ → その variant + id がエイリアスに記録される）＝「最終チェック・修正専用UI」。

本設計では「エイリアスにレコードを足す純関数 + 一致判定関数」までを実装し、Cron/API 呼び出し配線は watch-platform 側の別タスクとする。

## 5. テストと影響範囲

### 5.1 変更ファイル
| ファイル | 変更 |
|---|---|
| `public/lib/scoring.js` | `normalize` / `resolve` 追加、`scoreMember` に第4引数 `aliasMap`、得点王照合差し替え |
| `public/index.html` | aliasMap 構築 + ラッパで第4引数を渡す（`?v=N` バンプ確認） |
| `public/data.js` | config から `window.WC.ALIASES` / `ALIAS_MAP` 設定 |
| `functions/_lib/validate.js` | `aliases` スキーマ検証追加（未指定時 `[]`） |
| `functions/api/config.js` | レスポンスに `aliases` 含める（既存 result 等と同様） |
| `public/admin/admin.jsx` | エイリアス編集セクション + 手動突合導線 |

### 5.2 テスト（functions/_lib/scoring.test.js 拡張）
- `normalize`: 大文字 / アクセント / 連続空白の正規化。
- `resolve`: variant→canonical、未登録は normalize フォールバック。
- `scoreMember`:
  - ① アクセント差のみ（エイリアス無しで一致）。
  - ② variant 経由一致（`"VINI JR. (BRA)"` 予想 × `"VINICIUS JUNIOR (BRA)"` 正解）。
  - ③ 別人は不一致。
  - ④ aliasMap 省略時＝従来挙動（既存テスト不変）。
- `validate`（`functions/_lib/validate.test.js`）: aliases 正常系 / 異常系（非配列・型不正・未指定→`[]`）。

### 5.3 非破壊の保証
- KV 既存予想: 無変更。既存正解: 保存形式（`"NAME (CODE)"`）そのまま。
- aliasMap 省略 or 空 + 表記差なし → 完全一致にフォールバック＝現行と同一挙動。
- 得点王以外の採点ロジックは一切変更しない。

## 6. デプロイ留意点
- jsx を変更する場合 `public/index.html` の `?v=N` バンプ必須（プロジェクト運用ルール）。
- テスト KV 分離 + GitHub Actions 自動デプロイのフローに従う（main push→本番 / PR→preview）。
