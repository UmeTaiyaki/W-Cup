// 結果スクリーン（読み取り専用）: グループリーグ / ノックアウト / 得点王 の3サブタブ。
// 終了済みの試合は各グループ表の下にカルーセルで表示する（旧「日程」サブタブは廃止）。
function GroupScreen({ T, wide = false }) {
	const [sub, setSub] = React.useState("league"); // 'league' | 'ko' | 'scorer'
	const SUBS = [
		{ id: "league", label: "グループリーグ" },
		{ id: "ko", label: "ノックアウト" },
		{ id: "scorer", label: "得点王" },
	];

	const SubTabs = () => (
		<div
			style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}
		>
			{SUBS.map((s) => {
				const active = sub === s.id;
				return (
					<button
						key={s.id}
						onClick={() => setSub(s.id)}
						style={{
							border: "none",
							cursor: "pointer",
							fontFamily: "inherit",
							borderRadius: 999,
							padding: "8px 16px",
							fontWeight: 800,
							fontSize: 14,
							background: active ? T.accent : T.card,
							color: active ? T.accentInk : T.sub,
							boxShadow: active ? "none" : `inset 0 0 0 1px ${T.line}`,
							transition: ".15s ease",
						}}
					>
						{s.label}
					</button>
				);
			})}
		</div>
	);

	return (
		<div style={{ padding: wide ? "4px 0 24px" : "4px 16px 16px" }}>
			<div style={{ marginBottom: 12 }}>
				<div
					style={{
						fontFamily: "Archivo",
						fontWeight: 800,
						fontSize: 11,
						letterSpacing: 1.4,
						color: T.faint,
					}}
				>
					RESULTS
				</div>
				<div
					style={{
						fontSize: wide ? 24 : 20,
						fontWeight: 800,
						color: T.text,
						marginTop: 2,
					}}
				>
					大会結果
				</div>
			</div>
			<SubTabs />
			{sub === "league" && <LeagueTables T={T} />}
			{sub === "ko" && <KnockoutResults T={T} />}
			{sub === "scorer" && <ScorerRanking T={T} />}
		</div>
	);
}

// ---- グループ試合カルーセル（各グループ表の下：終了済みのみ・新しい順）----
// 当該グループ（round = 'A'〜'L'）の SCHEDULE から終了試合だけを抜き出し、
// 横スクロールのコンパクトな試合カードで並べる。タップで試合詳細を開く。
const GROUP_DOW = ["日", "月", "火", "水", "木", "金", "土"];
function fmtGroupMatchDate(dateStr) {
	if (!dateStr) return "";
	const [y, m, d] = dateStr.split("-").map(Number);
	const wd = GROUP_DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
	return `${m}/${d}(${wd})`;
}

function GroupMatchCarousel({ T, k }) {
	const schedule = window.WC.SCHEDULE || [];
	const TEAM = window.WC.TEAM || {};
	const mr = window.WC.matchResult;
	if (!mr) return null;

	// 当該グループの終了試合（FT）を新しい順に。
	const finished = schedule
		.filter((m) => m && m.round === k)
		.map((m) => ({ m, r: mr(m) }))
		.filter((x) => x.r) // 終了スコアがあるもののみ
		.sort((x, y) => {
			const xk = `${x.m.date || ""} ${x.m.time || ""}`;
			const yk = `${y.m.date || ""} ${y.m.time || ""}`;
			return xk < yk ? 1 : xk > yk ? -1 : 0;
		});

	if (finished.length === 0) return null;

	const openDetail = (m) => {
		const id = window.WC.fixtureIdForMatch && window.WC.fixtureIdForMatch(m);
		if (id != null) window.WC.openDetail && window.WC.openDetail(id);
	};

	const Side = ({ code, alignEnd }) => {
		const tm = TEAM[code];
		return (
			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 4,
				}}
			>
				<Flag code={code} size={26} />
				<span
					style={{
						fontFamily: "Archivo",
						fontWeight: 800,
						fontSize: 11,
						color: T.sub,
						whiteSpace: "nowrap",
					}}
				>
					{tm ? code : "未定"}
				</span>
			</div>
		);
	};

	return (
		<div style={{ marginTop: 12 }}>
			<div
				style={{
					display: "flex",
					gap: 8,
					overflowX: "auto",
					paddingBottom: 4,
					scrollSnapType: "x proximity",
					WebkitOverflowScrolling: "touch",
				}}
			>
				{finished.map(({ m, r }, i) => (
					<button
						key={`${m.date || "x"}-${m.a}-${m.b}-${i}`}
						onClick={() => openDetail(m)}
						style={{
							flex: "0 0 auto",
							width: 148,
							scrollSnapAlign: "start",
							border: "none",
							cursor: "pointer",
							fontFamily: "inherit",
							textAlign: "left",
							background: T.bg,
							borderRadius: 12,
							padding: "10px 10px 11px",
							boxShadow: `inset 0 0 0 1px ${T.line}`,
						}}
					>
						<div
							style={{
								fontSize: 10,
								fontWeight: 700,
								color: T.faint,
								marginBottom: 8,
								textAlign: "center",
							}}
						>
							{fmtGroupMatchDate(m.date) || "日付未定"}
						</div>
						<div
							style={{
								display: "flex",
								alignItems: "flex-start",
								gap: 4,
							}}
						>
							<Side code={m.a} />
							<div
								style={{
									flexShrink: 0,
									paddingTop: 4,
									fontFamily: "Archivo",
									fontWeight: 900,
									fontSize: 17,
									color: T.text,
									letterSpacing: 0.5,
									whiteSpace: "nowrap",
								}}
							>
								{r.a ?? 0}
								<span style={{ color: T.faint, margin: "0 4px" }}>-</span>
								{r.b ?? 0}
							</div>
							<Side code={m.b} />
						</div>
					</button>
				))}
			</div>
		</div>
	);
}

// ---- ①グループリーグ（フルリーグ表）----
// 暫定突破圏を緑の縦線で示す（1・2位＝自動 / 3位＝全12組の3位成績上位8組）。
// 試合中のグループはカード右上に「試合中」を赤文字＋点滅で表示する。
const ADV_GREEN = "#22C55E"; // 突破圏インジケータ（テーマ非依存の明確な緑）
function LeagueTables({ T }) {
	const GK = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
	const groups = window.WC.GROUPS || {};
	const matches = window.WC.GROUP_MATCHES || {};
	const gr = window.WC.GROUP_RESULT || {};
	const TEAM = window.WC.TEAM || {};
	const compute = window.WC.computeStandings;
	const [detailCode, setDetailCode] = React.useState(null);
	// タイブレーカー⑦⑧（フェアプレーポイント / FIFAランク）。/api/results 由来。
	const tieOpts = {
		fairPlay: window.WC.FAIR_PLAY || {},
		fifaRank: window.WC.FIFA_RANK || {},
	};

	// 各グループの暫定順位（スコアがある組のみ算出）を一括計算しておく。
	const standingsByGroup = {};
	let anyStandings = false;
	for (const k of GK) {
		const members = (groups[k] || []).filter(Boolean);
		const ms = matches[k] || [];
		const hasScores = ms.some(
			(m) => typeof m.ga === "number" && typeof m.gb === "number",
		);
		const rows = hasScores && compute ? compute(members, ms, tieOpts) : null;
		standingsByGroup[k] = rows;
		if (rows) anyStandings = true;
	}

	// 3位通過（暫定）: 各組3位を成績順（勝点→得失差→総得点）に並べ、上位8組が突破圏。
	const thirdAdvance = new Set();
	const thirds = GK.map((k) => {
		const rows = standingsByGroup[k];
		const r = rows && rows[2];
		return r ? { k, r } : null;
	}).filter(Boolean);
	thirds.sort(
		(x, y) =>
			y.r.pts - x.r.pts ||
			y.r.gd - x.r.gd ||
			y.r.gf - x.r.gf ||
			(x.k < y.k ? -1 : 1),
	);
	thirds.slice(0, 8).forEach((c) => thirdAdvance.add(c.k));

	// グループ全試合確定後は /api/results の確定3位8組（thirdGroups）を真実とする。
	// これが揃っている＝全12組が数学的に確定 → 突破/敗退を断定できる（暫定→確定）。
	const confirmedThirds =
		(window.WC.RESULT && window.WC.RESULT.thirdGroups) || [];
	const thirdsConfirmed = confirmedThirds.length === 8;

	// 試合中（LIVE）のグループ判定: ライブ index か GROUP_MATCHES の status を見る。
	const isGroupLive = (k) => {
		const ms = matches[k] || [];
		const pairs =
			ms.length || !window.WC.generateFixtures
				? ms
				: window.WC.generateFixtures((groups[k] || []).filter(Boolean));
		return pairs.some((m) => {
			if (m.status === "LIVE") return true;
			const lv =
				window.WC.liveForMatch && window.WC.liveForMatch({ a: m.a, b: m.b });
			return lv && lv.status === "LIVE";
		});
	};

	// 突破圏か（i: 暫定順位インデックス0始まり, k: グループ）。
	// 3位は全組確定後は確定3位8組、未確定なら暫定best8で緑線を出す（バッジと一致）。
	const isAdvancing = (k, i) =>
		i === 0 ||
		i === 1 ||
		(i === 2 &&
			(thirdsConfirmed ? confirmedThirds.includes(k) : thirdAdvance.has(k)));

	// 突破圏を示す左の緑縦線（非突破でも幅を確保して桁を揃える）。
	const AdvBar = ({ on }) => (
		<span
			style={{
				width: 3,
				alignSelf: "stretch",
				minHeight: 16,
				borderRadius: 2,
				flexShrink: 0,
				background: on ? ADV_GREEN : "transparent",
			}}
		/>
	);

	const Card = ({ k }) => {
		const members = (groups[k] || []).filter(Boolean);
		const rows = standingsByGroup[k];
		const live = isGroupLive(k);
		// 数学的に確定したチームの突破/敗退/1位状態（残り試合の全シナリオ判定）。
		const clinch = window.WC.computeClinchStatus
			? window.WC.computeClinchStatus(members, matches[k] || [])
			: {};
		// 当該組が全試合確定（GROUP_RESULT に最終順位3つ）なら最終結果で突破/敗退を明記する。
		const groupDone = (gr[k] || []).filter(Boolean).length >= 3;
		// フォールバック: 最終順位の並び（数値なし）
		const order = (gr[k] || []).filter(Boolean);
		const fallback = order.length
			? [...order, ...members.filter((c) => !order.includes(c))]
			: members;

		return (
			<div
				style={{
					background: T.card,
					borderRadius: 18,
					padding: 14,
					boxShadow: `inset 0 0 0 1px ${T.line}`,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 8,
						marginBottom: 10,
					}}
				>
					<span
						style={{
							fontFamily: "Archivo",
							fontWeight: 900,
							fontSize: 15,
							color: T.accent,
						}}
					>
						GROUP {k}
					</span>
					{live && (
						<span
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 5,
								fontSize: 11,
								fontWeight: 900,
								color: T.danger,
							}}
						>
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: 3,
									background: T.danger,
									display: "inline-block",
									animation: "wc-blink 1s ease-in-out infinite",
								}}
							/>
							<span style={{ animation: "wc-blink 1s ease-in-out infinite" }}>
								試合中
							</span>
						</span>
					)}
				</div>
				{rows ? (
					<div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								fontFamily: "Archivo",
								fontWeight: 800,
								fontSize: 10,
								color: T.faint,
								padding: "0 4px 6px",
							}}
						>
							<span style={{ width: 3 }} />
							<span style={{ width: 16 }} />
							<span style={{ flex: 1 }} />
							<span style={{ width: 28, textAlign: "center" }}>勝点</span>
							<span style={{ width: 18, textAlign: "center" }}>試</span>
							<span style={{ width: 46, textAlign: "center" }}>勝分敗</span>
							<span style={{ width: 30, textAlign: "right" }}>得失</span>
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
							{rows.map((r, i) => {
								const tm = TEAM[r.code];
								if (!tm) return null;
								const adv = isAdvancing(k, i);
								const cs = clinch[r.code] || {};
								// 確定後は最終順位で明記:
								//   1・2位＝「突破」(緑) / 3位＝確定8組のみ「突破」(緑) /
								//   それ以外(3位の非通過・4位)＝「敗退」(赤)。
								// 3位の通過可否は全12組確定(thirdsConfirmed)後にのみ断定し、
								// それ以前はライブのクリンチ判定にフォールバックする。
								let badge = null;
								if (
									groupDone &&
									(i < 2 || i === 3 || (i === 2 && thirdsConfirmed))
								) {
									const advanced =
										i < 2 || (i === 2 && confirmedThirds.includes(k));
									badge = advanced
										? { t: "突破", c: ADV_GREEN }
										: { t: "敗退", c: T.danger };
								} else {
									badge = cs.won
										? { t: "1位確定", c: T.gold }
										: cs.qualified
											? { t: "突破", c: ADV_GREEN }
											: cs.eliminated
												? { t: "敗退", c: T.faint }
												: null;
								}
								const posColor =
									i === 0
										? T.gold
										: i === 1
											? T.silver
											: i < 2
												? T.sub
												: T.faint;
								return (
									<div
										key={r.code}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											fontSize: 13,
										}}
									>
										<AdvBar on={adv} />
										<span
											style={{
												width: 16,
												textAlign: "center",
												fontFamily: "Archivo",
												fontWeight: 800,
												color: posColor,
											}}
										>
											{i + 1}
										</span>
										<Flag code={r.code} size={18} />
										<span
											onClick={() => setDetailCode(r.code)}
											style={{
												fontWeight: 700,
												color: T.text,
												flex: 1,
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
												cursor: "pointer",
											}}
										>
											{tm.ja}
											<span style={{ color: T.faint, marginLeft: 3 }}>›</span>
										</span>
										{badge && (
											<span
												style={{
													flexShrink: 0,
													fontFamily: "Archivo",
													fontWeight: 900,
													fontSize: 9,
													lineHeight: 1,
													padding: "2px 5px",
													borderRadius: 6,
													color: badge.c,
													background: badge.c + "22",
												}}
											>
												{badge.t}
											</span>
										)}
										<span
											style={{
												width: 28,
												textAlign: "center",
												fontWeight: 900,
												color: T.text,
											}}
										>
											{r.pts}
										</span>
										<span
											style={{ width: 18, textAlign: "center", color: T.sub }}
										>
											{r.played}
										</span>
										<span
											style={{
												width: 46,
												textAlign: "center",
												color: T.sub,
												fontSize: 12,
											}}
										>
											{r.w}-{r.d}-{r.l}
										</span>
										<span
											style={{
												width: 30,
												textAlign: "right",
												color: T.sub,
												fontSize: 12,
											}}
										>
											{r.gd > 0 ? "+" : ""}
											{r.gd}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
						{fallback.map((code) => {
							const tm = TEAM[code];
							if (!tm) return null;
							const pos = order.length ? order.indexOf(code) : -1;
							const posColor =
								pos === 0
									? T.gold
									: pos === 1
										? T.silver
										: pos >= 0
											? T.sub
											: T.faint;
							return (
								<div
									key={code}
									style={{ display: "flex", alignItems: "center", gap: 10 }}
								>
									<span
										style={{
											width: 18,
											textAlign: "center",
											fontFamily: "Archivo",
											fontWeight: 800,
											fontSize: 13,
											color: posColor,
										}}
									>
										{pos >= 0 ? pos + 1 : "–"}
									</span>
									<Flag code={code} size={20} />
									<span
										onClick={() => setDetailCode(code)}
										style={{
											fontWeight: 700,
											color: T.text,
											fontSize: 14,
											flex: 1,
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
											cursor: "pointer",
										}}
									>
										{tm.ja}
										<span style={{ color: T.faint, marginLeft: 3 }}>›</span>
									</span>
								</div>
							);
						})}
						{fallback.length === 0 && (
							<div style={{ color: T.faint, fontSize: 13 }}>未設定</div>
						)}
					</div>
				)}
				<GroupMatchCarousel T={T} k={k} />
			</div>
		);
	};

	return (
		<>
			{anyStandings && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 7,
						margin: "0 4px 12px",
						fontSize: 11.5,
						fontWeight: 700,
						color: T.sub,
					}}
				>
					<span
						style={{
							width: 3,
							height: 13,
							borderRadius: 2,
							background: ADV_GREEN,
							display: "inline-block",
						}}
					/>
					{thirdsConfirmed
						? "決勝トーナメント進出（各組1・2位＋3位上位8組）。圏外は敗退。"
						: "暫定で決勝トーナメント進出圏（各組1・2位＋各組3位の上位8組）"}
				</div>
			)}
			<div
				style={{
					display: "grid",
					gridTemplateColumns:
						"repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
					gap: 12,
				}}
			>
				{GK.map((k) => (
					<Card key={k} k={k} />
				))}
			</div>
			{detailCode && (
				<TeamDetailSheet
					T={T}
					code={detailCode}
					onClose={() => setDetailCode(null)}
				/>
			)}
		</>
	);
}

// ---- ②ノックアウト（ホームと同じ KnockoutView を実結果で）----
function KnockoutResults({ T }) {
	const R = window.WC.RESULT || {};
	const baseGr = window.WC.GROUP_RESULT || {};
	const GROUPS = window.WC.GROUPS || {};
	const GM = window.WC.GROUP_MATCHES || {};
	// タイブレーカー⑦⑧（順位表タブと同じ条件で暫定順位を一致させる）。
	const tieOpts = {
		fairPlay: window.WC.FAIR_PLAY || {},
		fifaRank: window.WC.FIFA_RANK || {},
	};
	// 確定枠（base/クリンチ）はそのまま、未確定枠は現在の暫定順位で補完する。
	// provFlags[g][i]=true の枠は暫定配置 → 後で「暫定」マーカーを付ける。
	const pgr = window.WC.provisionalGroupRank
		? window.WC.provisionalGroupRank(GROUPS, GM, baseGr, tieOpts)
		: {
				rank: window.WC.clinchGroupRank
					? window.WC.clinchGroupRank(GROUPS, GM, baseGr)
					: baseGr,
				provisional: {},
			};
	const gr = pgr.rank;
	const provFlags = pgr.provisional || {};
	// 暫定配置されたチームコードの集合（KnockoutView の「暫定」表示用）。
	const provSet = new Set();
	for (const g of Object.keys(provFlags)) {
		(provFlags[g] || []).forEach((isP, i) => {
			if (isP && gr[g] && gr[g][i]) provSet.add(gr[g][i]);
		});
	}
	const TEAM = window.WC.TEAM || {};
	const ROUNDS = ["r32", "r16", "qf", "sf"];
	const LABELS = {
		r32: "ベスト32",
		r16: "ベスト16",
		qf: "準々決勝",
		sf: "準決勝",
	};
	// 3位枠は thirdGroups（実際に通過した8組）から FIFA Annex C で自動割当。
	// 確定 thirdGroups が無ければ現在順位の暫定 best8 で割当し、該当枠は暫定扱い。
	let thirdGroups =
		R.thirdGroups && R.thirdGroups.length ? R.thirdGroups : null;
	let thirdProvisional = false;
	if (!thirdGroups && window.WC.provisionalThirdGroups) {
		const pt = window.WC.provisionalThirdGroups(GROUPS, GM, tieOpts);
		if (pt.length === 8) {
			thirdGroups = pt;
			thirdProvisional = true;
		}
	}
	const ta =
		thirdGroups && window.WC.resolveThirdAssign
			? window.WC.resolveThirdAssign(gr, thirdGroups)
			: R.thirdAssign || {};
	if (thirdProvisional) {
		for (const c of Object.values(ta)) if (c) provSet.add(c);
	}
	// R.knockout は「各ラウンド到達チーム集合」。各カードの勝者は「次ラウンド到達側」
	// なので deriveKnockoutFromAppeared で 1 ラウンドずらして判定する（試合前の誤勝者表示を防止）。
	const finalists = [R.champion, R.runnerUp].filter(Boolean);
	const der = window.WC.deriveKnockoutFromAppeared
		? window.WC.deriveKnockoutFromAppeared(gr, ta, R.knockout || {}, finalists)
		: window.WC.deriveKnockoutFromSets
			? window.WC.deriveKnockoutFromSets(gr, ta, R.knockout || {})
			: null;
	const champ = R.champion ? TEAM[R.champion] : null;

	// 進出国が未確定でも、各枠の出自（A組1位など）は決まっているので
	// トーナメント表は常に表示する。確定結果はそのまま枠に入る。
	if (!der) {
		return (
			<div
				style={{
					background: T.card,
					borderRadius: 16,
					padding: "26px 18px",
					textAlign: "center",
					boxShadow: `inset 0 0 0 1px ${T.line}`,
					color: T.faint,
					fontSize: 14,
					fontWeight: 700,
				}}
			>
				ノックアウトの結果はまだありません
			</div>
		);
	}
	return (
		<div>
			{provSet.size > 0 && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						margin: "0 0 10px",
						fontSize: 11.5,
						fontWeight: 700,
						color: T.faint,
						lineHeight: 1.4,
					}}
				>
					<span
						style={{
							flexShrink: 0,
							fontSize: 9,
							fontWeight: 800,
							lineHeight: 1,
							letterSpacing: 0.3,
							padding: "2px 4px",
							borderRadius: 4,
							color: "#92400E",
							background: "#FCD34D",
						}}
					>
						暫定
					</span>
					＝現在の順位による配置（試合の進行でリアルタイムに変わります）
				</div>
			)}
			<window.KnockoutView
				T={T}
				der={der}
				champ={champ}
				ROUNDS={ROUNDS}
				LABELS={LABELS}
				provisional={provSet}
				champEmptyLabel="優勝"
				onMatchTap={(a, b) => {
					const id =
						window.WC.fixtureIdForMatch &&
						window.WC.fixtureIdForMatch({ a, b });
					if (id != null) window.WC.openDetail && window.WC.openDetail(id);
				}}
			/>
		</div>
	);
}

// ---- ③得点王ランキング ----
// 選手名は `NAME (CODE)` 形式（旧データは素の名前）。国旗＋選手名に整形する。
function parseScorerName(raw) {
	const m = /^(.*)\s+\(([A-Za-z]{2,3})\)$/.exec(raw || "");
	if (!m) return { flag: "", name: raw || "" };
	const tm = (window.WC.TEAM || {})[m[2]] || {};
	return { flag: tm.flag || "", name: m[1] };
}
function ScorerRanking({ T }) {
	const scorers = [...(window.WC.SCORERS || [])]
		.filter((s) => s && s.name)
		.sort((a, b) => (b.goals || 0) - (a.goals || 0));
	if (scorers.length === 0) {
		return (
			<div
				style={{
					background: T.card,
					borderRadius: 16,
					padding: "26px 18px",
					textAlign: "center",
					boxShadow: `inset 0 0 0 1px ${T.line}`,
					color: T.faint,
					fontSize: 14,
					fontWeight: 700,
				}}
			>
				得点者はまだ登録されていません
			</div>
		);
	}
	return (
		<div
			style={{
				maxWidth: 480,
				display: "flex",
				flexDirection: "column",
				gap: 7,
			}}
		>
			{scorers.map((s, i) => {
				const { flag, name } = parseScorerName(s.name);
				return (
					<div
						key={s.name + i}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 12,
							background: T.card,
							borderRadius: 12,
							padding: "11px 15px",
							boxShadow: `inset 0 0 0 1px ${T.line}`,
						}}
					>
						<span
							style={{
								width: 24,
								textAlign: "center",
								fontFamily: "Archivo",
								fontWeight: 900,
								fontSize: 16,
								color:
									i === 0
										? T.gold
										: i === 1
											? T.silver
											: i === 2
												? "#CD7F32"
												: T.faint,
							}}
						>
							{i + 1}
						</span>
						{flag && (
							<span style={{ fontSize: 20, flexShrink: 0 }}>{flag}</span>
						)}
						<span
							style={{ flex: 1, fontWeight: 700, color: T.text, fontSize: 15 }}
						>
							{name}
						</span>
						<span
							style={{
								fontFamily: "Archivo",
								fontWeight: 900,
								fontSize: 18,
								color: T.accent,
							}}
						>
							{s.goals}
						</span>
						<span style={{ fontSize: 12, color: T.faint, fontWeight: 700 }}>
							得点
						</span>
					</div>
				);
			})}
		</div>
	);
}
