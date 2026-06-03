# Phase A: グループ（48カ国・12組）対応 設計ドキュメント

- 日付: 2026-06-03
- 対象: W杯2026 予想アプリ（Cloudflare Pages `wcup2026-yosou`）
- 位置づけ: 「グループ順位→勝ち上がり」予想モデルへの移行の第1段階（基盤）
- 前提: `docs/superpowers/specs/2026-06-03-admin-tournament-config-design.md`（KV共有設定＋管理画面）が実装済み。

## 1. 目的とスコープ

2026 W杯の公式形式（48カ国・12グループ A〜L・各4チーム）に出場国データを刷新し、管理画面で「グループ表（所属＋最終順位）」を登録できるようにする。予想アプリには読み取り専用の「グループ」タブ（リーグ表）を追加する。

ユーザーによるグループ順位予想・ベスト32トーナメント予想・新採点は **Phase B**（別スペック）。本フェーズは「グループのデータ・管理・表示」までを、動作する形で完成・デプロイする。

### スコープ内
- 出場国を48カ国・12グループに刷新（2026抽選結果）。
- KV設定スキーマに `groups`（所属）と `groupResult`（最終順位）を後方互換で追加し、サーバー検証を拡張。
- 管理画面をグループ表UIに再構成（A〜Lに4チーム割当＋最終順位1〜4位の入力、チーム属性編集）。
- 予想アプリに「グループ」タブ（12グループのリーグ表）を追加し、既存の「トーナメント」タブを**非表示**にする。
- 既存の優勝・準優勝・得点王予想は維持（選択肢が48カ国に）。

### スコープ外（Phase B 以降）
- ユーザーのグループ順位予想。
- グループ順位を元にしたベスト32トーナメントの自動構築と勝ち上がり予想。
- ベスト3位枠（例「A/B/C/D/F3位」）の割当ロジック。
- 採点式・ランキングの作り直し（本フェーズでは現行式を不変、旧bracket採点は凍結扱い）。
- 試合ごとのスコア入力（順位は admin が直接入力する方式）。

## 2. データモデル（KV `config:v1` を後方互換で拡張）

```jsonc
{
  "version": 1,
  "updatedAt": "...",
  "teams": [ { "code":"MEX","ja":"メキシコ","flag":"🇲🇽","c":"#1E7C45" }, /* 計48件 */ ],
  "groups": {
    "A":["MEX","KOR","RSA","CZE"], "B":["CAN","SUI","QAT","BIH"],
    "C":["BRA","MAR","SCO","HAI"], "D":["USA","AUS","PAR","TUR"],
    "E":["GER","ECU","CIV","CUW"], "F":["NED","JPN","TUN","SWE"],
    "G":["BEL","IRN","EGY","NZL"], "H":["ESP","URU","KSA","CPV"],
    "I":["FRA","SEN","NOR","IRQ"], "J":["ARG","AUT","ALG","JOR"],
    "K":["POR","COL","UZB","COD"], "L":["ENG","CRO","PAN","GHA"]
  },
  "groupResult": { "A":[], "B":[], /* ... */ "L":[] },
  "result": { "champion":null|code, "runnerUp":null|code, "topScorer":"", "bracket":{...} },
  "scorerSuggest": [...],
  "schedule": [...],
  "r16Teams": [...]   // 後方互換で残す。Phase A では未使用（Phase B で再設計）
}
```

- **所属の単一の真実は `groups`**。チームオブジェクトに `group` フィールドは持たせない（重複・不整合回避）。アプリはグループ→チームを `groups` から構築する。
- `groups[X]` は4チーム（X所属コード、`teams` 内）。要素順は抽選順で、順位は意味しない。
- `groupResult[X]` は X の最終順位 `[1位,2位,3位,4位]`（コードは `groups[X]` 内）。未確定なら空配列。
- 既存 `result`/`scorerSuggest`/`schedule`/`r16Teams` はそのまま。

### 出場国（48）と所属（2026抽選）
コードは3文字（FIFAコード準拠）。新規追加: RSA(南アフリカ)/CZE(チェコ)/QAT(カタール)/BIH(ボスニア)/SCO(スコットランド)/HAI(ハイチ)/PAR(パラグアイ)/TUR(トルコ)/CIV(コートジボワール)/CUW(キュラソー)/TUN(チュニジア)/SWE(スウェーデン)/NZL(ニュージーランド)/CPV(カーボベルデ)/IRQ(イラク)/AUT(オーストリア)/ALG(アルジェリア)/JOR(ヨルダン)/UZB(ウズベキスタン)/COD(DRコンゴ)/PAN(パナマ)。現行から除外: ITA/DEN/NGA/SRB/POL。SCO/ENG の旗はサブディビジョン・タグ列（スコットランド `🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}`、イングランド既存値を流用）。
全48の `code/ja/flag/c` の具体値と各グループ所属は実装計画に全量を記載する。

## 3. バックエンド（検証拡張）

`functions/_lib/validate.js` の `validateConfig` を拡張:
- `groups`: 省略可。オブジェクトのとき、キーは `A`〜`L` のみ許容。各値は文字列配列で、各コードは `teams` 内に存在（未登録は400）。正規化で大文字化。欠損キーは空配列で補完しない（与えられたキーのみ保持）。
- `groupResult`: 省略可。各キー（`A`〜`L`）の各コードは、対応する `groups[key]` の所属内であること（所属外は400）。`groups` 未指定キーの `groupResult` はエラー。
- 既存検証（teams/r16Teams/result/scorerSuggest/schedule）は不変。
- 返り値 `value` に `groups`/`groupResult` を含める（既存フィールドと並ぶ）。

`functions/_lib/defaults.js` の `DEFAULT_CONFIG` を48カ国＋`groups`＋空 `groupResult` に更新。`result`/`scorerSuggest` は妥当な範囲で維持（champion 等のコードは48内に存在させる）。`r16Teams` は後方互換のため残置（未使用）。

新規/更新テスト（`validate.test.js`）: groups 妥当で通る / groups に未登録コードで400 / groupResult 所属外で400 / DEFAULT_CONFIG が妥当。

## 4. 予想アプリ（`data.js` / `index.html` / 画面）

- `data.js`: `window.WC` に `GROUPS`（既定 `{}`）と `GROUP_RESULT`（既定 `{}`）を追加。`fetchConfig` 成功時に `cfg.groups`/`cfg.groupResult` を取り込む（オブジェクト判定でガード、失敗時デフォルト維持）。
- `index.html`:
  - タブ定義から `bracket`（トーナメント）を除外し、`group`（グループ）を追加。モバイル: ホーム/予想/グループ/ランキング。デスクトップ: ホーム/予想を入力/グループ/見比べ/ランキング。
  - `renderScreen` に `group` 分岐を追加し `GroupScreen` を描画。`bracket` 分岐は呼ばれなくなる（コンポーネントはコードに残置、Phase Bで刷新）。
  - `showSwitcher`（メンバー切替ヘッダの表示条件）は `summary || input` のみとする。グループ表はメンバー非依存のグローバル表示のため、`group` タブではメンバー切替を出さない（`bracket` は元々 showSwitcher 対象だったが廃止）。
- **新規 `GroupScreen`**（新ファイル `public/screens-group.jsx`）: `window.WC.GROUPS` を A〜L 順に12枚のリーグ表カードで表示。各カードはグループ名と4チーム（旗・国名）。`window.WC.GROUP_RESULT[X]` があれば順位（1〜4）順に並べ、順位バッジ（1位/2位…）を表示。空なら所属順で「—」表示。`wide` で2〜3列グリッド、モバイルは1列。読み取り専用。スタイルは既存テーマトークン（`T`）を流用。

## 5. 管理画面（グループ表UI）

`public/admin/admin.jsx` の出場国セクションをグループ表に再構成:
- **チーム属性編集**は維持（code/ja/flag/c）。フラット一覧は廃し、A〜L のグループ単位で表示。
- 各グループ（A〜L）:
  - **所属**: 4スロット。各スロットは全チームからの `select`（`groups[X][i]` を設定）。
  - **最終順位**: 1位〜4位の4スロット。各 `select` は当該グループ所属（`groups[X]`）のみを候補に `groupResult[X][i]` を設定。未設定可。
- チームプール自体の追加/削除も可能（48を増減できる）。所属未割当のチームも保持。
- 既存の「正解（result）」「得点王候補」「日程」セクションは維持。「R16組み合わせ」セクションは Phase A では非表示（Phase B で再設計）。
- 保存は既存 `PUT /api/config`（`groups`/`groupResult` が追加で乗る）。`afterLogin` の正規化に `groups`/`groupResult` を追加（イミュータブル）。

## 6. データフロー・エラー処理

- 起動: `fetchConfig` → `GROUPS`/`GROUP_RESULT` 反映 → 再描画。失敗時デフォルト（48カ国・抽選グループ）で表示。
- 保存: admin → `PUT`（認証・検証）→ KV。検証失敗は400＋メッセージ表示（既存挙動）。
- 後方互換: 旧 `config:v1`（groups 無し）が KV にある場合、GET はそれを返すが `groups` 欠落 → アプリは `GROUPS={}` で「グループ未設定」を空表示。admin は DEFAULT を初期表示せず GET 値を使うため、初回は admin で保存し直すかデプロイ後に KV を空のままにして GET のデフォルトフォールバックを効かせる（KVが空ならデフォルト48カ国が返る）。※既に旧スキーマで保存済みなら admin から再保存で移行。

## 7. テスト方針

- 単体: `npm test`（`validate` の新フィールド検証、全pass）。
- ローカル結合: `wrangler pages dev` で
  - `GET /api/config` が48カ国＋groups を返す（KV空時のデフォルト）。
  - admin でグループ所属・順位を編集→保存→GET反映。
  - 予想アプリで「グループ」タブにリーグ表が出る／「トーナメント」タブが消えている／優勝等の予想が48カ国で動く。
  - ヘッドレスChromeでトップ・/admin の描画確認。
- 本番: デプロイ後に同等確認。

## 8. ファイル構成（変更/新規）

| ファイル | 変更点 |
|---|---|
| `functions/_lib/defaults.js` | 48カ国＋groups＋空groupResult に更新 |
| `functions/_lib/validate.js` | groups/groupResult 検証・正規化を追加 |
| `functions/_lib/validate.test.js` | 新フィールドのテスト追加 |
| `public/data.js` | `GROUPS`/`GROUP_RESULT` と fetchConfig 取り込み |
| `public/index.html` | タブを bracket→group に差し替え、renderScreen 分岐 |
| `public/screens-group.jsx` | 新規。GroupScreen（リーグ表） |
| `public/admin/admin.jsx` | 出場国→グループ表UI、afterLogin 正規化拡張、R16セクション非表示 |

## 9. 未決事項 / 将来拡張（Phase B）

- ユーザーのグループ順位予想 → ベスト32自動構築 → 勝ち上がり予想。
- ベスト3位枠の割当（公式表 or 手動選択）。
- 採点式の刷新（グループ的中・トーナメント的中の配点）。
- 旧 `BracketScreen`/`r16Teams` の撤去または置換。
