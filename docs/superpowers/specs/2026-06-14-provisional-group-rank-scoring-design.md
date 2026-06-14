# 暫定グループ順位による予想スコア反映 — 設計

## 背景・課題

予想スコアのグループ順位加点（`rankHit` = 1チーム1点）は、採点ロジック
`scoreMember(pred, RESULT)` が参照する `RESULT.groupResult` に依存する。

この `groupResult` を作る `deriveGroupResult`（`functions/_lib/sm-results.js`）は、
**そのグループの全試合が FT（終了）になるまで空配列 `[]`** を返す（`ftCount >= expected` 条件）。
結果として「グループ全試合が終わるまでグループ順位の点が一切入らない」状態になっている。

一方、結果タブのグループ表では既に `computeStandings`（`public/lib/standings.js`）で
**暫定順位**を算出し、突破圏を緑線で表示している。

## 目的

暫定順位の段階でも、予想のグループ順位点がスコアに反映され、試合の進行（ライブ含む）で
動くようにする。

## スコープ（確定事項）

- 対象は **グループ順位の点だけ**。champion / runnerUp / topScorer / KO到達は現状の挙動のまま。
- 暫定点は **確定点と区別せず合算**（バッジ等の区別表示なし）。
- 反映開始は **そのグループの全チームが1試合以上消化した後**（`computeStandings` の各行 `played >= 1`）。

## 方針

採点が参照する `groupResult` を **確定 → 暫定の順で解決**する薄い層を1つ足す。
確定結果・採点ロジック（`scoring.js`）・順位計算（`standings.js` の `computeStandings`）の
既存挙動は変更しない（純関数を1つ追加するのみ）。

## 実装

### 1. `public/lib/standings.js` に純関数を追加

```js
// 暫定グループ順位（採点用）。各グループの全チームが1試合以上消化したら
// computeStandings 順の top3 コード配列、未達なら空配列。
export function provisionalGroupResult(groups = {}, groupMatches = {}) {
  const out = {};
  for (const g of Object.keys(groups || {})) {
    const members = (groups[g] || []).filter(Boolean);
    const rows = computeStandings(members, (groupMatches || {})[g] || []);
    out[g] =
      members.length && rows.every((r) => r.played >= 1)
        ? rows.slice(0, 3).map((r) => r.code)
        : [];
  }
  return out;
}
```

ライブ中のスコアも `GROUP_MATCHES` の `ga/gb` に入るため、暫定順位は試合中もリアルタイムに動く。

### 2. `public/index.html` の採点ラッパで確定優先マージ

`scoringGroupResult()` を新設し、採点ラッパと `resultsLive` 判定の両方で共用する。

```js
window.WC.scoringGroupResult = () => {
  const conf = (window.WC.RESULT && window.WC.RESULT.groupResult) || {};
  const prov = provisionalGroupResult(window.WC.GROUPS || {}, window.WC.GROUP_MATCHES || {});
  const out = {};
  for (const g of new Set([...Object.keys(conf), ...Object.keys(prov)])) {
    const c = (conf[g] || []).filter(Boolean);
    out[g] = c.length ? conf[g] : (prov[g] || []); // 確定があれば確定、無ければ暫定
  }
  return out;
};
window.WC.scoreMember = (pred) =>
  scoreMember(
    pred,
    { ...(window.WC.RESULT || {}), groupResult: window.WC.scoringGroupResult() },
    SCORING,
    window.WC.ALIAS_MAP || {},
  );
```

### 3. `public/screens-rank.jsx` の `resultsLive` を実効 groupResult ベースに

現状は確定 `R.groupResult` のみで「結果待ち / メダル色 / 順位番号」を判定。暫定で点が動いても
ランキングが「–」「グレー」のままだと矛盾するため、判定を `scoringGroupResult()`（確定＋暫定）に変える。

## 挙動

- グループの全チームが1試合以上消化したら、暫定 1/2/3 位が予想と一致した分だけ加点。
  ライブスコアで順位が動けば点も増減する。
- グループ全試合が FT になると確定 `groupResult` へ切り替わる（暫定と同値なら見た目変化なし）。

## 留意点（仕様）

- 結果タブの緑線（突破圏表示）は1試合目から出るが、スコア加点は全チーム1試合消化後から。
  マッチデー1の途中は「緑線は出るが点はまだ動かない」状態になる（選択どおり）。

## テスト

`functions/_lib/` にユニットテストを追加し、`provisionalGroupResult` を検証する。

- 全チーム1試合消化前 → 空配列（加点なし）
- 全チーム1試合消化後 → 暫定 top3 コード
- ライブスコア（FT前でも ga/gb 数値）で順位反映
- マージ：確定があるグループは確定、無いグループは暫定

## バージョニング

jsx 変更（`screens-rank.jsx`）と `index.html` 変更のため、`index.html` の `?v=` を更新する。
