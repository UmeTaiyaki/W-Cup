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

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 指定 codes 間（=同点グループ）の試合だけで勝点/得失差/総得点を集計する
// head-to-head ミニリーグ。FIFA 2026 のタイブレーカー②〜④に使う。
function headToHead(codes, matches) {
	const set = new Set(codes);
	const t = {};
	codes.forEach((c) => (t[c] = { pts: 0, gf: 0, ga: 0 }));
	for (const m of matches || []) {
		if (!m || !set.has(m.a) || !set.has(m.b)) continue;
		if (!isNum(m.ga) || !isNum(m.gb)) continue;
		t[m.a].gf += m.ga;
		t[m.a].ga += m.gb;
		t[m.b].gf += m.gb;
		t[m.b].ga += m.ga;
		if (m.ga > m.gb) t[m.a].pts += 3;
		else if (m.ga < m.gb) t[m.b].pts += 3;
		else {
			t[m.a].pts += 1;
			t[m.b].pts += 1;
		}
	}
	const out = {};
	for (const c of codes)
		out[c] = { pts: t[c].pts, gd: t[c].gf - t[c].ga, gf: t[c].gf };
	return out;
}

// head-to-head で並ばなかった同点群の最終決着（FIFA 2026 タイブレーカー⑤〜⑧）。
// 全試合の得失差→総得点→フェアプレーポイント→FIFAランキング→登録順。
// fairPlay は「大きいほど上位」（カード減点方式 / データ無しは 0 で差なし）、
// fifaRank は「小さいほど上位」（データ無しは比較スキップ）。現状はカード/ランク
// 未連携のため登録順までフォールバックするが、行に値が入れば自動で効く。
function overallCompare(a, b) {
	if (b.gd !== a.gd) return b.gd - a.gd;
	if (b.gf !== a.gf) return b.gf - a.gf;
	const fpA = a.fairPlay || 0;
	const fpB = b.fairPlay || 0;
	if (fpB !== fpA) return fpB - fpA;
	if (isNum(a.fifaRank) && isNum(b.fifaRank) && a.fifaRank !== b.fifaRank)
		return a.fifaRank - b.fifaRank;
	return a._i - b._i;
}

// 全試合勝点が同じ同点群 codes を head-to-head で並べ替える。
// 当該チーム間 勝点→得失差→総得点 でグループ化し、分離できた塊は確定、
// なお並ぶサブ群には同じ基準を残ったチーム間で再適用（FIFA 規定の再帰）。
// head-to-head で全員同値なら overallCompare で決着する。
function breakTie(codes, rowByCode, matches) {
	if (codes.length <= 1) return codes.slice();
	const h = headToHead(codes, matches);
	const buckets = new Map();
	for (const c of codes) {
		const k = `${h[c].pts}|${h[c].gd}|${h[c].gf}`;
		if (!buckets.has(k)) buckets.set(k, []);
		buckets.get(k).push(c);
	}
	if (buckets.size === 1) {
		// head-to-head で全員同値 → 全試合基準で決着
		return codes
			.slice()
			.sort((x, y) => overallCompare(rowByCode[x], rowByCode[y]));
	}
	// バケットを head-to-head 成績の高い順に並べ、各バケット内は残った
	// チーム間で head-to-head を再計算（再帰）。
	const ordered = [...buckets.values()].sort((A, B) => {
		const a = A[0];
		const b = B[0];
		return h[b].pts - h[a].pts || h[b].gd - h[a].gd || h[b].gf - h[a].gf;
	});
	const out = [];
	for (const group of ordered) out.push(...breakTie(group, rowByCode, matches));
	return out;
}

// members: コード配列（空スロット可）, matches: [{a,b,ga,gb}]
// opts.fairPlay: { CODE: number }（フェアプレーポイント / 大きいほど上位・カード減点方式）
// opts.fifaRank: { CODE: number }（FIFAランキング順位 / 小さいほど上位）
// 返り値: [{code, played, w, d, l, gf, ga, gd, pts, fairPlay?, fifaRank?}] を
// FIFA 2026 のグループ順位決定基準でソート:
//   ①全試合の勝点 → ②当該チーム間の勝点 → ③当該チーム間の得失差
//   → ④当該チーム間の総得点 → ⑤全試合の得失差 → ⑥全試合の総得点
//   → ⑦フェアプレーポイント → ⑧FIFAランキング（⑦⑧はデータ未連携時は登録順）
export function computeStandings(members = [], matches = [], opts = {}) {
	const order = (members || []).filter(Boolean);
	const fairPlay = opts?.fairPlay || {};
	const fifaRank = opts?.fifaRank || {};
	const row = {};
	order.forEach((code, i) => {
		row[code] = {
			code,
			played: 0,
			w: 0,
			d: 0,
			l: 0,
			gf: 0,
			ga: 0,
			gd: 0,
			pts: 0,
			// ⑦⑧: 供給されたチームのみ値を持つ（未供給は undefined→比較スキップ）。
			fairPlay: isNum(fairPlay[code]) ? fairPlay[code] : undefined,
			fifaRank: isNum(fifaRank[code]) ? fifaRank[code] : undefined,
			_i: i,
		};
	});
	for (const m of matches || []) {
		if (!m || !row[m.a] || !row[m.b]) continue;
		if (!isNum(m.ga) || !isNum(m.gb)) continue; // 未消化
		const A = row[m.a],
			B = row[m.b];
		A.played++;
		B.played++;
		A.gf += m.ga;
		A.ga += m.gb;
		B.gf += m.gb;
		B.ga += m.ga;
		if (m.ga > m.gb) {
			A.w++;
			B.l++;
			A.pts += 3;
		} else if (m.ga < m.gb) {
			B.w++;
			A.l++;
			B.pts += 3;
		} else {
			A.d++;
			B.d++;
			A.pts++;
			B.pts++;
		}
	}
	order.forEach((c) => {
		row[c].gd = row[c].gf - row[c].ga;
	});

	// ①全試合の勝点で降順グループ化し、各同点群を head-to-head 等で確定する。
	const byPts = new Map();
	for (const c of order) {
		const p = row[c].pts;
		if (!byPts.has(p)) byPts.set(p, []);
		byPts.get(p).push(c);
	}
	const ranked = [];
	for (const p of [...byPts.keys()].sort((a, b) => b - a))
		ranked.push(...breakTie(byPts.get(p), row, matches));

	return ranked.map((c) => {
		const { _i, ...r } = row[c];
		return r;
	});
}

// 暫定グループ順位（採点用）。各グループの全チームが1試合以上消化したら
// computeStandings 順の top3 コード配列、未達なら空配列を返す。
// groupMatches[g] の ga/gb はライブスコアも含むため試合中も順位が動く。
// opts.fairPlay/opts.fifaRank は { CODE: 数値 }（タイブレーカー⑦⑧用 / 省略可）。
export function provisionalGroupResult(
	groups = {},
	groupMatches = {},
	opts = {},
) {
	const out = {};
	for (const g of Object.keys(groups || {})) {
		const members = (groups[g] || []).filter(Boolean);
		const rows = computeStandings(members, (groupMatches || {})[g] || [], opts);
		out[g] =
			members.length && rows.every((r) => r.played >= 1)
				? rows.slice(0, 3).map((r) => r.code)
				: [];
	}
	return out;
}
