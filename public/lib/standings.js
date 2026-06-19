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

// FT のみ決着済み。LIVE/未開催は残り（未確定）扱い。
function isSettled(m) {
	return m && m.status === "FT" && isNum(m.ga) && isNum(m.gb);
}
const _pairKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);

// members（最大4）と matches から各チームの突破/敗退クリンチ状態を返す。
// 残り試合（FT以外）の全 W/D/L シナリオ（3^n, n≤6）を列挙する勝点ベースの保守判定。
// 同点は「上位候補（>=）」として数え、確定と判定したものは必ず正しい。
// 返り値: { [code]: { qualified, won, eliminated, secondLocked } }
//   qualified    : 2位以内確定（突破確定）
//   won          : 単独1位確定
//   eliminated   : 2位以内不可能（敗退確定）
//   secondLocked : ちょうど2位で確定（ブラケットA2配置用）
export function computeClinchStatus(members = [], matches = []) {
	const teams = (members || []).filter(Boolean);
	const out = {};
	for (const c of teams)
		out[c] = {
			qualified: false,
			won: false,
			eliminated: false,
			secondLocked: false,
		};
	if (teams.length < 2) return out;

	// 決着済み試合の確定勝点
	const basePts = {};
	for (const c of teams) basePts[c] = 0;
	const settled = new Set();
	for (const m of matches || []) {
		if (!isSettled(m)) continue;
		if (!(m.a in basePts) || !(m.b in basePts)) continue;
		settled.add(_pairKey(m.a, m.b));
		if (m.ga > m.gb) basePts[m.a] += 3;
		else if (m.ga < m.gb) basePts[m.b] += 3;
		else {
			basePts[m.a] += 1;
			basePts[m.b] += 1;
		}
	}

	// 残り試合 = 全ペアリング − 決着済み
	const remaining = generateFixtures(teams).filter(
		(p) => !settled.has(_pairKey(p.a, p.b)),
	);

	const agg = {};
	for (const c of teams) agg[c] = { maxGe: 0, minGt: Infinity };

	const n = remaining.length;
	const total = 3 ** n;
	for (let s = 0; s < total; s++) {
		const pts = { ...basePts };
		let x = s;
		for (let i = 0; i < n; i++) {
			const o = x % 3;
			x = (x / 3) | 0;
			const { a, b } = remaining[i];
			if (o === 0)
				pts[a] += 3; // home勝
			else if (o === 2)
				pts[b] += 3; // away勝
			else {
				pts[a] += 1; // 引分
				pts[b] += 1;
			}
		}
		for (const c of teams) {
			let ge = 0;
			let gt = 0;
			for (const d of teams) {
				if (d === c) continue;
				if (pts[d] >= pts[c]) ge++;
				if (pts[d] > pts[c]) gt++;
			}
			if (ge > agg[c].maxGe) agg[c].maxGe = ge;
			if (gt < agg[c].minGt) agg[c].minGt = gt;
		}
	}

	for (const c of teams) {
		const a = agg[c];
		if (a.minGt === Infinity) a.minGt = 0;
		out[c].qualified = a.maxGe <= 1; // 全シナリオで自分以上が1以下→top2確定
		out[c].won = a.maxGe === 0; // 全シナリオで自分以上が0→単独1位確定
		out[c].eliminated = a.minGt >= 2; // 全シナリオで自分超が2以上→top2不可
		out[c].secondLocked = out[c].qualified && a.minGt >= 1; // top2確定かつ常時1チーム上→ちょうど2位
	}
	return out;
}

// 全グループのクリンチ状態を一括算出。
// 返り値: { [g]: { [code]: {qualified, won, eliminated, secondLocked} } }
export function computeAllClinch(groups = {}, groupMatches = {}) {
	const out = {};
	for (const g of Object.keys(groups || {})) {
		out[g] = computeClinchStatus(
			(groups[g] || []).filter(Boolean),
			(groupMatches || {})[g] || [],
		);
	}
	return out;
}

// ブラケット用：確定スロットのみ埋めた groupRank を返す。
// base[g]（GROUP_RESULT。全試合確定後の最終順位）に値があればそれを優先、
// 無ければクリンチ判定で 1位確定→[0]、2位確定→[1] のみ埋める（3位は常に null）。
// 返り値: { [g]: [first|null, second|null, null] }
export function clinchGroupRank(groups = {}, groupMatches = {}, base = {}) {
	const out = {};
	const clinch = computeAllClinch(groups, groupMatches);
	for (const g of Object.keys(groups || {})) {
		const b = (base || {})[g];
		if (Array.isArray(b) && b.filter(Boolean).length) {
			out[g] = b.slice();
			continue;
		}
		const st = clinch[g] || {};
		let first = null;
		let second = null;
		for (const c of Object.keys(st)) {
			if (st[c].won) first = c;
			else if (st[c].secondLocked) second = c;
		}
		out[g] = [first, second, null];
	}
	return out;
}
