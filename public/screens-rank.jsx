/* ============================================================
   得点の内訳コンポーネント（MemberBreakdown）
   部屋のメンバー詳細で得点ブレークダウンを表示するために使う。
   （旧 CompareScreen / RankingScreen は部屋のリーダーボード刷新に伴い廃止）
   ============================================================ */

// 得点の内訳（コア的中バッジ＋グループ順位/KO内訳）。
function MemberBreakdown({ T, pred, score, R, showOption = true }) {
	const p = pred || {};
	R = R || window.WC.RESULT || {};
	const HitBadge = ({ ok, label }) => (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 3,
				opacity: ok ? 1 : 0.4,
			}}
		>
			<Icon
				name={ok ? "check" : "close"}
				size={12}
				color={ok ? T.accent : T.faint}
				sw={2.6}
			/>
			<span
				style={{ fontSize: 11, fontWeight: 700, color: ok ? T.text : T.faint }}
			>
				{label}
			</span>
		</div>
	);
	return (
		<div>
			<div
				style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10 }}
			>
				<HitBadge
					ok={!!(p.champion && R.champion && p.champion === R.champion)}
					label={`優勝 +${score.core.champion}`}
				/>
				<HitBadge
					ok={!!(p.runnerUp && R.runnerUp && p.runnerUp === R.runnerUp)}
					label={`準優勝 +${score.core.runnerUp}`}
				/>
				<HitBadge
					ok={
						p.topScorer &&
						R.topScorer &&
						p.topScorer.trim() === R.topScorer.trim()
					}
					label={`得点王 +${score.core.topScorer}`}
				/>
			</div>
			{showOption && (
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 14,
						fontSize: 13,
						color: T.sub,
					}}
				>
					<span>
						順位的中 <b style={{ color: T.text }}>+{score.option.groupRank}</b>
						（{score.option.rankHits}）
					</span>
					<span>
						ノックアウト{" "}
						<b style={{ color: T.text }}>+{score.option.knockout}</b>
						<span style={{ color: T.faint }}>
							（16強{score.option.koHits.r32}・8強{score.option.koHits.r16}・4強
							{score.option.koHits.qf}・決勝{score.option.koHits.sf}）
						</span>
					</span>
				</div>
			)}
		</div>
	);
}

Object.assign(window, { MemberBreakdown });
