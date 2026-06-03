# 試合結果のリーグ表表示＋得点ランキング 設計

- 日付: 2026-06-03
- 対象アプリ: W杯2026 仲間内予想アプリ（Cloudflare Pages `wcup2026-yosou`）
- 関連: Phase A（48カ国12グループ・admin・グループタブ）／Phase B（順位予想→ベスト32→採点）実装済みの上に積む

## 目的

管理画面で **グループステージの実際の試合スコア**・**ノックアウトの実結果（到達チーム＋3位枠割当）**・
**得点者のゴール数** を入力し、アプリ側で「結果」タブ内の3サブタブ（①自動集計したフルリーグ表、
②ホームと同じ対戦カード付きノックアウト表、③得点ランキング）を読み取り専用で表示する。
大会進行に合わせて逐次更新できるようにする。

## スコープ（確定事項）

- グループタブを **「結果」** にリネーム（タブ id は `group` のまま、`grid` アイコン継続）し、画面内を
  **3サブタブ**に分割: ①グループリーグ ②ノックアウトステージ ③得点王。
- ①グループリーグ: **フルリーグ表（試合スコアからの自動集計）**。順位/旗/国名/勝点/試合数/勝分敗/得失点。
- ②ノックアウトステージ: **ホームタブと同じ対戦カード付きトーナメント表**（`KnockoutView`）を **実結果** で描画。
- ③得点王: **実際の得点王レース**。選手は **名前＋得点数だけ**（所属国は持たせない）。
- 最終順位（`groupResult`）: スコアから **自動算出 → admin が「順位に反映」操作で書き込み → 手動上書き可**。

### 非スコープ（YAGNI）

- ノックアウト段階の**試合スコア**入力（勝者は既存「到達チーム集合」トグルを継続。スコアは扱わない）。
- 採点ロジック（`scoring.js`）の変更。`bracket.js` は**純関数を1本追加するのみ**（既存 `deriveKnockout` は不変）。
- 得点者の所属国・選手名簿連携・得点王予想（`result.topScorer`）の採点変更。
- 試合日時/会場など日程の拡張（既存 `schedule` のまま）。

## データモデル（config JSON / KV を後方互換で拡張）

既存 `teams / scorerSuggest / result / schedule / groups / groupResult` に対し、トップレベルに
`groupMatches` / `scorers` を追加、`result` に `thirdAssign` を追加する（いずれも後方互換）。

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

### `result.thirdAssign`（新規・ノックアウト用）

実際の3位ワイルドカード割当。予想側 `pred.thirdAssign` と同じ形。

```
result: { ..., thirdAssign: { M1: 'BRA', M2: 'POR', ... } }
```

- キーは `WILDCARD_SLOTS`（M1/M2/M7/M8/M11/M12/M15/M16）のいずれか。
- 値は既知チームコード（理想的にはそのスロットの `PERMITTED` 群の3位）。空 `{}` 許容。
- これと `result.groupResult`・`result.knockout`（到達集合）から実結果ブラケットを導出する。

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

## ノックアウト導出（`public/lib/bracket.js` に純関数1本追加）

admin の「到達チーム集合」（`result.knockout` = 各ラウンドに勝ち残ったチームの**順不同集合**）を、
`deriveKnockout` が期待する**対戦カード整列済みの勝者配列**へ変換しつつ実結果ブラケットを構築する。

```
export function deriveKnockoutFromSets(groupRank = {}, thirdAssign = {}, sets = {}) {
  const rounds = ['r32', 'r16', 'qf', 'sf'];
  const knockout = {};
  let der = deriveKnockout(groupRank, thirdAssign, knockout);
  for (const r of rounds) {
    const set = new Set(sets[r] || []);
    // 各カードの2チームのうち集合に含まれる方を勝者として整列
    knockout[r] = der.matches[r].map((m) => m.find((t) => t && set.has(t)) || null);
    der = deriveKnockout(groupRank, thirdAssign, knockout);
  }
  return der;
}
```

- 既存 `deriveKnockout` は**一切変更しない**。ラウンドごとに整列→再導出を繰り返し、次ラウンドの
  対戦カードを確定させる（r32勝者→r16カード→…）。
- 実結果の引数: `groupRank = window.WC.GROUP_RESULT`、`thirdAssign = window.WC.RESULT.thirdAssign`、
  `sets = window.WC.RESULT.knockout`。`champ = window.WC.RESULT.champion`。
- `module` 経由で `window.WC.deriveKnockoutFromSets` として橋渡し。node `--test` 対象。

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
- 既存「正解（勝敗）」section に **「実際の3位枠割当」** を追加: `WILDCARD_SLOTS` の各スロットに、その
  スロットの `PERMITTED` 群に属するチームから選択（予想の3位ワイルドカードUIと同等。`window.WC` 非依存の
  ため `bracket.js` を admin/index.html の module で橋渡しして `WILDCARD_SLOTS`/`PERMITTED` を参照）。
  未割当のスロットは空可（ブラケットでは下段「未定」表示）。
- 新 section **「得点ランキング」**: `{name, goals}` の追加/削除/編集リスト。
- `afterLogin` の正規化に `groupMatches`（オブジェクト）・`scorers`（配列）・`result.thirdAssign`
  （オブジェクト）の補完を追加。

admin は現状 React UMD ＋ Babel のみで module も `window.WC` も読み込んでいない。`standings.js`/
`bracket.js` を単一の真実として再利用するため、**`admin/index.html` に `<script type="module">`
を追加**して `../lib/standings.js`・`../lib/bracket.js` を import し `window.WC = window.WC || {}` に
`computeStandings` / `generateFixtures` / `WILDCARD_SLOTS` / `PERMITTED` を `Object.assign` する。
`admin.jsx` 側は `window.WC?.computeStandings` 等を参照し、未ロード時はプレビュー/割当UIを空表示に
するガードを置く（操作はマウント後に走るため実用上のレースはない）。

## アプリ画面（`public/screens-group.jsx` → 結果スクリーン）

`GroupScreen` を **サブタブ付きの結果スクリーン**に再構成（id `group` のまま `index.html` から呼ばれる）。
上部に3つのサブタブ（グループリーグ / ノックアウトステージ / 得点王）、`React.useState` で切替。

### ①グループリーグ

- 各組カードを **フルリーグ表** に変更:
  - 列: 順位 / 旗 / 国名 / 勝点 / 試 / 勝分敗 / 得失（`+3` 形式）。
  - `window.WC.computeStandings(GROUPS[k], GROUP_MATCHES[k])` で集計。
  - `groupMatches[k]` が無い/未消化のみの組は、現状どおり `GROUP_RESULT` の順位並び（数値なし）にフォールバック。
- `wide` 対応は既存グリッドを踏襲。

### ②ノックアウトステージ

- **`KnockoutView` を再利用**（screens-optview.jsx で定義済みのグローバル関数）。実結果用の `der` を
  `window.WC.deriveKnockoutFromSets(GROUP_RESULT, RESULT.thirdAssign, RESULT.knockout)` で生成し、
  `champ = TEAM[RESULT.champion]`、`ROUNDS=['r32','r16','qf','sf']`、`LABELS`（ベスト32/…/準決勝）を渡す。
- `KnockoutView` を他ファイルから安全に参照するため、screens-optview.jsx 末尾の
  `Object.assign(window, { OptionViewScreen })` に **`KnockoutView` を追加**（`window.KnockoutView`）。
- データが空（到達集合も順位も無い）の場合は空状態表示。

### ③得点王

- **得点ランキング** を `window.WC.SCORERS` から `goals` 降順表示（順位 / 名前 / 得点数）。空なら「未登録」。

## ナビ（`public/index.html`）

- `MOBILE_TABS` / `DESKTOP_TABS` の `{ id: 'group', label: 'グループ' }` を `label: '結果'` に変更。
- `<script type="module">` に `standings.js` の import（`computeStandings`/`generateFixtures`）と
  `bracket.js` からの `deriveKnockoutFromSets` の import を追加し、`window.WC` へ Object.assign。
- `data.js` の `window.WC` 初期化に `GROUP_MATCHES = {}` / `SCORERS = []` を追加し、
  `RESULT` の既定に `thirdAssign: {}` を含める。`fetchConfig` で `cfg.groupMatches` / `cfg.scorers` /
  `cfg.result.thirdAssign` を反映（`RESULT` は既存どおり `{ ...RESULT, ...cfg.result }` でマージ）。

## バックエンド検証（`functions/_lib/validate.js` / `defaults.js`）

- `validateConfig` に追加:
  - `groupMatches`: オブジェクト。キーは A〜L。各値は配列で要素 `{a, b, ga, gb}`。
    `a`/`b` は既知コードかつ（理想的に）その組の所属。`ga`/`gb` は `null`/空 か 0〜99 の整数。
    不正は `{ ok:false, error }` で弾く。
  - `scorers`: 配列。要素 `{name, goals}`。`name` 非空、`goals` 非負整数。
  - `result.thirdAssign`: オブジェクト。キーは `WILDCARD_SLOTS`（`../../public/lib/bracket.js` から
    import、または同等のスロットキー定数）のみ、値は既知コード。空可。
  - 返り値 `value` に `groupMatches` / `scorers` と `result.thirdAssign` を含める。
- `defaults.js` の `DEFAULT_CONFIG` に `groupMatches: {}` / `scorers: []` を追加し、
  `result` に `thirdAssign: {}` を追加。

## エラーハンドリング

- アプリ側は `fetchConfig` 失敗時はデフォルト（空）で動作。リーグ表はフォールバック並び、得点ランキングは非表示。
- admin の保存失敗・通信エラーは既存の `msg` 表示を踏襲。
- 検証エラーは API が 400 とエラーメッセージを返し、admin に表示。

## テスト方針

- 新規 `functions/_lib/standings.test.js`（node `--test`）:
  - `generateFixtures`: 4チーム→6試合、空スロット時の縮退。
  - `computeStandings`: 勝点計算、得失点差/総得点ソート、同点の安定性、未消化試合の除外、全未消化（0試合）。
- 新規 `functions/_lib/bracket-fromsets.test.js`（node `--test`）:
  - `deriveKnockoutFromSets`: 到達集合→対戦カード整列、r32→r16→…の伝播、空集合、3位枠未割当時のフォールバック。
- `functions/_lib/validate.test.js` に `groupMatches` / `scorers` / `result.thirdAssign` の正常・異常ケースを追加。
- ヘッドレス Chrome で画面スモーク（3サブタブ切替・リーグ表・KOブラケット・得点ランキング・タブ名「結果」・0エラー）。

## デプロイ

- 検証グリーン後、`wrangler pages deploy public --project-name=wcup2026-yosou --branch=main --commit-dirty=true`。
