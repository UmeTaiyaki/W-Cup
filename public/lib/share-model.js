// SNS共有カードの「表示モデル」を予想データから抽出する純関数群（ESM）。
// 描画(share-draw.js)・共有(share-image.js)から独立してテスト可能にするための層。

export const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
export const KO_ROUNDS = ['r32', 'r16', 'qf', 'sf'];
export const SHARE_KINDS = ['core', 'group', 'knockout'];

export const KIND_LABEL = {
  core: '優勝予想',
  group: 'グループ順位予想',
  knockout: 'トーナメント予想',
};

// 各グループの予想1・2位コード（あるぶんだけ。未確定は含めない）。判定用。
export function groupTop2(groupRank = {}) {
  const gr = groupRank && typeof groupRank === 'object' ? groupRank : {};
  const out = {};
  for (const k of GROUP_KEYS) {
    const order = Array.isArray(gr[k]) ? gr[k].filter(Boolean) : [];
    out[k] = order.slice(0, 2);
  }
  return out;
}

// 各グループの1〜4位を返す（表示用）。1〜3位を予想して4位が空のとき、
// グループ所属チームから残り1国を自動補完する（optview と同じ挙動）。
// 戻り値: { A: [{code, auto}], ... }（最大4件）。
export function groupRanking(groupRank = {}, groups = {}) {
  const gr = groupRank && typeof groupRank === 'object' ? groupRank : {};
  const gp = groups && typeof groups === 'object' ? groups : {};
  const out = {};
  for (const k of GROUP_KEYS) {
    const order = Array.isArray(gr[k]) ? gr[k].filter(Boolean) : [];
    const mem = Array.isArray(gp[k]) ? gp[k].filter(Boolean) : [];
    let ranked = order.slice(0, 4);
    let autoIdx = -1;
    if (order.length === 3 && mem.length) {
      const auto4 = mem.find((c) => !order.includes(c));
      if (auto4) { ranked = [...order.slice(0, 3), auto4]; autoIdx = 3; }
    }
    out[k] = ranked.map((code, i) => ({ code, auto: i === autoIdx }));
  }
  return out;
}

// 共有可能なデータが揃っているカード種別の判定。
export function availableCards(pred = {}) {
  const p = pred && typeof pred === 'object' ? pred : {};
  const gr = p.groupRank || {};
  const top2 = groupTop2(gr);
  const group = GROUP_KEYS.some((k) => top2[k].length >= 1);

  const ko = p.knockout || {};
  const knockout =
    KO_ROUNDS.some((r) => Array.isArray(ko[r]) && ko[r].some(Boolean)) || !!p.champion;

  const hasScorer = typeof p.topScorer === 'string' && p.topScorer.trim() !== '';
  const core = !!p.champion || !!p.runnerUp || hasScorer;

  return { core, group, knockout };
}

// 得点王の保存値 "NAME (CODE)" を {name, code} に分解。CODEが無ければ code:null。
export function parseScorer(value) {
  if (typeof value !== 'string') return { name: '', code: null };
  const v = value.trim();
  const m = /^(.*)\s+\(([A-Za-z]{2,4})\)$/.exec(v);
  if (m) return { name: m[1].trim(), code: m[2].toUpperCase() };
  return { name: v, code: null };
}

// 画像ファイル名（安全化。日本語名も許容しつつ記号は除去）。
export function shareFilename(memberName, kind) {
  const safe =
    String(memberName || 'member')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .slice(0, 20) || 'member';
  const k = SHARE_KINDS.includes(kind) ? kind : 'card';
  return `wcup2026-${k}-${safe}.png`;
}

// 共有時に添えるテキスト（X/LINE等の本文）。
export function shareText(memberName, kind, url) {
  const who = String(memberName || '').trim() || '私';
  const label = KIND_LABEL[kind] || '予想';
  const link = url ? `\n${url}` : '';
  return `${who}のW杯2026 ${label} ⚽️🏆${link}\n#W杯予想 #WorldCup2026`;
}
