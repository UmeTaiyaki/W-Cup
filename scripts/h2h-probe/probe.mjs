// 使い捨て: SportMonks H2H の実レスポンス構造を確認する。
// 実行: SPORTMONKS_TOKEN=xxx node scripts/h2h-probe/probe.mjs <teamId1> <teamId2>
const token = process.env.SPORTMONKS_TOKEN;
if (!token) throw new Error("SPORTMONKS_TOKEN required");
const [, , t1 = "18", t2 = "83"] = process.argv; // 既定は適当な2チーム
const base = "https://api.sportmonks.com/v3/football";
const url = `${base}/fixtures/head-to-head/${t1}/${t2}?include=participants;scores`;
const res = await fetch(url, { headers: { Authorization: token } });
console.log("status", res.status);
const body = await res.json();
const first = Array.isArray(body?.data) ? body.data[0] : null;
console.log("count", Array.isArray(body?.data) ? body.data.length : "n/a");
console.log("first fixture keys", first ? Object.keys(first) : null);
console.log(JSON.stringify(first, null, 2).slice(0, 4000));
