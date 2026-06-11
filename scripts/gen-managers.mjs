// W杯2026 各国代表監督を Vertex AI(検索グラウンディング)で「チームごとに」取得し、
// public/data/ai-teams.json の各チームに manager を付与する。
//
// 一括取得は学習知識の古さに引っ張られ精度が低いため、必ずチーム単位で取得する。
//
// 使い方:
//   GCP_TOKEN_FILE=/tmp/gtok node scripts/gen-managers.mjs --project <GCP_PROJECT> \
//     --base https://wcup2026-yosou.pages.dev [--only JPN,BRA] [--delay 1500]
// 注意: ネットワーク／課金。サンドボックス外で実行。アクセストークンは ~1時間で失効。

import { readFile, writeFile } from "node:fs/promises";
import { sanitizeText } from "./lib/sanitize-text.mjs";

const OUT = new URL("../public/data/ai-teams.json", import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
	const a = { base: "http://127.0.0.1:8788", only: null, project: null, location: "global", delay: 1500, model: "gemini-2.5-pro" };
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === "--base") a.base = argv[++i];
		else if (v === "--only") a.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
		else if (v === "--project") a.project = argv[++i];
		else if (v === "--location") a.location = argv[++i];
		else if (v === "--delay") a.delay = Number(argv[++i]) || 0;
		else if (v === "--model") a.model = argv[++i];
	}
	return a;
}

async function fetchManager({ token, project, location, model, teamName }) {
	const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
	const prompt = `${teamName}サッカー代表チームの、2026年6月時点の現在の監督(head coach)は誰ですか。直近2024〜2025年に監督が交代している可能性が高いため、必ず最新情報を検索で確認してください。回答は監督の氏名のみを日本語表記(カタカナ可)で1行だけ。肩書き・説明文・敬称・引用番号・記号は付けないこと。`;
	const res = await fetch(url, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ googleSearch: {} }], generationConfig: { temperature: 0 } }),
	});
	if (!res.ok) throw new Error(`Vertex HTTP ${res.status}`);
	const j = await res.json();
	const raw = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
	const line = sanitizeText(raw).split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
	return line.replace(/\s+/g, " ").trim();
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const tf = process.env.GCP_TOKEN_FILE;
	const token = tf ? (await readFile(tf, "utf8")).trim() : process.env.GCP_ACCESS_TOKEN;
	if (!token || !args.project) {
		console.error("GCP_TOKEN_FILE(または GCP_ACCESS_TOKEN) と --project が必要です。");
		process.exit(1);
	}

	const cfg = await (await fetch(`${args.base}/api/config`)).json();
	const ja = Object.fromEntries((cfg.teams || []).map((t) => [t.code, t.ja || t.code]));
	const doc = JSON.parse(await readFile(OUT, "utf8"));
	const codes = (args.only || Object.keys(doc.teams)).filter((c) => doc.teams[c]);

	const failed = [];
	for (const code of codes) {
		let m = "";
		for (let a = 1; a <= 3 && !m; a++) {
			try {
				m = await fetchManager({ token, project: args.project, location: args.location, model: args.model, teamName: ja[code] || code });
			} catch (e) {
				console.error(`  ${code} 試行${a}: ${e.message}`);
				await sleep(3000);
			}
			if (!m && a < 3) await sleep(2000);
		}
		if (m) {
			doc.teams[code].manager = m;
			console.log(`✓ ${code} ${ja[code]}: ${m}`);
		} else {
			failed.push(code);
			console.error(`✗ ${code} 取得失敗`);
		}
		await sleep(args.delay);
	}

	await writeFile(OUT, JSON.stringify(doc, null, 2) + "\n", "utf8");
	console.log(`\n付与: ${codes.length - failed.length}/${codes.length}  失敗: ${failed.join(",") || "なし"}`);
	if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
