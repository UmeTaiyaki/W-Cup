// sm_* 行 → 採点が読む result/groupMatches への純導出（大会結果自動反映）
// 不変条件: 副作用なし。壊れた/欠損入力でも例外を投げず空・null で返す（障害隔離）。
// FT確定ルール: 採点に効く確定値は status==="FT" の試合からのみ。順位表表示はライブ込み。

// 突合用に round 名を正規化（小文字化・英数のみ）
function normRound(s) {
	return String(s == null ? "" : s)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

// SportMonks round/stage 名 → アプリのノックアウト到達キー。群リーグ・決勝・3位決定は null。
export function roundKey(roundName) {
	const n = normRound(roundName);
	if (n === "roundof32") return "r32";
	if (n === "roundof16") return "r16";
	if (n === "quarterfinals") return "qf";
	if (n === "semifinals") return "sf";
	return null;
}

// 決勝のみ true。"3rd Place Final" を誤検出しないため完全一致で判定。
export function isFinalRound(roundName) {
	return normRound(roundName) === "final";
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// 各グループに属する fixtures（両 app_code が同一グループ）のスコアを {a,b,ga,gb} 配列で返す。
// 順位表「表示」用なのでライブ(LIVE/FT)のスコアを含める。NS/スコア欠落は除外。
export function deriveGroupMatches(fixtures, groups) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const out = {};
	for (const g of Object.keys(groups || {})) {
		const members = new Set((groups[g] || []).filter(Boolean));
		out[g] = [];
		for (const fx of list) {
			const a = fx?.home?.app_code,
				b = fx?.away?.app_code;
			if (!a || !b || !members.has(a) || !members.has(b)) continue;
			const ga = fx?.home?.score,
				gb = fx?.away?.score;
			if (!isNum(ga) || !isNum(gb)) continue;
			out[g].push({ a, b, ga, gb });
		}
	}
	return out;
}

// 勝点→得失点差→総得点→登録順。FT試合のみ集計（採点用）。
function standingsFT(members, fixtures) {
	const order = (members || []).filter(Boolean);
	const row = {};
	order.forEach((c, i) => {
		row[c] = { c, pts: 0, gf: 0, ga: 0, _i: i };
	});
	for (const fx of fixtures || []) {
		if (fx?.status !== "FT") continue;
		const a = fx?.home?.app_code,
			b = fx?.away?.app_code;
		const ga = fx?.home?.score,
			gb = fx?.away?.score;
		if (!row[a] || !row[b] || !isNum(ga) || !isNum(gb)) continue;
		row[a].gf += ga;
		row[a].ga += gb;
		row[b].gf += gb;
		row[b].ga += ga;
		if (ga > gb) row[a].pts += 3;
		else if (ga < gb) row[b].pts += 3;
		else {
			row[a].pts += 1;
			row[b].pts += 1;
		}
	}
	return order
		.map((c) => row[c])
		.sort(
			(x, y) =>
				y.pts - x.pts ||
				y.gf - y.ga - (x.gf - x.ga) ||
				y.gf - x.gf ||
				x._i - y._i,
		);
}

// 全試合（4チーム総当たり=6試合）がFTのグループのみ、上位3コードを返す。未完は空配列。
export function deriveGroupResult(fixtures, groups) {
	const list = Array.isArray(fixtures) ? fixtures : [];
	const out = {};
	for (const g of Object.keys(groups || {})) {
		const members = (groups[g] || []).filter(Boolean);
		const ftCount = list.filter((fx) => {
			if (fx?.status !== "FT") return false;
			const a = fx?.home?.app_code,
				b = fx?.away?.app_code;
			return members.includes(a) && members.includes(b);
		}).length;
		const expected = (members.length * (members.length - 1)) / 2;
		out[g] =
			ftCount >= expected && expected > 0
				? standingsFT(members, list)
						.slice(0, 3)
						.map((r) => r.c)
				: [];
	}
	return out;
}
