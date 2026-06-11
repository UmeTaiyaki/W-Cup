// 試合ライフサイクル連動 AI分析: プロンプト組立(純関数)・AI呼び出し・保存。
// 数値は sm_* 確定値を正とし、Google検索グラウンディングは文脈の肉付けのみ。

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
