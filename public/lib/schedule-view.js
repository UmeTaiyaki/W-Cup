// 試合日程ビューの純ロジック（ブラウザ/Node 共有・ESM）

const ROUND_NAMES = {
  R32: 'ベスト32', R16: 'ベスト16', QF: '準々決勝',
  SF: '準決勝', '3rd': '3位決定戦', F: '決勝',
};

// round 記号 → 章ラベル
export function roundLabel(round) {
  if (round == null) return '';
  if (ROUND_NAMES[round]) return ROUND_NAMES[round];
  if (/^[A-L]$/.test(round)) return `グループ${round}`;
  return round;
}

// a/b の表記（確定コード or スロット）を表示用に正規化
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
