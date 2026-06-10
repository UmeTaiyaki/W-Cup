// チームタブの純ロジック（ブラウザ/Node 共有・ESM）
// localStorage や DOM には触れない。副作用は呼び出し側（screens-teams.jsx）が持つ。

// localStorage の生文字列 → お気に入り国コード配列。
// 文字列のみ・重複除去。空/非配列/壊れたJSON は [] を返す（握りつぶし）。
export function parseFavs(raw) {
	if (!raw) return [];
	try {
		const v = JSON.parse(raw);
		if (!Array.isArray(v)) return [];
		const seen = new Set();
		const out = [];
		for (const c of v) {
			if (typeof c === "string" && c && !seen.has(c)) {
				seen.add(c);
				out.push(c);
			}
		}
		return out;
	} catch (e) {
		return [];
	}
}

// お気に入りリストに code をトグル（無ければ末尾追加・あれば除去）。
// 常に新しい配列を返し、入力配列は変更しない。code が空なら複製のみ。
export function toggleFav(list, code) {
	const arr = Array.isArray(list) ? list.slice() : [];
	if (!code) return arr;
	return arr.includes(code) ? arr.filter((c) => c !== code) : [...arr, code];
}

// schedule からあるチーム(code)が出場する試合を抽出し、日付→時刻 昇順で返す。
// 日付なし(date 欠落)は末尾へ。元配列は変更しない。code 空/不正入力は []。
export function teamFixtures(schedule, code) {
	const list = Array.isArray(schedule) ? schedule : [];
	if (!code) return [];
	const mine = list.filter((m) => m && (m.a === code || m.b === code));
	return mine.slice().sort((x, y) => {
		const dx = x.date || "￿"; // 日付なしは最後尾
		const dy = y.date || "￿";
		if (dx !== dy) return dx.localeCompare(dy);
		return (x.time || "").localeCompare(y.time || "");
	});
}

// groups({A:[code,...],...}) から code の所属グループキーを返す。無ければ null。
export function groupOf(groups, code) {
	if (!groups || !code) return null;
	for (const k of Object.keys(groups)) {
		if (Array.isArray(groups[k]) && groups[k].includes(code)) return k;
	}
	return null;
}
