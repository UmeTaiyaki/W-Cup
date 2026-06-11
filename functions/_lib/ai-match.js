// 試合ライフサイクル連動 AI分析: プロンプト組立(純関数)・AI呼び出し・保存。
// 数値は sm_* 確定値を正とし、Google検索グラウンディングは文脈の肉付けのみ。

import { getFixtureDetail } from "./sm-read.js";

// 既知の team stat type_id → 日本語ラベル（欠損・未知は畳む）
const STAT_LABELS = {
	5304: "xG",
	42: "シュート",
	86: "枠内シュート",
	45: "支配率%",
};

const PHASE_GOAL = {
	lineup:
		"スタメンと布陣から、注目の対決と勝敗の鍵を日本語で2〜3文にまとめてください。",
	ht: "前半の流れ（スコア・xG・主なイベント）を踏まえ、後半の見どころを日本語で2〜3文にまとめてください。",
	ft: "試合結果（スコア・xG・主なイベント）から、勝敗の要因とMVPを日本語で2〜3文にまとめてください。",
};

const CONSTRAINT =
	"制約: スコア・xG・統計などの数値は与えたデータを正とし、推測で上書きしないこと。Web検索は選手の調子や話題など文脈の肉付けにのみ使うこと。";

function lineupLines(detail) {
	const xi = (detail.lineups || []).filter((p) => p.is_start === 1);
	return xi
		.map(
			(p) =>
				`- ${p.position || "?"} ${p.player_name || "?"}${p.club_name ? ` / ${p.club_name}` : ""}${p.formation_field ? ` [${p.formation_field}]` : ""}`,
		)
		.join("\n");
}

function eventLines(detail) {
	return (detail.events || [])
		.map((e) =>
			`- ${e.minute ?? "?"}' ${e.type || ""} ${e.player_name || ""}`.trim(),
		)
		.join("\n");
}

function statLines(detail) {
	const byTeam = new Map();
	for (const s of detail.stats || []) {
		const label = STAT_LABELS[s.type_id];
		if (!label || s.value == null) continue;
		const prev = byTeam.get(s.team_id) || [];
		byTeam.set(s.team_id, [...prev, `${label}=${s.value}`]);
	}
	return [...byTeam.entries()]
		.map(([t, arr]) => `- team ${t}: ${arr.join(", ")}`)
		.join("\n");
}

// state_id → フェーズ（該当しなければ null）。HT は 3、FT は 5/7/8、lineup は NS(1)。
function phaseForState(stateId, startXiCount) {
	if (stateId === 1) return startXiCount >= 22 ? "lineup" : null;
	if (stateId === 3) return "ht";
	if (stateId === 5 || stateId === 7 || stateId === 8) return "ft";
	return null;
}

// 生成可能か（行が無い、または summary未充填かつ attempts<3）
// summary は null/undefined/空文字を等しく未完了とみなす（将来の空応答保存に備えた防御）。
function isGeneratable(existing, fixtureId, phase) {
	const cur = existing.get(`${fixtureId}:${phase}`);
	if (!cur) return true;
	return !cur.summary && (cur.attempts || 0) < 3;
}

// 生成すべき {fixtureId, phase} を返す。cap で 1tick あたりの件数を制限。
export function selectFixturesForAi(fixtureRows, existing, cap) {
	const out = [];
	for (const r of fixtureRows || []) {
		const phase = phaseForState(r.state_id, r.start_xi_count || 0);
		if (!phase) continue;
		if (!isGeneratable(existing, r.sm_fixture_id, phase)) continue;
		out.push({ fixtureId: r.sm_fixture_id, phase });
		if (out.length >= cap) break;
	}
	return out;
}

// generateContent 応答から本文テキストを取り出す。
function extractGeminiText(json, label) {
	const cand = json && json.candidates && json.candidates[0];
	const parts = cand && cand.content && cand.content.parts;
	const text = Array.isArray(parts)
		? parts.map((p) => p.text || "").join("")
		: "";
	if (!text.trim()) {
		const fr = cand && cand.finishReason;
		throw new Error(`${label}: 応答が空${fr ? `（finishReason=${fr}）` : ""}`);
	}
	return text;
}

// Gemini Developer API 呼び出し（Google検索グラウンディング有効）。応答テキストを返す。
export async function callGeminiText({ apiKey, model, prompt, fetchImpl }) {
	const doFetch = fetchImpl || fetch;
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
	const res = await doFetch(url, {
		method: "POST",
		headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
		body: JSON.stringify({
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			tools: [{ google_search: {} }],
			generationConfig: { temperature: 0.7 },
		}),
	});
	if (!res.ok) {
		throw new Error(
			`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
		);
	}
	let json;
	try {
		json = await res.json();
	} catch {
		throw new Error("Gemini: 応答のJSONパースに失敗");
	}
	return extractGeminiText(json, "Gemini");
}

const SUCCESS_SQL = `INSERT INTO sm_match_ai (sm_fixture_id, phase, summary, model, attempts, updated_at)
VALUES (?, ?, ?, ?, 1, ?)
ON CONFLICT(sm_fixture_id, phase) DO UPDATE SET
  summary=excluded.summary, model=excluded.model, attempts=sm_match_ai.attempts+1, updated_at=excluded.updated_at`;

const FAIL_SQL = `INSERT INTO sm_match_ai (sm_fixture_id, phase, summary, model, attempts, updated_at)
VALUES (?, ?, NULL, NULL, 1, ?)
ON CONFLICT(sm_fixture_id, phase) DO UPDATE SET
  attempts=sm_match_ai.attempts+1, updated_at=excluded.updated_at`;

// 1件のAI分析を生成して保存。getDetail/callAi は注入可能（既定は本番実装）。
export async function generateMatchAi({
	db,
	fixtureId,
	phase,
	apiKey,
	model,
	now,
	getDetail,
	callAi,
}) {
	const fetchDetail = getDetail || ((id) => getFixtureDetail(db, id));
	const ai = callAi || ((prompt) => callGeminiText({ apiKey, model, prompt }));
	try {
		const detail = await fetchDetail(fixtureId);
		if (!detail) throw new Error("detail not found");
		const prompt = buildMatchPrompt(phase, detail);
		const summary = (await ai(prompt)).trim();
		await db
			.prepare(SUCCESS_SQL)
			.bind(fixtureId, phase, summary, model, now)
			.run();
		return { ok: true };
	} catch (err) {
		await db.prepare(FAIL_SQL).bind(fixtureId, phase, now).run();
		return { ok: false, error: err?.message };
	}
}

const DEFAULT_CAP = 3;
const DEFAULT_MODEL = "gemini-2.5-pro";

// ±36h 窓の fixture と既存 sm_match_ai から検知し、上限内で生成する。
// 集計を返す: { lineup, ht, ft }
export async function maybeGenerateMatchAi(
	db,
	now,
	{
		apiKey,
		model = DEFAULT_MODEL,
		cap = DEFAULT_CAP,
		windowSec = 36 * 60 * 60,
		getDetail,
		callAi,
	} = {},
) {
	const fxRes = await db
		.prepare(
			`SELECT f.sm_fixture_id, f.state_id,
        (SELECT COUNT(*) FROM sm_lineups l WHERE l.sm_fixture_id = f.sm_fixture_id AND l.is_start = 1) AS start_xi_count
       FROM sm_fixtures f WHERE f.starting_at_ts BETWEEN ? AND ?`,
		)
		.bind(now - windowSec, now + windowSec)
		.all();
	const rows = Array.isArray(fxRes?.results) ? fxRes.results : [];

	const aiRes = await db
		.prepare("SELECT sm_fixture_id, phase, summary, attempts FROM sm_match_ai")
		.bind()
		.all();
	const existing = new Map();
	for (const r of Array.isArray(aiRes?.results) ? aiRes.results : []) {
		existing.set(`${r.sm_fixture_id}:${r.phase}`, {
			summary: r.summary,
			attempts: r.attempts,
		});
	}

	const targets = selectFixturesForAi(rows, existing, cap);
	const agg = { lineup: 0, ht: 0, ft: 0 };
	for (const t of targets) {
		let r;
		try {
			r = await generateMatchAi({
				db,
				fixtureId: t.fixtureId,
				phase: t.phase,
				apiKey,
				model,
				now,
				getDetail,
				callAi,
			});
		} catch (e) {
			r = { ok: false, error: e?.message };
		}
		if (r.ok) agg[t.phase] += 1;
	}
	return agg;
}

export function buildMatchPrompt(phase, detail) {
	const safe = detail || {};
	if (!PHASE_GOAL[phase]) {
		throw new Error(`buildMatchPrompt: unknown phase "${phase}"`);
	}
	const f = safe.fixture || {};
	const head = `${f.home_name ?? "Home"} vs ${f.away_name ?? "Away"}（${f.round_name ?? ""}）`;
	const parts = [PHASE_GOAL[phase], CONSTRAINT, "", head];

	if (phase !== "lineup") {
		if (f.home_score != null && f.away_score != null) {
			parts.push(`スコア: ${f.home_score} - ${f.away_score}`);
		}
		if (f.home_xg != null || f.away_xg != null) {
			parts.push(`xG: ${f.home_xg ?? "—"} - ${f.away_xg ?? "—"}`);
		}
		const evs = eventLines(safe);
		if (evs) parts.push("主なイベント:\n" + evs);
		const st = statLines(safe);
		if (st) parts.push("チーム統計:\n" + st);
	}

	const xi = lineupLines(safe);
	if (xi) parts.push("先発(両チーム):\n" + xi);

	return parts.filter((s) => s !== "").join("\n");
}
