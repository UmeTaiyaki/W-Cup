/* ============================================================
   画面: 3位ワイルドカード（オプション）
   12組のうち「3位で勝ち上がる」と予想する8組を選ぶ。
   ベスト32のどの枠に入るかは FIFA Annex C（公式組み合わせ表）で自動決定。
   props: T, member, pred, setThirdGroups(arr), goBack
   ============================================================ */
function ThirdWildScreen({
	T,
	member,
	pred,
	setThirdGroups,
	goBack,
	wide = false,
}) {
	const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
	const TEAM = window.WC.TEAM || {};
	const STRUCT = (window.WC.BRACKET_STRUCTURE || {}).r32 || [];
	const gr = pred.groupRank || {};
	const selected = pred.thirdGroups || [];
	const doneCount = selected.length;
	const FULL = 8;

	const thirdCode = (g) => (gr[g] || [])[2] || null;

	function toggle(g) {
		if (selected.includes(g)) {
			setThirdGroups(selected.filter((x) => x !== g));
		} else if (selected.length < FULL) {
			setThirdGroups([...selected, g].sort());
		}
	}

	// 8組確定時：各ワイルドカード枠に入る実チームを Annex C で算出してプレビュー
	const assign =
		doneCount === FULL && window.WC.resolveThirdAssign
			? window.WC.resolveThirdAssign(gr, selected)
			: null;
	// スロットID → 対戦相手のグループ1位 seed（例 M1→'E1'）
	const winnerSeedOf = {};
	STRUCT.forEach((m) => {
		if (Array.isArray(m.bottom?.wc)) winnerSeedOf[m.id] = m.top;
	});

	const Chip = ({ g }) => {
		const code = thirdCode(g);
		const tm = code ? TEAM[code] : null;
		const on = selected.includes(g);
		const blocked = !on && selected.length >= FULL;
		return (
			<button
				onClick={() => toggle(g)}
				disabled={blocked}
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 3,
					width: "100%",
					textAlign: "left",
					border: "none",
					cursor: blocked ? "default" : "pointer",
					fontFamily: "inherit",
					background: on ? T.accent : T.card,
					borderRadius: 13,
					padding: "11px 12px",
					opacity: blocked ? 0.4 : 1,
					boxShadow: on ? "none" : `inset 0 0 0 1px ${T.line}`,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 9,
						width: "100%",
					}}
				>
					<span
						style={{
							fontFamily: "Archivo",
							fontWeight: 800,
							fontSize: 13,
							width: 16,
							flexShrink: 0,
							textAlign: "center",
							color: on ? T.accentInk : T.accent,
						}}
					>
						{g}
					</span>
					{tm ? (
						<Flag code={tm.code} size={19} style={{ flexShrink: 0 }} />
					) : (
						<span style={{ fontSize: 19, flexShrink: 0, lineHeight: 1 }}>
							⚪️
						</span>
					)}
					<span
						style={{
							flex: 1,
							minWidth: 0,
							fontWeight: 800,
							fontSize: 14,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
							color: on ? T.accentInk : tm ? T.text : T.faint,
						}}
					>
						{tm ? tm.ja : "3位未予想"}
					</span>
					{on && <Icon name="check" size={15} color={T.accentInk} sw={2.6} />}
				</div>
				<div
					style={{
						marginLeft: 25,
						fontSize: 11,
						fontFamily: "Archivo",
						letterSpacing: 0.4,
						color: on ? T.accentInk + "cc" : T.faint,
					}}
				>
					{g}組 3位
				</div>
			</button>
		);
	};

	return (
		<div style={{ padding: wide ? "4px 0 24px" : "4px 16px 16px" }}>
			<button
				onClick={goBack}
				style={{
					border: "none",
					background: "transparent",
					color: T.accent,
					fontWeight: 700,
					fontSize: 14,
					cursor: "pointer",
					fontFamily: "inherit",
					display: "flex",
					alignItems: "center",
					gap: 4,
					padding: "4px 0",
					marginBottom: 6,
				}}
			>
				<span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
					<Icon name="chevron" size={15} color={T.accent} />
				</span>
				予想ハブに戻る
			</button>
			<Eyebrow T={T}>OPTION · {member.name}</Eyebrow>
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					justifyContent: "space-between",
					marginTop: 3,
					marginBottom: 4,
				}}
			>
				<div
					style={{ fontSize: wide ? 26 : 22, fontWeight: 800, color: T.text }}
				>
					3位ワイルドカード
				</div>
				<span
					style={{
						fontFamily: "Archivo",
						fontWeight: 800,
						fontSize: 15,
						color: doneCount === FULL ? T.accent : T.text,
					}}
				>
					{doneCount}
					<span style={{ color: T.faint, fontSize: 12 }}>/8組</span>
				</span>
			</div>
			<p
				style={{
					color: T.sub,
					fontSize: 13,
					lineHeight: 1.55,
					margin: "0 0 14px",
				}}
			>
				各組3位のうち、成績上位8組がベスト32へ進みます。
				<br />
				<b>勝ち上がると思う8組</b>を選んでください。
				<br />
				対戦カードは FIFA 公式の組み合わせ表（Annex
				C）に従って自動で決まります。
			</p>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: wide ? "repeat(3, 1fr)" : "repeat(2, 1fr)",
					gap: 9,
				}}
			>
				{GROUPS.map((g) => (
					<Chip key={g} g={g} />
				))}
			</div>

			{/* プレビュー：8組確定時に対戦カードを表示 */}
			{assign && (
				<div style={{ marginTop: 18 }}>
					<Eyebrow T={T}>自動割当（公式組み合わせ表）</Eyebrow>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: wide ? "repeat(2, 1fr)" : "1fr",
							gap: 8,
							marginTop: 8,
						}}
					>
						{(window.WC.WILDCARD_SLOTS || []).map((slot) => {
							const wseed = winnerSeedOf[slot] || ""; // 'E1'
							const wg = wseed[0] || "?";
							const wcode = wseed ? (gr[wseed[0]] || [])[0] : null;
							const wtm = wcode ? TEAM[wcode] : null;
							const tcode = assign[slot];
							const ttm = tcode ? TEAM[tcode] : null;
							return (
								<div
									key={slot}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										background: T.card,
										borderRadius: 12,
										padding: "10px 12px",
										boxShadow: `inset 0 0 0 1px ${T.line}`,
									}}
								>
									<span
										style={{
											fontFamily: "Archivo",
											fontWeight: 800,
											fontSize: 11,
											color: T.faint,
											width: 26,
										}}
									>
										{slot}
									</span>
									{wtm ? (
										<Flag code={wtm.code} size={16} />
									) : (
										<span style={{ fontSize: 16 }}>🏳️</span>
									)}
									<span
										style={{
											fontWeight: 700,
											fontSize: 13,
											color: T.text,
											flex: 1,
											minWidth: 0,
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
										}}
									>
										{wtm ? wtm.ja : `${wg}組1位`}
									</span>
									<span
										style={{ fontSize: 11, color: T.faint, fontWeight: 800 }}
									>
										vs
									</span>
									{ttm ? (
										<Flag code={ttm.code} size={16} />
									) : (
										<span style={{ fontSize: 16 }}>⚪️</span>
									)}
									<span
										style={{
											fontWeight: 800,
											fontSize: 13,
											color: T.accent,
											flex: 1,
											minWidth: 0,
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
										}}
									>
										{ttm ? ttm.ja : "3位未予想"}
									</span>
								</div>
							);
						})}
					</div>
				</div>
			)}

			<OptionSaveBar
				T={T}
				onSave={async () => {
					await window.WC.Me.commit();
					goBack();
				}}
				hint="「保存」を押すと予想を保存して予想ハブに戻ります。押すまで保存されません。"
			/>
		</div>
	);
}

Object.assign(window, { ThirdWildScreen });
