// 2部門採点（純ロジック / ESM）
export const SCORING = {
	champion: 25,
	runnerUp: 15,
	topScorer: 20,
	rankHit: 1, // グループ順位ピタリ1チーム
	koHit: 1, // ノックアウト到達1チーム
};

const KO_ROUNDS = ["r32", "r16", "qf", "sf"];

// 得点王照合用の文字列正規化（大文字化・アクセント除去・空白畳み）
// NFD で分解しラテン系の結合分音記号(U+0300–U+036F)のみ除去 → 末尾で NFC 再合成。
// 日本語の濁点/半濁点(U+3099/U+309A)は除去対象外なので再合成で元の表記に戻る。
export function normalize(s) {
	return String(s == null ? "" : s)
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toUpperCase()
		.replace(/\s+/g, " ")
		.trim()
		.normalize("NFC");
}

// "NAME (CODE)" を "CODE::正規化名" に畳む。(CODE) 無しは normalize のみ。
export function canonicalKey(input) {
	const s = String(input == null ? "" : input).trim();
	const m = s.match(/^(.+?)\s*\(([A-Za-z]{3})\)\s*$/);
	if (m) return `${m[2].toUpperCase()}::${normalize(m[1])}`;
	return normalize(s);
}

// 入力を canonical へ解決。エイリアス表（normalize(変種)→canonical）優先、無ければ構造畳み。
export function resolve(input, aliasMap = {}) {
	if (!input) return "";
	const norm = normalize(input);
	if (aliasMap && aliasMap[norm]) return aliasMap[norm];
	return canonicalKey(input);
}

export function scoreMember(
	pred = {},
	result = {},
	scoring = SCORING,
	aliasMap = {},
) {
	// ---- コア ----
	const champion =
		pred.champion && pred.champion === result.champion ? scoring.champion : 0;
	const runnerUp =
		pred.runnerUp && pred.runnerUp === result.runnerUp ? scoring.runnerUp : 0;
	const topScorer =
		pred.topScorer &&
		result.topScorer &&
		resolve(pred.topScorer, aliasMap) === resolve(result.topScorer, aliasMap)
			? scoring.topScorer
			: 0;
	const coreTotal = champion + runnerUp + topScorer;

	// ---- オプション：グループ順位 ----
	let rankPts = 0;
	let rankHits = 0;
	const gr = pred.groupRank || {};
	const grRes = result.groupResult || {};
	for (const k of Object.keys(grRes)) {
		const mine = gr[k] || [];
		const act = grRes[k] || [];
		for (let i = 0; i < 3; i++) {
			if (mine[i] && act[i] && mine[i] === act[i]) {
				rankPts += scoring.rankHit;
				rankHits += 1;
			}
		}
	}

	// ---- オプション：ノックアウト到達 ----
	let koPts = 0;
	const koHits = { r32: 0, r16: 0, qf: 0, sf: 0 };
	const ko = pred.knockout || {};
	const koRes = result.knockout || {};
	for (const r of KO_ROUNDS) {
		const mine = ko[r] || [];
		const act = new Set(koRes[r] || []);
		for (const t of mine) {
			if (t && act.has(t)) {
				koPts += scoring.koHit;
				koHits[r] += 1;
			}
		}
	}

	const optionTotal = rankPts + koPts;
	return {
		core: { champion, runnerUp, topScorer, total: coreTotal },
		option: {
			groupRank: rankPts,
			knockout: koPts,
			total: optionTotal,
			rankHits,
			koHits,
		},
		coreTotal,
		optionTotal,
		grandTotal: coreTotal + optionTotal,
	};
}
