// 大会設定JSONの検証＋正規化。純関数。
// 返り値: { ok: true, value } | { ok: false, error }
import { WILDCARD_SLOTS } from '../../public/lib/bracket.js';
const CODE_RE = /^[A-Za-z]{2,4}$/;
const POS_SET = new Set(['GK', 'DF', 'MF', 'FW']);
const isStr = (v) => typeof v === 'string';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function validateConfig(input) {
  if (!isObj(input)) return { ok: false, error: 'config はオブジェクトである必要があります' };

  // teams
  if (!Array.isArray(input.teams) || input.teams.length === 0) {
    return { ok: false, error: 'teams は1件以上の配列が必要です' };
  }
  const codes = new Set();
  const teams = [];
  for (const t of input.teams) {
    if (!isObj(t) || !isStr(t.code) || !CODE_RE.test(t.code)) {
      return { ok: false, error: `teams の code が不正です: ${JSON.stringify(t)}` };
    }
    const code = t.code.toUpperCase();
    if (codes.has(code)) return { ok: false, error: `teams の code が重複しています: ${code}` };
    if (!isStr(t.ja) || !t.ja.trim()) return { ok: false, error: `teams の ja(名前) が必要です: ${code}` };
    codes.add(code);
    teams.push({ code, ja: t.ja.trim(), flag: isStr(t.flag) ? t.flag : '', c: isStr(t.c) ? t.c : '#888888' });
  }
  const known = (c) => codes.has(c);

  // result
  const ri = isObj(input.result) ? input.result : {};
  const champion = ri.champion == null || ri.champion === '' ? null : String(ri.champion).toUpperCase();
  const runnerUp = ri.runnerUp == null || ri.runnerUp === '' ? null : String(ri.runnerUp).toUpperCase();
  if (champion && !known(champion)) return { ok: false, error: `result.champion が未登録: ${champion}` };
  if (runnerUp && !known(runnerUp)) return { ok: false, error: `result.runnerUp が未登録: ${runnerUp}` };
  const bi = isObj(ri.bracket) ? ri.bracket : {};
  const bracket = {};
  for (const r of ['r16', 'qf', 'sf', 'final']) {
    const arr = Array.isArray(bi[r]) ? bi[r] : [];
    for (const c of arr) {
      if (!(isStr(c) && known(c.toUpperCase()))) return { ok: false, error: `result.bracket.${r} に未登録コード: ${c}` };
    }
    bracket[r] = arr.map((c) => c.toUpperCase());
  }
  // knockout（採点用の到達チーム集合。各ラウンドは既知コードのみ。空可）
  const ki = isObj(ri.knockout) ? ri.knockout : {};
  const knockout = {};
  for (const r of ['r32', 'r16', 'qf', 'sf']) {
    const arr = Array.isArray(ki[r]) ? ki[r] : [];
    for (const c of arr) {
      if (!(isStr(c) && known(c.toUpperCase()))) {
        return { ok: false, error: `result.knockout.${r} に未登録コード: ${c}` };
      }
    }
    knockout[r] = arr.map((c) => c.toUpperCase());
  }
  // thirdAssign（実際の3位枠割当。キーは WILDCARD_SLOTS、値は既知コード。空可）
  const tai = isObj(ri.thirdAssign) ? ri.thirdAssign : {};
  const thirdAssign = {};
  for (const k of Object.keys(tai)) {
    if (!WILDCARD_SLOTS.includes(k)) {
      return { ok: false, error: `result.thirdAssign に不正なスロット: ${k}` };
    }
    const v = tai[k];
    if (v == null || v === '') continue;
    if (!(isStr(v) && known(v.toUpperCase()))) {
      return { ok: false, error: `result.thirdAssign.${k} に未登録コード: ${v}` };
    }
    thirdAssign[k] = v.toUpperCase();
  }
  // thirdGroups（3位通過した8グループの選択。A〜L の重複なし、最大8。thirdAssign の出自。空可）
  const tgi = Array.isArray(ri.thirdGroups) ? ri.thirdGroups : [];
  const thirdGroups = [];
  for (const g of tgi) {
    if (!isStr(g)) return { ok: false, error: `result.thirdGroups に不正な値: ${g}` };
    const gu = g.toUpperCase();
    if (!/^[A-L]$/.test(gu)) return { ok: false, error: `result.thirdGroups に不正なグループ: ${g}` };
    if (thirdGroups.includes(gu)) return { ok: false, error: `result.thirdGroups にグループ重複: ${gu}` };
    thirdGroups.push(gu);
  }
  if (thirdGroups.length > 8) return { ok: false, error: 'result.thirdGroups は最大8グループです' };
  const topScorer = isStr(ri.topScorer) ? ri.topScorer.trim() : '';
  const result = { champion, runnerUp, topScorer, bracket, knockout, thirdAssign, thirdGroups };

  // schedule（緩め）
  let schedule = [];
  if (input.schedule != null) {
    if (!Array.isArray(input.schedule)) return { ok: false, error: 'schedule は配列が必要です' };
    schedule = input.schedule.map((s) => ({
      date: isStr(s?.date) ? s.date : '',
      time: isStr(s?.time) ? s.time : '',
      round: isStr(s?.round) ? s.round : '',
      a: isStr(s?.a) ? s.a : '',
      b: isStr(s?.b) ? s.b : '',
      note: isStr(s?.note) ? s.note : '',
    }));
  }

  // groups（A〜L、各コードは teams 内。空文字スロット許容）
  const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const groups = {};
  if (input.groups != null) {
    if (!isObj(input.groups)) return { ok: false, error: 'groups はオブジェクトが必要です' };
    const seenMembers = new Set();
    for (const k of Object.keys(input.groups)) {
      if (!GROUP_KEYS.includes(k)) return { ok: false, error: `groups に不正なキー: ${k}` };
      const arr = input.groups[k];
      if (!Array.isArray(arr)) return { ok: false, error: `groups.${k} は配列が必要です` };
      const norm = [];
      const localSeen = new Set();
      for (const c of arr) {
        if (c === '') { norm.push(''); continue; }
        if (!(isStr(c) && known(c.toUpperCase()))) return { ok: false, error: `groups.${k} に未登録コード: ${c}` };
        const up = c.toUpperCase();
        if (localSeen.has(up)) return { ok: false, error: `groups.${k} にチームの重複: ${up}` };
        if (seenMembers.has(up)) return { ok: false, error: `チームが複数グループに所属: ${up}` };
        localSeen.add(up);
        seenMembers.add(up);
        norm.push(up);
      }
      groups[k] = norm;
    }
  }

  // groupResult（各コードは対応 groups[k] の所属内。空文字スロット許容）
  const groupResult = {};
  if (input.groupResult != null) {
    if (!isObj(input.groupResult)) return { ok: false, error: 'groupResult はオブジェクトが必要です' };
    for (const k of Object.keys(input.groupResult)) {
      if (!GROUP_KEYS.includes(k)) return { ok: false, error: `groupResult に不正なキー: ${k}` };
      const arr = input.groupResult[k];
      if (!Array.isArray(arr)) return { ok: false, error: `groupResult.${k} は配列が必要です` };
      const members = new Set((groups[k] || []).filter(Boolean));
      const norm = [];
      const localSeen = new Set();
      for (const c of arr) {
        if (c === '') { norm.push(''); continue; }
        const up = isStr(c) ? c.toUpperCase() : '';
        if (!up || !members.has(up)) return { ok: false, error: `groupResult.${k} に所属外コード: ${c}` };
        if (localSeen.has(up)) return { ok: false, error: `groupResult.${k} にチームの重複: ${up}` };
        localSeen.add(up);
        norm.push(up);
      }
      groupResult[k] = norm;
    }
  }

  // groupMatches（各組の試合スコア。a/b は既知コード、ga/gb は null か 0〜99 整数）
  const groupMatches = {};
  if (input.groupMatches != null) {
    if (!isObj(input.groupMatches)) return { ok: false, error: 'groupMatches はオブジェクトが必要です' };
    for (const k of Object.keys(input.groupMatches)) {
      if (!GROUP_KEYS.includes(k)) return { ok: false, error: `groupMatches に不正なキー: ${k}` };
      const arr = input.groupMatches[k];
      if (!Array.isArray(arr)) return { ok: false, error: `groupMatches.${k} は配列が必要です` };
      const norm = [];
      for (const m of arr) {
        if (!isObj(m)) return { ok: false, error: `groupMatches.${k} の要素が不正です` };
        const a = isStr(m.a) ? m.a.toUpperCase() : '';
        const b = isStr(m.b) ? m.b.toUpperCase() : '';
        if (!known(a) || !known(b)) return { ok: false, error: `groupMatches.${k} に未登録コード` };
        const sc = (v) => (v == null || v === '' ? null : v);
        const ga = sc(m.ga), gb = sc(m.gb);
        const okScore = (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 99);
        if (!okScore(ga) || !okScore(gb)) return { ok: false, error: `groupMatches.${k} のスコアが不正です` };
        norm.push({ a, b, ga, gb });
      }
      groupMatches[k] = norm;
    }
  }

  // scorers（得点ランキング。name 非空、goals 非負整数）
  const scorers = [];
  if (input.scorers != null) {
    if (!Array.isArray(input.scorers)) return { ok: false, error: 'scorers は配列が必要です' };
    for (const s of input.scorers) {
      if (!isObj(s) || !isStr(s.name) || !s.name.trim()) {
        return { ok: false, error: 'scorers の name が必要です' };
      }
      const goals = s.goals;
      if (!Number.isInteger(goals) || goals < 0) {
        return { ok: false, error: `scorers の goals が不正です: ${s.name}` };
      }
      scorers.push({ name: s.name.trim(), goals });
    }
  }

  // squads（国別選手名簿。キーは既知コード、各選手は name 非空・pos は GK/DF/MF/FW か空）
  const squads = {};
  if (input.squads != null) {
    if (!isObj(input.squads)) return { ok: false, error: 'squads はオブジェクトが必要です' };
    for (const k of Object.keys(input.squads)) {
      const code = isStr(k) ? k.toUpperCase() : '';
      if (!known(code)) return { ok: false, error: `squads に未登録コード: ${k}` };
      const arr = input.squads[k];
      if (!Array.isArray(arr)) return { ok: false, error: `squads.${code} は配列が必要です` };
      const norm = [];
      for (const p of arr) {
        if (!isObj(p) || !isStr(p.name) || !p.name.trim()) {
          return { ok: false, error: `squads.${code} の選手名が必要です` };
        }
        const pos = isStr(p.pos) ? p.pos.trim().toUpperCase() : '';
        if (pos && !POS_SET.has(pos)) {
          return { ok: false, error: `squads.${code} のポジションが不正です: ${p.pos}` };
        }
        const club = isStr(p.club) ? p.club.trim() : '';
        norm.push({ name: p.name.trim(), pos, club });
      }
      squads[code] = norm;
    }
  }

  return { ok: true, value: { version: 1, updatedAt: null, teams, result, schedule, groups, groupResult, groupMatches, scorers, squads } };
}
