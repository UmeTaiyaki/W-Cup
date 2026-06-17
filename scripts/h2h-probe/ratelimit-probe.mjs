// 使い捨て: API-Football を高速連打し、per-minute 超過時のレスポンス形(status/errors/response長)を確認する。
// 実行: APIFOOTBALL_TOKEN=xxx node scripts/h2h-probe/ratelimit-probe.mjs
const token = process.env.APIFOOTBALL_TOKEN;
if (!token) throw new Error("APIFOOTBALL_TOKEN required");
const base = "https://v3.football.api-sports.io";
const headers = { "x-apisports-key": token };
// 履歴のある組(ENG-CRO=10-3, NED-SWE=1118-5, MEX-KOR=16-17, GER-NED=25-1118)を連打
const pairs = ["10-3", "1118-5", "16-17", "25-1118", "2-25", "9-25", "26-6", "10-2", "27-2", "13-31", "12-16", "6-7"];
for (const h2h of pairs) {
	const res = await fetch(`${base}/fixtures/headtohead?h2h=${h2h}`, { headers });
	let json = null;
	try {
		json = await res.json();
	} catch {}
	const arr = Array.isArray(json?.response) ? json.response : [];
	const errs = json?.errors;
	const hasErr = errs && (Array.isArray(errs) ? errs.length : Object.keys(errs).length);
	console.log(
		`h2h=${h2h}: status=${res.status} response=${arr.length}件 errors=${hasErr ? JSON.stringify(errs) : "なし"}`,
	);
}
