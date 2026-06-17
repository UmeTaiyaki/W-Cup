/* ホームタブ：試合日程ビュー（読み取り専用・直近フォーカス型） */

// 小さな旗（枠なしの絵文字）。未確定チームは何も表示しない。
function MiniFlag({ team, size = 20 }) {
	if (!team.resolved) return null;
	return <Flag code={team.code} size={size} style={{ flexShrink: 0 }} />;
}

// 試合経過の表記。minute有→"67分" / アディショナル有→"46 (+4)"。無→null。
function fmtMatchClock(minute, added) {
	if (minute == null) return null;
	return added != null && added > 0 ? `${minute} (+${added})` : `${minute}分`;
}

// ライブ状態の小バッジ（LIVE=赤・終了=控えめ）。
// LIVE中はHT→"HT" / 経過分→"67分" / 無→"LIVE" を表示する。
function LiveBadge({ T, status, stateId, minute, added }) {
	const isLive = status === "LIVE";
	const clock = isLive
		? stateId === 3
			? "HT"
			: fmtMatchClock(minute, added)
		: null;
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				fontSize: 11,
				fontWeight: 800,
				padding: "3px 9px",
				borderRadius: 999,
				background: isLive ? "rgba(255,90,90,0.16)" : "rgba(255,255,255,0.06)",
				color: isLive ? "#ff5a5a" : T.sub,
				border: `1px solid ${isLive ? "rgba(255,90,90,0.35)" : T.line}`,
			}}
		>
			{isLive && (
				<span
					style={{
						width: 6,
						height: 6,
						borderRadius: 3,
						background: "#ff5a5a",
						display: "inline-block",
						animation: "wc-blink 1s ease-in-out infinite",
					}}
				/>
			)}
			{isLive ? clock || "LIVE" : "終了"}
		</span>
	);
}

// 放送メディアのタグ列（茶=有料DAZN / 緑=無料BS4K・地上波）。折返し可。
function MediaTags({ T, match, justify = "flex-start" }) {
	const list =
		(window.WC.mediaForMatch && window.WC.mediaForMatch(match)) || [];
	if (!list.length) return null;
	return (
		<div
			style={{
				display: "flex",
				flexWrap: "wrap",
				gap: 5,
				justifyContent: justify,
			}}
		>
			{list.map((m) => {
				const paid = m.kind === "paid";
				return (
					<span
						key={m.name}
						style={{
							fontSize: 10,
							fontWeight: 700,
							padding: "2px 7px",
							borderRadius: 999,
							background: paid
								? "rgba(240,160,48,0.14)"
								: "rgba(52,211,153,0.14)",
							color: paid ? "#f0a030" : "#34d399",
							border: `1px solid ${paid ? "rgba(240,160,48,0.30)" : "rgba(52,211,153,0.30)"}`,
							whiteSpace: "nowrap",
						}}
					>
						{m.name}
					</span>
				);
			})}
		</div>
	);
}

// タイムライン1行：時刻(or スコア) / A vs B / 章ラベル + 放送メディア
function MatchRow({ T, match, last }) {
	const teamMap = window.WC.TEAM || {};
	const a = window.WC.formatMatchTeam(match.a, teamMap, match.round);
	const b = window.WC.formatMatchTeam(match.b, teamMap, match.round);
	const label = window.WC.roundLabel(match.round);
	const live = window.WC.liveForMatch ? window.WC.liveForMatch(match) : null;
	// スコア表示の元: ライブ優先、無ければ確定結果（GROUP_MATCHES 由来の終了試合）。
	const result =
		live || (window.WC.matchResult ? window.WC.matchResult(match) : null);
	const sideStyle = {
		fontWeight: 800,
		fontSize: 13,
		color: T.text,
		whiteSpace: "nowrap",
	};
	function handleClick() {
		const id =
			window.WC.fixtureIdForMatch && window.WC.fixtureIdForMatch(match);
		if (id != null) window.WC.openDetail && window.WC.openDetail(id);
	}
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={handleClick}
			style={{
				padding: "9px 4px",
				borderBottom: last ? "none" : `1px solid ${T.line}`,
				cursor: "pointer",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<div
					style={{
						fontSize: result ? 13 : 12,
						fontWeight: 800,
						color: result
							? result.status === "LIVE"
								? "#ff5a5a"
								: T.text
							: T.accent,
						width: 46,
						flexShrink: 0,
					}}
				>
					{result ? `${result.a ?? 0}-${result.b ?? 0}` : match.time || "--:--"}
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						flex: 1,
						minWidth: 0,
					}}
				>
					<MiniFlag T={T} team={a} />
					<span style={sideStyle}>{a.resolved ? a.code : a.label}</span>
					<span
						style={{
							fontSize: 11,
							fontWeight: 800,
							color: T.faint,
							padding: "0 6px",
						}}
					>
						vs
					</span>
					<span style={sideStyle}>{b.resolved ? b.code : b.label}</span>
					<MiniFlag T={T} team={b} />
				</div>
				<span
					style={{
						fontSize: 11,
						fontWeight: 700,
						padding: "3px 9px",
						borderRadius: 999,
						background: "rgba(255,255,255,0.06)",
						color: T.sub,
						border: `1px solid ${T.line}`,
						flexShrink: 0,
						marginLeft: 8,
					}}
				>
					{label}
				</span>
			</div>
			<div style={{ marginTop: 7, paddingLeft: 46 }}>
				<MediaTags T={T} match={match} />
			</div>
		</div>
	);
}

// 日本語の曜日付き日付表記（'2026-06-13' → '6月13日(土)'）
function formatDateJa(dateStr) {
	if (!dateStr) return "日付未定";
	const [y, m, d] = dateStr.split("-").map(Number);
	const wd = ["日", "月", "火", "水", "木", "金", "土"][
		new Date(Date.UTC(y, m - 1, d)).getUTCDay()
	];
	return `${m}月${d}日(${wd})`;
}

// GNews(外部API)由来のURLを http/https のみに制限し、CSS/JSスキーム注入を防ぐ。
// 不正・非http(s)・パース不能は null。url("…") への埋め込み時は引用符/制御文字もエンコード。
function safeHttpUrl(raw) {
	const s = String(raw || "");
	// 絶対 http(s) のみ許可。相対URLは自オリジンに解決されてしまうため、
	// new URL に base を渡さず「外部の絶対URLのみ」を厳格に通す。
	if (!/^https?:\/\//i.test(s)) return null;
	try {
		const u = new URL(s);
		if (u.protocol !== "http:" && u.protocol !== "https:") return null;
		return u.href;
	} catch (e) {
		return null;
	}
}

function NewsCard({ item, onOpen }) {
	const hero = safeHttpUrl(item.image);
	const heroCss = hero ? hero.replace(/["\\\n\r]/g, encodeURIComponent) : null;
	const bgLayer = heroCss
		? `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.78) 100%), url("${heroCss}")`
		: "linear-gradient(135deg, #1f2937 0%, #0b3a6b 60%, #061a33 100%)";
	const dateStr = item.publishedAt
		? new Date(item.publishedAt).toLocaleDateString("ja-JP", {
				month: "numeric",
				day: "numeric",
			})
		: "";
	return (
		<button
			type="button"
			onClick={() => onOpen(item)}
			style={{
				flex: "0 0 auto",
				width: 240,
				height: 150,
				position: "relative",
				textAlign: "left",
				border: "none",
				borderRadius: 14,
				padding: 0,
				overflow: "hidden",
				cursor: "pointer",
				scrollSnapAlign: "start",
				backgroundImage: bgLayer,
				backgroundSize: "cover",
				backgroundPosition: "center",
				backgroundColor: "#0b3a6b",
			}}
		>
			{(item.source || dateStr) && (
				<span
					style={{
						position: "absolute",
						top: 8,
						left: 8,
						fontSize: 10,
						fontWeight: 700,
						color: "#fff",
						background: "rgba(0,0,0,0.55)",
						borderRadius: 8,
						padding: "2px 7px",
						maxWidth: 200,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{[item.source, dateStr].filter(Boolean).join(" ・ ")}
				</span>
			)}
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
					padding: "10px 12px",
					fontSize: 13,
					fontWeight: 800,
					color: "#fff",
					lineHeight: 1.35,
					textShadow: "0 1px 3px rgba(0,0,0,0.6)",
					display: "-webkit-box",
					WebkitLineClamp: 3,
					WebkitBoxOrient: "vertical",
					overflow: "hidden",
				}}
			>
				{item.title}
			</div>
		</button>
	);
}

function NewsCarousel({ T }) {
	const [items, setItems] = React.useState(null);
	React.useEffect(() => {
		let alive = true;
		if (window.WC.fetchNews) {
			window.WC.fetchNews().then((list) => {
				if (alive) setItems(list);
			});
		} else {
			setItems([]);
		}
		return () => {
			alive = false;
		};
	}, []);

	if (!items || items.length === 0) return null; // 取得前/空は非表示＝既存ホームと同一

	const openArticle = (item) => {
		const href = item && safeHttpUrl(item.url);
		if (href) window.open(href, "_blank", "noopener,noreferrer");
	};

	return (
		<div style={{ margin: "8px 0 4px" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "0 8px 6px",
				}}
			>
				<span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
					📰 ニュース
				</span>
			</div>
			<div
				style={{
					display: "flex",
					gap: 10,
					overflowX: "auto",
					padding: "0 8px 4px",
					scrollSnapType: "x mandatory",
					WebkitOverflowScrolling: "touch",
				}}
			>
				{items.map((it) => (
					<NewsCard key={it.id} item={it} onOpen={openArticle} />
				))}
			</div>
		</div>
	);
}

// 翌日以降の日付グループを順に表示
function DayTimeline({ T, groups }) {
	if (!groups.length) return null;
	return (
		<div>
			{groups.map((g) => (
				<div key={g.date || "tbd"}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							margin: "16px 4px 8px",
						}}
					>
						<span
							style={{
								width: 6,
								height: 6,
								borderRadius: 3,
								background: T.accent,
							}}
						/>
						<span style={{ fontWeight: 800, fontSize: 13, color: T.text }}>
							{formatDateJa(g.date)}
						</span>
						<span style={{ fontSize: 11, color: T.faint }}>
							{g.matches.length}試合
						</span>
					</div>
					<Card T={T} style={{ padding: "4px 12px" }}>
						{g.matches.map((m, i) => (
							<MatchRow
								key={`${m.time || "x"}-${m.a}-${m.b}`}
								T={T}
								match={m}
								last={i === g.matches.length - 1}
							/>
						))}
					</Card>
				</div>
			))}
		</div>
	);
}

// 日数差（'YYYY-MM-DD' 同士）。today→focus が何日後か。
function daysUntil(today, focus) {
	if (!today || !focus) return 0;
	const a = Date.UTC(
		...today
			.split("-")
			.map(Number)
			.map((n, i) => (i === 1 ? n - 1 : n)),
	);
	const b = Date.UTC(
		...focus
			.split("-")
			.map(Number)
			.map((n, i) => (i === 1 ? n - 1 : n)),
	);
	return Math.round((b - a) / 86400000);
}

// JST のキックオフ時刻(UNIX ms)。dateStr 'YYYY-MM-DD' + timeStr 'HH:MM'(JST=UTC+9)。
// 値が揃わない/不正なら null。
function kickoffMs(dateStr, timeStr) {
	if (!dateStr || !timeStr) return null;
	const d = dateStr.split("-").map(Number);
	const t = timeStr.split(":").map(Number);
	if (d.length < 3 || t.length < 2 || d.concat(t).some((n) => isNaN(n)))
		return null;
	return Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) - 9 * 3600 * 1000;
}

// 残り時間(ms) → "H:MM:SS"（時は0埋めなし、分秒は2桁）。
function fmtHMS(ms) {
	const total = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n) => String(n).padStart(2, "0");
	return `${h}:${pad(m)}:${pad(s)}`;
}

// 応援ボタンのスタイル（左=チームA/右=チームBの色）。
// selected=最後に押した側（塗りつぶし強調）、dim=未選択側を控えめに。
function cheerBtnStyle(color, selected, dim) {
	return {
		fontSize: 11,
		fontWeight: selected ? 800 : 700,
		padding: "6px 14px",
		borderRadius: 999,
		cursor: "pointer",
		border: `1px solid ${selected ? color : color + "55"}`,
		color: selected ? "#0e0f12" : color,
		background: selected ? color : `${color}14`,
		opacity: dim ? 0.5 : 1,
		boxShadow: selected ? `0 0 10px ${color}66` : "none",
		display: "inline-flex",
		alignItems: "center",
		gap: 5,
		transition: "all .15s",
	};
}
function hexA6(hex, al) {
	const h = hex.replace("#", "");
	return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${al})`;
}

// 試合前カードの「ご当地応援バトル」。何回でも応援でき、押すとご当地演出。
// 左チーム(a)=side"home"、右チーム(b)=side"away" として一貫マッピング。
function CheerBar({ T, match, a, b }) {
	const fixtureId = window.WC.fixtureIdForMatch
		? window.WC.fixtureIdForMatch(match)
		: null;
	const overlayRef = React.useRef(null);
	const [, force] = React.useState(0);
	const [userSide, setUserSide] = React.useState(null);

	React.useEffect(() => {
		if (fixtureId == null || !window.WC.cheer) return;
		window.WC.cheer.fetch([fixtureId]);
		return window.WC.cheer.subscribe(() => force((x) => x + 1));
	}, [fixtureId]);

	if (fixtureId == null || !window.WC.cheer) return null;

	const counts = window.WC.cheer.get(fixtureId);
	const total = Math.max(1, counts.home + counts.away);
	const homeR = counts.home / total;
	const aColor = "#ff7a96";
	const bColor = "#7aa0ff";
	// 共有する側＝最後に押した側。未選択なら優勢な側を既定にする。
	const shareSide = userSide || (homeR >= 0.5 ? "home" : "away");
	const shareTeam = shareSide === "home" ? a : b;

	function celebrate(side) {
		const team = side === "home" ? a : b;
		const theme = window.WC.cheerTheme
			? window.WC.cheerTheme.get(team.code, team)
			: null;
		const host = overlayRef.current;
		if (!host || !theme) return;
		if (theme.rays) {
			const r = document.createElement("div");
			r.style.cssText = `position:absolute;inset:0;background:repeating-conic-gradient(from 0deg at 50% 65%,${hexA6(theme.accent, 0.16)} 0 7deg,transparent 7deg 18deg);`;
			host.appendChild(r);
			r.animate([{ opacity: 0 }, { opacity: 0.7 }, { opacity: 0 }], {
				duration: 650,
				easing: "ease-out",
			});
			setTimeout(() => r.remove(), 650);
		}
		const cols = theme.colors || ["#b6ff60"];
		for (let i = 0; i < 18; i++) {
			const c = document.createElement("div");
			c.style.cssText = `position:absolute;top:-10px;left:${Math.random() * 100}%;width:${5 + Math.random() * 4}px;height:${8 + Math.random() * 5}px;background:${cols[i % cols.length]};border-radius:1px;`;
			host.appendChild(c);
			c.animate(
				[
					{ transform: "translateY(0) rotate(0)", opacity: 1 },
					{
						transform: `translateY(280px) rotate(${360 + Math.random() * 360}deg)`,
						opacity: 0,
					},
				],
				{
					duration: 900 + Math.random() * 500,
					easing: "cubic-bezier(.3,.7,.5,1)",
				},
			);
			setTimeout(() => c.remove(), 1500);
		}
		const shapes = theme.shapes || ["star"];
		for (let i = 0; i < 12; i++) {
			const s = document.createElement("div");
			s.innerHTML = window.WC.cheerTheme.shapeSVG(
				shapes[i % shapes.length],
				cols[i % cols.length],
				14 + Math.floor(Math.random() * 8),
			);
			s.style.cssText = `position:absolute;top:-18px;left:${Math.random() * 100}%;line-height:0;`;
			host.appendChild(s);
			s.animate(
				[
					{ transform: "translateY(0) rotate(0)", opacity: 1 },
					{
						transform: `translateY(280px) rotate(${(Math.random() * 2 - 1) * 360}deg)`,
						opacity: 0,
					},
				],
				{
					duration: 1000 + Math.random() * 600,
					easing: "ease-in",
				},
			);
			setTimeout(() => s.remove(), 1700);
		}
		const cry = document.createElement("div");
		cry.textContent = theme.cry;
		cry.style.cssText = `position:absolute;left:0;right:0;top:34%;text-align:center;font-weight:900;font-size:24px;color:#fff;text-shadow:0 0 16px ${theme.accent};`;
		host.appendChild(cry);
		cry.animate(
			[
				{ opacity: 0, transform: "scale(.8)" },
				{ opacity: 1, transform: "scale(1.12)" },
				{ opacity: 1, transform: "scale(1)" },
				{ opacity: 0 },
			],
			{ duration: 1000, easing: "ease-out" },
		);
		setTimeout(() => cry.remove(), 1000);
	}

	function onCheer(side) {
		setUserSide(side);
		window.WC.cheer.tap(fixtureId, side);
		celebrate(side);
	}
	function onShare() {
		if (!window.WC.cheerShare) return;
		window.WC.cheerShare.share({
			a,
			b,
			side: shareSide,
			counts: window.WC.cheer.get(fixtureId),
			roundLabel: window.WC.roundLabel ? window.WC.roundLabel(match.round) : "",
		});
	}

	return (
		<div
			style={{
				position: "relative",
				marginTop: 14,
				paddingTop: 12,
				borderTop: `1px solid ${T.line}`,
			}}
		>
			<div
				ref={overlayRef}
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
					height: 300,
					overflow: "hidden",
					pointerEvents: "none",
					zIndex: 4,
				}}
			/>
			<div
				style={{
					height: 8,
					borderRadius: 999,
					background: "#23262d",
					overflow: "hidden",
					display: "flex",
					position: "relative",
					zIndex: 1,
				}}
			>
				<div
					style={{
						width: `${homeR * 100}%`,
						background: "linear-gradient(90deg,#ff3b6b,#ff7a96)",
						transition: "width .4s",
					}}
				/>
				<div
					style={{
						flex: 1,
						background: "linear-gradient(90deg,#5b82e6,#a9c4ff)",
					}}
				/>
			</div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					fontSize: 11,
					fontWeight: 700,
					marginTop: 4,
					position: "relative",
					zIndex: 1,
				}}
			>
				<span style={{ color: aColor }}>
					{a.resolved ? a.code : a.label} {counts.home}
				</span>
				<span style={{ color: bColor }}>
					{counts.away} {b.resolved ? b.code : b.label}
				</span>
			</div>
			<div
				style={{
					display: "flex",
					gap: 8,
					justifyContent: "center",
					marginTop: 10,
					position: "relative",
					zIndex: 5,
				}}
			>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onCheer("home");
					}}
					style={cheerBtnStyle(
						aColor,
						userSide === "home",
						userSide != null && userSide !== "home",
					)}
				>
					{a.resolved ? a.code + "を応援" : "応援"}
				</button>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onCheer("away");
					}}
					style={cheerBtnStyle(
						bColor,
						userSide === "away",
						userSide != null && userSide !== "away",
					)}
				>
					{b.resolved ? b.code + "を応援" : "応援"}
				</button>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onShare();
					}}
					style={{
						fontSize: 11,
						fontWeight: 700,
						padding: "6px 14px",
						borderRadius: 999,
						cursor: "pointer",
						border: `1px solid ${T.line}`,
						color: T.sub,
						background: "transparent",
					}}
				>
					{shareTeam.resolved ? shareTeam.code + "でシェア" : "シェア"}
				</button>
			</div>
		</div>
	);
}

// カルーセル1枚分のカード。表示中(active)かどうかでスケール/不透明度を変え、
// スライド遷移中に隣カードが奥から手前へ立ち上がる奥行き感を出す。
function MatchSlide({ T, dateStr, match, today, nowMs, active }) {
	const teamMap = window.WC.TEAM || {};
	const a = window.WC.formatMatchTeam(match.a, teamMap, match.round);
	const b = window.WC.formatMatchTeam(match.b, teamMap, match.round);
	const live = window.WC.liveForMatch ? window.WC.liveForMatch(match) : null;

	// 右上表記: 残り24h未満→"H:MM:SS"、それ以外→"あとN日"/"本日"。
	const koMs = kickoffMs(dateStr, match.time);
	const msLeft = koMs != null ? koMs - nowMs : null;
	let countdown;
	if (msLeft != null && msLeft > 0 && msLeft < 86400000) {
		countdown = fmtHMS(msLeft);
	} else {
		const diff = daysUntil(today, dateStr);
		countdown = diff <= 0 ? "本日" : `あと${diff}日`;
	}
	// キックオフ時刻を過ぎたか。ライブ反映のラグに関係なく、応援UIは確実に消す。
	const kickedOff = koMs != null && nowMs >= koMs;

	const side = (team) => (
		<div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
			<div
				style={{
					height: 48,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				{team.resolved && <Flag code={team.code} size={42} />}
			</div>
			<div
				style={{ fontWeight: 800, fontSize: 13, color: T.text, marginTop: 6 }}
			>
				{team.resolved ? team.code : team.label}
			</div>
		</div>
	);

	return (
		<div
			style={{
				flex: "0 0 100%",
				minWidth: 0,
				boxSizing: "border-box",
				// 非アクティブは奥に沈める。トラック移動中だけ視界に入り立体的に見える。
				transform: active ? "scale(1)" : "scale(0.92)",
				opacity: active ? 1 : 0.45,
				transition:
					"transform .5s cubic-bezier(.22,1,.36,1), opacity .5s cubic-bezier(.22,1,.36,1)",
			}}
		>
			<Card
				T={T}
				style={{
					borderColor: live ? "rgba(255,90,90,0.45)" : "rgba(182,255,60,0.30)",
					boxShadow: live ? "0 0 0 1px rgba(255,90,90,0.25)" : undefined,
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: 14,
					}}
				>
					<span
						style={{
							fontSize: 11,
							fontWeight: 700,
							padding: "3px 9px",
							borderRadius: 999,
							background: "rgba(182,255,60,0.14)",
							color: T.accent,
							border: "1px solid rgba(182,255,60,0.25)",
						}}
					>
						{window.WC.roundLabel(match.round)}
					</span>
					{live ? (
						<LiveBadge
							T={T}
							status={live.status}
							stateId={live.state_id}
							minute={live.minute}
							added={live.added_time}
						/>
					) : (
						<span style={{ fontSize: 11, fontWeight: 700, color: T.faint }}>
							{countdown}
						</span>
					)}
				</div>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					{side(a)}
					<div style={{ textAlign: "center", minWidth: 64 }}>
						{live ? (
							<div>
								<div
									style={{
										fontSize: 27,
										fontWeight: 800,
										color: T.text,
										letterSpacing: 1,
									}}
								>
									{live.a ?? 0}
									<span style={{ color: T.faint, margin: "0 6px" }}>-</span>
									{live.b ?? 0}
								</div>
								<div
									style={{
										fontSize: 10,
										color: live.status === "LIVE" ? "#ff5a5a" : T.faint,
									}}
								>
									{live.status === "LIVE" ? "LIVE" : "終了"}
								</div>
							</div>
						) : (
							<div>
								<div style={{ fontSize: 23, fontWeight: 800, color: T.text }}>
									{match.time || "--:--"}
								</div>
								<div style={{ fontSize: 10, color: T.faint }}>KICK OFF</div>
							</div>
						)}
					</div>
					{side(b)}
				</div>
				{/* 応援バーは表示中カードのみ購読（非表示カードの無駄なfetchを抑止） */}
				{active && !live && !kickedOff && (
					<CheerBar T={T} match={match} a={a} b={b} />
				)}
				<div
					style={{
						marginTop: 14,
						paddingTop: 12,
						borderTop: `1px solid ${T.line}`,
					}}
				>
					<MediaTags T={T} match={match} justify="center" />
				</div>
				{/* 90分決着の冗長な"... after full time"系は出さない（PK/延長決着のみ表示） */}
				{live &&
					live.result_info &&
					!/full[\s-]?time/i.test(live.result_info) && (
						<div
							style={{
								textAlign: "center",
								fontSize: 11,
								color: T.faint,
								marginTop: 12,
							}}
						>
							{live.result_info}
						</div>
					)}
				{match.note && (
					<div
						style={{
							textAlign: "center",
							fontSize: 11,
							color: T.faint,
							marginTop: 14,
						}}
					>
						📍 {match.note}
					</div>
				)}
			</Card>
		</div>
	);
}

// フォーカス日の試合をスワイプ/矢印/ドットで切替表示。
// ・トラックをtranslateXで滑らせるスライドアニメーション
// ・試合中がなければ一定間隔で次ページへ自動送り
// ・試合中があれば自動送りを止め、その試合（複数なら左側優先）に固定
function MatchCarousel({ T, dateStr, matches, today }) {
	const [idx, setIdx] = React.useState(0);
	const touch = React.useRef(null);
	const n = matches.length;

	// 1秒ごと再描画（24時間以内のカウントダウンを秒まで更新するため）。
	const [nowMs, setNowMs] = React.useState(() => Date.now());
	React.useEffect(() => {
		const id = setInterval(() => setNowMs(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);

	// 試合中（LIVE）の最左インデックス。なければ -1。
	const liveIdx = matches.findIndex((m) => {
		const l = window.WC.liveForMatch ? window.WC.liveForMatch(m) : null;
		return l && l.status === "LIVE";
	});

	// 手動操作の直近時刻。操作後しばらくは自動送り/ライブ固定を控える。
	const interactRef = React.useRef(0);
	const RESUME_MS = 12000; // 手動操作後に自動制御を再開するまでの猶予
	const ADVANCE_MS = 6000; // 自動送りの間隔

	const clamp = (i) => Math.max(0, Math.min(n - 1, i));
	const go = (delta) => {
		interactRef.current = nowMs;
		setIdx((p) => clamp(p + delta));
	};
	const jump = (i) => {
		interactRef.current = nowMs;
		setIdx(clamp(i));
	};

	// 自動制御：試合中があればその試合へ固定、なければ次ページへ循環。
	React.useEffect(() => {
		if (n <= 1) return;
		const id = setInterval(() => {
			if (Date.now() - interactRef.current < RESUME_MS) return;
			if (liveIdx >= 0) setIdx(liveIdx);
			else setIdx((p) => (p + 1) % n);
		}, ADVANCE_MS);
		return () => clearInterval(id);
	}, [n, liveIdx]);

	// 試合中になった瞬間は待たずに即その試合へスナップ（手動直後を除く）。
	React.useEffect(() => {
		if (liveIdx >= 0 && Date.now() - interactRef.current >= RESUME_MS) {
			setIdx(liveIdx);
		}
	}, [liveIdx]);

	const onTouchStart = (e) => {
		touch.current = e.touches[0].clientX;
	};
	const onTouchEnd = (e) => {
		if (touch.current == null) return;
		const dx = e.changedTouches[0].clientX - touch.current;
		if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
		touch.current = null;
	};

	function handleCardClick() {
		const cur = matches[clamp(idx)];
		const id = window.WC.fixtureIdForMatch && window.WC.fixtureIdForMatch(cur);
		if (id != null) window.WC.openDetail && window.WC.openDetail(id);
	}

	// 控えめなオーバーレイ矢印（枠・背景なし、カード左右端に重ねる）
	const arrow = (delta, char, on, edge) => (
		<button
			onClick={(e) => {
				e.stopPropagation();
				go(delta);
			}}
			disabled={!on}
			aria-label={delta < 0 ? "前の試合" : "次の試合"}
			style={{
				position: "absolute",
				top: "50%",
				[edge]: 2,
				transform: "translateY(-50%)",
				width: 26,
				height: 40,
				border: "none",
				background: "transparent",
				padding: 0,
				color: T.faint,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: 22,
				lineHeight: 1,
				cursor: on ? "pointer" : "default",
				opacity: on ? 0.5 : 0.12,
				userSelect: "none",
				zIndex: 2,
			}}
		>
			{char}
		</button>
	);

	const safeIdx = clamp(idx);

	return (
		<div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
					margin: "2px 6px 8px",
				}}
			>
				<span style={{ fontWeight: 800, fontSize: 15, color: T.text }}>
					📅 {formatDateJa(dateStr)} の試合
				</span>
				<span style={{ fontSize: 11, fontWeight: 700, color: T.faint }}>
					{safeIdx + 1} / {n}
				</span>
			</div>
			<div
				role="button"
				tabIndex={0}
				onClick={handleCardClick}
				style={{ position: "relative", cursor: "pointer" }}
				onTouchStart={onTouchStart}
				onTouchEnd={onTouchEnd}
			>
				{/* ビューポート：はみ出すトラックを切り取る */}
				<div style={{ overflow: "hidden" }}>
					<div
						style={{
							display: "flex",
							transform: `translateX(-${safeIdx * 100}%)`,
							transition: "transform .5s cubic-bezier(.22,1,.36,1)",
							willChange: "transform",
						}}
					>
						{matches.map((m, i) => (
							<MatchSlide
								key={i}
								T={T}
								dateStr={dateStr}
								match={m}
								today={today}
								nowMs={nowMs}
								active={i === safeIdx}
							/>
						))}
					</div>
				</div>
				{n > 1 && arrow(-1, "‹", safeIdx > 0, "left")}
				{n > 1 && arrow(1, "›", safeIdx < n - 1, "right")}
			</div>
			{n > 1 && (
				<div
					style={{
						display: "flex",
						gap: 6,
						justifyContent: "center",
						marginTop: 12,
					}}
				>
					{matches.map((_, i) => (
						<span
							key={i}
							onClick={(e) => {
								e.stopPropagation();
								jump(i);
							}}
							style={{
								width: i === safeIdx ? 18 : 7,
								height: 7,
								borderRadius: 4,
								background: i === safeIdx ? T.accent : "rgba(255,255,255,0.18)",
								cursor: "pointer",
								transition: "all .3s cubic-bezier(.22,1,.36,1)",
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function HomeScreen({ T }) {
	const schedule = window.WC.SCHEDULE || [];
	const groups = window.WC.groupByDate(schedule);

	if (!groups.length) {
		return (
			<div style={{ padding: "40px 8px", textAlign: "center", color: T.sub }}>
				日程は準備中です
			</div>
		);
	}

	const today = window.WC.jstToday();
	const focusDate = window.WC.pickFocusDate(
		groups.map((g) => g.date),
		today,
	);
	const focusIdx = groups.findIndex((g) => g.date === focusDate);
	const focusGroup = groups[focusIdx];
	const rest = groups.slice(focusIdx + 1).filter((g) => g.date !== null);

	return (
		<div>
			<MatchCarousel
				T={T}
				dateStr={focusGroup.date}
				matches={focusGroup.matches}
				today={today}
			/>
			<NewsCarousel T={T} />
			<DayTimeline T={T} groups={rest} />
		</div>
	);
}

Object.assign(window, {
	HomeScreen,
	MatchRow,
	DayTimeline,
	NewsCarousel,
	NewsCard,
});
