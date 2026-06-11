// チーム分析プロンプトの組立（純関数・ESM）。AI呼び出し・I/Oはしない。

// 名簿を "- POS NAME / CLUB" の行テキストにする。
function rosterLines(squad) {
	return (Array.isArray(squad) ? squad : [])
		.map((p) =>
			p && p.name
				? `- ${p.pos || "?"} ${p.name}${p.club ? ` / ${p.club}` : ""}`
				: null,
		)
		.filter(Boolean)
		.join("\n");
}

// 対戦相手リスト（日本語名）。byCode: { code: ja }。
function opponentLines(fixtures, teamCode, byCode) {
	return (Array.isArray(fixtures) ? fixtures : [])
		.map((f) => {
			if (f.a !== teamCode && f.b !== teamCode) return null;
			const oppCode = f.a === teamCode ? f.b : f.a;
			const oppName = (byCode && byCode[oppCode]) || oppCode || "未定";
			return `- ${f.date || "日付未定"} vs ${oppName}`;
		})
		.filter(Boolean)
		.join("\n");
}

// buildTeamPrompt({ team:{code,ja}, group, fixtures, squad, byCode, liveSummary, mustPicks })
// → モデルに渡すプロンプト文字列。1チーム分のJSONを返すよう指示する。
// mustPicks: 指定があれば注目選手をその選手に固定（名簿表記の配列）。
export function buildTeamPrompt(input) {
	const { team, group, fixtures, squad, byCode, liveSummary, mustPicks } = input || {};
	if (!team || !team.code) throw new Error("buildTeamPrompt: team.code が必要です");
	const roster = rosterLines(squad);
	const opps = opponentLines(fixtures, team.code, byCode);
	const liveBlock = liveSummary
		? `\n## 大会中の実績（必ずこの事実に基づくこと）\n${liveSummary}\n`
		: "";
	const journeyLine = liveSummary
		? `,\n    { "id":"journey","heading":"ここまでの歩み","body":"上記実績の事実に基づく要約" }`
		: "";
	const picksFixed = Array.isArray(mustPicks) && mustPicks.length > 0;
	const playersGuide = picksFixed
		? `## 注目選手（固定指定）
注目選手(players)は必ず次の選手「だけ」を取り上げること。picks はこの表記に完全一致させ、過不足なくこの順で並べること: ${mustPicks.map((n) => `「${n}」`).join("、")}。
各選手について、今シーズンの具体的な活躍に触れて紹介すること。`
		: `## 注目選手の選び方
所属クラブの格や知名度ではなく、今シーズンの活躍・調子を最重視して選ぶこと。
ビッグクラブ所属でも今季出番が少ない選手より、中堅・小クラブでも今季に結果を出している選手を優先する。各選手の説明では今シーズンの具体的な活躍に触れること。`;
	const playersBody = picksFixed
		? "指定された注目選手それぞれの今シーズンの具体的な活躍を交えて紹介"
		: "今シーズンの活躍を重視して2〜3名を取り上げ、今季の具体的な活躍を交えてなぜ注目かを説明";
	const picksExample = picksFixed
		? JSON.stringify(mustPicks)
		: '["名簿のnameと完全一致した選手名"]';
	return `あなたはサッカーW杯2026の解説者です。次のチームについて、日本語で中立的な「読み物プロフィール」を書いてください。勝敗の断定予想（優勝確率・突破濃厚など）はしないでください。
本文（summary・body）はプレーン文のみとし、引用番号（[1] や [2,3] 等）・脚注・Markdown記号（** や * や # や バッククォート）・箇条書き記号を一切出力しないこと。

# チーム
- 名前: ${team.ja}（${team.code}）
- 所属グループ: ${group || "未定"}

## 対戦相手（事実・この日程に基づくこと）
${opps || "（未定）"}

## 代表メンバー名簿（注目選手はこの中からのみ選ぶこと。名簿外の選手名を出さない）
${roster || "（名簿未登録）"}

${playersGuide}
${liveBlock}
# 出力形式（厳守）
次のキーだけを持つJSONを1つだけ出力してください。前後に説明文やコードフェンスを付けないこと。picks の各要素は上の名簿の選手名と完全一致させること。
{
  "summary": "2〜3文の概要",
  "sections": [
    { "id":"profile","heading":"チームの横顔","body":"歴史・W杯実績・国内での位置づけ" },
    { "id":"style","heading":"プレースタイル","body":"フォーメーション傾向・攻守の特徴" },
    { "id":"players","heading":"注目選手","body":"${playersBody}","picks":${picksExample} },
    { "id":"context","heading":"今大会の構図","body":"所属グループ・対戦相手の構図。断定予想はせず『鍵となるのは〜』程度に留める" }${journeyLine}
  ]
}`;
}
