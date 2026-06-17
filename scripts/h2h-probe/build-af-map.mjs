// 使い捨て寄り: 本番 sm_teams の app_code/name から API-Football の国代表 team id を解決して JSON 出力。
// 実行: APIFOOTBALL_TOKEN=xxx node scripts/h2h-probe/build-af-map.mjs '<teams-json>'
// teams-json は [{app_code,name}, ...]（wrangler d1 で取得して渡す）。
const token = process.env.APIFOOTBALL_TOKEN;
if (!token) throw new Error("APIFOOTBALL_TOKEN required");
const teams = JSON.parse(process.argv[2] || "[]");
const base = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": token };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const out = {};
for (const t of teams) {
	const res = await fetch(`${base}/teams?search=${encodeURIComponent(t.name)}`, { headers });
	const json = await res.json();
	const list = Array.isArray(json?.response) ? json.response : [];
	// 国代表を優先。男子(women を名前で除外)を優先。
	const nat = list.filter((x) => x?.team?.national === true);
	const male = nat.find((x) => !/\bW\b|women/i.test(x.team.name || "")) || nat[0];
	out[t.app_code] = male
		? { af_id: male.team.id, af_name: male.team.name, candidates: nat.map((x) => `${x.team.id}:${x.team.name}`) }
		: { af_id: null, af_name: null, candidates: list.map((x) => `${x.team.id}:${x.team.name}`) };
	console.error(`${t.app_code} ${t.name} -> ${JSON.stringify(out[t.app_code])}`);
	await sleep(7000); // per-minute(≈10) 回避
}
console.log(JSON.stringify(out, null, 2));
