// 予想データ（参加者リスト＋各自の予想）の検証・正規化・デフォルトシード。純関数。
// 単一の真実はここ。public/data.js のフォールバック用シードと値を一致させること。

const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const KO_ROUNDS = ['r32', 'r16', 'qf', 'sf'];

const isStr = (v) => typeof v === 'string';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// チームコードは2〜4文字。長さをクランプしてからアッパーケース化（巨大文字列の保存を防止）。
const toCode = (v) => (v == null || v === '' ? null : String(v).slice(0, 4).toUpperCase());
const codeArr = (a, max) => (Array.isArray(a) ? a : []).filter(isStr).slice(0, max).map((c) => c.slice(0, 4).toUpperCase());

// 認証なしエンドポイントのため、配列長・文字列長に上限を設けてKV肥大化を防ぐ。
export const LIMITS = { members: 30, topScorer: 60, groupRank: 4, knockout: 32, postBytes: 64 * 1024 };

// 空の予想（新規参加者の初期値）
export function emptyPred() {
  return {
    champion: null,
    runnerUp: null,
    topScorer: '',
    groupRank: GROUP_KEYS.reduce((o, k) => { o[k] = []; return o; }, {}),
    thirdGroups: [], // 3位通過すると予想する8グループ（FIFA Annex C でベスト32の枠へ自動割当）
    knockout: { r32: [], r16: [], qf: [], sf: [] },
  };
}

// 単一メンバーの予想を構造的に正規化（型・キーを安全な形に整える）。
// 仲間内アプリのため、未登録コードでの hard-fail はせず正規化のみ行う。
export function validatePred(input) {
  const p = isObj(input) ? input : {};
  const base = emptyPred();

  const groupRank = {};
  const gr = isObj(p.groupRank) ? p.groupRank : {};
  for (const k of GROUP_KEYS) groupRank[k] = codeArr(gr[k], LIMITS.groupRank);

  // thirdGroups: A〜L の重複なし、最大8グループ。FIFA Annex C でベスト32の枠へ自動割当される。
  const tg = Array.isArray(p.thirdGroups) ? p.thirdGroups : [];
  const thirdGroups = [];
  for (const g of tg) {
    if (!isStr(g)) continue;
    const gu = g.toUpperCase();
    if (GROUP_KEYS.includes(gu) && !thirdGroups.includes(gu)) thirdGroups.push(gu);
    if (thirdGroups.length >= 8) break;
  }

  const knockout = {};
  const ko = isObj(p.knockout) ? p.knockout : {};
  for (const r of KO_ROUNDS) knockout[r] = codeArr(ko[r], LIMITS.knockout);

  return {
    ok: true,
    value: {
      champion: toCode(p.champion),
      runnerUp: toCode(p.runnerUp),
      topScorer: isStr(p.topScorer) ? p.topScorer.trim().slice(0, LIMITS.topScorer) : base.topScorer,
      groupRank,
      thirdGroups,
      knockout,
    },
  };
}

