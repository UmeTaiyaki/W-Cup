# 試合結果のリーグ表表示＋得点ランキング 設計

- 日付: 2026-06-03
- 対象アプリ: W杯2026 仲間内予想アプリ（Cloudflare Pages `wcup2026-yosou`）
- 関連: Phase A（48カ国12グループ・admin・グループタブ）／Phase B（順位予想→ベスト32→採点）実装済みの上に積む

## 目的

管理画面で **グループステージの実際の試合スコア** と **得点者のゴール数** を入力し、アプリ側で
①自動集計したフルリーグ表、②得点ランキング を読み取り専用で表示する。大会進行に合わせて
逐次更新できるようにする。

## スコープ（確定事項）

- グループタブの表示粒度: **フルリーグ表（試合スコアからの自動集計）**。順位/旗/国名/勝点/試合数/勝分敗/得失点。
- 得点ランキング: **実際の得点王レース**。選手は **名前＋得点数だけ**（所属国は持たせない）。
- 最終順位（`groupResult`）: スコアから **自動算出 → admin が「順位に反映」操作で書き込み → 手動上書き可**。
- 表示場所: **グループタブに集約**し、タブ名を **「グループ」→「結果」** にリネーム（タブ id は `group` のまま、`grid` アイコン継続）。

### 非スコープ（YAGNI）

- ノックアウト段階の試合スコア入力（到達チーム集合の既存UIを継続）。
- 採点ロジック（`scoring.js`）・ノックアウト導出（`bracket.js`）の変更。
- 得点者の所属国・選手名簿連携・得点王予想（`result.topScorer`）の採点変更。
- 試合日時/会場など日程の拡張（既存 `schedule` のまま）。

## データモデル（config JSON / KV を後方互換で拡張）

既存 `teams / scorerSuggest / result / schedule / groups / groupResult` に2フィールドを追加する。

### `groupMatches`

各組4チームの総当たり6試合のスコア。

```
groupMatches: {
  A: [ { a: 'MEX', b: 'KOR', ga: 2, gb: 1 }, ... 6件 ],
  ...
  L: [ ... ]
}
```

- `a` / `b`: チームコード（その組の所属チーム）。
- `ga` / `gb`: 整数（0〜99）または `null`（未消化）。両方が数値のとき「消化済み」とみなす。
- 欠損・空オブジェクトは許容（未入力の組）。
- 組のメンバー入替時は admin UI が **`{a,b}` ペアでスコアを引き継ぎつつ6試合を再生成**する。

### `scorers`

```
scorers: [ { name: 'ハーランド', goals: 5 }, { name: 'ムバッペ', goals: 4 }, ... ]
```

- `name`: 非空文字列。`goals`: 非負整数。
- 表示時は `goals` 降順（同点は入力順安定）。

## 純ロジック（新規 `public/lib/standings.js`・ESM）

既存 `public/lib/{scoring,bracket}.js` と同じ dual-use（ブラウザ＋node `--test`）パターン。

- `generateFixtures(members)` → 4チームから6試合のペア配列 `[{a,b}, ...]`（C(4,2)）。
  メンバーに空スロットがある場合は埋まっている2チームの組のみ生成。
- `computeStandings(members, matches)` → 各チームの集計行を返す。
  - 行: `{ code, played, w, d, l, gf, ga, gd, pts }`（`pts = 3*w + d`、`gd = gf - ga`）。
  - 消化済み試合（`ga`/`gb` ともに数値）のみ集計。
  - ソート: **勝点 → 得失点差 → 総得点 → 組登録順（members の順）**。

`index.html` の `<script type="module">` で import し `window.WC` へ橋渡し:
`Object.assign(window.WC, { computeStandings, generateFixtures })`。

## 採点・Phase B との関係

- 採点の根幹は **`groupResult`（最終順位1〜4位）のまま**。`computeStandings` は表示と「順位の自動算出候補」
  を提供するのみ。admin が「この順位を最終順位に反映」操作で `groupResult` に書き込み、手動上書きも可能。
- これにより `scoring.js` / `bracket.js` / 既存採点ループに **一切手を入れない**。
- `scorers` は表示専用。`result.topScorer`（1名一致で加点）の採点に影響しない。

## 管理画面（`public/admin/admin.jsx`）

- 既存「グループ（所属＋最終順位）」section を拡張:
  - 各組に **6試合のスコア入力**（`a` vs `b`、`ga` / `gb` 数値入力）。
  - **ライブ順位プレビュー**（`computeStandings` 結果のミニ表示）。
  - **「この順位を最終順位に反映」ボタン**（プレビュー上位4を `groupResult[k]` に書き込む。以後手動編集可）。
  - メンバー変更時に fixtures を再生成（`{a,b}` でスコア保持）。
- 新 section **「得点ランキング」**: `{name, goals}` の追加/削除/編集リスト。
- `afterLogin` の正規化に `groupMatches`（オブジェクト）・`scorers`（配列）の補完を追加。

admin は現状 React UMD ＋ Babel のみで module も `window.WC` も読み込んでいない。集計表示は
`standings.js` を単一の真実として再利用するため、**`admin/index.html` に `<script type="module">`
を追加**して `../lib/standings.js` を import し `window.WC = window.WC || {}` に
`computeStandings` / `generateFixtures` を `Object.assign` する。`admin.jsx` 側は
`window.WC?.computeStandings` を参照し、未ロード時は順位プレビューを空表示にするガードを置く
（集計はマウント後の操作時に走るため実用上のレースはない）。

## アプリ画面（`public/screens-group.jsx`）

- 各組カードを **フルリーグ表** に変更:
  - 列: 順位 / 旗 / 国名 / 勝点 / 試 / 勝分敗 / 得失（`+3` 形式）。
  - `groupMatches[k]` が無い/未消化のみの組は、現状どおり `GROUP_RESULT` の順位並び（数値なし）にフォールバック。
- 画面下部に **得点ランキング** セクション（`window.WC.SCORERS` を `goals` 降順表示。空なら非表示か「未登録」）。
- `wide` 対応は既存グリッドを踏襲。

## ナビ（`public/index.html`）

- `MOBILE_TABS` / `DESKTOP_TABS` の `{ id: 'group', label: 'グループ' }` を `label: '結果'` に変更。
- `<script type="module">` に `standings.js` の import と `window.WC` への Object.assign を追加。
- `data.js` の `window.WC` 初期化に `GROUP_MATCHES = {}` / `SCORERS = []` を追加し、
  `fetchConfig` で `cfg.groupMatches` / `cfg.scorers` を反映。

## バックエンド検証（`functions/_lib/validate.js` / `defaults.js`）

- `validateConfig` に追加:
  - `groupMatches`: オブジェクト。キーは A〜L。各値は配列で要素 `{a, b, ga, gb}`。
    `a`/`b` は既知コードかつ（理想的に）その組の所属。`ga`/`gb` は `null`/空 か 0〜99 の整数。
    不正は `{ ok:false, error }` で弾く。
  - `scorers`: 配列。要素 `{name, goals}`。`name` 非空、`goals` 非負整数。
  - 返り値 `value` に `groupMatches` / `scorers` を含める。
- `defaults.js` の `DEFAULT_CONFIG` に `groupMatches: {}` / `scorers: []` を追加。

## エラーハンドリング

- アプリ側は `fetchConfig` 失敗時はデフォルト（空）で動作。リーグ表はフォールバック並び、得点ランキングは非表示。
- admin の保存失敗・通信エラーは既存の `msg` 表示を踏襲。
- 検証エラーは API が 400 とエラーメッセージを返し、admin に表示。

## テスト方針

- 新規 `functions/_lib/standings.test.js`（node `--test`）:
  - `generateFixtures`: 4チーム→6試合、空スロット時の縮退。
  - `computeStandings`: 勝点計算、得失点差/総得点ソート、同点の安定性、未消化試合の除外、全未消化（0試合）。
- `functions/_lib/validate.test.js` に `groupMatches` / `scorers` の正常・異常ケースを追加。
- ヘッドレス Chrome で画面スモーク（リーグ表表示・得点ランキング・タブ名「結果」・0エラー）。

## デプロイ

- 検証グリーン後、`wrangler pages deploy public --project-name=wcup2026-yosou --branch=main --commit-dirty=true`。
