// 使い捨て: build-af-map で解決できなかった代表を代替検索語で解決する。
// 実行: APIFOOTBALL_TOKEN=xxx node scripts/h2h-probe/resolve-extra.mjs
const token = process.env.APIFOOTBALL_TOKEN;
if (!token) throw new Error("APIFOOTBALL_TOKEN required");
const base = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": token };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const probes = {
	BIH: ["Bosnia"],
	CIV: ["Ivory Coast", "Cote"],
	CZE: ["Czechia", "Czech"],
	TUR: ["Turkey", "Turkiye"],
	KOR: ["South Korea", "Korea"],
	USA: ["USA", "United States"],
};

for (const [code, terms] of Object.entries(probes)) {
	const hits = [];
	for (const term of terms) {
		const r = await (
			await fetch(`${base}/teams?search=${encodeURIComponent(term)}`, { headers })
		).json();
		const list = Array.isArray(r?.response) ? r.response : [];
		const nat = list
			.filter((x) => x?.team?.national === true)
			.map((x) => `${x.team.id}:${x.team.name}`);
		hits.push(`[${term}] ${nat.join(" | ") || "(なし)"}`);
		await sleep(7000);
	}
	console.log(code, "->", hits.join("  ;  "));
}
