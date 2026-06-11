// W杯2026 チームAI分析の生成スクリプト（完全静的・焼き込み）。
//
// 使い方:
//   CF_ACCOUNT_ID=xxx CF_AI_TOKEN=yyy \
//     node scripts/gen-ai-teams.mjs --base https://wcup2026-yosou.pages.dev [--only JPN,BRA] [--with-live] [--model @cf/meta/llama-3.3-70b-instruct]
//
// 入力: <base>/api/config（teams/squads/groups/schedule）。--with-live 時は <base>/api/live。
// 出力: public/data/ai-teams.json（既存があれば成功チームのみ部分マージ）。
// 注意: ネットワーク／課金が発生する。サンドボックス外で実行すること。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildTeamPrompt } from "./lib/ai-team-prompt.mjs";
import { validateTeam, unknownPicks } from "../public/lib/ai-analysis.js";

const OUT = new URL("../public/data/ai-teams.json", import.meta.url);
const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function parseArgs(argv) {
	const a = { base: "http://127.0.0.1:8788", only: null, withLive: false, model: DEFAULT_MODEL };
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === "--base") a.base = argv[++i];
		else if (v === "--only") a.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
		else if (v === "--with-live") a.withLive = true;
		else if (v === "--model") a.model = argv[++i];
	}
	return a;
}

async function fetchJson(url, label) {
	const res = await fetch(url, { headers: { "User-Agent": "wcup-ai-gen/1.0" } });
	if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
	return res.json();
}

// 出力JSONスキーマ（response_format で構造化出力を強制し、壊れたJSONを防ぐ）。
const RESPONSE_SCHEMA = {
	type: "object",
	properties: {
		summary: { type: "string" },
		sections: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					heading: { type: "string" },
					body: { type: "string" },
					picks: { type: "array", items: { type: "string" } },
				},
				required: ["id", "heading", "body"],
			},
		},
	},
	required: ["summary", "sections"],
};

// Workers AI REST 呼び出し。json_schema 指定時は構造化出力（オブジェクト）を、
// それ以外は応答テキスト（文字列）を返す。呼び出し側で型を見て扱う。
async function callWorkersAI({ accountId, token, model, prompt }) {
	const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
	const res = await fetch(url, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			messages: [{ role: "user", content: prompt }],
			response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
		}),
	});
	if (!res.ok) throw new Error(`Workers AI HTTP ${res.status}: ${await res.text()}`);
	const json = await res.json();
	const out = json && json.result && json.result.response;
	if (out == null || (typeof out === "string" && !out.trim()))
		throw new Error("Workers AI: 応答が空");
	return out; // object（構造化出力）or string
}

// モデル出力から JSON オブジェクトを抽出してパース。
function parseModelJson(text) {
	let s = String(text).trim();
	s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
	const start = s.indexOf("{");
	const end = s.lastIndexOf("}");
	if (start === -1 || end === -1) throw new Error("出力にJSONオブジェクトが無い");
	return JSON.parse(s.slice(start, end + 1));
}

// schedule から teamCode の試合を date 昇順で抽出。
function teamFixtures(schedule, teamCode) {
	return (Array.isArray(schedule) ? schedule : [])
		.filter((m) => m && (m.a === teamCode || m.b === teamCode))
		.sort((x, y) => String(x.date || "").localeCompare(String(y.date || "")));
}

// /api/live から teamCode の終了済み試合を要約文字列にする。無ければ null。
function liveSummaryFor(live, teamCode, byCode) {
	if (!live || !Array.isArray(live.fixtures)) return null;
	const lines = [];
	for (const fx of live.fixtures) {
		const ha = fx.home && fx.home.app_code;
		const aa = fx.away && fx.away.app_code;
		if (ha !== teamCode && aa !== teamCode) continue;
		if (fx.status !== "FT") continue;
		const oppCode = ha === teamCode ? aa : ha;
		const oppName = (byCode && byCode[oppCode]) || oppCode;
		const me = ha === teamCode ? fx.home.score : fx.away.score;
		const op = ha === teamCode ? fx.away.score : fx.home.score;
		lines.push(`- vs ${oppName} ${me}-${op}${fx.result_info ? `（${fx.result_info}）` : ""}`);
	}
	return lines.length ? lines.join("\n") : null;
}

async function loadExisting() {
	try {
		return JSON.parse(await readFile(OUT, "utf8"));
	} catch {
		return { teams: {} };
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const accountId = process.env.CF_ACCOUNT_ID;
	const token = process.env.CF_AI_TOKEN;
	if (!accountId || !token) {
		console.error("CF_ACCOUNT_ID と CF_AI_TOKEN を環境変数に設定してください。");
		process.exit(1);
	}

	console.log(`config 取得: ${args.base}/api/config`);
	const cfg = await fetchJson(`${args.base}/api/config`, "config");
	const teams = Array.isArray(cfg.teams) ? cfg.teams : [];
	const squads = cfg.squads || {};
	const groups = cfg.groups || {};
	const schedule = Array.isArray(cfg.schedule) ? cfg.schedule : [];
	const byCode = {};
	teams.forEach((t) => { byCode[t.code] = t.ja || t.code; });
	const groupOf = (code) =>
		Object.keys(groups).find((k) => Array.isArray(groups[k]) && groups[k].includes(code)) || null;

	let live = null;
	if (args.withLive) {
		try { live = await fetchJson(`${args.base}/api/live`, "live"); }
		catch (e) { console.error(`live 取得失敗（journey 省略）: ${e.message}`); }
	}

	const targetCodes = (args.only || teams.map((t) => t.code)).filter((c) => byCode[c]);
	const existing = await loadExisting();
	const out = {
		generatedAt: new Date().toISOString(),
		model: args.model,
		teams: { ...(existing.teams || {}) },
	};

	const failed = [];
	for (const code of targetCodes) {
		const squad = squads[code] || [];
		const prompt = buildTeamPrompt({
			team: { code, ja: byCode[code] },
			group: groupOf(code),
			fixtures: teamFixtures(schedule, code),
			squad,
			byCode,
			liveSummary: live ? liveSummaryFor(live, code, byCode) : null,
		});

		let ok = false;
		for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
			try {
				const raw = await callWorkersAI({ accountId, token, model: args.model, prompt });
				const parsed = typeof raw === "string" ? parseModelJson(raw) : raw;
				const errs = validateTeam(parsed);
				const bad = unknownPicks(parsed, squad);
				if (errs.length) throw new Error(`検証NG: ${errs.join("; ")}`);
				if (bad.length) throw new Error(`名簿外選手: ${bad.join(", ")}`);
				out.teams[code] = parsed;
				ok = true;
				console.log(`✓ ${code}`);
			} catch (e) {
				console.error(`  ${code} 試行${attempt} 失敗: ${e.message}`);
			}
		}
		if (!ok) failed.push(code);
	}

	await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
	await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
	console.log(`書き込み: public/data/ai-teams.json（${Object.keys(out.teams).length} チーム）`);
	if (failed.length) {
		console.error(`\n失敗 ${failed.length} チーム: ${failed.join(", ")}`);
		process.exit(1);
	}
}

main().catch((e) => { console.error(e); process.exit(1); });
