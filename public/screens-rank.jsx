/* ============================================================
   画面: 4人見比べ ＆ ランキング（ポイント集計）
   ============================================================ */

// ===== 見比べ画面 ===========================================
function CompareScreen({ T, state, goTab, wide = false }) {
	const M = state.members;

	// ある項目で同じ予想をしている人数 → 一致ハイライト用
	const tally = (getter) => {
		const map = {};
		M.forEach((m) => {
			const v = getter(state.preds[m.id]);
			if (v) map[v] = (map[v] || 0) + 1;
		});
		return map;
	};

	const Section = ({ title, sub, color, icon, getter, isTeam }) => {
		const counts = tally(getter);
		return (
			<div style={{ marginBottom: 8 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						margin: "0 4px 10px",
					}}
				>
					<Icon name={icon} size={18} color={color} />
					<span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>
						{title}
					</span>
					<span
						style={{
							fontFamily: "Archivo",
							fontWeight: 700,
							fontSize: 10,
							letterSpacing: 1.4,
							color: T.faint,
							whiteSpace: "nowrap",
						}}
					>
						{sub}
					</span>
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{M.map((m) => {
						const v = getter(state.preds[m.id]);
						const team = isTeam ? window.WC.TEAM[v] : null;
						const agree = v && counts[v] > 1;
						return (
							<div
								key={m.id}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
									background: T.card,
									borderRadius: 16,
									padding: "11px 14px",
									boxShadow: `inset 0 0 0 1px ${agree ? color + "4D" : T.line}`,
								}}
							>
								<Avatar m={m} size={30} T={T} />
								<span
									style={{
										fontWeight: 700,
										color: T.sub,
										fontSize: 14,
										width: 52,
									}}
								>
									{m.name}
								</span>
								<span style={{ fontSize: 22 }}>
									{isTeam ? (team ? team.flag : "🏳️") : "⚽️"}
								</span>
								<span
									style={{
										fontWeight: 800,
										color: T.text,
										fontSize: 16,
										flex: 1,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{isTeam ? (team ? team.ja : "未選択") : v || "未選択"}
								</span>
								{agree && (
									<span
										style={{
											fontFamily: "Archivo",
											fontWeight: 800,
											fontSize: 10,
											letterSpacing: 0.6,
											color: color,
											background: `${color}1F`,
											padding: "3px 7px",
											borderRadius: 6,
										}}
									>
										{counts[v]}人一致
									</span>
								)}
							</div>
						);
					})}
				</div>
			</div>
		);
	};

	return (
		<div style={{ padding: wide ? "4px 0 24px" : "4px 16px 16px" }}>
			<Eyebrow T={T}>COMPARE</Eyebrow>
			<div
				style={{
					fontSize: wide ? 27 : 23,
					fontWeight: 800,
					color: T.text,
					marginTop: 3,
					marginBottom: 16,
				}}
			>
				{wide ? "みんなの予想を見比べ" : `${M.length}人の予想を見比べ`}
			</div>
			<div
				style={
					wide
						? {
								display: "grid",
								gridTemplateColumns: "repeat(3, 1fr)",
								gap: 18,
								alignItems: "start",
							}
						: undefined
				}
			>
				<Section
					title="優勝"
					sub="CHAMPION"
					color={T.gold}
					icon="trophy"
					getter={(p) => p.champion}
					isTeam
				/>
				<Section
					title="準優勝"
					sub="RUNNER-UP"
					color={T.silver}
					icon="medal"
					getter={(p) => p.runnerUp}
					isTeam
				/>
				<Section
					title="得点王"
					sub="TOP SCORER"
					color={T.boot}
					icon="boot"
					getter={(p) => p.topScorer}
					isTeam={false}
				/>
			</div>

			{!wide && (
				<button
					onClick={() => goTab("rank")}
					style={{
						marginTop: 10,
						width: "100%",
						border: "none",
						borderRadius: 16,
						padding: "15px",
						cursor: "pointer",
						background: T.accent,
						color: T.accentInk,
						fontSize: 16,
						fontWeight: 800,
						fontFamily: "inherit",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 8,
					}}
				>
					<Icon name="medal" size={19} color={T.accentInk} />
					ランキングを見る
				</button>
			)}
		</div>
	);
}

// ===== ランキング画面 =======================================
function RankingScreen({ T, state, wide = false }) {
	const M = state.members;
	const R = window.WC.RESULT || {};
	const [division, setDivision] = React.useState("core"); // 'core' | 'grand'
	const keyOf = (s) => (division === "core" ? s.coreTotal : s.grandTotal);
	const scored = M.map((m) => ({
		m,
		s: window.WC.scoreMember(state.preds[m.id]),
	})).sort((a, b) => keyOf(b.s) - keyOf(a.s));
	const [open, setOpen] = React.useState(null);
	const maxTotal = Math.max(1, ...scored.map((x) => keyOf(x.s)));

	// 確定結果が1つでも入力されているか（採点が実際に意味を持つか）を判定。
	// 未確定のあいだは順位メダル色を出さず「結果待ち」を明示する。
	const KO_ROUNDS = ["r32", "r16", "qf", "sf"];
	// 暫定込みの実効グループ順位（採点ラッパと同一ロジック）で判定。
	// これにより暫定点が入った時点でメダル色・順位番号が出る。
	const grRes = window.WC.scoringGroupResult
		? window.WC.scoringGroupResult()
		: R.groupResult || {};
	const koRes = R.knockout || {};
	const resultsLive =
		!!(R.champion || R.runnerUp || (R.topScorer && R.topScorer.trim())) ||
		Object.keys(grRes).some(
			(k) => (grRes[k] || []).filter(Boolean).length > 0,
		) ||
		KO_ROUNDS.some((r) => (koRes[r] || []).length > 0);

	const rankColor = (i) =>
		!resultsLive
			? T.faint
			: i === 0
				? T.gold
				: i === 1
					? T.silver
					: i === 2
						? T.boot
						: T.faint;
	// 未確定時は順位番号を出さず「–」（全員0ptで並びに意味が無いため）
	const rankLabel = (i) => (resultsLive ? i + 1 : "–");

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

	const DivisionTabs = () => (
		<div style={{ display: "flex", gap: 6, margin: "12px 0 4px" }}>
			{[
				["core", "コア部門"],
				["grand", "総合部門"],
			].map(([id, label]) => (
				<button
					key={id}
					onClick={() => setDivision(id)}
					style={{
						border: "none",
						cursor: "pointer",
						fontFamily: "inherit",
						fontWeight: 800,
						fontSize: 13,
						padding: "8px 14px",
						borderRadius: 11,
						background: division === id ? `${T.accent}1A` : "transparent",
						boxShadow:
							division === id
								? `inset 0 0 0 1px ${T.accent}3D`
								: `inset 0 0 0 1px ${T.line}`,
						color: division === id ? T.accent : T.sub,
					}}
				>
					{label}
				</button>
			))}
		</div>
	);

	// ----- 集計状況バナー（大会中のみ確定結果を表示。大会前は非表示）-----
	const Banner = () => {
		if (!resultsLive) return null;
		const champ = R.champion ? window.WC.TEAM[R.champion] : null;
		const runner = R.runnerUp ? window.WC.TEAM[R.runnerUp] : null;
		const scorer = (R.topScorer || "").trim();
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 9,
					background: T.panel2,
					borderRadius: 14,
					padding: "11px 13px",
					margin: "12px 0 16px",
				}}
			>
				<Icon name="flame" size={17} color={T.accent} />
				<div style={{ fontSize: 13, color: T.sub, lineHeight: 1.45 }}>
					<b style={{ color: T.text }}>確定結果</b>で集計中 · 優勝{" "}
					{champ ? (
						<>
							<Flag code={champ.code} size={15} style={{ marginRight: 3 }} />
							{champ.ja}
						</>
					) : (
						"—"
					)}{" "}
					/ 準優勝{" "}
					{runner ? (
						<>
							<Flag code={runner.code} size={15} style={{ marginRight: 3 }} />
							{runner.ja}
						</>
					) : (
						"—"
					)}{" "}
					/ 得点王 {scorer || "—"}
				</div>
			</div>
		);
	};

	// 結果未確定のあいだは順位を付けず、参加者数と入力待ちを示すプレースホルダーを表示
	const EmptyPodium = () => (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 8,
				background: T.card,
				borderRadius: 18,
				boxShadow: `inset 0 0 0 1px ${T.line}`,
				padding: "26px 18px",
				margin: wide ? "0 auto 4px" : "0 0 18px",
				maxWidth: wide ? 460 : "none",
			}}
		>
			<Icon name="trophy" size={26} color={T.faint} />
			<div style={{ fontWeight: 800, fontSize: 15, color: T.text }}>
				まだ順位はつきません
			</div>
			<div
				style={{
					fontSize: 13,
					color: T.sub,
					textAlign: "center",
					lineHeight: 1.5,
				}}
			>
				<DotBreak>{`${M.length}人が予想を登録済み。試合結果が出ると順位が表示されます。`}</DotBreak>
			</div>
		</div>
	);

	const Podium = () =>
		!resultsLive ? (
			<EmptyPodium />
		) : (
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					gap: 10,
					maxWidth: wide ? 460 : "none",
					margin: wide ? "0 auto 4px" : "0 0 18px",
				}}
			>
				{[1, 0, 2].map((pos) => {
					const item = scored[pos];
					if (!item) return <div key={pos} style={{ flex: 1 }} />;
					const h = pos === 0 ? 116 : pos === 1 ? 92 : 78;
					return (
						<div
							key={pos}
							style={{
								flex: 1,
								display: "flex",
								flexDirection: "column",
								alignItems: "center",
								gap: 7,
							}}
						>
							<Avatar m={item.m} size={pos === 0 ? 48 : 40} T={T} />
							<div style={{ fontWeight: 800, fontSize: 13, color: T.text }}>
								{item.m.name}
							</div>
							<div
								style={{
									width: "100%",
									height: h,
									borderRadius: "14px 14px 0 0",
									background: `linear-gradient(180deg, ${rankColor(pos)}38, ${T.card})`,
									boxShadow: `inset 0 0 0 1px ${T.line}`,
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									justifyContent: "flex-start",
									paddingTop: 12,
									gap: 2,
								}}
							>
								<div
									style={{
										fontFamily: "Archivo",
										fontWeight: 900,
										fontSize: 22,
										color: rankColor(pos),
									}}
								>
									{pos + 1}
								</div>
								<div
									style={{
										fontFamily: "Archivo",
										fontWeight: 900,
										fontSize: 26,
										color: T.text,
									}}
								>
									{keyOf(item.s)}
								</div>
								<div style={{ fontSize: 10, color: T.faint, fontWeight: 700 }}>
									pt
								</div>
							</div>
						</div>
					);
				})}
			</div>
		);

	const COLS = "46px minmax(140px,1.4fr) repeat(4, 1fr) 92px";
	const TableHead = () => (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: COLS,
				gap: 10,
				alignItems: "center",
				padding: "0 16px 10px",
				fontFamily: "Archivo",
				fontWeight: 800,
				fontSize: 10,
				letterSpacing: 1.2,
				color: T.faint,
			}}
		>
			<div>#</div>
			<div>メンバー</div>
			<div style={{ color: T.gold }}>優勝</div>
			<div style={{ color: T.silver }}>準優勝</div>
			<div style={{ color: T.boot }}>得点王</div>
			<div style={{ color: T.accent }}>オプション</div>
			<div style={{ textAlign: "right" }}>合計</div>
		</div>
	);
	const CatCell = ({ flag, text, ok, pts, color }) => (
		<div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
			{flag !== undefined && <span style={{ fontSize: 17 }}>{flag}</span>}
			<span
				style={{
					fontSize: 13,
					fontWeight: 700,
					color: ok ? T.text : T.faint,
					minWidth: 0,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{text}
			</span>
			{pts > 0 && (
				<span
					style={{
						fontFamily: "Archivo",
						fontWeight: 800,
						fontSize: 11,
						color,
						marginLeft: "auto",
						flexShrink: 0,
					}}
				>
					+{pts}
				</span>
			)}
		</div>
	);
	const RankTable = () => (
		<div
			style={{
				background: T.card,
				borderRadius: 20,
				boxShadow: `inset 0 0 0 1px ${T.line}`,
				padding: "16px 0 6px",
				marginTop: 18,
			}}
		>
			<TableHead />
			<div>
				{scored.map((item, i) => {
					const p = state.preds[item.m.id];
					const cHit = !!(
						p.champion &&
						R.champion &&
						p.champion === R.champion
					);
					const rHit = !!(
						p.runnerUp &&
						R.runnerUp &&
						p.runnerUp === R.runnerUp
					);
					const sHit =
						p.topScorer &&
						R.topScorer &&
						p.topScorer.trim() === R.topScorer.trim();
					const cT = window.WC.TEAM[p.champion],
						rT = window.WC.TEAM[p.runnerUp];
					return (
						<div
							key={item.m.id}
							style={{
								display: "grid",
								gridTemplateColumns: COLS,
								gap: 10,
								alignItems: "center",
								padding: "11px 16px",
								borderTop: `1px solid ${T.line}`,
								background:
									resultsLive && i === 0 ? `${T.gold}0F` : "transparent",
							}}
						>
							<span
								style={{
									fontFamily: "Archivo",
									fontWeight: 900,
									fontSize: 17,
									color: rankColor(i),
								}}
							>
								{rankLabel(i)}
							</span>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 9,
									minWidth: 0,
								}}
							>
								<Avatar m={item.m} size={30} T={T} />
								<span
									style={{
										fontWeight: 800,
										color: T.text,
										fontSize: 14,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{item.m.name}
								</span>
							</div>
							<CatCell
								flag={cT ? cT.flag : "🏳️"}
								text={cT ? cT.ja : "—"}
								ok={cHit}
								pts={item.s.core.champion}
								color={T.gold}
							/>
							<CatCell
								flag={rT ? rT.flag : "🏳️"}
								text={rT ? rT.ja : "—"}
								ok={rHit}
								pts={item.s.core.runnerUp}
								color={T.silver}
							/>
							<CatCell
								flag="⚽️"
								text={p.topScorer || "—"}
								ok={sHit}
								pts={item.s.core.topScorer}
								color={T.boot}
							/>
							<CatCell
								text={`順位${item.s.option.rankHits}・KO${item.s.option.koHits.r32 + item.s.option.koHits.r16 + item.s.option.koHits.qf + item.s.option.koHits.sf}`}
								ok={item.s.option.total > 0}
								pts={division === "grand" ? item.s.option.total : 0}
								color={T.accent}
							/>
							<div style={{ textAlign: "right" }}>
								<span
									style={{
										fontFamily: "Archivo",
										fontWeight: 900,
										fontSize: 21,
										color: T.text,
									}}
								>
									{keyOf(item.s)}
								</span>
								<span style={{ fontSize: 11, color: T.faint, fontWeight: 700 }}>
									{" "}
									pt
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);

	const Legend = () => (
		<div
			style={{
				display: "flex",
				flexWrap: "wrap",
				gap: 12,
				marginTop: 16,
				padding: "12px 14px",
				background: T.panel2,
				borderRadius: 14,
			}}
		>
			{[
				["優勝", T.gold, "+25"],
				["準優勝", T.silver, "+15"],
				["得点王", T.boot, "+20"],
				["オプション", T.accent, "グループ+ノックアウト"],
			].map(([l, c, v]) => (
				<div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<div
						style={{ width: 10, height: 10, borderRadius: 3, background: c }}
					/>
					<span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>
						{l}
					</span>
					<span
						style={{
							fontFamily: "Archivo",
							fontSize: 11,
							fontWeight: 700,
							color: T.faint,
						}}
					>
						{v}
					</span>
				</div>
			))}
		</div>
	);

	// ----- デスクトップ表示 -----
	if (wide) {
		return (
			<div style={{ padding: "4px 0 24px" }}>
				<Eyebrow T={T}>RANKING</Eyebrow>
				<div
					style={{ fontSize: 27, fontWeight: 800, color: T.text, marginTop: 3 }}
				>
					予想の的中ランキング
				</div>
				<Banner />
				<DivisionTabs />
				<Podium />
				<RankTable />
				<Legend />
			</div>
		);
	}

	return (
		<div style={{ padding: "4px 16px 16px" }}>
			<Eyebrow T={T}>RANKING</Eyebrow>
			<div
				style={{ fontSize: 23, fontWeight: 800, color: T.text, marginTop: 3 }}
			>
				予想の的中ランキング
			</div>

			<Banner />
			<DivisionTabs />

			{/* 表彰台 トップ3（結果未確定なら「結果待ち」プレースホルダー）*/}
			<Podium />

			{/* 詳細リスト */}
			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{scored.map((item, i) => {
					const p = state.preds[item.m.id];
					const isOpen = open === item.m.id;
					return (
						<div
							key={item.m.id}
							style={{
								background: T.card,
								borderRadius: 16,
								boxShadow: `inset 0 0 0 1px ${T.line}`,
								overflow: "hidden",
							}}
						>
							<button
								onClick={() => setOpen(isOpen ? null : item.m.id)}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
									width: "100%",
									border: "none",
									background: "transparent",
									cursor: "pointer",
									padding: "12px 14px",
									fontFamily: "inherit",
									textAlign: "left",
								}}
							>
								<span
									style={{
										fontFamily: "Archivo",
										fontWeight: 900,
										fontSize: 18,
										color: rankColor(i),
										width: 22,
									}}
								>
									{rankLabel(i)}
								</span>
								<Avatar m={item.m} size={34} T={T} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>
										{item.m.name}
									</div>
									{/* 内訳バー */}
									<div
										style={{
											display: "flex",
											height: 6,
											borderRadius: 4,
											overflow: "hidden",
											marginTop: 5,
											background: T.panel2,
											width: 130,
										}}
									>
										{[
											["champion", T.gold, item.s.core.champion],
											["runnerUp", T.silver, item.s.core.runnerUp],
											["topScorer", T.boot, item.s.core.topScorer],
											...(division === "grand"
												? [["option", T.accent, item.s.option.total]]
												: []),
										].map(([k, c, v]) => (
											<div
												key={k}
												style={{
													width: `${(v / maxTotal) * 100}%`,
													background: c,
												}}
											/>
										))}
									</div>
								</div>
								<div style={{ textAlign: "right" }}>
									<span
										style={{
											fontFamily: "Archivo",
											fontWeight: 900,
											fontSize: 22,
											color: T.text,
										}}
									>
										{keyOf(item.s)}
									</span>
									<span
										style={{ fontSize: 11, color: T.faint, fontWeight: 700 }}
									>
										{" "}
										pt
									</span>
								</div>
								<div
									style={{
										transform: isOpen ? "rotate(90deg)" : "none",
										transition: ".2s ease",
									}}
								>
									<Icon name="chevron" size={16} color={T.faint} />
								</div>
							</button>
							{isOpen && (
								<div style={{ padding: "0 14px 14px 48px" }}>
									<div
										style={{
											display: "flex",
											flexWrap: "wrap",
											gap: 12,
											marginBottom: 10,
										}}
									>
										<HitBadge
											ok={
												!!(
													p.champion &&
													R.champion &&
													p.champion === R.champion
												)
											}
											label={`優勝 +${item.s.core.champion}`}
										/>
										<HitBadge
											ok={
												!!(
													p.runnerUp &&
													R.runnerUp &&
													p.runnerUp === R.runnerUp
												)
											}
											label={`準優勝 +${item.s.core.runnerUp}`}
										/>
										<HitBadge
											ok={
												p.topScorer &&
												R.topScorer &&
												p.topScorer.trim() === R.topScorer.trim()
											}
											label={`得点王 +${item.s.core.topScorer}`}
										/>
									</div>
									{division === "grand" && (
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
												順位的中{" "}
												<b style={{ color: T.text }}>
													+{item.s.option.groupRank}
												</b>
												（{item.s.option.rankHits}）
											</span>
											<span>
												ノックアウト{" "}
												<b style={{ color: T.text }}>
													+{item.s.option.knockout}
												</b>
												<span style={{ color: T.faint }}>
													（16強{item.s.option.koHits.r32}・8強
													{item.s.option.koHits.r16}・4強
													{item.s.option.koHits.qf}・決勝
													{item.s.option.koHits.sf}）
												</span>
											</span>
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>

			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: 12,
					marginTop: 16,
					padding: "12px 14px",
					background: T.panel2,
					borderRadius: 14,
				}}
			>
				{[
					["優勝", T.gold, "+25"],
					["準優勝", T.silver, "+15"],
					["得点王", T.boot, "+20"],
					["オプション", T.accent, "グループ+ノックアウト"],
				].map(([l, c, v]) => (
					<div
						key={l}
						style={{ display: "flex", alignItems: "center", gap: 6 }}
					>
						<div
							style={{ width: 10, height: 10, borderRadius: 3, background: c }}
						/>
						<span style={{ fontSize: 12, color: T.sub, fontWeight: 600 }}>
							{l}
						</span>
						<span
							style={{
								fontFamily: "Archivo",
								fontSize: 11,
								fontWeight: 700,
								color: T.faint,
							}}
						>
							{v}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

Object.assign(window, { CompareScreen, RankingScreen });
