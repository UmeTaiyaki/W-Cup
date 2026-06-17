// 使い捨て: API-Football H2H を解決済みIDで叩く(per-minute制限回避のため内部で間隔を空ける)。
// 実行: APIFOOTBALL_TOKEN=xxx node scripts/h2h-probe/apifootball-h2h-only.mjs
const token = process.env.APIFOOTBALL_TOKEN;
if (!token) throw new Error("APIFOOTBALL_TOKEN required");
const base = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": token };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 前回 resolve で得た国代表ID(national=true)。USAは男子代表に修正。
const ID = {
	Germany: 25,
	Netherlands: 1118,
	France: 2,
	England: 10,
	Argentina: 26,
	Brazil: 6,
	Spain: 9,
	Japan: 12,
	USA: 2384,
};
// [a, b, SMでの返却数]
const pairs = [
	["Germany", "Netherlands", 0],
	["Japan", "USA", 0],
	["France", "Germany", 1],
	["England", "Germany", 1],
	["Argentina", "Brazil", 9],
	["Spain", "Germany", 2],
];

console.log("(per-minute制限回避: 各H2Hの間に8秒待機)\n");
await sleep(20000); // 直前probeのminute窓をリセット
for (const [a, b, sm] of pairs) {
	const res = await fetch(`${base}/fixtures/headtohead?h2h=${ID[a]}-${ID[b]}`, {
		headers,
	});
	const json = await res.json();
	const arr = Array.isArray(json?.response) ? json.response : [];
	const years = arr.map((f) => Number(f?.fixture?.date?.slice(0, 4))).filter(Boolean);
	const minY = years.length ? Math.min(...years) : "-";
	const maxY = years.length ? Math.max(...years) : "-";
	const errs = json?.errors;
	const hasErr = errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length);
	console.log(
		`${a} vs ${b}: API-Football ${arr.length}戦 (${minY}〜${maxY})  [SportMonks ${sm}戦]${hasErr ? " ERR=" + JSON.stringify(errs) : ""}`,
	);
	await sleep(8000);
}
