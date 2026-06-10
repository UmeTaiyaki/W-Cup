/* チームタブ：出場48カ国の一覧と各国詳細（名簿・所属グループ・日程） */

// ---- お気に入り（端末ローカル localStorage） ----------------
// 純ロジックは window.WC.teamsLib（public/lib/teams.js）を利用。
// teamsLib 未ロード時もインラインで安全にフォールバックする。
const FAV_KEY = "wc:favTeams";
const Favs = (() => {
	let listeners = [];
	let state = null; // 遅延初期化（teamsLib のロードを待つ）
	const lib = () => window.WC.teamsLib || {};
	function read() {
		try {
			const raw = localStorage.getItem(FAV_KEY);
			if (lib().parseFavs) return lib().parseFavs(raw);
			const v = raw ? JSON.parse(raw) : [];
			return Array.isArray(v)
				? v.filter((c) => typeof c === "string" && c)
				: [];
		} catch (e) {
			return [];
		}
	}
	function ensure() {
		if (state === null) state = read();
		return state;
	}
	function write(next) {
		state = next;
		try {
			localStorage.setItem(FAV_KEY, JSON.stringify(next));
		} catch (e) {}
		listeners.forEach((fn) => fn(state));
	}
	return {
		list: () => ensure().slice(),
		has: (code) => ensure().includes(code),
		toggle: (code) => {
			const t = lib().toggleFav;
			write(t ? t(ensure(), code) : ensure());
		},
		onChange: (fn) => {
			listeners.push(fn);
			return () => {
				listeners = listeners.filter((f) => f !== fn);
			};
		},
	};
})();

// お気に入り変更を購読して再描画するフック
function useFavs() {
	const [, force] = React.useState(0);
	React.useEffect(() => {
		const off = Favs.onChange(() => force((n) => n + 1));
		return off;
	}, []);
	return Favs;
}

// ---- 選手名簿の表示順（ui.jsx の SquadSheet と同じ並び）------
const TEAMS_POS_ORDER = ["GK", "DF", "MF", "FW"];
const TEAMS_POS_LABEL = {
	GK: "ゴールキーパー",
	DF: "ディフェンダー",
	MF: "ミッドフィールダー",
	FW: "フォワード",
};

// '2026-06-20' → '6/20(土)'。空は「日付未定」。
function fmtTeamsDate(d) {
	if (!d) return "日付未定";
	const [y, m, day] = d.split("-").map(Number);
	const wd = ["日", "月", "火", "水", "木", "金", "土"][
		new Date(Date.UTC(y, m - 1, day)).getUTCDay()
	];
	return `${m}/${day}(${wd})`;
}

// ---- チームアイコンの角丸バッジ ----------------------------
// 中身は ui.jsx の Flag に委譲。Flag が window.WC.teamLogo(code) を見て
// SportMonksロゴ(img)優先、無ければ国旗絵文字にフォールバックする。
function TeamLogo({ code, size = 40 }) {
	return (
		<div
			style={{
				width: size,
				height: size,
				borderRadius: size * 0.26,
				flexShrink: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				overflow: "hidden",
				background: "rgba(255,255,255,0.06)",
				boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
			}}
		>
			<Flag code={code} size={Math.round(size * 0.8)} />
		</div>
	);
}

// ---- ★フォロー トグル（画像の Follow / Following 相当）-------
function FavButton({ T, code, favs, big = false }) {
	const on = favs.has(code);
	return (
		<button
			onClick={(e) => {
				e.stopPropagation();
				favs.toggle(code);
			}}
			aria-pressed={on}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				cursor: "pointer",
				border: "none",
				fontFamily: "inherit",
				fontWeight: 800,
				fontSize: big ? 14 : 12.5,
				padding: big ? "9px 16px" : "6px 13px",
				borderRadius: 999,
				flexShrink: 0,
				background: on ? T.accent : "transparent",
				color: on ? T.accentInk : T.accent,
				boxShadow: on ? "none" : `inset 0 0 0 1.5px ${T.accent}`,
				transition: ".15s ease",
			}}
		>
			<Icon
				name="star"
				size={big ? 16 : 14}
				color={on ? T.accentInk : T.accent}
				fill={on ? "solid" : "none"}
				sw={2}
			/>
			{on ? "フォロー中" : "フォロー"}
		</button>
	);
}

// ---- セクション見出し --------------------------------------
function SectionHeader({ T, label }) {
	return (
		<div
			style={{
				fontFamily: "Archivo",
				fontWeight: 800,
				fontSize: 11,
				letterSpacing: 1.4,
				color: T.faint,
				margin: "18px 4px 8px",
			}}
		>
			{label}
		</div>
	);
}

// ---- 詳細のサブタブ（メンバー / 日程 を下線で切替）----------
function DetailTabs({ T, value, onChange, tabs }) {
	return (
		<div
			style={{
				display: "flex",
				gap: 4,
				borderBottom: `1px solid ${T.line}`,
				margin: "16px 2px 0",
			}}
		>
			{tabs.map((tb) => {
				const active = value === tb.id;
				return (
					<button
						key={tb.id}
						onClick={() => onChange(tb.id)}
						style={{
							border: "none",
							background: "transparent",
							cursor: "pointer",
							fontFamily: "inherit",
							fontWeight: active ? 800 : 700,
							fontSize: 15,
							color: active ? T.text : T.faint,
							padding: "9px 14px",
							borderBottom: active
								? `2.5px solid ${T.accent}`
								: "2.5px solid transparent",
							marginBottom: -1,
							transition: ".15s ease",
						}}
					>
						{tb.label}
					</button>
				);
			})}
		</div>
	);
}

// ---- 一覧の1行 ---------------------------------------------
function TeamRow({ T, code, favs, onOpen, last }) {
	const tm = (window.WC.TEAM || {})[code];
	if (!tm) return null;
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onOpen(code)}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "10px 4px",
				borderBottom: last ? "none" : `1px solid ${T.line}`,
				cursor: "pointer",
			}}
		>
			<TeamLogo code={code} size={40} />
			<span
				style={{
					flex: 1,
					minWidth: 0,
					fontWeight: 700,
					fontSize: 16,
					color: T.text,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{tm.ja}
			</span>
			<FavButton T={T} code={code} favs={favs} />
		</div>
	);
}

// ---- 一覧画面（お気に入り＋グループA〜L）-------------------
function TeamList({ T, onOpen }) {
	const favs = useFavs();
	const groups = window.WC.GROUPS || {};
	const teamMap = window.WC.TEAM || {};
	const favCodes = favs.list().filter((c) => teamMap[c]);
	return (
		<div style={{ padding: "4px 2px 24px" }}>
			<div
				style={{
					fontWeight: 800,
					fontSize: 22,
					color: T.text,
					margin: "6px 4px 2px",
				}}
			>
				チーム
			</div>

			{favCodes.length > 0 && (
				<React.Fragment>
					<SectionHeader T={T} label="★ お気に入り" />
					<Card T={T} style={{ padding: "2px 12px" }}>
						{favCodes.map((c, i) => (
							<TeamRow
								key={c}
								T={T}
								code={c}
								favs={favs}
								onOpen={onOpen}
								last={i === favCodes.length - 1}
							/>
						))}
					</Card>
				</React.Fragment>
			)}

			{Object.keys(groups).map((g) => (
				<React.Fragment key={g}>
					<SectionHeader T={T} label={`グループ${g}`} />
					<Card T={T} style={{ padding: "2px 12px" }}>
						{(groups[g] || []).map((c, i) => (
							<TeamRow
								key={c}
								T={T}
								code={c}
								favs={favs}
								onOpen={onOpen}
								last={i === (groups[g] || []).length - 1}
							/>
						))}
					</Card>
				</React.Fragment>
			))}
		</div>
	);
}

// ---- 詳細：日程の1行 ---------------------------------------
function TeamFixtureRow({ T, match, code, last }) {
	const teamMap = window.WC.TEAM || {};
	const oppCode = match.a === code ? match.b : match.a;
	const opp = window.WC.formatMatchTeam(oppCode, teamMap, match.round);
	const live = window.WC.liveForMatch ? window.WC.liveForMatch(match) : null;
	const id = window.WC.fixtureIdForMatch
		? window.WC.fixtureIdForMatch(match)
		: null;
	const tappable = id != null;
	function open() {
		if (tappable && window.WC.openDetail) window.WC.openDetail(id);
	}
	// 自国視点のスコア（live.a は match.a 側）
	const myScore = live ? (match.a === code ? live.a : live.b) : null;
	const oppScore = live ? (match.a === code ? live.b : live.a) : null;
	return (
		<div
			role="button"
			tabIndex={0}
			onClick={open}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "10px 4px",
				borderBottom: last ? "none" : `1px solid ${T.line}`,
				cursor: tappable ? "pointer" : "default",
			}}
		>
			<div
				style={{
					width: 64,
					flexShrink: 0,
					fontSize: 11,
					fontWeight: 700,
					color: T.faint,
					lineHeight: 1.3,
				}}
			>
				<div>{fmtTeamsDate(match.date)}</div>
				<div style={{ color: T.sub }}>{match.time || "--:--"}</div>
			</div>
			<span style={{ fontSize: 11, fontWeight: 800, color: T.faint }}>vs</span>
			{opp.resolved && <Flag code={oppCode} size={20} />}
			<span
				style={{
					flex: 1,
					minWidth: 0,
					fontWeight: 700,
					fontSize: 14,
					color: T.text,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{opp.label}
			</span>
			{live ? (
				<span
					style={{
						fontFamily: "Archivo",
						fontWeight: 900,
						fontSize: 15,
						color: live.status === "LIVE" ? "#ff5a5a" : T.text,
					}}
				>
					{myScore ?? 0}-{oppScore ?? 0}
				</span>
			) : (
				<span
					style={{
						fontSize: 10.5,
						fontWeight: 700,
						padding: "3px 9px",
						borderRadius: 999,
						background: "rgba(255,255,255,0.06)",
						color: T.sub,
						border: `1px solid ${T.line}`,
						flexShrink: 0,
					}}
				>
					{window.WC.roundLabel(match.round)}
				</span>
			)}
		</div>
	);
}

// ---- 詳細画面（ヘッダー＋名簿＋日程）-----------------------
function TeamDetail({ T, code, onBack }) {
	const favs = useFavs();
	const [subtab, setSubtab] = React.useState("squad"); // squad | schedule
	const tm = (window.WC.TEAM || {})[code];
	const lib = window.WC.teamsLib || {};
	if (!tm) return null;
	const group = lib.groupOf ? lib.groupOf(window.WC.GROUPS, code) : null;
	const squad = (window.WC.SQUADS || {})[code] || [];
	const fixtures = lib.teamFixtures
		? lib.teamFixtures(window.WC.SCHEDULE, code)
		: [];

	const grouped = {};
	TEAMS_POS_ORDER.forEach((p) => {
		grouped[p] = [];
	});
	const other = [];
	squad.forEach((p) => {
		(grouped[p.pos] || other).push(p);
	});

	return (
		<div style={{ padding: "4px 2px 24px" }}>
			{/* 戻る */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					margin: "2px 0 14px",
				}}
			>
				<button
					onClick={onBack}
					aria-label="戻る"
					style={{
						border: "none",
						background: "rgba(255,255,255,0.06)",
						borderRadius: 999,
						width: 30,
						height: 30,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						cursor: "pointer",
						color: T.sub,
						fontSize: 18,
						lineHeight: 1,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
						flexShrink: 0,
					}}
				>
					‹
				</button>
				<span style={{ fontSize: 12, color: T.faint, fontWeight: 700 }}>
					チーム一覧
				</span>
			</div>

			{/* ヘッダー（チームカラーをアクセント背景に） */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 16,
					padding: "18px 16px",
					borderRadius: 20,
					background: `linear-gradient(135deg, ${tm.c}33, ${tm.c}10)`,
					boxShadow: `inset 0 0 0 1px ${T.line}`,
					marginBottom: 4,
				}}
			>
				<TeamLogo code={code} size={64} />
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ fontWeight: 800, fontSize: 22, color: T.text }}>
						{tm.ja}
					</div>
					{group && (
						<div
							style={{
								display: "inline-block",
								marginTop: 6,
								fontSize: 11.5,
								fontWeight: 800,
								color: T.sub,
								padding: "3px 10px",
								borderRadius: 999,
								background: "rgba(255,255,255,0.08)",
								boxShadow: `inset 0 0 0 1px ${T.line}`,
							}}
						>
							グループ{group}
						</div>
					)}
				</div>
				<FavButton T={T} code={code} favs={favs} big />
			</div>

			{/* サブタブ（メンバー / 日程 を切替） */}
			<DetailTabs
				T={T}
				value={subtab}
				onChange={setSubtab}
				tabs={[
					{ id: "squad", label: "メンバー" },
					{ id: "schedule", label: "日程" },
				]}
			/>

			{/* 名簿 */}
			{subtab === "squad" && (
				<Card T={T} style={{ padding: "8px 14px 12px", marginTop: 10 }}>
					{squad.length === 0 ? (
						<div
							style={{
								color: T.faint,
								fontSize: 14,
								padding: "20px 0",
								textAlign: "center",
								fontWeight: 700,
							}}
						>
							メンバーはまだ登録されていません
						</div>
					) : (
						<React.Fragment>
							{TEAMS_POS_ORDER.map(
								(pos) =>
									grouped[pos].length > 0 && (
										<div key={pos} style={{ marginBottom: 10 }}>
											<div
												style={{
													fontFamily: "Archivo",
													fontWeight: 800,
													fontSize: 11,
													letterSpacing: 1,
													color: T.faint,
													margin: "8px 0 4px",
												}}
											>
												{pos}{" "}
												<span style={{ color: T.sub }}>
													{TEAMS_POS_LABEL[pos]}
												</span>
											</div>
											{grouped[pos].map((p, i) => (
												<PlayerLine key={i} T={T} pos={pos} player={p} />
											))}
										</div>
									),
							)}
							{other.length > 0 && (
								<div style={{ marginBottom: 10 }}>
									<div
										style={{
											fontFamily: "Archivo",
											fontWeight: 800,
											fontSize: 11,
											letterSpacing: 1,
											color: T.faint,
											margin: "8px 0 4px",
										}}
									>
										その他
									</div>
									{other.map((p, i) => (
										<PlayerLine key={i} T={T} pos={p.pos} player={p} />
									))}
								</div>
							)}
						</React.Fragment>
					)}
				</Card>
			)}

			{/* 日程 */}
			{subtab === "schedule" && (
				<Card T={T} style={{ padding: "2px 14px", marginTop: 10 }}>
					{fixtures.length === 0 ? (
						<div
							style={{
								color: T.faint,
								fontSize: 14,
								padding: "20px 0",
								textAlign: "center",
								fontWeight: 700,
							}}
						>
							日程は未定です
						</div>
					) : (
						fixtures.map((m, i) => (
							<TeamFixtureRow
								key={`${m.date || "x"}-${m.a}-${m.b}`}
								T={T}
								match={m}
								code={code}
								last={i === fixtures.length - 1}
							/>
						))
					)}
				</Card>
			)}
		</div>
	);
}

// 名簿の選手1行（ポジション記号＋名前＋所属クラブ）
function PlayerLine({ T, pos, player }) {
	return (
		<div
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
				{pos || ""}
			</span>
			<div style={{ minWidth: 0, flex: 1 }}>
				<div style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>
					{player.name}
				</div>
				{player.club && (
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
						{player.club}
					</div>
				)}
			</div>
		</div>
	);
}

// ---- タブ本体（一覧 ⇄ 詳細）-------------------------------
function TeamsScreen({ T }) {
	const [selected, setSelected] = React.useState(null);
	if (selected) {
		return (
			<TeamDetail T={T} code={selected} onBack={() => setSelected(null)} />
		);
	}
	return <TeamList T={T} onOpen={setSelected} />;
}

Object.assign(window, { TeamsScreen });
