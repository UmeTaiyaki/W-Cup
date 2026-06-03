// 大会設定JSONの検証＋正規化。純関数。
// 返り値: { ok: true, value } | { ok: false, error }
const CODE_RE = /^[A-Za-z]{2,4}$/;
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

  // scorerSuggest
  let scorerSuggest = [];
  if (input.scorerSuggest != null) {
    if (!Array.isArray(input.scorerSuggest) || input.scorerSuggest.some((s) => !isStr(s))) {
      return { ok: false, error: 'scorerSuggest は文字列配列が必要です' };
    }
    scorerSuggest = input.scorerSuggest.map((s) => s.trim()).filter(Boolean);
  }

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
  const topScorer = isStr(ri.topScorer) ? ri.topScorer.trim() : '';
  const result = { champion, runnerUp, topScorer, bracket, knockout };

  // schedule（緩め）
  let schedule = [];
  if (input.schedule != null) {
    if (!Array.isArray(input.schedule)) return { ok: false, error: 'schedule は配列が必要です' };
    schedule = input.schedule.map((s) => ({
      date: isStr(s?.date) ? s.date : '',
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

  return { ok: true, value: { version: 1, updatedAt: null, teams, scorerSuggest, result, schedule, groups, groupResult } };
}
