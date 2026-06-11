// AI生成テキストの整形（純関数・ESM）。
// 検索グラウンディングの引用マーカーや Markdown 記号など、表示に不要な記号を除去し
// 読みやすいプレーン文に整える。意味のある本文・ラテン文字（選手名等）の空白は保持する。

export function sanitizeText(input) {
	if (typeof input !== "string") return input;
	let s = input;
	// 1) 検索グラウンディングの引用マーカー [1] / [4, 18, 22] を直前の空白ごと除去
	s = s.replace(/[ \t　]*\[\d+(?:\s*,\s*\d+)*\]/g, "");
	// 2) Markdown 記号（** 太字・* 強調・` コード）を除去
	s = s.replace(/\*+/g, "").replace(/`+/g, "");
	// 3) 行頭の見出し/箇条書き記号（# / - ）を除去
	s = s.replace(/^[ \t　]*[#\-]+[ \t]+/gm, "");
	// 4) 句読点・閉じ括弧の直前の空白を除去
	s = s.replace(/[ \t　]+([。、！？!?」』）)、])/g, "$1");
	// 5) 日本語（非ASCII）同士の間に残った空白を除去（ラテン名等の空白は保持）
	s = s.replace(/([^\x00-\x7f])[ \t　]+(?=[^\x00-\x7f])/g, "$1");
	// 6) 連続空白・行末空白・過剰な空行を整理
	s = s.replace(/[ \t]{2,}/g, " ").replace(/[ \t　]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
	return s.trim();
}

// チーム1件分（summary + 各 section.body）をサニタイズした新オブジェクトを返す（非破壊）。
export function sanitizeTeam(team) {
	if (!team || typeof team !== "object") return team;
	return {
		...team,
		summary: sanitizeText(team.summary),
		sections: Array.isArray(team.sections)
			? team.sections.map((s) => ({ ...s, body: sanitizeText(s.body) }))
			: team.sections,
	};
}
