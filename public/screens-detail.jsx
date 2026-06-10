/* 試合詳細画面（P2 watch-detail）
   MatchDetailScreen + sub-components: DetailHeader / DetailTabBar / placeholder tabs
   全コンポーネントは pitch-night テーマ T prop で色決め。ハードコード禁止。
*/

// ── 定数 ──────────────────────────────────────────────────────────────────
const DETAIL_TABS = [
	{ id: "timeline", label: "タイムライン" },
	{ id: "stats", label: "スタッツ" },
	{ id: "xg", label: "xG" },
	{ id: "lineup", label: "布陣" },
	{ id: "h2h", label: "H2H" },
];

// ライブ更新の控えめなアニメーション。詳細画面に自己完結で注入（本番/ハーネス両対応）。
const DETAIL_ANIM_CSS = `
@keyframes wcScorePop { 0%{transform:scale(1)} 38%{transform:scale(1.22)} 100%{transform:scale(1)} }
@keyframes wcEventIn { from{opacity:0; transform:translateY(7px)} to{opacity:1; transform:translateY(0)} }
@keyframes wcEventFlash { from{background:rgba(182,255,60,0.14)} to{background:transparent} }
@keyframes wcLivePulse { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:.35; transform:scale(.62)} }
`;

// ── ヘルパー ──────────────────────────────────────────────────────────────
// SportMonks の starting_at は UTC。日本時間(Asia/Tokyo)で表示する。
// epoch(starting_at_ts) 優先＝TZ曖昧性ゼロ。無ければ "YYYY-MM-DD HH:MM:SS"(UTC) を Z 付与して解釈。
function toJstDate(fx) {
	if (fx && fx.starting_at_ts != null) {
		const n = Number(fx.starting_at_ts);
		if (!isNaN(n) && n > 0) return new Date(n * 1000);
	}
	const s = fx && fx.starting_at;
	if (!s) return null;
	let iso = String(s).trim().replace(" ", "T");
	if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(iso)) iso += "Z"; // TZ無し＝UTC扱い
	const d = new Date(iso);
	return isNaN(d.getTime()) ? null : d;
}

// JST のキックオフ時刻 "HH:MM"
function fmtKickoff(fx) {
	const d = toJstDate(fx);
	if (!d) return "--:--";
	try {
		return new Intl.DateTimeFormat("ja-JP", {
			timeZone: "Asia/Tokyo",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}).format(d);
	} catch (e) {
		return "--:--";
	}
}

// JST の日付 "YYYY-MM-DD (曜)"
function fmtMatchDate(fx) {
	const d = toJstDate(fx);
	if (!d) return "";
	try {
		const parts = new Intl.DateTimeFormat("ja-JP", {
			timeZone: "Asia/Tokyo",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			weekday: "short",
		}).formatToParts(d);
		const get = (t) => (parts.find((p) => p.type === t) || {}).value || "";
		const wd = get("weekday").replace(/曜日?$/, "");
		return `${get("year")}-${get("month")}-${get("day")}（${wd}）`;
	} catch (e) {
		return "";
	}
}

// ── TeamCrest（チームロゴ。実画像優先・読込失敗や未設定時は絵文字旗にフォールバック）──
function TeamCrest({ imageUrl, flag, size = 54 }) {
	const [err, setErr] = React.useState(false);
	if (imageUrl && !err) {
		return (
			<img
				src={imageUrl}
				alt=""
				onError={() => setErr(true)}
				style={{
					width: size,
					height: size,
					objectFit: "contain",
					display: "block",
					margin: "0 auto",
				}}
			/>
		);
	}
	return (
		<div style={{ fontSize: size * 0.74, lineHeight: 1 }}>{flag || "🏳️"}</div>
	);
}

// ── DetailHeader ──────────────────────────────────────────────────────────
function DetailHeader({ T, fx, goBack }) {
	const teamMap = window.WC && window.WC.TEAM ? window.WC.TEAM : {};
	const homeInfo = teamMap[fx.home.app_code] || {};
	const awayInfo = teamMap[fx.away.app_code] || {};
	const homeFlag = homeInfo.flag || "";
	const homeName = homeInfo.ja || fx.home.name || fx.home.app_code || "?";
	const awayFlag = awayInfo.flag || "";
	const awayName = awayInfo.ja || fx.away.name || fx.away.app_code || "?";

	const homeScore = fx.home.score != null ? fx.home.score : null;
	const awayScore = fx.away.score != null ? fx.away.score : null;
	const scoreStr =
		homeScore != null && awayScore != null
			? `${homeScore} - ${awayScore}`
			: "–";

	// スコアが変化したら数字をポップさせる（key を変えて再マウント＝アニメ再生）
	const [scorePop, setScorePop] = React.useState(0);
	const prevScoreRef = React.useRef(scoreStr);
	React.useEffect(() => {
		if (prevScoreRef.current !== scoreStr) {
			prevScoreRef.current = scoreStr;
			setScorePop((n) => n + 1);
		}
	}, [scoreStr]);

	// ステータスバッジ
	let statusBadge = null;
	if (fx.status === "LIVE") {
		statusBadge = (
			<div
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 5,
					fontSize: 10,
					fontWeight: 800,
					padding: "2px 9px",
					borderRadius: 999,
					background: "rgba(255,90,90,0.16)",
					color: "#ff5a5a",
					border: "1px solid rgba(255,90,90,0.35)",
					marginTop: 4,
				}}
			>
				<span
					style={{
						width: 5,
						height: 5,
						borderRadius: 3,
						background: "#ff5a5a",
						display: "inline-block",
						animation: "wcLivePulse 1.5s ease-in-out infinite",
					}}
				/>
				LIVE
			</div>
		);
	} else if (fx.status === "FT") {
		statusBadge = (
			<div
				style={{
					display: "inline-flex",
					alignItems: "center",
					fontSize: 10,
					fontWeight: 800,
					padding: "2px 9px",
					borderRadius: 999,
					background: "rgba(255,255,255,0.06)",
					color: T.sub,
					border: `1px solid ${T.line}`,
					marginTop: 4,
				}}
			>
				終了 / FT
			</div>
		);
	} else {
		// NS = キックオフ時刻
		statusBadge = (
			<div
				style={{
					display: "inline-flex",
					alignItems: "center",
					fontSize: 10,
					fontWeight: 800,
					padding: "2px 9px",
					borderRadius: 999,
					background: "rgba(255,255,255,0.06)",
					color: T.accent,
					border: `1px solid ${T.line}`,
					marginTop: 4,
				}}
			>
				{fmtKickoff(fx)}
			</div>
		);
	}

	return (
		<div
			style={{
				padding: "10px 12px 14px",
				textAlign: "center",
				background:
					"radial-gradient(120% 90% at 50% -10%, rgba(22,56,38,0.31) 0%, transparent 60%)",
				borderBottom: `1px solid ${T.line}`,
			}}
		>
			{/* 上部バー: 戻る + 日付 + ラウンド（ヘッダーに内包＝浮かせない） */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 10,
				}}
			>
				{goBack && (
					<button
						onClick={goBack}
						aria-label="戻る"
						style={{
							border: "none",
							background: "rgba(255,255,255,0.06)",
							borderRadius: 999,
							width: 28,
							height: 28,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							cursor: "pointer",
							color: T.sub,
							fontSize: 17,
							lineHeight: 1,
							boxShadow: `inset 0 0 0 1px ${T.line}`,
							flexShrink: 0,
						}}
					>
						‹
					</button>
				)}
				<span style={{ fontSize: 10.5, color: T.faint, fontWeight: 700 }}>
					{fmtMatchDate(fx)}
				</span>
				<span
					style={{
						marginLeft: "auto",
						fontSize: 10.5,
						color: T.sub,
						fontWeight: 700,
					}}
				>
					{fx.round_name || ""}
				</span>
			</div>
			{/* スコア行 */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					margin: "2px 2px 0",
				}}
			>
				{/* ホーム */}
				<div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
					<TeamCrest imageUrl={fx.home.image_url} flag={homeFlag} />
					<div
						style={{
							fontWeight: 800,
							fontSize: 13,
							marginTop: 7,
							color: T.text,
						}}
					>
						{homeName}
					</div>
				</div>
				{/* スコア + バッジ */}
				<div style={{ textAlign: "center" }}>
					<div
						key={scorePop}
						style={{
							fontSize: 32,
							fontWeight: 800,
							letterSpacing: 1,
							color: T.text,
							animation: scorePop
								? "wcScorePop .55s cubic-bezier(.22,1.4,.4,1) both"
								: undefined,
						}}
					>
						{scoreStr}
					</div>
					{statusBadge}
				</div>
				{/* アウェイ */}
				<div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
					<TeamCrest imageUrl={fx.away.image_url} flag={awayFlag} />
					<div
						style={{
							fontWeight: 800,
							fontSize: 13,
							marginTop: 7,
							color: T.text,
						}}
					>
						{awayName}
					</div>
				</div>
			</div>
		</div>
	);
}

// ── DetailTabBar ──────────────────────────────────────────────────────────
function DetailTabBar({ T, tab, setTab }) {
	return (
		<div
			style={{
				display: "flex",
				justifyContent: "center",
				padding: "12px 10px",
				borderBottom: `1px solid ${T.line}`,
			}}
		>
			<div
				style={{
					display: "inline-flex",
					gap: 2,
					padding: 4,
					borderRadius: 999,
					background: "rgba(255,255,255,0.05)",
					boxShadow: `inset 0 0 0 1px ${T.line}`,
					maxWidth: "100%",
					overflowX: "auto",
					msOverflowStyle: "none",
					scrollbarWidth: "none",
				}}
			>
				{DETAIL_TABS.map((t) => {
					const active = tab === t.id;
					return (
						<button
							key={t.id}
							onClick={() => setTab(t.id)}
							style={{
								flexShrink: 0,
								fontSize: 12.5,
								fontWeight: 800,
								padding: "7px 14px",
								borderRadius: 999,
								background: active ? T.accent : "transparent",
								color: active ? T.accentInk : T.sub,
								border: "none",
								cursor: "pointer",
								whiteSpace: "nowrap",
								transition: ".15s ease",
							}}
						>
							{t.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}

// ── プレースホルダータブ本体 ──────────────────────────────────────────────
function PlaceholderBody({ T, label }) {
	return (
		<div
			style={{
				padding: "40px 16px",
				textAlign: "center",
				color: T.faint,
				fontSize: 13,
				fontWeight: 700,
			}}
		>
			{label}（このタブは実装予定）
		</div>
	);
}

// ── 共有ヘルパー ──────────────────────────────────────────────────────────

/** ミラーバー: 中央ラベル、左=ホーム値、右=アウェイ値、2分割バー */
function MirrorBar({ T, label, unit, homeVal, awayVal }) {
	const hv = homeVal != null ? homeVal : 0;
	const av = awayVal != null ? awayVal : 0;
	const total = hv + av;
	const homePct = total > 0 ? (hv / total) * 100 : 50;
	const awayPct = total > 0 ? (av / total) * 100 : 50;
	const valStr = (v) =>
		v != null ? (unit === "%" ? `${v}%` : String(v)) : "–";

	return (
		<div style={{ margin: "11px 0" }}>
			{/* ラベル行 */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					fontSize: 11.5,
					marginBottom: 5,
				}}
			>
				<span style={{ fontWeight: 800, color: T.text }}>
					{valStr(homeVal)}
				</span>
				<span style={{ fontWeight: 700, color: T.sub }}>{label}</span>
				<span style={{ fontWeight: 800, color: T.text }}>
					{valStr(awayVal)}
				</span>
			</div>
			{/* バー */}
			<div
				style={{
					display: "flex",
					height: 6,
					borderRadius: 3,
					overflow: "hidden",
					background: "rgba(255,255,255,0.06)",
				}}
			>
				<div
					style={{
						width: `${homePct}%`,
						background: T.accent,
						borderRadius: "3px 0 0 3px",
					}}
				/>
				<div
					style={{
						width: `${awayPct}%`,
						background: "rgba(226,240,228,0.42)",
						marginLeft: "auto",
						borderRadius: "0 3px 3px 0",
					}}
				/>
			</div>
		</div>
	);
}

/** 選手別xG 横バー */
function PlayerXgBar({ T, playerName, xg, maxXg, isHome }) {
	const pct = maxXg > 0 ? (xg / maxXg) * 100 : 0;
	const barColor = isHome ? T.accent : "rgba(226,240,228,0.55)";

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 9,
				fontSize: 12,
				padding: "7px 0",
				borderBottom: `1px solid ${T.line}`,
			}}
		>
			<span style={{ fontSize: 13 }}>⚽</span>
			<span style={{ flex: 1, fontWeight: 700, color: T.text }}>
				{playerName}
			</span>
			<div style={{ width: 60 }}>
				<div
					style={{
						height: 5,
						borderRadius: 3,
						background: barColor,
						width: `${pct}%`,
					}}
				/>
			</div>
			<span
				style={{
					fontWeight: 800,
					fontFamily: "monospace",
					width: 38,
					textAlign: "right",
					color: T.text,
				}}
			>
				{xg.toFixed(2)}
			</span>
		</div>
	);
}

// ── TimelineTab ───────────────────────────────────────────────────────────
function TimelineTab({ T, detail }) {
	const events = (detail && detail.events) || [];
	const fx = detail && detail.fixture;
	const homeTeamId = fx && fx.home && fx.home.team_id;

	// 新着イベントだけアニメ（初回ロードは静か＝既存全件を seen に積む）
	const seenRef = React.useRef(new Set());
	const firstRef = React.useRef(true);
	const ids = events.map((e) => e.sm_event_id).filter((id) => id != null);
	const newIdSet = new Set(
		firstRef.current ? [] : ids.filter((id) => !seenRef.current.has(id)),
	);
	React.useEffect(() => {
		ids.forEach((id) => seenRef.current.add(id));
		firstRef.current = false;
	});

	/** 分文字列: "45+3'" など */
	function fmtMin(ev) {
		if (ev.extra_minute != null && ev.extra_minute > 0) {
			return `${ev.minute}+${ev.extra_minute}'`;
		}
		return `${ev.minute}'`;
	}

	/** typeからアイコン文字列を返す */
	function eventIcon(type) {
		switch (type) {
			case "goal":
			case "penalty":
			case "pen_shootout_goal":
				return "⚽";
			case "own_goal":
				return "⚽";
			case "yellowcard":
				return "🟨";
			case "redcard":
			case "yellowredcard":
				return "🟥";
			case "substitution":
				return "🔁";
			case "missed_penalty":
			case "pen_shootout_miss":
				return "✖";
			default:
				return "●";
		}
	}

	// sort_order → minute の順にソート
	const sorted = [...events].sort((a, b) => {
		const sa = a.sort_order != null ? a.sort_order : a.minute * 60;
		const sb = b.sort_order != null ? b.sort_order : b.minute * 60;
		return sa - sb;
	});

	if (sorted.length === 0) {
		const emptyMsg =
			fx && fx.status === "NS"
				? "キックオフ後にイベントが表示されます"
				: "イベントはまだありません";
		return (
			<div
				style={{
					padding: "40px 16px",
					textAlign: "center",
					color: T.faint,
					fontSize: 13,
					fontWeight: 700,
				}}
			>
				{emptyMsg}
			</div>
		);
	}

	return (
		<div style={{ padding: "14px" }}>
			{/* 中心ライン付き タイムライン */}
			<div style={{ position: "relative" }}>
				{/* 縦中心線 */}
				<div
					style={{
						position: "absolute",
						left: "50%",
						top: 4,
						bottom: 4,
						width: 2,
						transform: "translateX(-50%)",
						background: T.line,
					}}
				/>

				{sorted.map((ev, i) => {
					const isHome = ev.team_id === homeTeamId;
					const icon = eventIcon(ev.type);
					const isOwnGoal = ev.type === "own_goal";
					const isSub = ev.type === "substitution";
					const playerColor = isOwnGoal ? T.sub : T.text;
					const isNew = ev.sm_event_id != null && newIdSet.has(ev.sm_event_id);

					// ホーム→左側、アウェイ→右側
					return (
						<div
							key={ev.sm_event_id || `ev-${i}`}
							style={{
								display: "flex",
								alignItems: "center",
								margin: "13px 0",
								fontSize: 12,
								position: "relative",
								borderRadius: 8,
								animation: isNew
									? "wcEventIn .45s ease both, wcEventFlash 1.4s ease both"
									: undefined,
							}}
						>
							{/* ホーム側 (左) */}
							<div
								style={{
									flex: 1,
									display: "flex",
									alignItems: "center",
									gap: 6,
									justifyContent: "flex-end",
									paddingRight: 38,
									textAlign: "right",
								}}
							>
								{isHome && (
									<>
										{isSub && ev.related_player_name && (
											<span style={{ color: T.sub, fontSize: 10.5 }}>
												→{ev.related_player_name}
											</span>
										)}
										<span style={{ fontWeight: 700, color: playerColor }}>
											{ev.player_name}
										</span>
										<span>{icon}</span>
									</>
								)}
							</div>

							{/* 中心: 分表示 */}
							<span
								style={{
									position: "absolute",
									left: "50%",
									transform: "translateX(-50%)",
									fontSize: 9.5,
									fontWeight: 800,
									color: T.sub,
									background: T.bg,
									padding: "2px 0",
									width: 32,
									textAlign: "center",
									zIndex: 1,
								}}
							>
								{fmtMin(ev)}
							</span>

							{/* アウェイ側 (右) */}
							<div
								style={{
									flex: 1,
									display: "flex",
									alignItems: "center",
									gap: 6,
									justifyContent: "flex-start",
									paddingLeft: 38,
								}}
							>
								{!isHome && (
									<>
										<span>{icon}</span>
										<span style={{ fontWeight: 700, color: playerColor }}>
											{ev.player_name}
										</span>
										{isSub && ev.related_player_name && (
											<span style={{ color: T.sub, fontSize: 10.5 }}>
												→{ev.related_player_name}
											</span>
										)}
									</>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ── StatsTab ─────────────────────────────────────────────────────────────
// ミラーバー形式: ホーム値(左) | ラベル(中) | アウェイ値(右)
// ANALYST READ-OUT: 支配率・シュート・xGを元に1〜2文の自動解析文を生成
const STAT_LABELS = [
	[45, "ボール支配", "%"],
	[42, "シュート", ""],
	[86, "枠内シュート", ""],
	[34, "コーナー", ""],
	[56, "ファウル", ""],
	[84, "イエロー", ""],
	[80, "パス", ""],
	[82, "パス成功率", "%"],
];

/** スタッツ配列 → { [typeId]: { home: val, away: val } } に折りたたむ */
function foldStats(stats, homeTeamId, awayTeamId) {
	const map = {};
	(stats || []).forEach((row) => {
		const tid = row.type_id;
		if (!map[tid]) map[tid] = { home: null, away: null };
		if (row.team_id === homeTeamId) map[tid].home = row.value;
		else if (row.team_id === awayTeamId) map[tid].away = row.value;
	});
	return map;
}

/** 自動読み解き文章: 1〜2文 */
function statInsight(homeName, awayName, statsByType, fixture) {
	const parts = [];

	// ボール支配 (type_id 45)
	const poss = statsByType[45];
	if (poss && (poss.home != null || poss.away != null)) {
		const hv = poss.home != null ? poss.home : 0;
		const av = poss.away != null ? poss.away : 0;
		if (hv !== av) {
			const dominant = hv > av ? homeName : awayName;
			const domVal = hv > av ? hv : av;
			parts.push(`${dominant}がボールを支配（${domVal}%）。`);
		}
	}

	// シュート (type_id 42)
	const shots = statsByType[42];
	if (shots && (shots.home != null || shots.away != null)) {
		const hv = shots.home != null ? shots.home : 0;
		const av = shots.away != null ? shots.away : 0;
		if (hv !== av) {
			const more = hv > av ? homeName : awayName;
			parts.push(`シュートは${more}が上回る。`);
		}
	}

	// xG (fixture直接)
	const hxg = fixture && fixture.home && fixture.home.xg;
	const axg = fixture && fixture.away && fixture.away.xg;
	if (hxg != null && axg != null) {
		if (Math.abs(hxg - axg) > 0.1) {
			const better = hxg > axg ? homeName : awayName;
			parts.push(`xGでは${better}が上回り、得点期待値で優勢。`);
		}
	}

	return parts.join(" ");
}

function StatsTab({ T, detail }) {
	const stats = (detail && detail.stats) || [];
	const fx = detail && detail.fixture;
	const homeTeamId = fx && fx.home && fx.home.team_id;
	const awayTeamId = fx && fx.away && fx.away.team_id;

	const teamMap = window.WC && window.WC.TEAM ? window.WC.TEAM : {};
	const homeInfo = teamMap[fx && fx.home && fx.home.app_code] || {};
	const awayInfo = teamMap[fx && fx.away && fx.away.app_code] || {};
	const homeName = homeInfo.ja || (fx && fx.home && fx.home.name) || "ホーム";
	const awayName = awayInfo.ja || (fx && fx.away && fx.away.name) || "アウェイ";

	if (stats.length === 0) {
		const emptyMsg =
			fx && fx.status === "NS"
				? "試合開始後にスタッツが表示されます"
				: "スタッツはまだありません";
		return (
			<div
				style={{
					padding: "40px 16px",
					textAlign: "center",
					color: T.faint,
					fontSize: 13,
					fontWeight: 700,
				}}
			>
				{emptyMsg}
			</div>
		);
	}

	const statsByType = foldStats(stats, homeTeamId, awayTeamId);

	// STAT_LABELS の順に、データにある type_id だけ描画
	const rows = STAT_LABELS.filter(([tid]) => statsByType[tid] != null);

	const insight = statInsight(homeName, awayName, statsByType, fx);

	return (
		<div style={{ padding: "14px" }}>
			{rows.map(([tid, label, unit]) => {
				const pair = statsByType[tid];
				return (
					<MirrorBar
						key={tid}
						T={T}
						label={label}
						unit={unit}
						homeVal={pair.home}
						awayVal={pair.away}
					/>
				);
			})}

			{/* 自動読み解き */}
			{insight && (
				<div
					style={{
						marginTop: 16,
						padding: "10px 13px",
						background: T.card,
						borderRadius: 10,
						border: `1px solid ${T.line}`,
					}}
				>
					<div
						style={{
							fontSize: 9.5,
							fontWeight: 800,
							letterSpacing: 0.8,
							color: T.sub,
							marginBottom: 5,
						}}
					>
						ANALYST READ-OUT
					</div>
					<div
						style={{
							fontSize: 12,
							color: T.sub,
							lineHeight: 1.6,
						}}
					>
						{insight}
					</div>
				</div>
			)}
		</div>
	);
}

// ── XgTab ─────────────────────────────────────────────────────────────────
// セクション1: チーム合計バンド(accent枠) — 両xGともnull時は早期return
// セクション2: 効率判定: score>xg+0.3→効率良く / score<xg-0.5→決定機活かせず / else→ほぼ期待通り
// セクション3: 選手別xG horizontal bars — lineups.xg から top5/チーム
function XgTab({ T, detail }) {
	const fx = detail && detail.fixture;
	const lineups = (detail && detail.lineups) || [];

	const homeXg = fx && fx.home && fx.home.xg != null ? fx.home.xg : null;
	const awayXg = fx && fx.away && fx.away.xg != null ? fx.away.xg : null;
	const homeScore =
		fx && fx.home && fx.home.score != null ? fx.home.score : null;
	const awayScore =
		fx && fx.away && fx.away.score != null ? fx.away.score : null;
	const homeTeamId = fx && fx.home && fx.home.team_id;
	const awayTeamId = fx && fx.away && fx.away.team_id;

	const teamMap = window.WC && window.WC.TEAM ? window.WC.TEAM : {};
	const homeInfo = teamMap[fx && fx.home && fx.home.app_code] || {};
	const awayInfo = teamMap[fx && fx.away && fx.away.app_code] || {};
	const homeName = homeInfo.ja || (fx && fx.home && fx.home.name) || "ホーム";
	const awayName = awayInfo.ja || (fx && fx.away && fx.away.name) || "アウェイ";

	// 両方 null → データなしノート
	if (homeXg == null && awayXg == null) {
		return (
			<div
				style={{
					padding: "40px 16px",
					textAlign: "center",
					color: T.faint,
					fontSize: 13,
					fontWeight: 700,
				}}
			>
				xGデータは試合後に表示されます
			</div>
		);
	}

	// ── セクション1: チーム合計バンド ────────────────────────────────────
	const hxgVal = homeXg != null ? homeXg : 0;
	const axgVal = awayXg != null ? awayXg : 0;
	const xgTotal = hxgVal + axgVal;
	const homePct = xgTotal > 0 ? (hxgVal / xgTotal) * 100 : 50;
	const awayPct = xgTotal > 0 ? (axgVal / xgTotal) * 100 : 50;

	// ── セクション2: 効率 ─────────────────────────────────────────────────
	function effLabel(score, xg) {
		if (score == null || xg == null) return null;
		if (score > xg + 0.3) return "効率良く決めた";
		if (score < xg - 0.5) return "決定機を活かせず";
		return "ほぼ期待通り";
	}
	const homeEff = effLabel(homeScore, homeXg);
	const awayEff = effLabel(awayScore, awayXg);

	// ── セクション3: 選手別xG ─────────────────────────────────────────────
	const withXg = lineups.filter((p) => p.xg != null && p.xg > 0);
	// チームごとに上位5人に絞る
	const homeTopPlayers = withXg
		.filter((p) => p.team_id === homeTeamId)
		.sort((a, b) => b.xg - a.xg)
		.slice(0, 5);
	const awayTopPlayers = withXg
		.filter((p) => p.team_id === awayTeamId)
		.sort((a, b) => b.xg - a.xg)
		.slice(0, 5);
	const hasPlayerXg = homeTopPlayers.length > 0 || awayTopPlayers.length > 0;
	const allPlayers = [...homeTopPlayers, ...awayTopPlayers];
	const maxXg = allPlayers.reduce((m, p) => Math.max(m, p.xg), 0);

	return (
		<div style={{ padding: "14px" }}>
			{/* セクション1: チーム合計バンド */}
			<div
				style={{
					background:
						"linear-gradient(180deg, rgba(22,48,36,0.065) 0%, transparent 100%)",
					borderRadius: 14,
					padding: "13px 12px",
					boxShadow: `inset 0 0 0 1px rgba(182,255,60,0.28)`,
					marginBottom: 14,
				}}
			>
				<div
					style={{
						fontSize: 10,
						fontWeight: 800,
						letterSpacing: 1,
						color: T.sub,
						textAlign: "center",
					}}
				>
					xG · 期待得点（チーム合計）
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 13,
						marginTop: 4,
					}}
				>
					<span
						style={{
							fontSize: 30,
							fontWeight: 800,
							color: homeXg != null ? T.accent : T.faint,
						}}
					>
						{homeXg != null ? homeXg.toFixed(2) : "–"}
					</span>
					<span style={{ fontSize: 10, color: T.sub }}>xG</span>
					<span
						style={{
							fontSize: 30,
							fontWeight: 800,
							color: awayXg != null ? "rgba(226,240,228,0.7)" : T.faint,
						}}
					>
						{awayXg != null ? awayXg.toFixed(2) : "–"}
					</span>
				</div>
				{/* 2分割バー */}
				<div
					style={{
						display: "flex",
						height: 8,
						borderRadius: 4,
						overflow: "hidden",
						background: "rgba(255,255,255,0.06)",
						marginTop: 10,
					}}
				>
					<div
						style={{
							width: `${homePct}%`,
							background: T.accent,
							borderRadius: "4px 0 0 4px",
						}}
					/>
					<div
						style={{
							width: `${awayPct}%`,
							background: "rgba(226,240,228,0.42)",
							marginLeft: "auto",
							borderRadius: "0 4px 4px 0",
						}}
					/>
				</div>

				{/* セクション2: 効率 */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						marginTop: 11,
						fontSize: 10.5,
						color: T.sub,
					}}
				>
					<span>
						{homeName}: 実得点{" "}
						<b
							style={{
								fontSize: 13,
								fontWeight: 800,
								color: homeXg != null ? T.accent : T.text,
							}}
						>
							{homeScore != null ? homeScore : "–"}
						</b>{" "}
						/ xG {homeXg != null ? homeXg.toFixed(2) : "–"}
						{homeEff && (
							<span style={{ display: "block", fontSize: 10, marginTop: 2 }}>
								{homeEff}
							</span>
						)}
					</span>
					<span style={{ textAlign: "right" }}>
						{awayName}: 実得点{" "}
						<b style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
							{awayScore != null ? awayScore : "–"}
						</b>{" "}
						/ xG {awayXg != null ? awayXg.toFixed(2) : "–"}
						{awayEff && (
							<span style={{ display: "block", fontSize: 10, marginTop: 2 }}>
								{awayEff}
							</span>
						)}
					</span>
				</div>
			</div>

			{/* セクション3: 選手別xG */}
			{hasPlayerXg && (
				<div>
					{homeTopPlayers.length > 0 && (
						<>
							<div
								style={{
									fontSize: 11,
									fontWeight: 800,
									margin: "18px 0 9px",
									display: "flex",
									alignItems: "center",
									gap: 6,
									color: T.text,
								}}
							>
								{homeInfo.flag || "🏠"} {homeName}
								<span style={{ color: T.sub, fontWeight: 700 }}>
									選手別xG（誰が好機を作ったか）
								</span>
							</div>
							{homeTopPlayers.map((p, i) => (
								<PlayerXgBar
									key={p.player_id || `hp-${i}`}
									T={T}
									playerName={p.player_name}
									xg={p.xg}
									maxXg={maxXg}
									isHome={true}
								/>
							))}
						</>
					)}
					{awayTopPlayers.length > 0 && (
						<>
							<div
								style={{
									fontSize: 11,
									fontWeight: 800,
									margin: "18px 0 9px",
									display: "flex",
									alignItems: "center",
									gap: 6,
									color: T.text,
								}}
							>
								{awayInfo.flag || "✈️"} {awayName}
								<span style={{ color: T.sub, fontWeight: 700 }}>選手別xG</span>
							</div>
							{awayTopPlayers.map((p, i) => (
								<PlayerXgBar
									key={p.player_id || `ap-${i}`}
									T={T}
									playerName={p.player_name}
									xg={p.xg}
									maxXg={maxXg}
									isHome={false}
								/>
							))}
						</>
					)}
				</div>
			)}
		</div>
	);
}

// ── 布陣タブ (LineupTab) ──────────────────────────────────────────────────

/** 選手スタッツ type_id → ラベル */
/** formation_field "row:col" → { row: int, col: int } または null */
function parseField(formation_field) {
	if (!formation_field) return null;
	const parts = String(formation_field).split(":");
	if (parts.length < 2) return null;
	const row = parseInt(parts[0], 10);
	const col = parseInt(parts[1], 10);
	if (isNaN(row) || isNaN(col)) return null;
	return { row, col };
}

/** 選手名の苗字（スペース区切り最後のトークン）*/
function surname(player_name) {
	if (!player_name) return "?";
	const tokens = player_name.trim().split(/\s+/);
	return tokens[tokens.length - 1] || player_name;
}

// "YYYY-MM-DD" → 満年齢（タイムゾーン非依存の単純年差）。不正は null。
function ageFromDob(dob) {
	if (!dob) return null;
	const m = String(dob).match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return null;
	const y = +m[1],
		mo = +m[2],
		d = +m[3];
	const now = new Date();
	let age = now.getFullYear() - y;
	const mm = now.getMonth() + 1,
		dd = now.getDate();
	if (mm < mo || (mm === mo && dd < d)) age -= 1;
	return age >= 0 && age < 130 ? age : null;
}

// ── PlayerSheet: 選手詳細ボトムシート ────────────────────────────────────
function PlayerSheet({ T, player, onClose }) {
	// スクロールロック（シート外のスクロールを止める）
	// Rules of Hooks: フックは無条件に最初に呼ぶ
	React.useEffect(() => {
		if (!player) return;
		const root = document.getElementById("wc-app-root") || document.body;
		const locked = [];
		root.querySelectorAll("*").forEach((el) => {
			const s = window.getComputedStyle(el);
			const oy = s.overflowY;
			const ox = s.overflowX;
			const scrollY =
				(oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight;
			const scrollX =
				(ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth;
			if (scrollY || scrollX) {
				locked.push([
					el,
					el.style.overflowY,
					el.style.overflowX,
					el.style.overscrollBehavior,
				]);
				el.style.overflowY = "hidden";
				el.style.overflowX = "hidden";
				el.style.overscrollBehavior = "contain";
			}
		});
		return () => {
			locked.forEach((item) => {
				item[0].style.overflowY = item[1];
				item[0].style.overflowX = item[2];
				item[0].style.overscrollBehavior = item[3];
			});
		};
	}, [player]);

	const [prof, setProf] = React.useState(null);
	const [profLoading, setProfLoading] = React.useState(false);
	React.useEffect(() => {
		if (!player || player.player_id == null) {
			setProf(null);
			return;
		}
		let alive = true;
		setProfLoading(true);
		setProf(null);
		setStatSeasonIdx(0);
		(async () => {
			const d =
				window.WC && window.WC.fetchPlayerProfile
					? await window.WC.fetchPlayerProfile(player.player_id)
					: null;
			if (alive) {
				setProf(d);
				setProfLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [player ? player.player_id : null]);
	const [statSeasonIdx, setStatSeasonIdx] = React.useState(0);

	if (!player) return null;

	const teamMap = window.WC && window.WC.TEAM ? window.WC.TEAM : {};
	const teamInfo = teamMap[player._appCode] || {};
	const flag = teamInfo.flag || "";

	const node = (
		<div
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 100,
				display: "flex",
				flexDirection: "column",
				background: T.bg,
			}}
		>
			<div
				style={{
					background: T.bg,
					height: "100%",
					display: "flex",
					flexDirection: "column",
					paddingBottom: 26,
				}}
			>
				{/* 上部セーフエリア */}
				<div style={{ height: 10 }} />
				{/* タイトル行 */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "12px 18px 6px",
						flexShrink: 0,
					}}
				>
					<div>
						{prof && prof.profile && prof.profile.image_path && (
							<img
								src={prof.profile.image_path}
								alt=""
								onError={(e) => {
									e.target.style.display = "none";
								}}
								style={{
									width: 44,
									height: 44,
									borderRadius: "50%",
									objectFit: "cover",
									marginRight: 10,
									background: "rgba(255,255,255,0.08)",
									verticalAlign: "middle",
								}}
							/>
						)}
						<span
							style={{
								fontSize: 26,
								fontWeight: 900,
								color: T.accent,
								marginRight: 8,
								fontFamily: "monospace",
							}}
						>
							{player.jersey_number}
						</span>
						<span style={{ fontSize: 17, fontWeight: 800, color: T.text }}>
							{player.player_name}
						</span>
						{flag && (
							<span style={{ marginLeft: 7, fontSize: 20 }}>{flag}</span>
						)}
					</div>
					<button
						onClick={onClose}
						style={{
							border: "none",
							background: "rgba(255,255,255,0.08)",
							width: 30,
							height: 30,
							borderRadius: "50%",
							display: "grid",
							placeItems: "center",
							cursor: "pointer",
							color: T.sub,
							fontSize: 18,
							flexShrink: 0,
						}}
					>
						✕
					</button>
				</div>

				{/* クラブ・国籍行 */}
				{prof &&
					prof.profile &&
					(prof.profile.club_name || prof.profile.nationality_name) && (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "0 18px 8px",
								flexWrap: "wrap",
							}}
						>
							{prof.profile.club_name && (
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 5,
										fontSize: 12,
										fontWeight: 700,
										color: T.sub,
									}}
								>
									{prof.profile.club_image && (
										<img
											src={prof.profile.club_image}
											alt=""
											onError={(e) => {
												e.target.style.display = "none";
											}}
											style={{ width: 16, height: 16, objectFit: "contain" }}
										/>
									)}
									{prof.profile.club_name}
								</span>
							)}
							{prof.profile.nationality_name && (
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 5,
										fontSize: 12,
										fontWeight: 700,
										color: T.sub,
									}}
								>
									{prof.profile.nationality_image && (
										<img
											src={prof.profile.nationality_image}
											alt=""
											onError={(e) => {
												e.target.style.display = "none";
											}}
											style={{
												width: 16,
												height: 16,
												borderRadius: "50%",
												objectFit: "cover",
											}}
										/>
									)}
									{prof.profile.nationality_name}
								</span>
							)}
						</div>
					)}

				{/* スタッツ本体 */}
				<div
					style={{
						overflowY: "auto",
						WebkitOverflowScrolling: "touch",
						overscrollBehavior: "contain",
						padding: "4px 18px 12px",
						flex: 1,
						minHeight: 0,
					}}
				>
					{/* 今までのデータ: リッチプロフィール */}
					{(() => {
						const p0 = (prof && prof.profile) || null;
						const bio = p0 || {
							height: player.height,
							weight: player.weight,
							date_of_birth: player.date_of_birth,
							preferred_foot: null,
							detailed_position: player.detailed_position || player.position,
							nationality_name: player.nationality_name,
							club_name: player.club_name,
							club_image: player.club_image,
							image_path: null,
						};
						const age = ageFromDob(bio.date_of_birth);
						const rows = [];
						if (bio.detailed_position)
							rows.push([
								"ポジション",
								`${bio.detailed_position}　#${player.jersey_number ?? "-"}`,
							]);
						if (age != null || bio.height || bio.weight)
							rows.push([
								"年齢/身長/体重",
								`${age != null ? age + "歳" : "-"} / ${bio.height ? bio.height + "cm" : "-"} / ${bio.weight ? bio.weight + "kg" : "-"}`,
							]);
						if (bio.preferred_foot)
							rows.push([
								"利き足",
								bio.preferred_foot === "right"
									? "右"
									: bio.preferred_foot === "left"
										? "左"
										: bio.preferred_foot,
							]);
						if (bio.nationality_name) rows.push(["国籍", bio.nationality_name]);
						if (bio.club_name) rows.push(["所属クラブ", bio.club_name]);
						return (
							<>
								{profLoading && (
									<div
										style={{
											color: T.faint,
											fontSize: 12,
											fontWeight: 700,
											padding: "10px 0",
										}}
									>
										読み込み中…
									</div>
								)}
								{rows.map(([k, v]) => (
									<div
										key={k}
										style={{
											display: "flex",
											justifyContent: "space-between",
											padding: "9px 0",
											borderBottom: "1px solid " + T.line,
											fontSize: 13,
										}}
									>
										<span style={{ color: T.sub, fontWeight: 700 }}>{k}</span>
										<span style={{ fontWeight: 800, color: T.text }}>{v}</span>
									</div>
								))}
								{p0 &&
									prof.seasons &&
									prof.seasons.length > 0 &&
									(() => {
										const idx = Math.min(
											statSeasonIdx,
											prof.seasons.length - 1,
										);
										const s = prof.seasons[idx];
										const cell = (key, unit) =>
											s.stats[key] != null ? (
												<div
													key={key}
													style={{
														flex: "1 0 30%",
														padding: "8px 0",
														textAlign: "center",
													}}
												>
													<div
														style={{
															fontSize: 15,
															fontWeight: 900,
															color: T.text,
														}}
													>
														{s.stats[key]}
														{unit || ""}
													</div>
													<div
														style={{
															fontSize: 10,
															color: T.sub,
															fontWeight: 700,
														}}
													>
														{key}
													</div>
												</div>
											) : null;
										return (
											<div style={{ marginTop: 12 }}>
												<div
													style={{
														display: "flex",
														gap: 8,
														alignItems: "center",
														marginBottom: 6,
													}}
												>
													<span
														style={{
															fontSize: 12,
															fontWeight: 800,
															color: T.text,
														}}
													>
														シーズン統計
													</span>
													{prof.seasons.length > 1 && (
														<select
															value={idx}
															onChange={(e) =>
																setStatSeasonIdx(Number(e.target.value))
															}
															style={{
																marginLeft: "auto",
																background: "rgba(255,255,255,0.06)",
																color: T.text,
																border: "1px solid " + T.line,
																borderRadius: 8,
																fontSize: 11,
																padding: "3px 6px",
															}}
														>
															{prof.seasons.map((se, i) => (
																<option key={se.season_id} value={i}>
																	{se.league_name ? se.league_name + " " : ""}
																	{se.season_name || se.season_id}
																</option>
															))}
														</select>
													)}
												</div>
												<div style={{ display: "flex", flexWrap: "wrap" }}>
													{cell("appearances")}
													{cell("goals")}
													{cell("assists")}
													{cell("minutes", "分")}
													{cell("rating")}
													{cell("yellowcards")}
													{cell("shots_total")}
													{cell("shots_on_target")}
													{cell("passes")}
												</div>
											</div>
										);
									})()}
							</>
						);
					})()}
				</div>
			</div>
		</div>
	);

	const root = document.getElementById("wc-app-root");
	return root ? ReactDOM.createPortal(node, root) : node;
}

// ── PlayerDot: ピッチ上の選手ドット ──────────────────────────────────────
function PlayerDot({ T, player, ev, topPct, leftPct, onTap }) {
	const sn = surname(player.player_name);

	return (
		<div
			onClick={() => {
				onTap(player);
			}}
			style={{
				position: "absolute",
				top: topPct + "%",
				left: leftPct + "%",
				transform: "translate(-50%, -50%)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				cursor: "pointer",
				zIndex: 2,
				userSelect: "none",
			}}
		>
			{/* 丸 */}
			<div
				style={{
					width: 30,
					height: 30,
					borderRadius: "50%",
					background: T.accent,
					color: T.accentInk,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontWeight: 900,
					fontSize: 11,
					boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
					border: "2px solid rgba(255,255,255,0.18)",
					position: "relative",
				}}
			>
				{player.jersey_number}
				{/* カード（最重を優先表示: 赤系 > 黄） */}
				{ev && ev.cards && ev.cards.length > 0 && (
					<div
						style={{
							position: "absolute",
							top: -6,
							right: -6,
							fontSize: 12,
							lineHeight: 1,
						}}
					>
						{ev.cards.some(
							(c) => c.type === "redcard" || c.type === "yellowredcard",
						)
							? "🟥"
							: "🟨"}
					</div>
				)}
				{/* 交代OUT（先発が退く） */}
				{ev && ev.subOff != null && (
					<div
						style={{
							position: "absolute",
							bottom: -7,
							right: -8,
							background: "rgba(255,90,90,0.92)",
							color: "#1a0c0c",
							fontSize: 7.5,
							fontWeight: 900,
							padding: "0 3px",
							borderRadius: 5,
						}}
					>
						↓{ev.subOff}'
					</div>
				)}
			</div>
			{/* 苗字 */}
			<div
				style={{
					fontSize: 9,
					fontWeight: 700,
					color: T.text,
					marginTop: 3,
					whiteSpace: "nowrap",
					maxWidth: 52,
					overflow: "hidden",
					textOverflow: "ellipsis",
					textShadow: "0 1px 3px rgba(0,0,0,0.7)",
				}}
			>
				{sn}
			</div>
		</div>
	);
}

// ── FormationPitch: フォーメーション図 ───────────────────────────────────
function FormationPitch({ T, starters, onTapPlayer, events }) {
	const evIndex = playerEventIndex(events);
	// formation_field を持つスターターのみ
	const placed = starters.filter((p) => parseField(p.formation_field) !== null);

	if (placed.length === 0) {
		return (
			<div
				style={{
					padding: "28px 16px",
					textAlign: "center",
					color: T.faint,
					fontSize: 13,
					fontWeight: 700,
				}}
			>
				布陣データがありません
			</div>
		);
	}

	// row 範囲を求める
	const rows = placed.map((p) => parseField(p.formation_field).row);
	const maxRow = Math.max.apply(null, rows);
	// maxRow が 0 の場合でも安全（1 以上保証）
	const safeMaxRow = maxRow > 0 ? maxRow : 1;

	// row → players のマップ
	const byRow = {};
	placed.forEach((p) => {
		const r = parseField(p.formation_field).row;
		if (!byRow[r]) byRow[r] = [];
		byRow[r].push(p);
	});

	// 各rowの選手をcol順にソート
	Object.keys(byRow).forEach((r) => {
		byRow[r].sort(
			(a, b) =>
				parseField(a.formation_field).col - parseField(b.formation_field).col,
		);
	});

	// ピッチの縦横比 3:4
	return (
		<div
			style={{
				position: "relative",
				width: "100%",
				paddingBottom: "118%",
				background:
					"linear-gradient(180deg, rgba(14,54,26,0.92) 0%, rgba(10,40,20,0.97) 100%)",
				borderRadius: 14,
				overflow: "hidden",
				margin: "10px 0",
				boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07)",
			}}
		>
			{/* ピッチ装飾 */}
			<div style={{ position: "absolute", inset: 0 }}>
				{/* 中心線 */}
				<div
					style={{
						position: "absolute",
						left: "8%",
						right: "8%",
						top: "50%",
						height: 1,
						background: "rgba(255,255,255,0.13)",
					}}
				/>
				{/* センターサークル */}
				<div
					style={{
						position: "absolute",
						left: "50%",
						top: "50%",
						width: 60,
						height: 60,
						borderRadius: "50%",
						border: "1px solid rgba(255,255,255,0.13)",
						transform: "translate(-50%,-50%)",
					}}
				/>
				{/* ゴール前エリア（上） */}
				<div
					style={{
						position: "absolute",
						left: "25%",
						right: "25%",
						top: "3%",
						height: "14%",
						border: "1px solid rgba(255,255,255,0.11)",
						borderBottom: "none",
					}}
				/>
				{/* ゴール前エリア（下） */}
				<div
					style={{
						position: "absolute",
						left: "25%",
						right: "25%",
						bottom: "3%",
						height: "14%",
						border: "1px solid rgba(255,255,255,0.11)",
						borderTop: "none",
					}}
				/>
				{/* ピッチ外枠 */}
				<div
					style={{
						position: "absolute",
						inset: "3% 8%",
						border: "1px solid rgba(255,255,255,0.13)",
						pointerEvents: "none",
					}}
				/>
			</div>

			{/* 選手ドット */}
			{placed.map((p) => {
				const field = parseField(p.formation_field);
				const row = field.row;

				// rowCount はそのrowの選手数
				const rowPlayers = byRow[row] || [];
				const N = rowPlayers.length;
				const colIdx = rowPlayers.indexOf(p) + 1; // 1-based

				// 縦位置: GK(row=1)が下、最大row(FW)が上
				// topPct = 100 - (row / (safeMaxRow + 1)) * 100
				// → GK: row=1, maxRow=4: top = 100 - 1/5*100 = 80%
				// → FW: row=4, maxRow=4: top = 100 - 4/5*100 = 20%
				const topPct = 100 - (row / (safeMaxRow + 1)) * 100;

				// 横位置: N人を均等配置
				const leftPct = (colIdx / (N + 1)) * 100;

				return (
					<PlayerDot
						key={p.player_id || "dot-" + row + "-" + colIdx}
						T={T}
						player={p}
						ev={playerEvents(evIndex, p)}
						topPct={topPct}
						leftPct={leftPct}
						onTap={onTapPlayer}
					/>
				);
			})}
		</div>
	);
}

// ── BenchList: 控え選手リスト ─────────────────────────────────────────────
function BenchList({ T, bench, onTapPlayer, events }) {
	if (!bench || bench.length === 0) return null;
	const evIndex = playerEventIndex(events);

	return (
		<div style={{ marginTop: 4 }}>
			<div
				style={{
					fontSize: 11,
					fontWeight: 800,
					letterSpacing: 0.8,
					color: T.sub,
					margin: "14px 0 8px",
					borderTop: "1px solid " + T.line,
					paddingTop: 12,
				}}
			>
				{`控え ${bench.length}`}
			</div>
			{bench.map((p, i) => {
				const sub = playerEvents(evIndex, p).subOn;
				return (
					<div
						key={p.player_id || "bench-" + i}
						onClick={() => {
							onTapPlayer(p);
						}}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 10,
							padding: "8px 4px",
							borderBottom: "1px solid " + T.line,
							cursor: "pointer",
						}}
					>
						<span
							style={{
								fontWeight: 900,
								fontSize: 12,
								color: T.accent,
								width: 24,
								flexShrink: 0,
								fontFamily: "monospace",
							}}
						>
							{p.jersey_number}
						</span>
						<span style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>
							{p.player_name}
						</span>
						{sub != null ? (
							<span
								style={{
									fontSize: 10,
									fontWeight: 900,
									color: T.accent,
									marginLeft: "auto",
								}}
							>
								↑{sub}'
							</span>
						) : null}
						{p.position && (
							<span
								style={{
									fontSize: 10,
									fontWeight: 800,
									color: T.faint,
									marginLeft: sub != null ? 8 : "auto",
								}}
							>
								{p.position}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

// detail.events を player_id で索引化。各選手の {goals:[], cards:[{type,minute}], subOff, subOn} を返す。
// player_id 欠落の旧データは player_name フォールバック（完全一致のみ）。
function playerEventIndex(events) {
	const byId = {};
	const byName = {};
	const ensure = (map, key) => {
		if (key == null) return null;
		if (!map[key])
			map[key] = { goals: [], cards: [], subOff: null, subOn: null };
		return map[key];
	};
	(events || []).forEach((e) => {
		const t = e.type;
		if (t === "goal" || t === "penalty" || t === "owngoal") {
			const slot = ensure(byId, e.player_id) || ensure(byName, e.player_name);
			if (slot)
				slot.goals.push({
					minute: e.minute,
					own: t === "owngoal",
					pen: t === "penalty",
				});
		} else if (t === "yellowcard" || t === "redcard" || t === "yellowredcard") {
			const slot = ensure(byId, e.player_id) || ensure(byName, e.player_name);
			if (slot) slot.cards.push({ type: t, minute: e.minute });
		} else if (t === "substitution") {
			const inSlot = ensure(byId, e.player_id) || ensure(byName, e.player_name);
			if (inSlot) inSlot.subOn = e.minute;
			const outSlot =
				ensure(byId, e.related_player_id) ||
				ensure(byName, e.related_player_name);
			if (outSlot) outSlot.subOff = e.minute;
		}
	});
	return { byId, byName };
}

// 1選手のイベント要約を索引から取り出す（player_id優先・名前フォールバック）。
function playerEvents(index, player) {
	return (
		(index.byId && index.byId[player.player_id]) ||
		(index.byName && index.byName[player.player_name]) || {
			goals: [],
			cards: [],
			subOff: null,
			subOn: null,
		}
	);
}

// ── LineupTab: メイン ─────────────────────────────────────────────────────
function LineupTab({ T, detail }) {
	const fx = detail && detail.fixture;
	const lineups = (detail && detail.lineups) || [];

	const homeTeamId = fx && fx.home && fx.home.team_id;
	const awayTeamId = fx && fx.away && fx.away.team_id;
	const homeAppCode = fx && fx.home && fx.home.app_code;
	const awayAppCode = fx && fx.away && fx.away.app_code;

	const teamMap = window.WC && window.WC.TEAM ? window.WC.TEAM : {};
	const homeInfo = teamMap[homeAppCode] || {};
	const awayInfo = teamMap[awayAppCode] || {};
	const homeName = homeInfo.ja || (fx && fx.home && fx.home.name) || "ホーム";
	const awayName = awayInfo.ja || (fx && fx.away && fx.away.name) || "アウェイ";
	const homeFlag = homeInfo.flag || "";
	const awayFlag = awayInfo.flag || "";

	// チームトグル: "home" | "away"
	const [side, setSide] = React.useState("home");
	// 選手シート: null or lineup row
	const [sheetPlayer, setSheetPlayer] = React.useState(null);

	const selectedTeamId = side === "home" ? homeTeamId : awayTeamId;
	const selectedAppCode = side === "home" ? homeAppCode : awayAppCode;

	// 選択チームのlineup行（_appCodeを付加しておく）
	const teamLineups = lineups
		.filter((p) => p.team_id === selectedTeamId)
		.map((p) => Object.assign({}, p, { _appCode: selectedAppCode }));

	const starters = teamLineups.filter(
		(p) => p.is_start === 1 || p.is_start === true,
	);
	const bench = teamLineups.filter(
		(p) => p.is_start === 0 || p.is_start === false,
	);

	return (
		<div style={{ padding: "14px" }}>
			{/* チームトグル */}
			<div
				style={{
					display: "flex",
					gap: 6,
					marginBottom: 10,
					justifyContent: "center",
				}}
			>
				<button
					onClick={() => {
						setSide("home");
					}}
					style={{
						flex: 1,
						maxWidth: 160,
						padding: "8px 12px",
						borderRadius: 999,
						border: "none",
						background: side === "home" ? T.accent : "rgba(255,255,255,0.07)",
						color: side === "home" ? T.accentInk : T.sub,
						fontWeight: 800,
						fontSize: 12,
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 5,
					}}
				>
					<span>{homeFlag}</span>
					<span>{homeName}</span>
				</button>
				<button
					onClick={() => {
						setSide("away");
					}}
					style={{
						flex: 1,
						maxWidth: 160,
						padding: "8px 12px",
						borderRadius: 999,
						border: "none",
						background: side === "away" ? T.accent : "rgba(255,255,255,0.07)",
						color: side === "away" ? T.accentInk : T.sub,
						fontWeight: 800,
						fontSize: 12,
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 5,
					}}
				>
					<span>{awayFlag}</span>
					<span>{awayName}</span>
				</button>
			</div>

			{/* lineupが全くない場合 */}
			{teamLineups.length === 0 ? (
				<div
					style={{
						padding: "40px 16px",
						textAlign: "center",
						color: T.faint,
						fontSize: 13,
						fontWeight: 700,
					}}
				>
					{fx && fx.status === "NS"
						? "スターティングメンバーは試合開始前に発表されます"
						: "ラインナップは試合開始前に発表されます"}
				</div>
			) : (
				<>
					{/* フォーメーション図 */}
					<FormationPitch
						T={T}
						starters={starters}
						onTapPlayer={setSheetPlayer}
						events={detail.events}
					/>

					{/* 控えリスト */}
					<BenchList
						T={T}
						bench={bench}
						onTapPlayer={setSheetPlayer}
						events={detail.events}
					/>
				</>
			)}

			{/* 選手詳細シート */}
			{sheetPlayer && (
				<PlayerSheet
					T={T}
					player={sheetPlayer}
					onClose={() => {
						setSheetPlayer(null);
					}}
				/>
			)}
		</div>
	);
}

function H2HPlaceholder({ T }) {
	return (
		<div style={{ padding: "16px" }}>
			<div
				style={{
					background: T.card,
					borderRadius: 14,
					padding: "28px 20px",
					textAlign: "center",
					border: `1px solid ${T.line}`,
				}}
			>
				<div style={{ fontSize: 28, marginBottom: 10 }}>🔜</div>
				<div
					style={{
						fontWeight: 800,
						fontSize: 15,
						color: T.text,
						marginBottom: 6,
					}}
				>
					H2H（過去対戦）
				</div>
				<div style={{ fontSize: 13, color: T.sub }}>準備中</div>
			</div>
		</div>
	);
}

// ── DetailSkeleton ────────────────────────────────────────────────────────
function DetailSkeleton({ T, goBack }) {
	return (
		<div style={{ minHeight: "100%", background: T.bg }}>
			{/* 戻るボタン */}
			<div
				style={{
					padding: "12px 14px 4px",
					display: "flex",
					alignItems: "center",
				}}
			>
				<button
					onClick={goBack}
					style={{
						border: "none",
						background: "rgba(255,255,255,0.06)",
						borderRadius: 999,
						width: 32,
						height: 32,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						cursor: "pointer",
						color: T.sub,
						fontSize: 18,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
					}}
				>
					‹
				</button>
			</div>
			{/* シマー */}
			<div
				style={{
					padding: "24px 16px",
					textAlign: "center",
					color: T.faint,
					fontSize: 14,
					fontWeight: 700,
				}}
			>
				読み込み中…
			</div>
		</div>
	);
}

// ── DetailUnavailable ─────────────────────────────────────────────────────
function DetailUnavailable({ T, goBack }) {
	return (
		<div style={{ minHeight: "100%", background: T.bg }}>
			<div
				style={{
					padding: "12px 14px 4px",
					display: "flex",
					alignItems: "center",
				}}
			>
				<button
					onClick={goBack}
					style={{
						border: "none",
						background: "rgba(255,255,255,0.06)",
						borderRadius: 999,
						width: 32,
						height: 32,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						cursor: "pointer",
						color: T.sub,
						fontSize: 18,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
					}}
				>
					‹
				</button>
			</div>
			<div style={{ padding: "16px" }}>
				<div
					style={{
						background: T.card,
						borderRadius: 14,
						padding: "28px 20px",
						textAlign: "center",
						border: `1px solid ${T.line}`,
					}}
				>
					<div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
					<div
						style={{
							fontWeight: 800,
							fontSize: 15,
							color: T.text,
							marginBottom: 6,
						}}
					>
						データ取得エラー
					</div>
					<div style={{ fontSize: 13, color: T.sub }}>
						詳細データを取得できませんでした
					</div>
					<button
						onClick={goBack}
						style={{
							marginTop: 20,
							border: "none",
							borderRadius: 10,
							padding: "10px 24px",
							background: T.accent,
							color: T.accentInk,
							fontWeight: 800,
							fontSize: 13,
							cursor: "pointer",
							fontFamily: "inherit",
						}}
					>
						戻る
					</button>
				</div>
			</div>
		</div>
	);
}

// ── MatchDetailScreen (メイン) ────────────────────────────────────────────
function MatchDetailScreen({ T, fixtureId, goBack }) {
	const [detail, setDetail] = React.useState(null);
	const [tab, setTab] = React.useState("timeline");
	const [loading, setLoading] = React.useState(true);

	// 詳細画面マウント時にスクロールコンテナを最上部へリセット
	React.useEffect(() => {
		try {
			const el = document.querySelector('[data-scroll="main"]');
			if (el) el.scrollTop = 0;
			if (window.scrollTo) window.scrollTo(0, 0);
		} catch (e) {
			/* defensive: スクロールリセット失敗は無視 */
		}
	}, []);

	React.useEffect(() => {
		if (fixtureId == null) return;
		let alive = true;
		let timer = null;
		setLoading(true);

		async function load() {
			try {
				const d = await window.WC.fetchFixtureDetail(fixtureId);
				if (!alive) return;
				setDetail(d);
				setLoading(false);
				if (timer) {
					clearTimeout(timer);
					timer = null;
				}
				// ライブ中だけ10秒後に再取得。NS/FTは1回取得のみ。
				if (d && d.fixture && d.fixture.status === "LIVE") {
					timer = setTimeout(load, 10000);
				}
			} catch (e) {
				if (!alive) return;
				setDetail(null);
				setLoading(false);
			}
		}

		load();

		return () => {
			alive = false;
			if (timer) clearTimeout(timer);
		};
	}, [fixtureId]);

	if (loading) return <DetailSkeleton T={T} goBack={goBack} />;
	if (!detail) return <DetailUnavailable T={T} goBack={goBack} />;

	const fx = detail.fixture;

	function renderTabBody() {
		if (tab === "timeline") return <TimelineTab T={T} detail={detail} />;
		if (tab === "stats") return <StatsTab T={T} detail={detail} />;
		if (tab === "xg") return <XgTab T={T} detail={detail} />;
		if (tab === "lineup") return <LineupTab T={T} detail={detail} />;
		if (tab === "h2h") return <H2HPlaceholder T={T} />;
		return null;
	}

	return (
		<div
			style={{
				minHeight: "100%",
				background: T.bg,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<style>{DETAIL_ANIM_CSS}</style>
			{/* 固定スコアヘッダー（戻るボタンを内包） */}
			<DetailHeader T={T} fx={fx} goBack={goBack} />

			{/* タブバー */}
			<DetailTabBar T={T} tab={tab} setTab={setTab} />

			{/* タブ本体 */}
			<div style={{ flex: 1, overflowY: "auto" }}>{renderTabBody()}</div>
		</div>
	);
}

Object.assign(window, {
	MatchDetailScreen,
	DetailHeader,
	DetailTabBar,
	TimelineTab,
	StatsTab,
	XgTab,
	LineupTab,
	H2HPlaceholder,
	DetailSkeleton,
	DetailUnavailable,
});
