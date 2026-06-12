// ホームニュースカルーセル用の純関数群。副作用なし・ネットワーク非依存。
// 一覧は SportMonks の season ニュース(pre/post)を統合、本文は fixture include の lines。

// ゴール系 type_id(livescore メモリ: 14=Goal,16=Penalty,23=PKGoal)
const GOAL_TYPE_IDS = new Set([14, 16, 23]);

// pre/post を統合し表示順に整列。各要素: { newsitem_id, fixture_id, type, title_en }
export function mergeNewsList(pre, post) {
	const norm = (arr, type) =>
		(Array.isArray(arr) ? arr : []).map((n) => ({
			newsitem_id: n.id,
			fixture_id: n.fixture_id,
			type: n.type || type,
			title_en: n.title || "",
		}));
	const all = [...norm(post, "postmatch"), ...norm(pre, "prematch")];
	const seen = new Set();
	const deduped = [];
	for (const item of all) {
		if (seen.has(item.newsitem_id)) continue;
		seen.add(item.newsitem_id);
		deduped.push(item);
	}
	const rank = (t) => (t === "postmatch" ? 0 : 1);
	return deduped
		.map((x, i) => ({ x, i }))
		.sort(
			(a, b) =>
				rank(a.x.type) - rank(b.x.type) ||
				(a.x.fixture_id ?? 0) - (b.x.fixture_id ?? 0) ||
				a.i - b.i,
		)
		.map(({ x }) => x);
}

// lines[].text を順序保持で連結(空・空白行は除去)。段落間は空行。
export function joinLines(lines) {
	if (!Array.isArray(lines)) return "";
	return lines
		.map((l) => (l && typeof l.text === "string" ? l.text.trim() : ""))
		.filter((t) => t.length > 0)
		.join("\n\n");
}

// fixture 詳細からヒーロー画像を選定(得点者写真→venue→エンブレム→null)。
export function pickHero(detail) {
	const events = Array.isArray(detail?.events) ? detail.events : [];
	const scorer = events.find(
		(e) => GOAL_TYPE_IDS.has(e?.type_id) && e?.player?.image_path,
	);
	if (scorer) {
		return {
			kind: "player",
			url: scorer.player.image_path,
			alt: scorer.player.display_name || scorer.player.name || "",
		};
	}
	if (detail?.venue?.image_path) {
		return {
			kind: "venue",
			url: detail.venue.image_path,
			alt: detail.venue.name || "",
		};
	}
	const parts = Array.isArray(detail?.participants) ? detail.participants : [];
	if (parts[0]?.image_path && parts[1]?.image_path) {
		return {
			kind: "crest",
			url: parts[0].image_path,
			url2: parts[1].image_path,
			alt: "",
		};
	}
	return null;
}

// 翻訳結果の KV キー(記事内容は不変なので永続)。
export function translationCacheKey(newsitemId, kind) {
	return `news:tr:ja:${newsitemId}:${kind}`;
}

// 本文モードの SportMonks include を type で切替。
export function newsBodyInclude(type) {
	const newsInc =
		type === "prematch" ? "prematchNews.lines" : "postmatchNews.lines";
	return `${newsInc};participants;venue;events.player`;
}
