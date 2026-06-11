// チームAI分析の純ロジック（ブラウザ/Node 共有・ESM）。
// fetch/DOM には触れない。副作用は呼び出し側（data.js / screens-teams.jsx）が持つ。

// 許可する section id（journey は大会中のみ任意で存在）。
export const SECTION_IDS = [
	"profile",
	"style",
	"players",
	"context",
	"journey",
];

// 1チーム分の検証。エラーメッセージ配列を返す（空＝OK）。
export function validateTeam(team) {
	const errors = [];
	if (!team || typeof team !== "object") return ["team is not an object"];
	if (typeof team.summary !== "string" || !team.summary.trim())
		errors.push("summary empty");
	if (!Array.isArray(team.sections) || team.sections.length === 0) {
		errors.push("sections empty");
		return errors;
	}
	team.sections.forEach((s, i) => {
		if (!s || typeof s !== "object") {
			errors.push(`section[${i}] not object`);
			return;
		}
		if (!SECTION_IDS.includes(s.id))
			errors.push(`section[${i}] invalid id "${s.id}"`);
		if (typeof s.heading !== "string" || !s.heading.trim())
			errors.push(`section[${i}] heading empty`);
		if (typeof s.body !== "string" || !s.body.trim())
			errors.push(`section[${i}] body empty`);
	});
	return errors;
}

// ドキュメント全体の形を検証。{ ok, errors[] } を返す。
export function validateDoc(doc) {
	const errors = [];
	if (!doc || typeof doc !== "object")
		return { ok: false, errors: ["doc is not an object"] };
	if (typeof doc.generatedAt !== "string" || !doc.generatedAt)
		errors.push("generatedAt missing");
	if (typeof doc.model !== "string" || !doc.model) errors.push("model missing");
	if (!doc.teams || typeof doc.teams !== "object" || Array.isArray(doc.teams)) {
		errors.push("teams missing or not an object");
		return { ok: false, errors };
	}
	for (const [code, team] of Object.entries(doc.teams)) {
		validateTeam(team).forEach((m) => errors.push(`${code}: ${m}`));
	}
	return { ok: errors.length === 0, errors };
}

// players セクションの picks のうち、名簿(squad)に存在しない選手名を返す。
// squad: [{ pos, name, club }]。players/picks 無しは [] を返す。
export function unknownPicks(team, squad) {
	const names = new Set(
		(Array.isArray(squad) ? squad : []).map((p) => p && p.name).filter(Boolean),
	);
	const sections = team && Array.isArray(team.sections) ? team.sections : [];
	const players = sections.find((s) => s && s.id === "players");
	const picks = players && Array.isArray(players.picks) ? players.picks : [];
	return picks.filter((name) => !names.has(name));
}

// ドキュメントから1チームの分析を取得。無ければ null。
export function getTeamAnalysis(doc, code) {
	if (!doc || !doc.teams || !code) return null;
	return doc.teams[code] || null;
}

// 指定チームの分析が存在し描画可能か。
export function hasAnalysis(doc, code) {
	const t = getTeamAnalysis(doc, code);
	return !!(t && validateTeam(t).length === 0);
}
