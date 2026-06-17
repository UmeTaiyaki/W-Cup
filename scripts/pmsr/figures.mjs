// 切り出す図表タイプの定義。ページ番号は試合ごとにズレ得るため、
// 「ページ見出しテキスト」でページを動的特定する（レイアウト差に耐える）。
// 図表ページは全面16:9の自己完結グラフィックなので crop は基本 null（全面）。

function escapeRe(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 各タイプ: side('home'|'away')とチーム名を受け、ページ判定 predicate を返す。
// predicate(pageText) → boolean。pageTexts を走査し最初の一致ページ(1始まり)を採用。
const TYPES = [
	{
		key: "shot-map",
		ja: "シュートマップ",
		// 「Attempts at Goal <team>」の図ページ。表ページ(Body Part列)は除外。
		pred: (team) => (t) =>
			new RegExp(`Attempts at Goal\\s+${escapeRe(team)}`).test(t) &&
			/Blocked/.test(t) && /Incomplete/.test(t) && !/Body Part/.test(t),
	},
	{
		key: "attack-shape",
		ja: "攻撃時のライン高 & チーム長",
		pred: (team) => (t) =>
			new RegExp(`In Possession Line Height & Team Length\\s+${escapeRe(team)}`).test(t),
	},
	{
		key: "def-shape",
		ja: "守備時のライン高 & チーム長",
		pred: (team) => (t) =>
			new RegExp(`Defensive Line Height & Team Length\\s+${escapeRe(team)}`).test(t),
	},
	{
		key: "crosses",
		ja: "クロス分布",
		pred: (team) => (t) =>
			new RegExp(`Crosses \\(Open Play\\)\\s+${escapeRe(team)}`).test(t),
	},
];

// pageTexts(配列) と home/away チーム名から、切り出すべき図表ターゲットを構築。
// 返り値: [{ key, side, team, ja, page }]  page は1始まり。見つからない型はスキップ。
export function buildFigureTargets(pageTexts, homeName, awayName) {
	const sides = [
		{ side: "home", team: homeName },
		{ side: "away", team: awayName },
	];
	const targets = [];
	for (const type of TYPES) {
		for (const { side, team } of sides) {
			if (!team) continue;
			const predicate = type.pred(team);
			const idx = pageTexts.findIndex((t) => predicate(t));
			if (idx >= 0) {
				targets.push({
					key: `${type.key}-${side}`,
					side,
					team,
					ja: `${team} — ${type.ja}`,
					page: idx + 1,
					crop: null,
				});
			}
		}
	}
	return targets;
}
