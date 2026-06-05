// 予想データ（参加者リスト＋各自の予想）の検証・正規化・デフォルトシード。純関数。
// 単一の真実はここ。public/data.js のフォールバック用シードと値を一致させること。

const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const WILDCARD_SLOTS = ['M1', 'M2', 'M7', 'M8', 'M11', 'M12', 'M15', 'M16'];
const KO_ROUNDS = ['r32', 'r16', 'qf', 'sf'];

const isStr = (v) => typeof v === 'string';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// チームコードは2〜4文字。長さをクランプしてからアッパーケース化（巨大文字列の保存を防止）。
const toCode = (v) => (v == null || v === '' ? null : String(v).slice(0, 4).toUpperCase());
const codeArr = (a, max) => (Array.isArray(a) ? a : []).filter(isStr).slice(0, max).map((c) => c.slice(0, 4).toUpperCase());

// 認証なしエンドポイントのため、配列長・文字列長に上限を設けてKV肥大化を防ぐ。
export const LIMITS = { members: 30, topScorer: 60, groupRank: 4, knockout: 32, postBytes: 64 * 1024 };

// 新規参加者に割り当てる色（順番に使用。data.js の MEMBER_COLORS と一致）
export const MEMBER_COLORS = [
  '#FF8A3D', '#34D399', '#60A5FA', '#F472B6',
  '#A78BFA', '#22D3EE', '#FB7185', '#FACC15',
  '#4ADE80', '#F87171', '#818CF8', '#2DD4BF',
];

// 空の予想（新規参加者の初期値）
export function emptyPred() {
  return {
    champion: null,
    runnerUp: null,
    topScorer: '',
    groupRank: GROUP_KEYS.reduce((o, k) => { o[k] = []; return o; }, {}),
    thirdAssign: WILDCARD_SLOTS.reduce((o, s) => { o[s] = null; return o; }, {}),
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

  const thirdAssign = {};
  const ta = isObj(p.thirdAssign) ? p.thirdAssign : {};
  for (const s of WILDCARD_SLOTS) thirdAssign[s] = toCode(ta[s]);

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
      thirdAssign,
      knockout,
    },
  };
}

function genId() {
  try {
    if (globalThis.crypto && globalThis.crypto.randomUUID) {
      return 'p' + globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
  } catch (e) {}
  return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

// 名前から新規メンバーを生成（id・色・イニシャルはサーバーで採番）。
// count は既存メンバー数（色のローテーションに使用）。
export function makeMember(name, count) {
  if (typeof name !== 'string') return null;
  const nm = name.trim();
  if (!nm) return null;
  const c = MEMBER_COLORS[count % MEMBER_COLORS.length];
  const initial = Array.from(nm)[0] || '?';
  return { id: genId(), name: nm.slice(0, 12), initial, c, custom: true };
}

// ---- デフォルトシード（KVが空のときのGETフォールバック）----------------
// data.js の MEMBERS / SEED と一致させること。
const DEFAULT_MEMBERS = [
  { id: 'hikaru', name: 'ひかる', initial: 'ひ', c: '#FF5C7A' },
  { id: 'sobe',   name: 'そべ',   initial: 'そ', c: '#2DD4BF' },
  { id: 'gan',    name: 'ガン',   initial: 'ガ', c: '#FBBF24' },
  { id: 'mizu',   name: '水谷',   initial: '水', c: '#8B7CFF' },
];

const SEED = {
  hikaru: { champion: 'ARG', runnerUp: 'ENG', topScorer: 'ムバッペ' },
  sobe:   { champion: 'FRA', runnerUp: 'ARG', topScorer: 'ハーランド' },
  gan:    { champion: 'ARG', runnerUp: 'FRA', topScorer: 'メッシ' },
  mizu:   { champion: 'BRA', runnerUp: 'FRA', topScorer: 'ムバッペ' },
};

export function seedPredictions() {
  const preds = {};
  for (const m of DEFAULT_MEMBERS) {
    const s = SEED[m.id] || {};
    preds[m.id] = {
      ...emptyPred(),
      champion: s.champion ?? null,
      runnerUp: s.runnerUp ?? null,
      topScorer: s.topScorer ?? '',
    };
  }
  return {
    version: 1,
    updatedAt: null,
    members: JSON.parse(JSON.stringify(DEFAULT_MEMBERS)),
    preds,
  };
}
