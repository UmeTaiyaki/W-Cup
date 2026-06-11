// sm_* 行 → 採点が読む result/groupMatches への純導出（大会結果自動反映）
// 不変条件: 副作用なし。壊れた/欠損入力でも例外を投げず空・null で返す（障害隔離）。
// FT確定ルール: 採点に効く確定値は status==="FT" の試合からのみ。順位表表示はライブ込み。

// 突合用に round 名を正規化（小文字化・英数のみ）
function normRound(s) {
	return String(s == null ? "" : s)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

// SportMonks round/stage 名 → アプリのノックアウト到達キー。群リーグ・決勝・3位決定は null。
export function roundKey(roundName) {
	const n = normRound(roundName);
	if (n === "roundof32") return "r32";
	if (n === "roundof16") return "r16";
	if (n === "quarterfinals") return "qf";
	if (n === "semifinals") return "sf";
	return null;
}

// 決勝のみ true。"3rd Place Final" を誤検出しないため完全一致で判定。
export function isFinalRound(roundName) {
	return normRound(roundName) === "final";
}
