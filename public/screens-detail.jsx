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

// ── ヘルパー ──────────────────────────────────────────────────────────────
function fmtKickoff(starting_at) {
	if (!starting_at) return "--:--";
	try {
		const d = new Date(starting_at);
		const h = String(d.getHours()).padStart(2, "0");
		const m = String(d.getMinutes()).padStart(2, "0");
		return `${h}:${m}`;
	} catch (e) {
		return "--:--";
	}
}

// ── DetailHeader ──────────────────────────────────────────────────────────
function DetailHeader({ T, fx }) {
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
				{fmtKickoff(fx.starting_at)}
			</div>
		);
	}

	return (
		<div
			style={{
				padding: "4px 14px 14px",
				textAlign: "center",
				background:
					"radial-gradient(120% 90% at 50% -10%, rgba(22,56,38,0.31) 0%, transparent 60%)",
				borderBottom: `1px solid ${T.line}`,
			}}
		>
			{/* ラウンド名 */}
			{fx.round_name && (
				<div
					style={{
						fontSize: 10.5,
						color: T.sub,
						fontWeight: 700,
						marginBottom: 4,
					}}
				>
					{fx.round_name}
				</div>
			)}
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
				<div style={{ flex: 1, textAlign: "center" }}>
					<div style={{ fontSize: 34, lineHeight: 1 }}>{homeFlag}</div>
					<div
						style={{
							fontWeight: 800,
							fontSize: 12,
							marginTop: 4,
							color: T.text,
						}}
					>
						{homeName}
					</div>
				</div>
				{/* スコア + バッジ */}
				<div style={{ textAlign: "center" }}>
					<div
						style={{
							fontSize: 32,
							fontWeight: 800,
							letterSpacing: 1,
							color: T.text,
						}}
					>
						{scoreStr}
					</div>
					{statusBadge}
				</div>
				{/* アウェイ */}
				<div style={{ flex: 1, textAlign: "center" }}>
					<div style={{ fontSize: 34, lineHeight: 1 }}>{awayFlag}</div>
					<div
						style={{
							fontWeight: 800,
							fontSize: 12,
							marginTop: 4,
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
				gap: 4,
				padding: "9px 10px",
				overflowX: "auto",
				borderBottom: `1px solid ${T.line}`,
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
							fontSize: 12,
							fontWeight: 800,
							padding: "7px 13px",
							borderRadius: 999,
							background: active ? T.accent : "transparent",
							color: active ? T.accentInk : T.sub,
							border: "none",
							cursor: "pointer",
							whiteSpace: "nowrap",
						}}
					>
						{t.label}
					</button>
				);
			})}
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

function TimelineTab({ T }) {
	return <PlaceholderBody T={T} label="タイムライン" />;
}

function StatsTab({ T }) {
	return <PlaceholderBody T={T} label="スタッツ" />;
}

function XgTab({ T }) {
	return <PlaceholderBody T={T} label="xG" />;
}

function LineupTab({ T }) {
	return <PlaceholderBody T={T} label="布陣" />;
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

	React.useEffect(() => {
		if (fixtureId == null) return;
		let cancelled = false;

		async function load() {
			setLoading(true);
			try {
				const d = await window.WC.fetchFixtureDetail(fixtureId);
				if (!cancelled) {
					setDetail(d);
					setLoading(false);
				}
			} catch (e) {
				if (!cancelled) {
					setDetail(null);
					setLoading(false);
				}
			}
		}

		load();

		const interval = setInterval(async () => {
			try {
				const d = await window.WC.fetchFixtureDetail(fixtureId);
				if (!cancelled) setDetail(d);
			} catch (e) {
				/* サイレント失敗 */
			}
		}, 10000);

		return () => {
			cancelled = true;
			clearInterval(interval);
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
			{/* 戻るボタン */}
			<div
				style={{
					padding: "12px 14px 4px",
					display: "flex",
					alignItems: "center",
					flexShrink: 0,
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
				<span
					style={{
						fontSize: 11,
						fontWeight: 700,
						color: T.sub,
						marginLeft: 10,
					}}
				>
					戻る
				</span>
			</div>

			{/* 固定スコアヘッダー */}
			<DetailHeader T={T} fx={fx} />

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
