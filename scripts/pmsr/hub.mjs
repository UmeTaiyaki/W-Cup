// FIFA Training Centre の Match Report Hub をスクレイプし、公開済みPMSRのPDF一覧を返す。
// https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php

const HUB_URL = "https://www.fifatrainingcentre.com/en/fifa-world-cup-2026/match-report-hub.php";
const BASE = "https://www.fifatrainingcentre.com";

// PDFファイル名から match番号とトリコードを抽出する。
//   "PMSR-M11-NED-V-JPN.pdf"        → { match:11, homeCode:"NED", awayCode:"JPN" }
//   "PMSR-M01 MEX V RSA.pdf"(旧式)   → { match:1,  homeCode:"MEX", awayCode:"RSA" }
export function parsePmsrFilename(name) {
	const base = decodeURIComponent(name).replace(/\.pdf$/i, "");
	// 区切りは "-" または空白の混在を許容
	const m = base.match(/PMSR[-\s]*M0*(\d+)[-\s]+([A-Z]{3})[-\s]+V[-\s]+([A-Z]{3})/i);
	if (!m) return null;
	return { match: Number(m[1]), homeCode: m[2].toUpperCase(), awayCode: m[3].toUpperCase() };
}

// hub から公開済みPDFを列挙。返り値: [{ match, homeCode, awayCode, pdfUrl }]
export async function fetchHub() {
	const res = await fetch(HUB_URL, { headers: { "user-agent": "Mozilla/5.0 (pmsr-ingest)" } });
	if (!res.ok) throw new Error("hub fetch " + res.status);
	const html = await res.text();
	const hrefs = [...html.matchAll(/href="([^"]*PMSR[^"]*\.pdf)"/gi)].map((m) => m[1]);
	const seen = new Set();
	const out = [];
	for (const href of hrefs) {
		const url = href.startsWith("http") ? href : BASE + href;
		if (seen.has(url)) continue;
		seen.add(url);
		const fname = url.split("/").pop();
		const parsed = parsePmsrFilename(fname);
		if (!parsed) continue;
		out.push({ ...parsed, pdfUrl: url });
	}
	out.sort((a, b) => a.match - b.match);
	return out;
}
