// W杯2026 チームAI分析の生成スクリプト（完全静的・焼き込み）。
//
// 使い方:
//   [Workers AI] CF_ACCOUNT_ID=xxx CF_AI_TOKEN=yyy \
//     node scripts/gen-ai-teams.mjs --base <url> [--only JPN,BRA] [--with-live] [--model <slug>]
//   [Gemini]     GEMINI_API_KEY=zzz \
//     node scripts/gen-ai-teams.mjs --provider gemini --base <url> [--only ...] [--delay 1000]
//
// --provider workers(既定) | gemini。gemini は Google検索グラウンディング有効＋
//   既定モデル gemini-2.5-pro。--delay はチーム間待機ms（無料枠レート制限対策）。
// 入力: <base>/api/config（teams/squads/groups/schedule）。--with-live 時は <base>/api/live。
// 出力: public/data/ai-teams.json（既存があれば成功チームのみ部分マージ）。
// 注意: ネットワーク／課金が発生する。サンドボックス外で実行すること。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildTeamPrompt } from "./lib/ai-team-prompt.mjs";
import { sanitizeTeam } from "./lib/sanitize-text.mjs";
import { validateTeam, unknownPicks } from "../public/lib/ai-analysis.js";

const OUT = new URL("../public/data/ai-teams.json", import.meta.url);
const DEFAULT_WORKERS_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";
const DEFAULT_VERTEX_MODEL = "gemini-2.5-pro";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
	const a = {
		base: "http://127.0.0.1:8788",
		only: null,
		withLive: false,
		provider: "workers", // workers | gemini | vertex
		model: null,
		delay: 0, // チーム間の待機ms（レート制限対策）
		project: null, // vertex: GCP プロジェクトID
		location: "global", // vertex: ロケーション
		mustPicks: null, // 注目選手を固定（名簿表記の配列。--only と併用想定）
	};
	for (let i = 0; i < argv.length; i++) {
		const v = argv[i];
		if (v === "--base") a.base = argv[++i];
		else if (v === "--only") a.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
		else if (v === "--with-live") a.withLive = true;
		else if (v === "--provider") a.provider = argv[++i];
		else if (v === "--model") a.model = argv[++i];
		else if (v === "--delay") a.delay = Number(argv[++i]) || 0;
		else if (v === "--project") a.project = argv[++i];
		else if (v === "--location") a.location = argv[++i];
		else if (v === "--must-picks") a.mustPicks = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
	}
	if (!a.model)
		a.model =
			a.provider === "vertex"
				? DEFAULT_VERTEX_MODEL
				: a.provider === "gemini"
					? DEFAULT_GEMINI_MODEL
					: DEFAULT_WORKERS_MODEL;
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

// Gemini API 呼び出し（Google検索グラウンディング有効）。応答テキスト（文字列）を返す。
// グラウンディング使用時は JSON モード(responseSchema)を併用できないため、
// 本文から parseModelJson で JSON を抽出する。
async function callGemini({ apiKey, model, prompt }) {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
	const res = await fetch(url, {
		method: "POST",
		headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
		body: JSON.stringify({
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			tools: [{ google_search: {} }],
			generationConfig: { temperature: 0.7 },
		}),
	});
	if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
	return extractGeminiText(await res.json(), "Gemini");
}

// Vertex AI（GCP）呼び出し。OAuthアクセストークン＋プロジェクトIDで認証。
// Gemini Developer API と同じ GenerateContent スキーマ。Google検索グラウンディング有効。
async function callVertex({ token, project, location, model, prompt }) {
	const url = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
	const res = await fetch(url, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			tools: [{ googleSearch: {} }],
			generationConfig: { temperature: 0.7 },
		}),
	});
	if (!res.ok) throw new Error(`Vertex HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
	return extractGeminiText(await res.json(), "Vertex");
}

// Gemini/Vertex の generateContent 応答から本文テキストを取り出す。
function extractGeminiText(json, label) {
	const cand = json && json.candidates && json.candidates[0];
	const parts = cand && cand.content && cand.content.parts;
	const text = Array.isArray(parts) ? parts.map((p) => p.text || "").join("") : "";
	if (!text.trim()) {
		const fr = cand && cand.finishReason;
		throw new Error(`${label}: 応答が空${fr ? `（finishReason=${fr}）` : ""}`);
	}
	return text;
}

// モデル出力から JSON オブジェクトを抽出してパース。
// コードフェンス除去 → 最初の{〜最後の} を切り出し、失敗時は末尾カンマ等を軽修復して再試行。
function parseModelJson(text) {
	let s = String(text).trim();
	s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
	const start = s.indexOf("{");
	const end = s.lastIndexOf("}");
	if (start === -1 || end === -1) throw new Error("出力にJSONオブジェクトが無い");
	const body = s.slice(start, end + 1);
	try {
		return JSON.parse(body);
	} catch {
		// LLM 由来の軽微な崩れ（配列/オブジェクト末尾の余分なカンマ）を修復して再試行。
		return JSON.parse(body.replace(/,(\s*[}\]])/g, "$1"));
	}
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
	const provider = args.provider;
	let accountId, token, geminiKey, vertexToken, vertexProject;
	if (provider === "gemini") {
		geminiKey = process.env.GEMINI_API_KEY;
		if (!geminiKey) {
			console.error("GEMINI_API_KEY を環境変数に設定してください。");
			process.exit(1);
		}
	} else if (provider === "vertex") {
		// トークンは GCP_TOKEN_FILE(パス) 優先、無ければ GCP_ACCESS_TOKEN。
		const tf = process.env.GCP_TOKEN_FILE;
		vertexToken = tf ? (await readFile(tf, "utf8")).trim() : process.env.GCP_ACCESS_TOKEN;
		vertexProject = args.project || process.env.GCP_PROJECT;
		if (!vertexToken || !vertexProject) {
			console.error("Vertex: GCP_TOKEN_FILE(または GCP_ACCESS_TOKEN) と --project(または GCP_PROJECT) が必要です。");
			process.exit(1);
		}
	} else {
		accountId = process.env.CF_ACCOUNT_ID;
		token = process.env.CF_AI_TOKEN;
		if (!accountId || !token) {
			console.error("CF_ACCOUNT_ID と CF_AI_TOKEN を環境変数に設定してください。");
			process.exit(1);
		}
	}
	console.log(`provider=${provider} model=${args.model}${provider === "vertex" ? ` project=${vertexProject} location=${args.location}` : ""}`);

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
			mustPicks: args.mustPicks,
		});

		let ok = false;
		for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
			try {
				const raw =
					provider === "gemini"
						? await callGemini({ apiKey: geminiKey, model: args.model, prompt })
						: provider === "vertex"
							? await callVertex({ token: vertexToken, project: vertexProject, location: args.location, model: args.model, prompt })
							: await callWorkersAI({ accountId, token, model: args.model, prompt });
				const parsed = sanitizeTeam(typeof raw === "string" ? parseModelJson(raw) : raw);
				const errs = validateTeam(parsed);
				const bad = unknownPicks(parsed, squad);
				if (errs.length) throw new Error(`検証NG: ${errs.join("; ")}`);
				if (bad.length) throw new Error(`名簿外選手: ${bad.join(", ")}`);
				// プロフィール再生成で監督名(別途 gen-managers.mjs で付与)を失わないよう保持。
				const prevManager = out.teams[code] && out.teams[code].manager;
				out.teams[code] = prevManager ? { ...parsed, manager: prevManager } : parsed;
				ok = true;
				console.log(`✓ ${code}`);
			} catch (e) {
				console.error(`  ${code} 試行${attempt} 失敗: ${e.message}`);
				if (attempt < 3) await sleep(3000); // 一時的な429/タイムアウトを待つ
			}
		}
		if (!ok) failed.push(code);
		if (args.delay > 0) await sleep(args.delay); // チーム間ペーシング
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
