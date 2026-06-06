// 試合日程ビューの純ロジック（ブラウザ/Node 共有・ESM）

const ROUND_NAMES = {
  R32: 'ベスト32', R16: 'ベスト16', QF: '準々決勝',
  SF: '準決勝', '3rd': '3位決定戦', F: '決勝',
};

// round 記号 → 章ラベル
export function roundLabel(round) {
  if (round == null || round === '') return ''; // null / undefined / 空文字
  if (ROUND_NAMES[round]) return ROUND_NAMES[round];
  if (/^[A-L]$/.test(round)) return `グループ${round}`;
  return round;
}

// 試合の a/b フィールド（確定チームコード or スロット表記）を表示用オブジェクトに変換
export function formatMatchTeam(code, teamMap = {}) {
  const c = code || '';
  const team = teamMap[c];
  if (team) {
    return { resolved: true, code: c, label: team.ja, flag: team.flag };
  }
  let label = '未定';
  let m;
  if ((m = /^([12])([A-L])$/.exec(c))) {
    label = `グループ${m[2]} ${m[1]}位`;
  } else if (/^3[A-L]{2,}$/.test(c)) {
    label = '3位通過';
  } else if ((m = /^W(\d+)$/.exec(c))) {
    label = `第${m[1]}試合 勝者`;
  } else if ((m = /^L(\d+)$/.exec(c))) {
    label = `第${m[1]}試合 敗者`;
  }
  return { resolved: false, code: c, label, flag: null };
}

// schedule を日付ごとにまとめ、日付昇順・各日内は時刻昇順で返す。
// date 欠落要素は末尾の { date: null } グループへ集約。
export function groupByDate(schedule) {
  const list = Array.isArray(schedule) ? schedule : [];
  const byDate = new Map();
  const undated = [];
  // byDate/undated はローカルの集計用（入力は不変、戻り値は新規配列）
  for (const m of list) {
    if (!m) continue;
    if (m.date) {
      if (!byDate.has(m.date)) byDate.set(m.date, []);
      byDate.get(m.date).push(m);
    } else {
      undated.push(m);
    }
  }
  const dates = [...byDate.keys()].sort();
  const byTime = (x, y) => (x.time || '').localeCompare(y.time || '');
  return [
    ...dates.map((date) => ({
      date,
      matches: byDate.get(date).slice().sort(byTime),
    })),
    ...(undated.length ? [{ date: null, matches: undated.slice().sort(byTime) }] : []),
  ];
}
