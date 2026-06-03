// グループ総当たりのフィクスチャ生成と順位表集計（純ロジック / ESM）

// 4チーム（空スロット可）から総当たり6試合のペアを生成
export function generateFixtures(members = []) {
  const teams = (members || []).filter(Boolean);
  const out = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      out.push({ a: teams[i], b: teams[j] });
    }
  }
  return out;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// members: コード配列（空スロット可）, matches: [{a,b,ga,gb}]
// 返り値: [{code, played, w, d, l, gf, ga, gd, pts}] を勝点→得失点差→総得点→登録順でソート
export function computeStandings(members = [], matches = []) {
  const order = (members || []).filter(Boolean);
  const row = {};
  order.forEach((code, i) => {
    row[code] = { code, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, _i: i };
  });
  for (const m of matches || []) {
    if (!m || !row[m.a] || !row[m.b]) continue;
    if (!isNum(m.ga) || !isNum(m.gb)) continue; // 未消化
    const A = row[m.a], B = row[m.b];
    A.played++; B.played++;
    A.gf += m.ga; A.ga += m.gb;
    B.gf += m.gb; B.ga += m.ga;
    if (m.ga > m.gb) { A.w++; B.l++; A.pts += 3; }
    else if (m.ga < m.gb) { B.w++; A.l++; B.pts += 3; }
    else { A.d++; B.d++; A.pts++; B.pts++; }
  }
  const rows = order.map((c) => {
    const r = row[c];
    return { ...r, gd: r.gf - r.ga };
  });
  rows.sort((x, y) =>
    y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x._i - y._i);
  return rows.map(({ _i, ...r }) => r);
}
