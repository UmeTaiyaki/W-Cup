// API-Football v3 の薄いクライアント。throw せず {status, json} を返す（呼び出し側が 429 等を判断）。
const AF_BASE = "https://v3.football.api-sports.io";

export function makeAfClient({ token, fetchImpl } = {}) {
	if (!token)
		throw new Error("apifootball: token required (APIFOOTBALL_TOKEN)");
	const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
	if (!doFetch) throw new Error("apifootball: no fetch available");
	return {
		async get(path) {
			try {
				const res = await doFetch(`${AF_BASE}${path}`, {
					headers: { "x-apisports-key": token },
				});
				let json = null;
				try {
					json = await res.json();
				} catch {
					json = null;
				}
				return { status: res.status, json };
			} catch {
				return { status: 0, json: null };
			}
		},
	};
}
