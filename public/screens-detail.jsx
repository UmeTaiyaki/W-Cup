/* 試合詳細画面（P2 watch-detail）
   MatchDetailScreen + sub-components: DetailHeader / DetailTabBar / placeholder tabs
   全コンポーネントは pitch-night テーマ T prop で色決め。ハードコード禁止。
*/

// ── 定数 ──────────────────────────────────────────────────────────────────
const DETAIL_TABS = [
	{ id: "timeline", label: "タイムライン" },
	{ id: "ai", label: "AI" },
	{ id: "lineup", label: "スタメン" },
	{ id: "stats", label: "スタッツ" },
	{ id: "xg", label: "xG" },
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

// 試合経過の表記。minute有→"67分" / アディショナル有→"46 (+4)"。無→null。
function fmtMatchClock(minute, added) {
	if (minute == null) return null;
	return added != null && added > 0 ? `${minute} (+${added})` : `${minute}分`;
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
	// PK決着の表示（KO戦で本スコア同点→PK戦スコアで決着）
	const penStr =
		fx.home.pen_score != null && fx.away.pen_score != null
			? `PK ${fx.home.pen_score} - ${fx.away.pen_score}`
			: null;

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
				{fx.state_id === 3
					? "HT"
					: fmtMatchClock(fx.minute, fx.added_time) || "LIVE"}
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
					{penStr && (
						<div
							style={{
								fontSize: 12,
								fontWeight: 800,
								color: T.accent,
								marginTop: 1,
							}}
						>
							{penStr}
						</div>
					)}
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

// ── タイムライン用 SVG アイコン ───────────────────────────────────────────
// 暗背景(pitch-night)でも視認できる高コントラスト配色。viewBox 24×24・既定16px。
// ボールの内部パターンは BallPaths を共有し、取消/オウンゴール等で配色だけ差し替える。
// 本格フットボール柄: 中央＋外周5枚の黒ペンタゴン(頂点方向・内向き)を円縁でクリップし、
// 白ヘキサゴンとの古典的配置にする＋中央頂点から外周へシーム。パスは規則ペンタゴン生成の固定値。
// 外周ペンタゴンは円外まで張り出し clipPath(円)で切るため、シルエットに「途切れたペンタゴン」が出る。
const BALL_PATCHES = [
	"M12.00 8.60L15.23 10.95L14.00 14.75L10.00 14.75L8.77 10.95Z",
	"M12.00 6.80L8.96 4.59L10.12 1.01L13.88 1.01L15.04 4.59Z",
	"M16.95 10.39L18.11 6.82L21.87 6.82L23.03 10.39L19.99 12.60Z",
	"M15.06 16.21L18.82 16.21L19.98 19.78L16.94 22.00L13.89 19.78Z",
	"M8.94 16.21L10.11 19.78L7.06 22.00L4.02 19.78L5.18 16.21Z",
	"M7.05 10.39L4.01 12.60L0.97 10.39L2.13 6.82L5.89 6.82Z",
];
const BALL_SEAMS = [
	"M12.00 8.60 L12.00 2.60",
	"M15.23 10.95 L20.94 9.10",
	"M14.00 14.75 L17.53 19.60",
	"M10.00 14.75 L6.47 19.60",
	"M8.77 10.95 L3.06 9.10",
];
// clipPath は要素ごとに一意な id が要る（複数ボール同時描画でも干渉しない）。
let _ballSeq = 0;
function BallPaths({ white, dark }) {
	const idRef = React.useRef(null);
	if (idRef.current == null) idRef.current = "wcBallClip" + _ballSeq++;
	const cid = idRef.current;
	return (
		<>
			<defs>
				<clipPath id={cid}>
					<circle cx="12" cy="12" r="9.4" />
				</clipPath>
			</defs>
			<circle
				cx="12"
				cy="12"
				r="9.4"
				fill={white}
				stroke={dark}
				strokeWidth="1.2"
			/>
			<g clipPath={`url(#${cid})`}>
				{BALL_PATCHES.map((d, i) => (
					<path key={i} d={d} fill={dark} />
				))}
				<g stroke={dark} strokeWidth="1.1" fill="none" strokeLinecap="round">
					{BALL_SEAMS.map((d, i) => (
						<path key={i} d={d} />
					))}
				</g>
			</g>
		</>
	);
}
function Svg({ s = 16, children }) {
	return (
		<svg
			width={s}
			height={s}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			style={{ display: "block" }}
		>
			{children}
		</svg>
	);
}
function IcoSoccerBall({ s }) {
	return (
		<Svg s={s}>
			<BallPaths white="#ffffff" dark="#15181d" />
		</Svg>
	);
}
function IcoOwnGoal({ s }) {
	// 赤系のボール＝オウンゴール
	return (
		<Svg s={s}>
			<BallPaths white="#ffd9d6" dark="#c0392b" />
		</Svg>
	);
}
function IcoGoalDisallowed({ s }) {
	// くすませたボール＋赤スラッシュ＝VAR取消
	return (
		<Svg s={s}>
			<g opacity="0.5">
				<BallPaths white="#cfd4da" dark="#3a4048" />
			</g>
			<line
				x1="4.5"
				y1="19.5"
				x2="19.5"
				y2="4.5"
				stroke="#ff3b30"
				strokeWidth="2.6"
				strokeLinecap="round"
			/>
		</Svg>
	);
}
function IcoMissedPen({ s }) {
	// くすませたボール＋赤×＝PK失敗
	return (
		<Svg s={s}>
			<g opacity="0.5">
				<BallPaths white="#cfd4da" dark="#3a4048" />
			</g>
			<path
				d="M7.2 7.2 L16.8 16.8 M16.8 7.2 L7.2 16.8"
				stroke="#ff3b30"
				strokeWidth="2.4"
				strokeLinecap="round"
			/>
		</Svg>
	);
}
function IcoCard({ s, color, stroke }) {
	return (
		<Svg s={s}>
			<rect
				x="8"
				y="3.6"
				width="10"
				height="15"
				rx="2"
				fill={color}
				stroke={stroke}
				strokeWidth="0.8"
				transform="rotate(10 12 11)"
			/>
		</Svg>
	);
}
function IcoCardDouble({ s }) {
	// 2枚目の警告＝退場（黄の後ろ＋赤の前）
	return (
		<Svg s={s}>
			<rect
				x="5.5"
				y="4.4"
				width="9"
				height="14"
				rx="2"
				fill="#FFCB05"
				stroke="#C99A00"
				strokeWidth="0.7"
				transform="rotate(10 10 11)"
			/>
			<rect
				x="10"
				y="4.4"
				width="9"
				height="14"
				rx="2"
				fill="#EA3B2E"
				stroke="#B5241A"
				strokeWidth="0.7"
				transform="rotate(10 14 11)"
			/>
		</Svg>
	);
}
function IcoSub({ s }) {
	return (
		<Svg s={s}>
			{/* IN: 緑・上向き */}
			<g
				stroke="#2fd968"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			>
				<path d="M8 19 L8 7" />
				<path d="M4.8 10.2 L8 6.6 L11.2 10.2" />
			</g>
			{/* OUT: 赤・下向き */}
			<g
				stroke="#ff5a5f"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			>
				<path d="M16 5 L16 17" />
				<path d="M12.8 13.8 L16 17.4 L19.2 13.8" />
			</g>
		</Svg>
	);
}
function IcoVar({ s }) {
	// 主審のVARジェスチャ(画面の四角)＋レビュー三角
	return (
		<Svg s={s}>
			<rect
				x="3"
				y="5.5"
				width="18"
				height="13"
				rx="2.2"
				fill="none"
				stroke="#4da3ff"
				strokeWidth="2"
			/>
			<path d="M10 9.4 L15.2 12 L10 14.6 Z" fill="#4da3ff" />
		</Svg>
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

	/** type から SVG アイコン要素を返す（未知 type は null＝無アイコン） */
	function eventIcon(type) {
		switch (type) {
			case "goal":
			case "penalty":
			case "pen_shootout_goal":
				return <IcoSoccerBall />;
			case "own_goal":
				return <IcoOwnGoal />;
			case "goal_disallowed":
			case "var_goal_disallowed":
				return <IcoGoalDisallowed />;
			case "yellowcard":
				return <IcoCard color="#FFCB05" stroke="#C99A00" />;
			case "redcard":
				return <IcoCard color="#EA3B2E" stroke="#B5241A" />;
			case "yellowredcard":
				return <IcoCardDouble />;
			case "substitution":
				return <IcoSub />;
			case "missed_penalty":
			case "pen_shootout_miss":
				return <IcoMissedPen />;
			case "var":
				return <IcoVar />;
			default:
				return null;
		}
	}

	/** VAR など type の補足ラベル（無ければ null）。交代相手は別途 sideNote で扱う。 */
	function eventNote(type) {
		switch (type) {
			case "goal_disallowed":
			case "var_goal_disallowed":
				return "VAR: ゴール取消";
			case "var":
				return "VAR判定";
			default:
				return null;
		}
	}

	// 時系列順: minute → extra_minute → sort_order(同分内の安定化)。
	// sort_order 単独は SportMonks の型別連番でグローバル時系列にならないため主キーにしない。
	const sorted = [...events].sort(
		(a, b) =>
			(a.minute ?? 0) - (b.minute ?? 0) ||
			(a.extra_minute ?? 0) - (b.extra_minute ?? 0) ||
			(a.sort_order ?? 0) - (b.sort_order ?? 0),
	);

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
					const isCancelled =
						ev.type === "goal_disallowed" || ev.type === "var_goal_disallowed";
					const note = eventNote(ev.type);
					const playerStyle = {
						fontWeight: 700,
						color: isOwnGoal || isCancelled ? T.sub : T.text,
						textDecoration: isCancelled ? "line-through" : undefined,
					};
					const isNew = ev.sm_event_id != null && newIdSet.has(ev.sm_event_id);

					const iconNode = icon ? (
						<span style={{ display: "inline-flex", alignItems: "center" }}>
							{icon}
						</span>
					) : null;

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
										{note && (
											<span style={{ color: T.sub, fontSize: 10.5 }}>
												{note}
											</span>
										)}
										<span style={playerStyle}>{ev.player_name}</span>
										{iconNode}
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
										{iconNode}
										<span style={playerStyle}>{ev.player_name}</span>
										{isSub && ev.related_player_name && (
											<span style={{ color: T.sub, fontSize: 10.5 }}>
												→{ev.related_player_name}
											</span>
										)}
										{note && (
											<span style={{ color: T.sub, fontSize: 10.5 }}>
												{note}
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

// ③ シュートの質: xG per shot（= xG / シュート数）。shots か xG が欠ければ非表示。
function XgShotQuality({
	T,
	homeName,
	awayName,
	homeXg,
	awayXg,
	homeShots,
	awayShots,
}) {
	const perShot = (xg, shots) =>
		xg != null && shots != null && shots > 0 ? xg / shots : null;
	const h = perShot(homeXg, homeShots);
	const a = perShot(awayXg, awayShots);
	if (h == null && a == null) return null;
	const cell = (label, v, sub) => (
		<div style={{ flex: 1, textAlign: "center" }}>
			<div style={{ fontSize: 9.5, color: T.sub }}>{label}</div>
			<div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>
				{v != null ? v.toFixed(2) : "–"}
			</div>
			<div style={{ fontSize: 9, color: T.faint }}>{sub}</div>
		</div>
	);
	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				padding: "11px 12px",
				background: T.card,
				borderRadius: 12,
				border: `1px solid ${T.line}`,
				marginBottom: 14,
			}}
		>
			{cell(homeName, h, `${homeShots != null ? homeShots : "–"}本`)}
			<div style={{ alignSelf: "center", fontSize: 9.5, color: T.sub }}>
				xG / シュート
			</div>
			{cell(awayName, a, `${awayShots != null ? awayShots : "–"}本`)}
		</div>
	);
}

// ④ GK評価: 防いだ失点 ≒ 相手xGoT − 失点。xGoT が無ければ null（節ごと非表示）。
function XgGkValue({
	T,
	homeName,
	awayName,
	homeXgot,
	awayXgot,
	homeScore,
	awayScore,
}) {
	// home GK は away の攻撃(awayXgot)に対峙し、失点は awayScore
	const homeSaved =
		awayXgot != null && awayScore != null ? awayXgot - awayScore : null;
	const awaySaved =
		homeXgot != null && homeScore != null ? homeXgot - homeScore : null;
	if (homeSaved == null && awaySaved == null) return null;
	const cell = (teamName, saved) => (
		<div style={{ flex: 1, textAlign: "center" }}>
			<div style={{ fontSize: 9.5, color: T.sub }}>{teamName} GK</div>
			<div
				style={{
					fontSize: 16,
					fontWeight: 800,
					color: saved != null && saved > 0 ? T.accent : T.text,
				}}
			>
				{saved != null ? (saved > 0 ? "+" : "") + saved.toFixed(2) : "–"}
			</div>
			<div style={{ fontSize: 9, color: T.faint }}>防いだ失点</div>
		</div>
	);
	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				padding: "11px 12px",
				background: T.card,
				borderRadius: 12,
				border: `1px solid ${T.line}`,
				marginBottom: 14,
			}}
		>
			{cell(homeName, homeSaved)}
			<div style={{ alignSelf: "center", fontSize: 9.5, color: T.sub }}>
				GK評価
			</div>
			{cell(awayName, awaySaved)}
		</div>
	);
}

// ── AiTab ─────────────────────────────────────────────────────────────────
// 試合進行(スタメン/HT/FT)に合わせた Gemini 生成の日本語サマリーを phase 順に表示。
// detail.ai は { phase, summary, model, generated_at } の配列（未生成時は空 or 無）。
const AI_PHASE_META = {
	lineup: { label: "スタメン分析", order: 0 },
	ht: { label: "ハーフタイム分析", order: 1 },
	ft: { label: "試合総括", order: 2 },
};

function AiTab({ T, detail }) {
	const ai = (detail && detail.ai) || [];
	if (ai.length === 0) {
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
				AI分析は試合の進行に合わせて表示されます
			</div>
		);
	}
	const sorted = [...ai].sort(
		(a, b) =>
			((AI_PHASE_META[a.phase] && AI_PHASE_META[a.phase].order) != null
				? AI_PHASE_META[a.phase].order
				: 9) -
			((AI_PHASE_META[b.phase] && AI_PHASE_META[b.phase].order) != null
				? AI_PHASE_META[b.phase].order
				: 9),
	);
	return (
		<div
			style={{
				padding: 12,
				display: "flex",
				flexDirection: "column",
				gap: 12,
			}}
		>
			{sorted.map((a) => (
				<div
					key={a.phase}
					style={{
						background: T.card,
						borderRadius: 12,
						padding: 14,
						border: `1px solid ${T.line}`,
					}}
				>
					<div
						style={{
							fontSize: 13,
							fontWeight: 800,
							color: T.text,
							marginBottom: 6,
						}}
					>
						{(AI_PHASE_META[a.phase] && AI_PHASE_META[a.phase].label) ||
							a.phase}
					</div>
					<div
						style={{
							fontSize: 13,
							lineHeight: 1.7,
							color: T.text,
							whiteSpace: "pre-wrap",
						}}
					>
						{a.summary}
					</div>
				</div>
			))}
		</div>
	);
}

// ── XgTab ─────────────────────────────────────────────────────────────────
// セクション1: チーム合計バンド(accent枠) — 未終了(非FT)or 両xGともnull時は早期return
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

	// xG系派生（foldStats を再利用。null は描画側で畳む）
	const xgStatsByType = foldStats(
		(detail && detail.stats) || [],
		homeTeamId,
		awayTeamId,
	);
	const pick = (tid, side) => {
		const p = xgStatsByType[tid];
		return p && p[side] != null ? p[side] : null;
	};
	// xGoT: 5305（無ければ null）
	const homeXgot = pick(5305, "home");
	const awayXgot = pick(5305, "away");
	// シュート数: type_id 42
	const homeShots = pick(42, "home");
	const awayShots = pick(42, "away");
	// 被xG(xGA): 9687 を優先、無ければ相手の base xG で導出
	const homeXga = pick(9687, "home") != null ? pick(9687, "home") : awayXg;
	const awayXga = pick(9687, "away") != null ? pick(9687, "away") : homeXg;
	// xG差（base xG 同士）
	const xgDiff = homeXg != null && awayXg != null ? homeXg - awayXg : null;
	const fmtXg = (v) => (v != null ? v.toFixed(2) : "–");

	const teamMap = window.WC && window.WC.TEAM ? window.WC.TEAM : {};
	const homeInfo = teamMap[fx && fx.home && fx.home.app_code] || {};
	const awayInfo = teamMap[fx && fx.away && fx.away.app_code] || {};
	const homeName = homeInfo.ja || (fx && fx.home && fx.home.name) || "ホーム";
	const awayName = awayInfo.ja || (fx && fx.away && fx.away.name) || "アウェイ";

	// xG はリアルタイムでは確定しないため、終了(FT)した試合のみ中身を表示する。
	// 未終了(NS/LIVE)・データ無しは「試合後に表示されます」プレースホルダを出す。
	const isFinished = fx && fx.status === "FT";
	if (!isFinished || (homeXg == null && awayXg == null)) {
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

	// 決定力（xGoT−xG）: xGoT が無いチームは null
	function finishingNote(xg, xgot) {
		if (xg == null || xgot == null) return null;
		const d = xgot - xg;
		if (d > 0.3) return "枠内に良い形で持ち込んだ";
		if (d < -0.3) return "枠を捉えきれず";
		return null;
	}
	const homeFinish = finishingNote(homeXg, homeXgot);
	const awayFinish = finishingNote(awayXg, awayXgot);

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

				{/* xGoT / 被xG / xG差 ミニグリッド（値がある列だけ） */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-around",
						marginTop: 11,
						gap: 8,
						fontSize: 10,
						color: T.sub,
						textAlign: "center",
					}}
				>
					{(homeXgot != null || awayXgot != null) && (
						<div>
							<div style={{ fontWeight: 800, color: T.text, fontSize: 12 }}>
								{fmtXg(homeXgot)} / {fmtXg(awayXgot)}
							</div>
							<div>xGoT（枠内）</div>
						</div>
					)}
					{(homeXga != null || awayXga != null) && (
						<div>
							<div style={{ fontWeight: 800, color: T.text, fontSize: 12 }}>
								{fmtXg(homeXga)} / {fmtXg(awayXga)}
							</div>
							<div>被xG</div>
						</div>
					)}
					{xgDiff != null && (
						<div>
							<div style={{ fontWeight: 800, color: T.text, fontSize: 12 }}>
								{xgDiff > 0 ? "+" : ""}
								{xgDiff.toFixed(2)}
							</div>
							<div>xG差</div>
						</div>
					)}
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
						{homeFinish && (
							<span
								style={{
									display: "block",
									fontSize: 10,
									marginTop: 1,
									color: T.faint,
								}}
							>
								{homeFinish}
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
						{awayFinish && (
							<span
								style={{
									display: "block",
									fontSize: 10,
									marginTop: 1,
									color: T.faint,
								}}
							>
								{awayFinish}
							</span>
						)}
					</span>
				</div>
			</div>

			<XgShotQuality
				T={T}
				homeName={homeName}
				awayName={awayName}
				homeXg={homeXg}
				awayXg={awayXg}
				homeShots={homeShots}
				awayShots={awayShots}
			/>
			<XgGkValue
				T={T}
				homeName={homeName}
				awayName={awayName}
				homeXgot={homeXgot}
				awayXgot={awayXgot}
				homeScore={homeScore}
				awayScore={awayScore}
			/>
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
							detailed_position:
								player.detailed_position || positionLabel(player.position),
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
										const VIEW = [
											["appearances", "出場", ""],
											["goals", "ゴール", ""],
											["assists", "アシスト", ""],
											["rating", "評価", ""],
											["minutes", "出場時間", "分"],
											["yellowcards", "警告", ""],
											["shots_total", "シュート", ""],
											["shots_on_target", "枠内", ""],
											["passes", "パス", ""],
										];
										const cells = VIEW.filter(([k]) => s.stats[k] != null);
										const seasonLabel = (se) =>
											(se.league_name ? se.league_name + " " : "") +
											(se.season_name || se.season_id);
										return (
											<div style={{ marginTop: 18 }}>
												<div
													style={{
														display: "flex",
														gap: 8,
														alignItems: "center",
														marginBottom: 10,
													}}
												>
													<span
														style={{
															fontSize: 13,
															fontWeight: 800,
															color: T.text,
														}}
													>
														シーズン統計
													</span>
													<span style={{ marginLeft: "auto" }}>
														{prof.seasons.length > 1 ? (
															<select
																value={idx}
																onChange={(e) =>
																	setStatSeasonIdx(Number(e.target.value))
																}
																style={{
																	background: "rgba(255,255,255,0.06)",
																	color: T.text,
																	border: "1px solid " + T.line,
																	borderRadius: 999,
																	fontSize: 11.5,
																	fontWeight: 700,
																	padding: "5px 10px",
																}}
															>
																{prof.seasons.map((se, i) => (
																	<option key={se.season_id} value={i}>
																		{seasonLabel(se)}
																	</option>
																))}
															</select>
														) : (
															<span
																style={{
																	fontSize: 11.5,
																	fontWeight: 700,
																	color: T.sub,
																	background: "rgba(255,255,255,0.06)",
																	border: "1px solid " + T.line,
																	borderRadius: 999,
																	padding: "5px 10px",
																}}
															>
																{seasonLabel(s)}
															</span>
														)}
													</span>
												</div>
												<div
													style={{
														display: "grid",
														gridTemplateColumns: "repeat(3, 1fr)",
														gap: 8,
													}}
												>
													{cells.map(([k, label, unit]) => (
														<div
															key={k}
															style={{
																boxSizing: "border-box",
																background: "rgba(255,255,255,0.045)",
																border: "1px solid " + T.line,
																borderRadius: 12,
																padding: "11px 6px",
																textAlign: "center",
															}}
														>
															<div
																style={{
																	fontSize: 19,
																	fontWeight: 900,
																	color: T.text,
																	lineHeight: 1.1,
																}}
															>
																{s.stats[k]}
																{unit && (
																	<span
																		style={{
																			fontSize: 11,
																			fontWeight: 700,
																			color: T.sub,
																		}}
																	>
																		{unit}
																	</span>
																)}
															</div>
															<div
																style={{
																	fontSize: 10.5,
																	color: T.sub,
																	fontWeight: 700,
																	marginTop: 4,
																}}
															>
																{label}
															</div>
														</div>
													))}
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

// ── PlayerMarks: 選手のイベントマーク（ゴール数分のボール＋カード）──────────
// スタメン/控え共通。ゴールは数だけボールを並べ、オウンゴールは赤系ボールで区別。
// カードは赤系(レッド/2枚目)優先、無ければイエロー。イベント無しなら何も描かない。
function PlayerMarks({ ev, size = 12 }) {
	if (!ev) return null;
	const goals = ev.goals || [];
	const cards = ev.cards || [];
	const hasRed = cards.some(
		(c) => c.type === "redcard" || c.type === "yellowredcard",
	);
	const hasYellow = cards.some((c) => c.type === "yellowcard");
	if (goals.length === 0 && !hasRed && !hasYellow) return null;
	return (
		<span
			style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
			aria-hidden="true"
		>
			{goals.map((g, i) => (
				<span key={"g" + i} style={{ display: "inline-flex" }}>
					{g.own ? <IcoOwnGoal s={size} /> : <IcoSoccerBall s={size} />}
				</span>
			))}
			{hasRed ? (
				<IcoCard s={size} color="#EA3B2E" stroke="#B5241A" />
			) : hasYellow ? (
				<IcoCard s={size} color="#FFCB05" stroke="#C99A00" />
			) : null}
		</span>
	);
}

// SportMonks の一般ポジション position_id を略号へ。未知はそのまま返す（障害隔離）。
const POSITION_LABELS = { 24: "GK", 25: "DF", 26: "MF", 27: "FW" };
function positionLabel(position) {
	if (position == null || position === "") return null;
	return POSITION_LABELS[Number(position)] || String(position);
}
function isGoalkeeper(player) {
	return String(player?.position) === "24";
}
// GK を際立たせるアクセント（参考: SofaScore 風）。
const GK_ACCENT = "#f59e0b";
const GK_INK = "#3a2400";

// ── PlayerAvatar: 顔写真の丸（PlayerDot/BenchList 共用） ───────────────────
// 画像が無い/読み込み失敗時は背番号の色付き丸へフォールバック（graceful degradation）。
// overflow:hidden で写真を円形にクリップ。バッジ類は呼び出し側が外側に重ねる。
// GK は accent/ink を差し替えて色分け（写真があれば写真が優先表示される）。
function PlayerAvatar({ T, player, size }) {
	const num = player.jersey_number;
	const gk = isGoalkeeper(player);
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: "50%",
				background: gk ? GK_ACCENT : T.accent,
				color: gk ? GK_INK : T.accentInk,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontWeight: 900,
				fontSize: Math.round(size * 0.34),
				// GK は枠をアクセント色に（写真があっても識別できる）。
				border: gk
					? `2.5px solid ${GK_ACCENT}`
					: "2px solid rgba(255,255,255,0.85)",
				boxShadow: gk
					? `0 0 0 1px ${GK_ACCENT}55, 0 2px 6px rgba(0,0,0,0.35)`
					: "0 2px 6px rgba(0,0,0,0.35)",
				position: "relative",
				overflow: "hidden",
				flexShrink: 0,
			}}
		>
			{num != null ? num : "?"}
			{player.player_image && (
				<img
					src={player.player_image}
					alt=""
					loading="lazy"
					onError={(e) => {
						e.target.style.display = "none";
					}}
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
						borderRadius: "50%",
						objectFit: "cover",
						objectPosition: "top center",
						background: "#cfd8d3",
					}}
				/>
			)}
		</div>
	);
}

// ── PlayerDot: ピッチ上の選手ドット ──────────────────────────────────────
// マーク配置（参考画像準拠）: カード=右上 / ゴール(数分のボール)=右下 / 交代OUT=左下。
// 外側 div は丸サイズちょうど。translate(-50%,-50%) で「丸の中心」を座標へ固定し、
// 名前ラベルは絶対配置で下に流すため、名前の行数(1/2行)で丸の縦位置がズレない。
function PlayerDot({ T, player, ev, topPct, leftPct, onTap }) {
	const fullName = player.player_name || "?";
	const num = player.jersey_number;
	const goals = (ev && ev.goals) || [];
	const cards = (ev && ev.cards) || [];
	const hasRed = cards.some(
		(c) => c.type === "redcard" || c.type === "yellowredcard",
	);
	const hasYellow = cards.some((c) => c.type === "yellowcard");
	const SIZE = 44;

	return (
		<div
			onClick={() => {
				onTap(player);
			}}
			style={{
				position: "absolute",
				top: topPct + "%",
				left: leftPct + "%",
				width: SIZE,
				height: SIZE,
				transform: "translate(-50%, -50%)",
				cursor: "pointer",
				zIndex: 2,
				userSelect: "none",
			}}
		>
			<PlayerAvatar T={T} player={player} size={SIZE} />
			{/* カード（右上・赤系優先） */}
			{(hasRed || hasYellow) && (
				<div
					style={{
						position: "absolute",
						top: -8,
						right: -8,
						display: "inline-flex",
						zIndex: 3,
					}}
				>
					{hasRed ? (
						<IcoCard s={17} color="#EA3B2E" stroke="#B5241A" />
					) : (
						<IcoCard s={17} color="#FFCB05" stroke="#C99A00" />
					)}
				</div>
			)}
			{/* ゴール（右下・得点数分のボール） */}
			{goals.length > 0 && (
				<div
					style={{
						position: "absolute",
						bottom: -8,
						right: -8,
						display: "inline-flex",
						alignItems: "center",
						gap: 1,
						zIndex: 3,
					}}
				>
					{goals.map((g, i) => (
						<span key={"g" + i} style={{ display: "inline-flex" }}>
							{g.own ? <IcoOwnGoal s={17} /> : <IcoSoccerBall s={17} />}
						</span>
					))}
				</div>
			)}
			{/* 交代OUT（先発が退く・左下）。丸の下端付近に置き、名前ラベルと被らせない。 */}
			{ev && ev.subOff != null && (
				<div
					style={{
						position: "absolute",
						bottom: 3,
						left: -8,
						background: "rgba(255,90,90,0.92)",
						color: "#1a0c0c",
						fontSize: 9,
						fontWeight: 900,
						padding: "0 4px",
						borderRadius: 6,
						zIndex: 3,
					}}
				>
					↓{ev.subOff}'
				</div>
			)}
			{/* 背番号＋フルネーム（丸の真下に絶対配置＝丸の縦位置に影響しない・2行まで） */}
			<div
				style={{
					position: "absolute",
					top: "calc(100% + 3px)",
					left: "50%",
					transform: "translateX(-50%)",
					width: 74,
					fontSize: 10,
					fontWeight: 700,
					color: T.text,
					textAlign: "center",
					lineHeight: 1.12,
					display: "-webkit-box",
					WebkitLineClamp: 2,
					WebkitBoxOrient: "vertical",
					overflow: "hidden",
					wordBreak: "break-word",
					textShadow: "0 1px 3px rgba(0,0,0,0.7)",
					pointerEvents: "none",
				}}
			>
				{num != null && (
					<span style={{ fontWeight: 900, marginRight: 3, opacity: 0.85 }}>
						{num}
					</span>
				)}
				{fullName}
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
				スタメンデータがありません
			</div>
		);
	}

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

	// 実在する row を昇順に（番号の歯抜けがあっても均等配置できるよう rank 化）。
	// rank 0 = GK 側（下）、rank 最大 = FW 側（上）。
	const sortedRows = Object.keys(byRow)
		.map(Number)
		.sort((a, b) => a - b);
	const nRows = sortedRows.length;

	// ピッチの縦横比（やや縦長＝行間/ラベル余白を確保）
	return (
		<div
			style={{
				position: "relative",
				width: "100%",
				paddingBottom: "132%",
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
				const rank = sortedRows.indexOf(row); // 0=GK側(下)

				// 縦位置: 上下マージン[V_TOP, V_BOT]の帯に rank を均等配置（GKが下）。
				// 行が1段だけなら中央。歯抜け row 番号でも等間隔になる。
				const V_TOP = 13;
				const V_BOT = 86;
				const topPct =
					nRows <= 1
						? (V_TOP + V_BOT) / 2
						: V_BOT - (rank / (nRows - 1)) * (V_BOT - V_TOP);

				// 横位置: N人を均等配置し、左右マージン(SIDE)でラベルの見切れを防ぐ。
				const SIDE = 9;
				const leftPct = SIDE + (colIdx / (N + 1)) * (100 - 2 * SIDE);

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
				const pev = playerEvents(evIndex, p);
				const sub = pev.subOn;
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
						{/* 顔写真（背番号があった位置・画像欠落時は背番号フォールバック） */}
						<PlayerAvatar T={T} player={p} size={34} />
						{/* 名前の前に背番号 */}
						<span
							style={{
								fontWeight: 700,
								color: T.text,
								fontSize: 14,
								display: "inline-flex",
								alignItems: "baseline",
								gap: 6,
								minWidth: 0,
							}}
						>
							{p.jersey_number != null && (
								<span
									style={{
										fontWeight: 900,
										fontSize: 12,
										color: T.accent,
										fontFamily: "monospace",
										flexShrink: 0,
									}}
								>
									{p.jersey_number}
								</span>
							)}
							<span
								style={{
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{p.player_name}
							</span>
						</span>
						{/* 右端クラスタ: マーク（ゴール/カード）→ 交代時間 → ポジション */}
						<span
							style={{
								marginLeft: "auto",
								display: "inline-flex",
								alignItems: "center",
								gap: 8,
							}}
						>
							<PlayerMarks ev={pev} size={18} />
							{sub != null && (
								<span
									style={{ fontSize: 12, fontWeight: 900, color: T.accent }}
								>
									↑{sub}'
								</span>
							)}
							{positionLabel(p.position) && (
								<span
									style={{
										fontSize: 10.5,
										fontWeight: 800,
										color: isGoalkeeper(p) ? GK_ACCENT : T.faint,
										minWidth: 22,
										textAlign: "right",
									}}
								>
									{positionLabel(p.position)}
								</span>
							)}
						</span>
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
		if (t === "goal" || t === "penalty" || t === "own_goal") {
			const slot = ensure(byId, e.player_id) || ensure(byName, e.player_name);
			if (slot)
				slot.goals.push({
					minute: e.minute,
					own: t === "own_goal",
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
		if (tab === "ai") return <AiTab T={T} detail={detail} />;
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
	AiTab,
	StatsTab,
	XgTab,
	LineupTab,
	H2HPlaceholder,
	DetailSkeleton,
	DetailUnavailable,
});
