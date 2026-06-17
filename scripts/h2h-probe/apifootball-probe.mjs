// 使い捨て: API-Football(無料枠)のH2Hが「通算(深い歴史)」をどれだけ返すか実測する。
// 実行: APIFOOTBALL_TOKEN=xxx node scripts/h2h-probe/apifootball-probe.mjs
// 目的: SportMonksでGER-NED=0だった組などが、API-Footballの無料枠で何戦返るかを確認。
const token = process.env.APIFOOTBALL_TOKEN;
if (!token) throw new Error("APIFOOTBALL_TOKEN required");

// api-football.com ダッシュボード直契約のホスト/ヘッダ。RapidAPI経由なら別ホスト。
const base = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": token };

async function get(path) {
	const res = await fetch(`${base}${path}`, { headers });
	const json = await res.json();
	return { status: res.status, json };
}

// 国代表のチームIDを名前で解決(national=true のみ)。clubと衝突しないように絞る。
async function resolveNationalId(name) {
	const { json } = await get(`/teams?search=${encodeURIComponent(name)}`);
	const list = Array.isArray(json?.response) ? json.response : [];
	const nat = list.find((x) => x?.team?.national === true) || list[0];
	return nat ? { id: nat.team.id, name: nat.team.name } : null;
}

// 検証する組(SportMonksでの返却数を併記)
const pairs = [
	["Germany", "Netherlands"], // SM: 0
	["Japan", "USA"], // SM: 0
	["France", "Germany"], // SM: 1
	["England", "Germany"], // SM: 1
	["Argentina", "Brazil"], // SM: 9
	["Spain", "Germany"], // SM: 2
];

// 名前→ID解決(重複は1回)
const names = [...new Set(pairs.flat())];
const idByName = {};
for (const n of names) {
	const r = await resolveNationalId(n);
	idByName[n] = r;
	console.log(`resolve ${n}:`, r ? `${r.id} (${r.name})` : "NOT FOUND");
}

console.log("\n=== HEAD-TO-HEAD (API-Football 無料枠) ===");
for (const [a, b] of pairs) {
	const ia = idByName[a];
	const ib = idByName[b];
	if (!ia || !ib) {
		console.log(`${a} vs ${b}: ID未解決でスキップ`);
		continue;
	}
	const { status, json } = await get(`/fixtures/headtohead?h2h=${ia.id}-${ib.id}`);
	const arr = Array.isArray(json?.response) ? json.response : [];
	const years = arr
		.map((f) => f?.fixture?.date?.slice(0, 4))
		.filter(Boolean);
	const minY = years.length ? Math.min(...years.map(Number)) : "-";
	const maxY = years.length ? Math.max(...years.map(Number)) : "-";
	const errs = json?.errors;
	const errStr =
		errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length)
			? ` errors=${JSON.stringify(errs)}`
			: "";
	console.log(
		`${a} vs ${b}: ${arr.length}戦 (期間 ${minY}〜${maxY}) status=${status}${errStr}`,
	);
}
