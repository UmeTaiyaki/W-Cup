// PMSR (Post Match Summary Report) のPDFテキストを構造化する純粋関数群。
// 入力は pdf.js で抽出した本文テキスト（改行区切り）。外部依存なし。
// 図表(ヒートマップ/パス網/シュート位置)は画像のため対象外（render側で扱う）。

// Key Statistics の指標（出現順）。label は PDF 表記に厳密一致。
export const KEY_STATS = [
	{ key: "goals", label: "Goals", ja: "ゴール" },
	{ key: "xg", label: "xG (Expected Goals)", ja: "xG（期待値）" },
	{ key: "attempts", label: "Attempts at Goal (On Target)", ja: "シュート（枠内）" },
	{ key: "passes", label: "Total Passes (Complete)", ja: "総パス（成功）" },
	{ key: "passPct", label: "Pass Completion %", ja: "パス成功率" },
	{ key: "lineBreaks", label: "Completed Line Breaks", ja: "ライン突破（成功）" },
	{ key: "defLineBreaks", label: "Defensive Line Breaks", ja: "守備ライン突破" },
	{ key: "receptionsF3", label: "Receptions in the Final Third", ja: "ファイナルサード受球" },
	{ key: "crosses", label: "Crosses", ja: "クロス" },
	{ key: "ballProg", label: "Ball Progressions", ja: "ボール前進" },
	{ key: "defPressures", label: "Defensive Pressures Applied (Direct Pressures)", ja: "守備プレッシャー（直接）" },
	{ key: "forcedTurnovers", label: "Forced Turnovers", ja: "ボール奪取（強制）" },
	{ key: "secondBalls", label: "Second Balls", ja: "セカンドボール" },
	{ key: "distance", label: "Total Distance Covered", ja: "総走行距離" },
	{ key: "sprintZone4", label: "Zone 4 – Low Speed Sprinting: 20-25 km/h", ja: "スプリント Zone4 (20-25km/h)" },
];

export const PHASES_IN = [
	{ key: "buildUpUnopposed", label: "Build Up Unopposed", ja: "ビルドアップ（無圧）" },
	{ key: "buildUpOpposed", label: "Build Up Opposed", ja: "ビルドアップ（被圧）" },
	{ key: "progression", label: "Progression", ja: "前進" },
	{ key: "finalThird", label: "Final Third", ja: "ファイナルサード" },
	{ key: "longBall", label: "Long Ball", ja: "ロングボール" },
	{ key: "attackingTransition", label: "Attacking Transition", ja: "攻撃トランジション" },
	{ key: "counterAttack", label: "Counter Attack", ja: "カウンター" },
	{ key: "setPiece", label: "Set Piece", ja: "セットピース" },
];

export const PHASES_OUT = [
	{ key: "highPress", label: "High Press", ja: "ハイプレス" },
	{ key: "midPress", label: "Mid Press", ja: "ミドルプレス" },
	{ key: "lowPress", label: "Low Press", ja: "ロープレス" },
	{ key: "highBlock", label: "High Block", ja: "ハイブロック" },
	{ key: "midBlock", label: "Mid Block", ja: "ミドルブロック" },
	{ key: "lowBlock", label: "Low Block", ja: "ローブロック" },
	{ key: "recovery", label: "Recovery", ja: "リカバリー" },
	{ key: "defensiveTransition", label: "Defensive Transition", ja: "守備トランジション" },
	{ key: "counterPress", label: "Counter-press", ja: "カウンタープレス" },
];

// 行末に混入する「14 June 2026 - Dallas Stadium - 15:00」等のフッターを除去。
function stripFooter(s) {
	return s.replace(/\d{1,2}\s+\w+\s+\d{4}\s*-.*$/g, "").trim();
}

// 値トークン: 数値 + 任意で % / km / (補助値)。
const VALUE_RE = /[\d.]+\s*(?:%|km)?(?:\s*\([\d.]+\s*%?\))?/;

// ラベル前(home)・後(away)から、ラベルに隣接する値を1つ取り出す。
// 値はラベルに直接隣接（間に文字が無い）していることを要求し、
// 部分文字列衝突（"Progression"⊂"Ball Progressions" 等）の誤マッチを防ぐ。
function splitByLabel(line, label) {
	const idx = line.indexOf(label);
	if (idx < 0) return null;
	const before = line.slice(0, idx).trim();
	const after = stripFooter(line.slice(idx + label.length).trim());
	const beforeMatches = [...before.matchAll(new RegExp(VALUE_RE, "g"))];
	let home = null;
	if (beforeMatches.length) {
		const last = beforeMatches[beforeMatches.length - 1];
		const tail = before.slice(last.index + last[0].length);
		if (/^\s*$/.test(tail)) home = last[0].replace(/\s+/g, " ").trim();
	}
	const afterMatch = after.match(VALUE_RE);
	let away = null;
	if (afterMatch && /^\s*$/.test(after.slice(0, afterMatch.index))) {
		away = afterMatch[0].replace(/\s+/g, " ").trim();
	}
	if (home == null || away == null) return null;
	return { home, away };
}

function parseStatBlock(lines, defs) {
	const out = {};
	for (const def of defs) {
		let found = null;
		for (const line of lines) {
			const r = splitByLabel(line, def.label);
			if (r) { found = r; break; }
		}
		out[def.key] = {
			label: def.label,
			ja: def.ja,
			home: found ? found.home : null,
			away: found ? found.away : null,
		};
	}
	return out;
}

function parseHeader(lines) {
	const header = { home: null, away: null, scoreHome: null, scoreAway: null, group: null, match: null, date: null, kickoff: null, venue: null };
	const scoreLine = lines.find((l) => /^.+\s+\d+\s*-\s*\d+\s+.+$/.test(l) && !/Match/.test(l));
	if (scoreLine) {
		const m = scoreLine.match(/^(.+?)\s+(\d+)\s*-\s*(\d+)\s+(.+?)$/);
		if (m) {
			header.home = m[1].trim();
			header.scoreHome = Number(m[2]);
			header.scoreAway = Number(m[3]);
			header.away = m[4].trim();
		}
	}
	const gm = lines.find((l) => /Group\s+\w+\s*-\s*Match\s+\d+/.test(l));
	if (gm) {
		const m = gm.match(/Group\s+(\w+)\s*-\s*Match\s+(\d+)/);
		header.group = m[1];
		header.match = Number(m[2]);
	}
	const dl = lines.find((l) => /^\d{1,2}\s+\w+\s+\d{4}$/.test(l.trim()));
	if (dl) header.date = dl.trim();
	const kl = lines.find((l) => /Kick\s*O/i.test(l));
	if (kl) header.kickoff = (kl.match(/(\d{1,2}:\d{2})/) || [])[1] || null;
	const vIdx = lines.findIndex((l) => /Kick\s*O/i.test(l));
	if (vIdx >= 0 && lines[vIdx + 1]) header.venue = lines[vIdx + 1].trim();
	return header;
}

function parsePossession(lines) {
	const line = lines.find((l) => /^Total\s+[\d.]+%.*Total\s*$/.test(l.trim()));
	if (!line) return null;
	const nums = [...line.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
	if (nums.length >= 3) return { home: nums[0], contested: nums[1], away: nums[2] };
	if (nums.length === 2) return { home: nums[0], away: nums[1] };
	return null;
}

// 抽出本文テキスト → 構造化スタッツ。欠損は null（呼び出し側で graceful degradation）。
export function parseStats(text) {
	const lines = text.split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
	return {
		header: parseHeader(lines),
		possession: parsePossession(lines),
		keyStats: parseStatBlock(lines, KEY_STATS),
		phasesInPossession: parseStatBlock(lines, PHASES_IN),
		phasesOutOfPossession: parseStatBlock(lines, PHASES_OUT),
	};
}

// 抽出品質チェック: 欠損キーの一覧を返す（インジェストの健全性検証用）。
export function findMissing(stats) {
	const missing = [];
	for (const blk of ["keyStats", "phasesInPossession", "phasesOutOfPossession"]) {
		for (const [k, v] of Object.entries(stats[blk] || {})) {
			if (v.home == null || v.away == null) missing.push(`${blk}.${k}`);
		}
	}
	if (!stats.possession) missing.push("possession");
	return missing;
}
