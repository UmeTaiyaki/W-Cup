/* ============================================================
   共有UIコンポーネント（テーマ T はpropで受け取る）
   window に export
   ============================================================ */

// ---- Cloudflare Turnstile（bot対策ウィジェット） -------------
// siteKey が無ければ何も描画せずトークンも要求しない（＝鍵未設定なら従来どおり素通り）。
// 取得したトークンは onToken(token) で親に渡す。失敗/期限切れは onToken(null)。
function TurnstileWidget({ siteKey, onToken, theme = "auto" }) {
	const ref = React.useRef(null);
	const widgetId = React.useRef(null);
	React.useEffect(() => {
		if (!siteKey) return;
		let cancelled = false;
		const cleanup = () => {
			try {
				if (widgetId.current != null && window.turnstile)
					window.turnstile.remove(widgetId.current);
			} catch (e) {}
			widgetId.current = null;
		};
		function renderWidget() {
			if (
				cancelled ||
				!window.turnstile ||
				!ref.current ||
				widgetId.current != null
			)
				return;
			try {
				widgetId.current = window.turnstile.render(ref.current, {
					sitekey: siteKey,
					theme,
					callback: (t) => {
						if (onToken) onToken(t);
					},
					"error-callback": () => {
						if (onToken) onToken(null);
					},
					"expired-callback": () => {
						if (onToken) onToken(null);
					},
				});
			} catch (e) {
				/* 多重 render などは無視 */
			}
		}
		if (window.turnstile) {
			renderWidget();
			return () => {
				cancelled = true;
				cleanup();
			};
		}
		// スクリプトが非同期読み込みのため、ロード完了を待ってから render する。
		const iv = setInterval(() => {
			if (window.turnstile) {
				clearInterval(iv);
				renderWidget();
			}
		}, 120);
		const to = setTimeout(() => clearInterval(iv), 8000);
		return () => {
			cancelled = true;
			clearInterval(iv);
			clearTimeout(to);
			cleanup();
		};
	}, [siteKey]);
	if (!siteKey) return null;
	return <div ref={ref} style={{ marginTop: 14, minHeight: 65 }} />;
}

// ---- アイコン（SVGストローク系） ----------------------------
function Icon({
	name,
	size = 24,
	color = "currentColor",
	fill = "none",
	sw = 1.9,
}) {
	const p = {
		fill: fill === "none" ? "none" : color,
		stroke: fill === "solid" ? "none" : color,
		strokeWidth: sw,
		strokeLinecap: "round",
		strokeLinejoin: "round",
	};
	const paths = {
		trophy: (
			<g {...p}>
				<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
				<path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
				<path d="M10 14.5V17m4-2.5V17M8 20h8M9 20l.4-3h5.2l.4 3" />
			</g>
		),
		boot: (
			<g {...p}>
				<path d="M4 7h4l1 5 8 1c2 .3 3 1.7 3 3.5V19H4V7Z" />
				<path d="M4 14h5M4 19h17" />
			</g>
		),
		medal: (
			<g {...p}>
				<circle cx="12" cy="15" r="5" />
				<path d="M9 4l3 6 3-6M8.5 4h7M12 13.4l.9 1.7 1.9.2-1.4 1.3.4 1.9-1.8-1-1.8 1 .4-1.9-1.4-1.3 1.9-.2.9-1.7Z" />
			</g>
		),
		bracket: (
			<g {...p}>
				<path d="M3 5h5v6h4M3 19h5v-6M16 9h5M16 9v6M16 15h5" />
			</g>
		),
		grid: (
			<g {...p}>
				<rect x="4" y="4" width="7" height="7" rx="1.5" />
				<rect x="13" y="4" width="7" height="7" rx="1.5" />
				<rect x="4" y="13" width="7" height="7" rx="1.5" />
				<rect x="13" y="13" width="7" height="7" rx="1.5" />
			</g>
		),
		people: (
			<g {...p}>
				<circle cx="8.5" cy="9" r="2.6" />
				<circle cx="16" cy="9.5" r="2.2" />
				<path d="M3.5 18c.4-2.6 2.4-4.2 5-4.2s4.6 1.6 5 4.2M14.5 14c2.3.1 4 1.6 4.4 4" />
			</g>
		),
		edit: (
			<g {...p}>
				<path d="M5 19h14M7 15.5 16 6.5l2 2-9 9-2.6.6.6-2.6Z" />
			</g>
		),
		check: (
			<g {...p}>
				<path d="M5 12.5 10 17l9-10" />
			</g>
		),
		close: (
			<g {...p}>
				<path d="M6 6l12 12M18 6 6 18" />
			</g>
		),
		plus: (
			<g {...p}>
				<path d="M12 5v14M5 12h14" />
			</g>
		),
		trash: (
			<g {...p}>
				<path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13" />
			</g>
		),
		search: (
			<g {...p}>
				<circle cx="11" cy="11" r="6" />
				<path d="M20 20l-4-4" />
			</g>
		),
		chevron: (
			<g {...p}>
				<path d="M9 6l6 6-6 6" />
			</g>
		),
		flame: (
			<g {...p}>
				<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1 .4-2 1-2.5C9 11 12 9 12 3Z" />
			</g>
		),
		refresh: (
			<g {...p}>
				<path d="M4 12a8 8 0 0 1 14-5m1-3v4h-4M20 12a8 8 0 0 1-14 5m-1 3v-4h4" />
			</g>
		),
		star: (
			<g {...p}>
				<path d="M12 3.5l2.5 5.3 5.5.7-4 3.9 1 5.6L12 16.9 7 19l1-5.6-4-3.9 5.5-.7L12 3.5Z" />
			</g>
		),
		share: (
			<g {...p}>
				<circle cx="6" cy="12" r="2.4" />
				<circle cx="17" cy="6" r="2.4" />
				<circle cx="17" cy="18" r="2.4" />
				<path d="M8.2 10.9 14.8 7.1M8.2 13.1 14.8 16.9" />
			</g>
		),
		copy: (
			<g {...p}>
				<rect x="9" y="9" width="11" height="11" rx="2" />
				<path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
			</g>
		),
		door: (
			<g {...p}>
				<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8M14 3l4 2v14l-4 2M14 3v18M11 12h.01" />
			</g>
		),
		user: (
			<g {...p}>
				<circle cx="12" cy="8.5" r="3.4" />
				<path d="M5.5 19c.5-3.2 3-5 6.5-5s6 1.8 6.5 5" />
			</g>
		),
		gear: (
			<g {...p}>
				<circle cx="12" cy="12" r="3" />
				<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
			</g>
		),
		chat: (
			<g {...p}>
				<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
			</g>
		),
		image: (
			<g {...p}>
				<rect x="3" y="5" width="18" height="14" rx="2" />
				<circle cx="8.5" cy="10" r="1.5" />
				<path d="M21 16l-5-5L5 19" />
			</g>
		),
		chart: (
			<g {...p}>
				<path d="M4 20V11M9.5 20V5M15 20v-6M20.5 20V8M3 20h18" />
			</g>
		),
		target: (
			<g {...p}>
				<circle cx="12" cy="12" r="8" />
				<circle cx="12" cy="12" r="3.4" />
				<path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
			</g>
		),
		stadium: (
			<g {...p}>
				<rect x="2.5" y="6" width="19" height="12" rx="6" />
				<path d="M12 6.4v11.2" />
				<circle cx="12" cy="12" r="2.1" />
			</g>
		),
		award: (
			<g {...p}>
				<circle cx="12" cy="9" r="5" />
				<path d="M9.2 13.3 7.4 21l4.6-2.6L16.6 21l-1.8-7.7" />
			</g>
		),
		party: (
			<g {...p}>
				<path d="M4 20l4.2-11.2 7 7L4 20Z" />
				<path d="M9.3 8.2 11 6M14.2 9.4 16 8.2M16.4 13.2 18.6 13M13.6 4.2 14 2.2M19.5 6.5 21.5 6" />
			</g>
		),
		shield: (
			<g {...p}>
				<path d="M12 3 5 5.5v5.2c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V5.5L12 3Z" />
				<path d="M9.5 12l1.8 1.8L15 9.8" />
			</g>
		),
	};
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			style={{ display: "block", flexShrink: 0 }}
		>
			{paths[name] || null}
		</svg>
	);
}

// ---- 国旗バッジ（角丸で旗をクロップ） ----------------------
function FlagBadge({ code, size = 30, T }) {
	const t = window.WC.TEAM[code];
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: size * 0.28,
				overflow: "hidden",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: size * 0.95,
				lineHeight: 1,
				flexShrink: 0,
				background: "rgba(255,255,255,0.06)",
				boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
				userSelect: "none",
			}}
		>
			<span style={{ transform: "scale(1.35)" }}>{t ? t.flag : "🏳️"}</span>
		</div>
	);
}

// ---- インライン国旗（ロゴ画像 or 絵文字フォールバック） ----
// /api/live で取得したロゴ画像があれば img、なければ従来の絵文字旗を表示。
// ゼロ影響フォールバック: WATCH無効/データ未取得/読み込みエラーは絵文字のまま。
function Flag({ code, size = 20, style }) {
	const url = window.WC && window.WC.teamLogo ? window.WC.teamLogo(code) : null;
	const tm = (window.WC && window.WC.TEAM ? window.WC.TEAM : {})[code] || {};
	if (url) {
		return (
			<img
				src={url}
				alt=""
				onError={(e) => {
					e.currentTarget.style.display = "none";
				}}
				style={{
					width: size,
					height: size,
					objectFit: "contain",
					display: "inline-block",
					verticalAlign: "middle",
					...(style || {}),
				}}
			/>
		);
	}
	return (
		<span style={{ fontSize: size, lineHeight: 1, ...(style || {}) }}>
			{tm.flag || ""}
		</span>
	);
}

// ---- チーム行（旗＋名前＋コード） ---------------------------
function TeamLine({ code, T, size = 30, big = false, codeRight = true }) {
	const t = window.WC.TEAM[code];
	if (!t) return <span style={{ color: T.faint }}>未選択</span>;
	return (
		<div
			style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}
		>
			<FlagBadge code={code} size={size} T={T} />
			<span
				style={{
					fontWeight: 700,
					color: T.text,
					fontSize: big ? 19 : 15.5,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{t.ja}
			</span>
			{codeRight && (
				<span
					style={{
						fontFamily: "Archivo, system-ui",
						fontWeight: 700,
						fontSize: big ? 13 : 11,
						letterSpacing: 1,
						color: T.faint,
					}}
				>
					{t.code}
				</span>
			)}
		</div>
	);
}

// ---- メンバーアバター --------------------------------------
function Avatar({ m, size = 36, active = false, T }) {
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: "50%",
				flexShrink: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontWeight: 800,
				fontSize: size * 0.42,
				color: "#fff",
				background: m.c,
				boxShadow: active ? `0 0 0 2.5px ${T.bg}, 0 0 0 4.5px ${m.c}` : "none",
			}}
		>
			{m.initial}
		</div>
	);
}

// ---- 小さなラベル見出し ------------------------------------
function Eyebrow({ children, color, T }) {
	return (
		<div
			style={{
				fontFamily: "Archivo, system-ui",
				fontWeight: 800,
				fontSize: 12,
				letterSpacing: 2.2,
				textTransform: "uppercase",
				color: color || T.accent,
			}}
		>
			{children}
		</div>
	);
}

// ---- カード -------------------------------------------------
function Card({ children, style, T, onClick }) {
	return (
		<div
			onClick={onClick}
			style={{
				background: T.card,
				borderRadius: 20,
				padding: 16,
				boxShadow: `inset 0 0 0 1px ${T.line}`,
				...style,
			}}
		>
			{children}
		</div>
	);
}

// ---- ボトムシート / 中央ダイアログ（モーダル） ------------
function Sheet({ open, onClose, children, T, title, centered = false }) {
	const overlayRef = React.useRef(null);
	// 開いている間はアプリ枠内のスクロールを固定（シート内部は除外）
	React.useEffect(() => {
		if (!open) return;
		const root = document.getElementById("wc-app-root") || document.body;
		const sheet = overlayRef.current;
		const locked = [];
		root.querySelectorAll("*").forEach((el) => {
			if (sheet && sheet.contains(el)) return; // シート内部のスクロールは保持
			const s = window.getComputedStyle(el);
			const oy = s.overflowY,
				ox = s.overflowX;
			const scrollY =
				(oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight;
			const scrollX =
				(ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth;
			if (scrollY || scrollX) {
				// longhand を個別に保存・復元（overflow ショートハンドで元の overflowY:auto を潰さない）
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
			locked.forEach(([e, oy2, ox2, ob]) => {
				e.style.overflowY = oy2;
				e.style.overflowX = ox2;
				e.style.overscrollBehavior = ob;
			});
		};
	}, [open]);
	if (!open) return null;
	const node = (
		<div
			ref={overlayRef}
			onClick={onClose}
			style={{
				position: centered ? "fixed" : "absolute",
				inset: 0,
				zIndex: 100,
				display: "flex",
				flexDirection: "column",
				justifyContent: centered ? "center" : "flex-end",
				alignItems: centered ? "center" : "stretch",
				padding: centered ? 24 : 0,
				boxSizing: "border-box",
				background: "rgba(0,0,0,0.5)",
				backdropFilter: "blur(2px)",
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					background: T.panel,
					borderRadius: centered ? 24 : "26px 26px 0 0",
					width: centered ? "100%" : "auto",
					maxWidth: centered ? 460 : "none",
					boxShadow: centered
						? "0 30px 70px rgba(0,0,0,0.4)"
						: `0 -1px 0 ${T.line}`,
					maxHeight: centered ? "86%" : "82%",
					display: "flex",
					flexDirection: "column",
					paddingBottom: centered ? 18 : 26,
				}}
			>
				{!centered && (
					<div
						style={{
							display: "flex",
							justifyContent: "center",
							paddingTop: 10,
						}}
					>
						<div
							style={{
								width: 38,
								height: 5,
								borderRadius: 9,
								background: T.line,
							}}
						/>
					</div>
				)}
				{title && (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: "12px 18px 6px",
						}}
					>
						<span style={{ fontWeight: 800, fontSize: 18, color: T.text }}>
							{title}
						</span>
						<button
							onClick={onClose}
							style={{
								border: "none",
								background: T.panel2,
								width: 30,
								height: 30,
								borderRadius: "50%",
								display: "grid",
								placeItems: "center",
								cursor: "pointer",
								color: T.sub,
							}}
						>
							<Icon name="close" size={18} color={T.sub} />
						</button>
					</div>
				)}
				<div
					style={{
						overflowY: "auto",
						WebkitOverflowScrolling: "touch",
						overscrollBehavior: "contain",
					}}
				>
					{children}
				</div>
			</div>
		</div>
	);
	// アプリ枠（非スクロールの固定枠）へ portal。スクロール位置に依らず下部固定になる。
	const root = document.getElementById("wc-app-root");
	return root ? ReactDOM.createPortal(node, root) : node;
}

// ---- 選手名簿シート（国名タップで表示・共有部品）-----------
const POS_ORDER = ["GK", "DF", "MF", "FW"];
const POS_LABEL = {
	GK: "ゴールキーパー",
	DF: "ディフェンダー",
	MF: "ミッドフィールダー",
	FW: "フォワード",
};
function SquadSheet({ T, code, onClose }) {
	const tm = (window.WC.TEAM || {})[code];
	const list = (window.WC.SQUADS || {})[code] || [];
	const grouped = {};
	POS_ORDER.forEach((p) => {
		grouped[p] = [];
	});
	const other = [];
	list.forEach((p) => {
		(grouped[p.pos] || other).push(p);
	});
	return (
		<Sheet
			open
			centered
			onClose={onClose}
			T={T}
			title={tm ? `${tm.flag} ${tm.ja} メンバー` : "メンバー"}
		>
			<div style={{ padding: "4px 18px 16px" }}>
				{list.length === 0 ? (
					<div
						style={{
							color: T.faint,
							fontSize: 14,
							padding: "22px 0",
							textAlign: "center",
							fontWeight: 700,
						}}
					>
						メンバーはまだ登録されていません
					</div>
				) : (
					<>
						{POS_ORDER.map(
							(pos) =>
								grouped[pos].length > 0 && (
									<div key={pos} style={{ marginBottom: 14 }}>
										<div
											style={{
												fontFamily: "Archivo",
												fontWeight: 800,
												fontSize: 11,
												letterSpacing: 1,
												color: T.faint,
												margin: "4px 0 6px",
											}}
										>
											{pos}{" "}
											<span style={{ color: T.sub }}>{POS_LABEL[pos]}</span>
										</div>
										{grouped[pos].map((p, i) => (
											<div
												key={i}
												style={{
													display: "flex",
													alignItems: "center",
													gap: 10,
													padding: "7px 2px",
													borderBottom: `1px solid ${T.line}`,
												}}
											>
												<span
													style={{
														fontFamily: "Archivo",
														fontWeight: 900,
														fontSize: 11,
														color: T.accent,
														width: 26,
														flexShrink: 0,
													}}
												>
													{pos}
												</span>
												<div style={{ minWidth: 0, flex: 1 }}>
													<div
														style={{
															fontWeight: 700,
															color: T.text,
															fontSize: 15,
														}}
													>
														{p.name}
													</div>
													{p.club && (
														<div
															style={{
																fontSize: 12,
																color: T.faint,
																fontWeight: 600,
																whiteSpace: "nowrap",
																overflow: "hidden",
																textOverflow: "ellipsis",
															}}
														>
															{p.club}
														</div>
													)}
												</div>
											</div>
										))}
									</div>
								),
						)}
						{other.length > 0 && (
							<div style={{ marginBottom: 14 }}>
								<div
									style={{
										fontFamily: "Archivo",
										fontWeight: 800,
										fontSize: 11,
										letterSpacing: 1,
										color: T.faint,
										margin: "4px 0 6px",
									}}
								>
									その他
								</div>
								{other.map((p, i) => (
									<div
										key={i}
										style={{
											padding: "7px 2px",
											borderBottom: `1px solid ${T.line}`,
										}}
									>
										<div
											style={{ fontWeight: 700, color: T.text, fontSize: 15 }}
										>
											{p.name}
										</div>
										{p.club && (
											<div
												style={{
													fontSize: 12,
													color: T.faint,
													fontWeight: 600,
												}}
											>
												{p.club}
											</div>
										)}
									</div>
								))}
							</div>
						)}
					</>
				)}
			</div>
		</Sheet>
	);
}

// ---- チーム選択シート --------------------------------------
function TeamPicker({
	open,
	onClose,
	onPick,
	T,
	title = "チームを選ぶ",
	exclude = [],
	centered = false,
}) {
	const [q, setQ] = React.useState("");
	const [squadCode, setSquadCode] = React.useState(null);
	React.useEffect(() => {
		if (open) setQ("");
	}, [open]);
	const list = window.WC.TEAMS.filter(
		(t) =>
			!exclude.includes(t.code) &&
			(q === "" ||
				t.ja.includes(q) ||
				t.code.toLowerCase().includes(q.toLowerCase())),
	);
	return (
		<Sheet
			open={open}
			onClose={onClose}
			T={T}
			title={title}
			centered={centered}
		>
			<div style={{ padding: "4px 18px 10px" }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						background: T.panel2,
						borderRadius: 12,
						padding: "9px 12px",
					}}
				>
					<Icon name="search" size={18} color={T.faint} />
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="国名で検索"
						style={{
							border: "none",
							outline: "none",
							background: "transparent",
							color: T.text,
							fontSize: 16,
							flex: 1,
							fontFamily: "inherit",
						}}
					/>
				</div>
			</div>
			<div style={{ padding: "0 12px" }}>
				{list.map((t) => (
					<div
						key={t.code}
						style={{ display: "flex", alignItems: "center", gap: 4 }}
					>
						<button
							onClick={() => {
								onPick(t.code);
								onClose();
							}}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								flex: 1,
								minWidth: 0,
								border: "none",
								background: "transparent",
								cursor: "pointer",
								padding: "10px 8px",
								borderRadius: 12,
								textAlign: "left",
							}}
						>
							<FlagBadge code={t.code} size={32} T={T} />
							<span
								style={{
									fontWeight: 700,
									color: T.text,
									fontSize: 16,
									flex: 1,
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{t.ja}
							</span>
							<span
								style={{
									fontFamily: "Archivo, system-ui",
									fontWeight: 700,
									fontSize: 12,
									letterSpacing: 1,
									color: T.faint,
								}}
							>
								{t.code}
							</span>
						</button>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setSquadCode(t.code);
							}}
							title="メンバーを見る"
							style={{
								flexShrink: 0,
								border: `1px solid ${T.line}`,
								background: "transparent",
								color: T.sub,
								cursor: "pointer",
								borderRadius: 999,
								padding: "6px 11px",
								fontSize: 12,
								fontWeight: 700,
								fontFamily: "inherit",
							}}
						>
							メンバー
						</button>
					</div>
				))}
				{list.length === 0 && (
					<div style={{ padding: 24, textAlign: "center", color: T.faint }}>
						該当なし
					</div>
				)}
			</div>
			{squadCode && (
				<SquadSheet T={T} code={squadCode} onClose={() => setSquadCode(null)} />
			)}
		</Sheet>
	);
}

// ---- 得点王セレクト（国別 optgroup・全選手。web=プルダウン/モバイル=ロール）----
// 保存値は `NAME (CODE)` 形式（一意・採点の文字列一致と互換）。
function scorerOptionGroups(teams, groups, squads) {
	const TEAM = {};
	(teams || []).forEach((t) => {
		TEAM[t.code] = t;
	});
	const KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
	const seen = new Set();
	const out = [];
	const pushTeam = (code) => {
		if (!code || seen.has(code)) return;
		const tm = TEAM[code];
		if (!tm) return;
		const players = ((squads || {})[code] || []).filter((p) => p && p.name);
		if (!players.length) return;
		seen.add(code);
		out.push({ code, label: `${tm.flag} ${tm.ja}`, players });
	};
	KEYS.forEach((k) =>
		((groups || {})[k] || []).filter(Boolean).forEach(pushTeam),
	);
	(teams || []).forEach((t) => pushTeam(t.code)); // グループ未所属も拾う
	return out;
}
const scorerValue = (name, code) => `${name} (${code})`;
// 選択肢の表示テキスト: 選手名のみ（ポジション・クラブは出さない）
const scorerText = (p) => p.name;
// 国横断の得点王候補（よく挙がる注目選手。SportMonks API表記名で名簿と一致）。
// 名簿(squads)を改名したら、ここも同じ表記に合わせる必要がある（名前一致で引くため）。
const SCORER_FAVORITES = [
	["FRA", "Kylian Mbappé"],
	["NOR", "Erling Haaland"],
	["ENG", "Harry Kane"],
	["BRA", "Vinicius Junior"],
	["ESP", "Lamine Yamal"],
	["ARG", "Lionel Messi"],
	["ARG", "Julián Álvarez"],
	["ARG", "Lautaro Martínez"],
	["BRA", "Raphinha"],
	["ENG", "Jude Bellingham"],
	["FRA", "Ousmane Dembélé"],
	["POR", "Cristiano Ronaldo"],
];
function scorerFavorites(teams, squads) {
	const TEAM = {};
	(teams || []).forEach((t) => {
		TEAM[t.code] = t;
	});
	const out = [];
	SCORER_FAVORITES.forEach(([code, name]) => {
		const p = ((squads || {})[code] || []).find((x) => x.name === name);
		if (!p) return;
		out.push({
			value: scorerValue(name, code),
			label: `${TEAM[code] ? TEAM[code].flag + " " : ""}${scorerText(p)}`,
		});
	});
	return out;
}

function ScorerSelect({ value, onChange, T, teams, groups, squads }) {
	const d = window.WC || {};
	const TEAMS = teams || d.TEAMS,
		GROUPS = groups || d.GROUPS,
		SQUADS = squads || d.SQUADS;
	const og = scorerOptionGroups(TEAMS, GROUPS, SQUADS);
	const favs = scorerFavorites(TEAMS, SQUADS);
	return (
		<select
			className="wc-scorer-select"
			value={value || ""}
			onChange={(e) => onChange(e.target.value)}
			style={{
				width: "100%",
				boxSizing: "border-box",
				fontFamily: "inherit",
				fontSize: 16,
				fontWeight: 700,
				padding: "13px 14px",
				borderRadius: 14,
				cursor: "pointer",
				background: T ? T.panel2 : "#0f1a15",
				color: T ? T.text : "#fff",
				border: `1px solid ${T ? T.line : "#333"}`,
			}}
		>
			<option value="">選手を選ぶ</option>
			{favs.length > 0 && (
				<optgroup label="⭐ 得点王候補">
					{favs.map((f, i) => (
						<option key={"fav" + i} value={f.value}>
							{"　" + f.label}
						</option>
					))}
				</optgroup>
			)}
			{og.map((g) => (
				<optgroup key={g.code} label={g.label}>
					{g.players.map((p, i) => (
						<option key={g.code + i} value={scorerValue(p.name, g.code)}>
							{"　" + scorerText(p)}
						</option>
					))}
				</optgroup>
			))}
		</select>
	);
}

// ---- 得点王ピッカー（優勝/準優勝と同じシート選択方式）------
// 検索付き。⭐候補→国別グループの順で全選手を一覧。保存値は `NAME (CODE)`。
function ScorerPicker({
	open,
	onClose,
	onPick,
	T,
	title = "得点王を選ぶ",
	centered = false,
	teams,
	groups,
	squads,
}) {
	const [q, setQ] = React.useState("");
	React.useEffect(() => {
		if (open) setQ("");
	}, [open]);
	const d = window.WC || {};
	const TEAMS = teams || d.TEAMS,
		GROUPS = groups || d.GROUPS,
		SQUADS = squads || d.SQUADS;
	const og = scorerOptionGroups(TEAMS, GROUPS, SQUADS);
	const favs = scorerFavorites(TEAMS, SQUADS);
	const nq = q.trim().toLowerCase();
	const sectionStyle = {
		fontFamily: "Archivo, system-ui",
		fontWeight: 800,
		fontSize: 11,
		letterSpacing: 1,
		color: T.faint,
		padding: "12px 10px 4px",
	};
	const rowBtn = {
		display: "flex",
		alignItems: "center",
		gap: 12,
		width: "100%",
		minWidth: 0,
		border: "none",
		background: "transparent",
		cursor: "pointer",
		padding: "10px 8px",
		borderRadius: 12,
		textAlign: "left",
		fontFamily: "inherit",
	};
	const Player = ({ value, code, name, pos }) => (
		<button
			onClick={() => {
				onPick(value);
				onClose();
			}}
			style={rowBtn}
		>
			{code && <Flag code={code} size={24} style={{ flexShrink: 0 }} />}
			<span
				style={{
					fontWeight: 700,
					color: T.text,
					fontSize: 16,
					flex: 1,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{name}
			</span>
			{pos && (
				<span
					style={{
						fontFamily: "Archivo, system-ui",
						fontWeight: 700,
						fontSize: 11,
						letterSpacing: 1,
						color: T.faint,
						flexShrink: 0,
					}}
				>
					{pos}
				</span>
			)}
		</button>
	);
	const matched = og
		.map((g) => ({
			g,
			players: g.players.filter(
				(p) =>
					nq === "" ||
					p.name.toLowerCase().includes(nq) ||
					g.label.toLowerCase().includes(nq),
			),
		}))
		.filter((x) => x.players.length > 0);
	const showFavs = nq === "" && favs.length > 0;
	return (
		<Sheet
			open={open}
			onClose={onClose}
			T={T}
			title={title}
			centered={centered}
		>
			<div style={{ padding: "4px 18px 10px" }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						background: T.panel2,
						borderRadius: 12,
						padding: "9px 12px",
					}}
				>
					<Icon name="search" size={18} color={T.faint} />
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="選手名・国名で検索"
						style={{
							border: "none",
							outline: "none",
							background: "transparent",
							color: T.text,
							fontSize: 16,
							flex: 1,
							fontFamily: "inherit",
						}}
					/>
				</div>
			</div>
			<div style={{ padding: "0 12px" }}>
				{showFavs && (
					<div>
						<div
							style={{
								...sectionStyle,
								display: "flex",
								alignItems: "center",
								gap: 5,
							}}
						>
							<Icon name="star" size={13} color={T.gold} fill="solid" />{" "}
							得点王候補
						</div>
						{favs.map((f, i) => {
							const m = /^(.*)\s+\(([A-Za-z]{2,3})\)$/.exec(f.value) || [];
							return (
								<Player
									key={"fav" + i}
									value={f.value}
									code={m[2] || undefined}
									name={m[1] || f.label}
								/>
							);
						})}
					</div>
				)}
				{matched.map(({ g, players }) => (
					<div key={g.code}>
						<div style={sectionStyle}>{g.label}</div>
						{players.map((p, i) => (
							<Player
								key={g.code + i}
								value={scorerValue(p.name, g.code)}
								code={g.code}
								name={scorerText(p)}
								pos={p.pos}
							/>
						))}
					</div>
				))}
				{matched.length === 0 && !showFavs && (
					<div style={{ padding: 24, textAlign: "center", color: T.faint }}>
						該当なし
					</div>
				)}
			</div>
		</Sheet>
	);
}

// ---- 予想の保存バー（最下部・押すと下書きをKVへ保存）------
// onSave は下書きをKVへ書き込む commit（async・失敗時 throw）。成功するまで
// 「保存しました」は出さない（無言の失敗を作らない）。失敗時はボタンを戻す
// （浮遊ピル SaveStatus 側がエラー表示と再試行を担う）。
function OptionSaveBar({ T, onSave, hint, style }) {
	const [phase, setPhase] = React.useState("idle"); // 'idle' | 'saving' | 'saved'
	const mounted = React.useRef(true);
	React.useEffect(
		() => () => {
			mounted.current = false;
		},
		[],
	);
	async function handle() {
		if (phase !== "idle") return;
		setPhase("saving");
		try {
			await (onSave && onSave());
			if (mounted.current) setPhase("saved");
		} catch (e) {
			if (mounted.current) setPhase("idle"); // 失敗：再度押せるように戻す
		}
	}
	const saved = phase === "saved";
	const saving = phase === "saving";
	return (
		<div style={{ marginTop: 18, ...style }}>
			<button
				onClick={handle}
				disabled={saving || saved}
				style={{
					width: "100%",
					border: "none",
					borderRadius: 16,
					padding: "15px",
					cursor: saving || saved ? "default" : "pointer",
					fontFamily: "inherit",
					fontWeight: 800,
					fontSize: 16,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 9,
					background: saved ? T.card : T.accent,
					color: saved ? T.accent : T.accentInk,
					boxShadow: saved ? `inset 0 0 0 1.5px ${T.accent}` : "none",
					transition: ".18s ease",
				}}
			>
				<span
					style={{
						display: "grid",
						placeItems: "center",
						animation: saving ? "wcSpin 0.7s linear infinite" : "none",
					}}
				>
					<Icon
						name={saving ? "refresh" : "check"}
						size={19}
						color={saved ? T.accent : T.accentInk}
						sw={2.6}
					/>
				</span>
				{saved ? "保存しました" : saving ? "保存中…" : "保存する"}
			</button>
			{hint && (
				<p
					style={{
						color: T.faint,
						fontSize: 12,
						textAlign: "center",
						margin: "8px 0 0",
						lineHeight: 1.5,
					}}
				>
					<DotBreak>{hint}</DotBreak>
				</p>
			)}
		</div>
	);
}

// 文字列を「。」ごとに改行して表示する（説明文の可読性のため全体で統一）。
// 句点は残し、各文を独立した行にする。Safari互換のため後読み正規表現は使わない。
function DotBreak({ children }) {
	const text =
		typeof children === "string"
			? children
			: React.Children.toArray(children)
					.filter((c) => typeof c === "string")
					.join("");
	const sentences = text.split("。");
	const out = [];
	sentences.forEach((s, i) => {
		const seg = i === sentences.length - 1 ? s : s + "。";
		if (!seg) return;
		if (out.length) out.push(<br key={"br" + i} />);
		out.push(<React.Fragment key={i}>{seg}</React.Fragment>);
	});
	return out;
}

// 1行に収まるよう文字サイズを自動で縮める（省略しない）。max から min まで段階縮小。
// 長い国名（例: ボスニア・ヘルツェゴビナ）を「…」省略せず全文表示するために使う。
function FitText({
	text,
	max,
	min = 12,
	weight = 800,
	color,
	lineHeight,
	letterSpacing,
	style,
}) {
	const ref = React.useRef(null);
	const [size, setSize] = React.useState(max);
	React.useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const measure = () => {
			let s = max;
			el.style.fontSize = s + "px";
			let guard = 120;
			while (s > min && el.scrollWidth > el.clientWidth && guard-- > 0) {
				s -= 1;
				el.style.fontSize = s + "px";
			}
			setSize(s);
		};
		measure();
		let ro;
		if (typeof ResizeObserver !== "undefined") {
			ro = new ResizeObserver(measure);
			ro.observe(el);
		}
		return () => {
			if (ro) ro.disconnect();
		};
	}, [text, max, min]);
	return (
		<div
			ref={ref}
			style={{
				whiteSpace: "nowrap",
				overflow: "hidden",
				fontSize: size,
				fontWeight: weight,
				color,
				lineHeight,
				letterSpacing,
				...style,
			}}
		>
			{text}
		</div>
	);
}

Object.assign(window, {
	Icon,
	Flag,
	FlagBadge,
	TeamLine,
	Avatar,
	Eyebrow,
	Card,
	Sheet,
	SquadSheet,
	TeamPicker,
	ScorerSelect,
	ScorerPicker,
	OptionSaveBar,
	FitText,
	DotBreak,
});
