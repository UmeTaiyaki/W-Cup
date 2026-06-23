// ベスト32トーナメント構造と対戦表導出（純ロジック / ESM）
// seed: 'X1'|'X2'（グループX 1位/2位）または { wc: ['A',...] }（3位ワイルドカード枠）

import { thirdAllocation } from "./third-allocation.js";

export const BRACKET_STRUCTURE = {
	r32: [
		{ id: "M1", top: "E1", bottom: { wc: ["A", "B", "C", "D", "F"] } },
		{ id: "M2", top: "I1", bottom: { wc: ["C", "D", "F", "G", "H"] } },
		{ id: "M3", top: "A2", bottom: "B2" },
		{ id: "M4", top: "F1", bottom: "C2" },
		{ id: "M5", top: "K2", bottom: "L2" },
		{ id: "M6", top: "H1", bottom: "J2" },
		{ id: "M7", top: "D1", bottom: { wc: ["B", "E", "F", "I", "J"] } },
		{ id: "M8", top: "G1", bottom: { wc: ["A", "E", "H", "I", "J"] } },
		{ id: "M9", top: "C1", bottom: "F2" },
		{ id: "M10", top: "E2", bottom: "I2" },
		{ id: "M11", top: "A1", bottom: { wc: ["C", "E", "F", "H", "I"] } },
		{ id: "M12", top: "L1", bottom: { wc: ["E", "H", "I", "J", "K"] } },
		{ id: "M13", top: "J1", bottom: "H2" },
		{ id: "M14", top: "D2", bottom: "G2" },
		{ id: "M15", top: "B1", bottom: { wc: ["E", "F", "G", "I", "J"] } },
		{ id: "M16", top: "K1", bottom: { wc: ["D", "E", "I", "J", "L"] } },
	],
};

export const WILDCARD_SLOTS = BRACKET_STRUCTURE.r32
	.filter((m) => Array.isArray(m.bottom?.wc))
	.map((m) => m.id);

export const PERMITTED = Object.fromEntries(
	BRACKET_STRUCTURE.r32
		.filter((m) => Array.isArray(m.bottom?.wc))
		.map((m) => [m.id, m.bottom.wc]),
);

// seed トークン → 表示ラベル（進出国が未確定でも枠の出自を示す）
// 'A1' → 'A組 1位' / { wc: ['B','E',...] } → '3位 (B/E/...)'
export function seedLabel(seed) {
	if (typeof seed === "string") return `${seed[0]}組 ${seed[1]}位`;
	if (seed && Array.isArray(seed.wc)) return `3位 (${seed.wc.join("/")})`;
	return "";
}

// 「3位通過する8グループの選択」→ FIFA Annex C で各ワイルドカード枠に割り当てる
// 実チームコードを算出する。{ slotId: teamCode }。表に無い/未確定の組は対象枠を null。
// thirdGroups: 8グループの配列（例 ['A','C','E',...]）。groupRank[g][2] が各組の3位コード。
export function resolveThirdAssign(groupRank = {}, thirdGroups = []) {
	const alloc = thirdAllocation(thirdGroups); // { slotId: groupLetter } or null
	const out = {};
	for (const slot of WILDCARD_SLOTS) {
		const g = alloc ? alloc[slot] : null;
		out[slot] = g ? (groupRank[g] || [])[2] || null : null;
	}
	return out;
}

// seed トークン → チームコード
function seedTeam(seed, groupRank, thirdAssign, slotId) {
	if (typeof seed === "string") {
		const g = seed[0];
		const pos = Number(seed[1]); // 1 or 2
		const order = groupRank[g] || [];
		return order[pos - 1] || null;
	}
	return thirdAssign[slotId] || null; // ワイルドカード
}

// 勝者配列 [w0,w1,...] → 次ラウンドのカード [[w0,w1],...]
function pair(winners) {
	const m = [];
	for (let i = 0; i < winners.length; i += 2)
		m.push([winners[i] || null, winners[i + 1] || null]);
	return m;
}

// 勝者を len 個に整え、各カードに含まれない勝者は null に消す
function sanitize(arr, matches, len) {
	const w = (arr || []).slice(0, len);
	while (w.length < len) w.push(null);
	return w.map((t, i) =>
		t && matches[i] && matches[i].includes(t) ? t : null,
	);
}

export function deriveKnockout(
	groupRank = {},
	thirdAssign = {},
	knockout = {},
) {
	const r32m = BRACKET_STRUCTURE.r32.map((m) => [
		seedTeam(m.top, groupRank, thirdAssign, m.id),
		seedTeam(m.bottom, groupRank, thirdAssign, m.id),
	]);
	const r32w = sanitize(knockout.r32, r32m, 16);

	const r16m = pair(r32w);
	const r16w = sanitize(knockout.r16, r16m, 8);

	const qfm = pair(r16w);
	const qfw = sanitize(knockout.qf, qfm, 4);

	const sfm = pair(qfw);
	const sfw = sanitize(knockout.sf, sfm, 2);

	// r32 各枠の出自ラベル（静的。グループ順位が未確定でも常に決まっている）
	const r32seeds = BRACKET_STRUCTURE.r32.map((m) => [
		seedLabel(m.top),
		seedLabel(m.bottom),
	]);

	return {
		matches: { r32: r32m, r16: r16m, qf: qfm, sf: sfm },
		winners: { r32: r32w, r16: r16w, qf: qfw, sf: sfw },
		seeds: { r32: r32seeds },
		finalists: sfw,
	};
}

// 予想画面用：forced チーム（優勝・準優勝など）を各ラウンドで自動的に勝ち上がらせる。
// forced は優先順位順（先頭が最優先）。同一カードに複数 forced がいれば先頭が勝つ。
// forced 以外の枠はユーザー選択（knockout）を尊重する。
export function deriveKnockoutAuto(
	groupRank = {},
	thirdAssign = {},
	knockout = {},
	forced = [],
) {
	const rounds = ["r32", "r16", "qf", "sf"];
	const fseq = (forced || []).filter(Boolean);
	const ko = {};
	let der = deriveKnockout(groupRank, thirdAssign, ko);
	for (const r of rounds) {
		const userW = knockout[r] || [];
		ko[r] = der.matches[r].map((m, i) => {
			const auto = fseq.find((t) => m.includes(t));
			if (auto) return auto;
			const u = userW[i];
			return u && m.includes(u) ? u : null;
		});
		der = deriveKnockout(groupRank, thirdAssign, ko);
	}
	return der;
}

// 結果ブラケット用：sm-results の「各ラウンド到達チーム集合」(appeared) から実ブラケットを構築する。
// ★重要：appeared[r] は「ラウンド r に到達した（=出場した）両チーム」であり「勝者」ではない。
// 各カード(ラウンド r)の勝者は「次のラウンド r+1 に到達した側」なので 1 ラウンドずらして判定する。
//   r32 カードの勝者 = appeared.r16（ベスト16到達）/ r16→appeared.qf / qf→appeared.sf
//   sf カードの勝者 = finalists（決勝進出＝champion/runnerUp）
// これにより、試合前にステージ fixtures だけ登録された段階で勝者が誤表示されるのを防ぐ。
export function deriveKnockoutFromAppeared(
	groupRank = {},
	thirdAssign = {},
	appeared = {},
	finalists = [],
) {
	const winnerSets = {
		r32: appeared.r16 || [],
		r16: appeared.qf || [],
		qf: appeared.sf || [],
		sf: (finalists || []).filter(Boolean),
	};
	return deriveKnockoutFromSets(groupRank, thirdAssign, winnerSets);
}

// admin の「到達チーム集合」(順不同) を deriveKnockout の対戦カードに整列しつつ
// 実結果ブラケットを構築する。既存 deriveKnockout は不変。
// 注意：ここでの sets[r] は「ラウンド r の勝者」を指す（予想 knockout やテストはこの形）。
// sm-results の「到達チーム集合」を渡す場合は deriveKnockoutFromAppeared を使うこと。
export function deriveKnockoutFromSets(
	groupRank = {},
	thirdAssign = {},
	sets = {},
) {
	const rounds = ["r32", "r16", "qf", "sf"];
	const knockout = {};
	let der = deriveKnockout(groupRank, thirdAssign, knockout);
	for (const r of rounds) {
		const set = new Set(sets[r] || []);
		knockout[r] = der.matches[r].map(
			(m) => m.find((t) => t && set.has(t)) || null,
		);
		der = deriveKnockout(groupRank, thirdAssign, knockout);
	}
	return der;
}
