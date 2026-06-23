/* ============================================================
   画面: オプション予想ビューア
   各メンバーのグループ順位・3位ワイルドカード・ノックアウト予想を閲覧する。
   既定は読み取り専用。editable+onEdit を渡すと各セクション見出しに編集ボタンを出す。
   上部のメンバーチップで閲覧対象を切り替えられる。
   props: T, state, viewId, setViewId, goBack, wide, availWidth, embedded, editable, onEdit
   ============================================================ */
function OptionViewScreen({
	T,
	state,
	viewId,
	setViewId,
	goBack,
	wide = false,
	availWidth = 0,
	backLabel = "ホームに戻る",
	embedded = false,
	editable = false,
	onEdit,
}) {
	const members = state.members;
	const viewed = members.find((m) => m.id === viewId) || members[0];
	const pred = (viewed && state.preds[viewed.id]) || {};
	const TEAM = window.WC.TEAM || {};
	const GROUPS = window.WC.GROUPS || {};
	const SLOTS = window.WC.WILDCARD_SLOTS || [];
	const PERMITTED = window.WC.PERMITTED || {};
	const GK = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

	const gr = pred.groupRank || {};
	// 3位枠は thirdGroups（通過8組）から FIFA Annex C で自動割当
	const ta = window.WC.resolveThirdAssign(gr, pred.thirdGroups || []);
	const grDone = GK.filter((k) => (gr[k] || []).length >= 3).length;
	const taDone = SLOTS.filter((s) => ta[s]).length;
	const der = window.WC.deriveKnockout(gr, ta, pred.knockout || {});
	const ROUNDS = ["r32", "r16", "qf", "sf"];
	const LABELS = {
		r32: "ベスト32",
		r16: "ベスト16",
		qf: "準々決勝",
		sf: "準決勝",
	};
	const koAny = ROUNDS.some((r) => (der.winners[r] || []).some(Boolean));
	const champ = pred.champion ? TEAM[pred.champion] : null;
	const hasAny = grDone > 0 || taDone > 0 || koAny;
	const [section, setSection] = React.useState("group"); // 'group'(順位＋3位WC) | 'ko'
	const [shareOpen, setShareOpen] = React.useState(false);
	const [openGroups, setOpenGroups] = React.useState({}); // グループ順位アコーディオンの開閉
	const [wcOpen, setWcOpen] = React.useState(false); // 3位ワイルドカードアコーディオンの開閉

	const posMeta = (i) =>
		i === 0
			? { n: "1", c: T.gold }
			: i === 1
				? { n: "2", c: T.silver }
				: i === 2
					? { n: "3", c: T.boot }
					: { n: "4", c: T.faint };

	// ---- ヘッダー（戻る＋メンバー切替）----
	const Header = () => (
		<div style={{ padding: wide ? "4px 0 0" : "4px 16px 0" }}>
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
				{backLabel}
			</button>
			<Eyebrow T={T}>OPTIONS · 閲覧</Eyebrow>
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					justifyContent: "space-between",
					gap: 10,
					marginTop: 3,
					marginBottom: 12,
				}}
			>
				<div
					style={{
						fontSize: wide ? 27 : 21,
						fontWeight: 800,
						color: T.text,
						minWidth: 0,
						flex: 1,
						lineHeight: 1.2,
					}}
				>
					{viewed ? `${viewed.name}のオプション予想` : "オプション予想"}
				</div>
				<button
					onClick={() => setShareOpen(true)}
					style={{
						flexShrink: 0,
						border: "none",
						cursor: "pointer",
						fontFamily: "inherit",
						borderRadius: 999,
						padding: "8px 14px",
						display: "flex",
						alignItems: "center",
						gap: 6,
						background: T.accent,
						color: T.accentInk,
						fontWeight: 800,
						fontSize: 13,
					}}
				>
					<Icon name="share" size={15} color={T.accentInk} sw={2.2} />
					共有
				</button>
			</div>

			{/* メンバー切替チップ */}
			<div
				style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}
			>
				{members.map((m) => {
					const active = m.id === viewId;
					return (
						<button
							key={m.id}
							onClick={() => setViewId(m.id)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 7,
								flexShrink: 0,
								border: "none",
								cursor: "pointer",
								borderRadius: 999,
								fontFamily: "inherit",
								padding: active ? "5px 13px 5px 5px" : "5px",
								background: active ? T.card : "transparent",
								boxShadow: active ? `inset 0 0 0 1px ${m.c}66` : "none",
								transition: ".18s ease",
							}}
						>
							<Avatar m={m} size={28} T={T} />
							{active && (
								<span style={{ fontWeight: 800, fontSize: 14, color: T.text }}>
									{m.name}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);

	// ---- セクション切替タブ（大会結果タブと同じピル型デザイン）----
	const TABS = [
		{ id: "group", label: "グループステージ" },
		{ id: "ko", label: "ノックアウト" },
	];
	const Tabs = () => (
		<div
			style={{ display: "flex", gap: 8, margin: "14px 0 0", flexWrap: "wrap" }}
		>
			{TABS.map((tb) => {
				const active = section === tb.id;
				return (
					<button
						key={tb.id}
						onClick={() => setSection(tb.id)}
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
						{tb.label}
					</button>
				);
			})}
		</div>
	);

	// ---- 空状態ヒント ----
	const EmptyHint = ({ text }) => (
		<div
			style={{
				background: T.card,
				borderRadius: 16,
				padding: "22px 18px",
				boxShadow: `inset 0 0 0 1px ${T.line}`,
				textAlign: "center",
			}}
		>
			<div style={{ fontSize: 28, marginBottom: 8 }}>🗒️</div>
			<div style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>{text}</div>
			<p
				style={{
					color: T.faint,
					fontSize: 12,
					lineHeight: 1.6,
					margin: "6px 0 0",
				}}
			>
				{viewed ? viewed.name : "この人"}
				は「予想」タブでまだ入力していないようです。
			</p>
		</div>
	);

	// ---- 小見出し（グループステージ内の区切り）----
	const SubHead = ({ icon, text, note, editId }) => (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 7,
				margin: "0 0 10px",
			}}
		>
			<Icon name={icon} size={15} color={T.accent} sw={2} />
			<span
				style={{
					fontFamily: "Archivo",
					fontWeight: 800,
					fontSize: 12,
					letterSpacing: 1,
					color: T.sub,
				}}
			>
				{text}
			</span>
			{note && (
				<span
					style={{
						marginLeft: "auto",
						fontSize: 11,
						fontWeight: 700,
						color: T.faint,
					}}
				>
					{note}
				</span>
			)}
			{editable && onEdit && editId && (
				<button
					onClick={() => onEdit(editId)}
					style={{
						marginLeft: note ? 8 : "auto",
						flexShrink: 0,
						border: "none",
						cursor: "pointer",
						fontFamily: "inherit",
						borderRadius: 999,
						padding: "5px 11px",
						display: "flex",
						alignItems: "center",
						gap: 5,
						background: T.panel2,
						color: T.accent,
						fontWeight: 800,
						fontSize: 12,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
					}}
				>
					<Icon name="edit" size={13} color={T.accent} sw={2} />
					編集
				</button>
			)}
		</div>
	);

	// ---- 軽量な空表示（小見出し直下に置く一行）----
	const MiniEmpty = ({ text }) => (
		<div
			style={{
				background: T.card,
				borderRadius: 14,
				padding: "14px 16px",
				boxShadow: `inset 0 0 0 1px ${T.line}`,
				color: T.faint,
				fontSize: 13,
				fontWeight: 600,
			}}
		>
			{text}
		</div>
	);

	// ---- グループ順位（読み取り専用・アコーディオン）----
	const GroupAccordion = ({ k }) => {
		const mem = (GROUPS[k] || []).filter(Boolean);
		const order = (gr[k] || []).filter(Boolean);
		const auto4 =
			order.length === 3 ? mem.find((c) => !order.includes(c)) : null;
		const ranked = auto4 ? [...order, auto4] : order;
		const done = order.length >= 3;
		const open = !!openGroups[k];
		const status = done
			? "完了"
			: order.length > 0
				? `${order.length}/3`
				: "未予想";
		return (
			<div
				style={{
					background: T.card,
					borderRadius: 14,
					boxShadow: `inset 0 0 0 1px ${T.line}`,
					overflow: "hidden",
				}}
			>
				<button
					onClick={() => setOpenGroups((s) => ({ ...s, [k]: !s[k] }))}
					style={{
						width: "100%",
						border: "none",
						background: "transparent",
						cursor: "pointer",
						fontFamily: "inherit",
						display: "flex",
						alignItems: "center",
						gap: 9,
						padding: "12px 13px",
					}}
				>
					<span
						style={{
							display: "inline-flex",
							flexShrink: 0,
							transform: open ? "rotate(90deg)" : "none",
							transition: ".18s ease",
						}}
					>
						<Icon name="chevron" size={15} color={T.faint} />
					</span>
					<span
						style={{
							fontFamily: "Archivo",
							fontWeight: 900,
							fontSize: 14,
							color: T.accent,
							flexShrink: 0,
						}}
					>
						GROUP {k}
					</span>
					{!open && ranked.length > 0 && (
						<span
							style={{
								display: "flex",
								gap: 1,
								fontSize: 15,
								minWidth: 0,
								overflow: "hidden",
								whiteSpace: "nowrap",
							}}
						>
							{ranked.map((c) => (
								<span key={c} style={{ opacity: c === auto4 ? 0.45 : 1 }}>
									<Flag code={c} size={16} />
								</span>
							))}
						</span>
					)}
					<span
						style={{
							marginLeft: "auto",
							fontSize: 11,
							fontWeight: 700,
							flexShrink: 0,
							color: done ? T.accent : T.faint,
						}}
					>
						{status}
					</span>
				</button>
				{open &&
					(ranked.length === 0 ? (
						<div
							style={{ color: T.faint, fontSize: 13, padding: "0 14px 13px" }}
						>
							未予想
						</div>
					) : (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 5,
								padding: "0 11px 12px",
							}}
						>
							{ranked.map((code, i) => {
								const tm = TEAM[code];
								if (!tm) return null;
								const meta = posMeta(i);
								const isAuto = code === auto4;
								return (
									<div
										key={code}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 7,
											padding: "6px 8px",
											borderRadius: 9,
											minWidth: 0,
											background: isAuto ? "transparent" : `${meta.c}14`,
											opacity: isAuto ? 0.6 : 1,
										}}
									>
										<span
											style={{
												fontFamily: "Archivo",
												fontWeight: 800,
												fontSize: 11,
												color: meta.c,
												background: `${meta.c}22`,
												borderRadius: 6,
												padding: "2px 5px",
												minWidth: 20,
												textAlign: "center",
												flexShrink: 0,
											}}
										>
											{meta.n}
										</span>
										<Flag code={code} size={16} style={{ flexShrink: 0 }} />
										<span
											style={{
												fontWeight: 700,
												color: T.text,
												fontSize: 13,
												flex: 1,
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
										>
											{tm.ja}
										</span>
									</div>
								);
							})}
						</div>
					))}
			</div>
		);
	};

	// ---- 3位ワイルドカード（読み取り専用・アコーディオン。通過チームを縦並び）----
	const WildcardRow = ({ slot }) => {
		const code = ta[slot];
		const tm = code ? TEAM[code] : null;
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 9,
					padding: "7px 8px",
					borderRadius: 9,
					minWidth: 0,
					background: code ? `${T.accent}12` : "transparent",
					opacity: code ? 1 : 0.7,
				}}
			>
				<span
					style={{
						fontFamily: "Archivo",
						fontWeight: 800,
						fontSize: 11,
						color: T.faint,
						width: 30,
						flexShrink: 0,
					}}
				>
					{slot}
				</span>
				{tm ? (
					<Flag code={code} size={16} style={{ flexShrink: 0 }} />
				) : (
					<span style={{ fontSize: 16, flexShrink: 0 }}>⚪️</span>
				)}
				<span
					style={{
						fontWeight: 700,
						fontSize: 13,
						flex: 1,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
						color: code ? T.text : T.faint,
					}}
				>
					{tm ? tm.ja : "未割当"}
				</span>
				<span
					style={{
						fontSize: 10,
						color: T.faint,
						fontFamily: "Archivo",
						letterSpacing: 0.3,
						flexShrink: 0,
					}}
				>
					{(PERMITTED[slot] || []).join("/")}
				</span>
			</div>
		);
	};

	const WildcardAccordion = () => {
		const status = taDone > 0 ? `${taDone}/${SLOTS.length}枠` : "未割当";
		const flags = SLOTS.map((s) => ta[s]).filter(Boolean);
		return (
			<div
				style={{
					background: T.card,
					borderRadius: 14,
					boxShadow: `inset 0 0 0 1px ${T.line}`,
					overflow: "hidden",
				}}
			>
				<button
					onClick={() => setWcOpen((o) => !o)}
					style={{
						width: "100%",
						border: "none",
						background: "transparent",
						cursor: "pointer",
						fontFamily: "inherit",
						display: "flex",
						alignItems: "center",
						gap: 9,
						padding: "12px 13px",
					}}
				>
					<span
						style={{
							display: "inline-flex",
							flexShrink: 0,
							transform: wcOpen ? "rotate(90deg)" : "none",
							transition: ".18s ease",
						}}
					>
						<Icon name="chevron" size={15} color={T.faint} />
					</span>
					<Icon name="target" size={15} color={T.accent} sw={2} />
					<span
						style={{
							fontWeight: 800,
							fontSize: 14,
							color: T.text,
							flexShrink: 0,
						}}
					>
						3位ワイルドカード
					</span>
					{!wcOpen && flags.length > 0 && (
						<span
							style={{
								display: "flex",
								gap: 1,
								fontSize: 15,
								minWidth: 0,
								overflow: "hidden",
								whiteSpace: "nowrap",
							}}
						>
							{flags.map((c, i) => (
								<Flag key={c + i} code={c} size={15} />
							))}
						</span>
					)}
					<span
						style={{
							marginLeft: "auto",
							fontSize: 11,
							fontWeight: 700,
							flexShrink: 0,
							color: taDone >= SLOTS.length ? T.accent : T.faint,
						}}
					>
						{status}
					</span>
				</button>
				{wcOpen && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 4,
							padding: "0 11px 12px",
						}}
					>
						{SLOTS.map((s) => (
							<WildcardRow key={s} slot={s} />
						))}
					</div>
				)}
			</div>
		);
	};

	// ---- タブ＋予想内容（本体。埋め込み時はこれだけを描画）----
	const Body = () => (
		<React.Fragment>
			<Tabs />
			<div style={{ marginTop: 16 }}>
				{/* グループステージ（グループ順位＋3位ワイルドカード）*/}
				{section === "group" && (
					<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
						<div>
							<SubHead
								icon="chart"
								text="グループ順位"
								note={`${grDone}/12組`}
								editId="grouprank"
							/>
							{GK.some((k) => (gr[k] || []).filter(Boolean).length > 0) ? (
								<div
									style={{
										display: "grid",
										gridTemplateColumns: wide ? "1fr 1fr" : "1fr",
										gap: 8,
										alignItems: "start",
									}}
								>
									{GK.map((k) => (
										<GroupAccordion key={k} k={k} />
									))}
								</div>
							) : (
								<MiniEmpty text="グループ順位予想はまだありません" />
							)}
						</div>
						<div>
							{editable && onEdit && (
								<SubHead
									icon="award"
									text="3位ワイルドカード"
									editId="thirdwild"
								/>
							)}
							{taDone > 0 ? (
								<WildcardAccordion />
							) : (
								<MiniEmpty text="3位ワイルドカードはまだ割り当てられていません" />
							)}
						</div>
					</div>
				)}

				{/* ノックアウト */}
				{section === "ko" && (
					<div>
						{editable && onEdit && (
							<SubHead icon="stadium" text="ノックアウト" editId="knockout" />
						)}
						{koAny ? (
							<KnockoutView
								T={T}
								der={der}
								champ={champ}
								ROUNDS={ROUNDS}
								LABELS={LABELS}
							/>
						) : (
							<EmptyHint text="ノックアウト予想はまだありません" />
						)}
					</div>
				)}
			</div>
		</React.Fragment>
	);

	// 埋め込み（ホーム/部屋にインライン表示）: ヘッダー・共有・戻る・メンバーチップ無し
	if (embedded)
		return (
			<div>
				<Body />
			</div>
		);

	return (
		<div style={{ paddingBottom: 24 }}>
			<Header />
			<div style={{ padding: wide ? "0" : "0 16px" }}>
				<Body />
			</div>
			<ShareSheet
				T={T}
				member={viewed}
				pred={pred}
				open={shareOpen}
				onClose={() => setShareOpen(false)}
			/>
		</div>
	);
}

/* ノックアウトの読み取り専用表示（トーナメント表ビュー・レスポンシブ）
   コンテナ幅を実測し、収まる時は中央寄せ・収まらない時は横スクロール */
function KnockoutView({
	T,
	der,
	champ,
	ROUNDS,
	LABELS,
	champEmptyLabel = "優勝予想",
	onMatchTap,
	provisional,
}) {
	const LENS = { r32: 16, r16: 8, qf: 4, sf: 2 };
	const wrapRef = React.useRef(null);
	const avail = window.useContainerWidth(wrapRef);
	const [squadCode, setSquadCode] = React.useState(null);
	// 暫定配置（現在順位由来で未確定）のチームコード集合。結果タブのみ供給される。
	const provSet = provisional || null;
	const isProv = (team) => team && provSet && provSet.has(team);

	const TeamRow = ({ team, isWinner, dimmed, half, placeholder }) => {
		const prov = isProv(team) && !isWinner;
		return (
			<div
				onClick={() => team && setSquadCode(team)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					width: "100%",
					height: half,
					background: isWinner ? T.accent : "transparent",
					padding: "0 10px",
					borderRadius: isWinner ? 10 : 0,
					opacity: dimmed ? 0.4 : 1,
					minWidth: 0,
					cursor: team ? "pointer" : "default",
				}}
			>
				{team ? (
					<Flag code={team} size={18} style={{ flexShrink: 0 }} />
				) : (
					<span style={{ fontSize: 18, flexShrink: 0 }}>⚪️</span>
				)}
				<span
					style={{
						fontSize: team ? 13.5 : 12,
						fontWeight: team ? 800 : 700,
						fontStyle: prov ? "italic" : "normal",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
						flex: 1,
						color: isWinner
							? T.accentInk
							: prov
								? T.sub
								: team
									? T.text
									: T.faint,
					}}
				>
					{team ? window.WC.TEAM[team]?.ja : placeholder || "未定"}
				</span>
				{prov && (
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
				)}
				{isWinner && (
					<Icon name="check" size={14} color={T.accentInk} sw={2.6} />
				)}
			</div>
		);
	};

	const rowH = 50,
		cardH = 46,
		colW = 172,
		stepX = 210,
		LABEL_H = 30;
	const canvasH = 16 * rowH;
	const centerY = (r, idx) => ((2 ** r * (2 * idx + 1)) / 2) * rowH;
	const colX = (r) => r * stepX;
	const champX = 4 * stepX;
	const contentW = champX + colW;
	const fitScale = avail
		? Math.max(0.72, Math.min(1.3, (avail - 2) / contentW))
		: 1;
	const scaledW = contentW * fitScale;
	const needsScroll = avail > 0 && scaledW > avail + 1;

	const connectors = [];
	[1, 2, 3].forEach((r) => {
		const n = LENS[ROUNDS[r]];
		for (let i = 0; i < n; i++) {
			const px = colX(r),
				py = centerY(r, i);
			const childBaseX = colX(r - 1) + colW;
			const midX = childBaseX + (stepX - colW) / 2;
			[2 * i, 2 * i + 1].forEach((ci) => {
				connectors.push(
					`M ${childBaseX} ${centerY(r - 1, ci)} H ${midX} V ${py} H ${px}`,
				);
			});
		}
	});
	const champCenterY = (centerY(3, 0) + centerY(3, 1)) / 2;
	const midChampX = colX(3) + colW + (stepX - colW) / 2;
	[0, 1].forEach((i) => {
		connectors.push(
			`M ${colX(3) + colW} ${centerY(3, i)} H ${midChampX} V ${champCenterY} H ${champX}`,
		);
	});

	const MatchCard = ({ round, r, idx }) => {
		const teams = der.matches[round][idx];
		const w = der.winners[round][idx];
		const seeds =
			(der.seeds && der.seeds[round] && der.seeds[round][idx]) || [];
		const tappable = onMatchTap && teams[0] && teams[1];
		return (
			<div
				onClick={tappable ? () => onMatchTap(teams[0], teams[1]) : undefined}
				role={tappable ? "button" : undefined}
				tabIndex={tappable ? 0 : undefined}
				style={{
					position: "absolute",
					left: colX(r),
					top: centerY(r, idx) - cardH / 2,
					width: colW,
					height: cardH,
					background: T.card,
					borderRadius: 11,
					boxShadow: `inset 0 0 0 1px ${w ? T.accent + "66" : T.line}`,
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					padding: 3,
					gap: 2,
					cursor: tappable ? "pointer" : undefined,
				}}
			>
				<TeamRow
					team={teams[0]}
					isWinner={w && w === teams[0]}
					dimmed={w && w !== teams[0]}
					half={cardH / 2 - 3}
					placeholder={seeds[0]}
				/>
				<div style={{ height: 1, background: T.line, margin: "0 6px" }} />
				<TeamRow
					team={teams[1]}
					isWinner={w && w === teams[1]}
					dimmed={w && w !== teams[1]}
					half={cardH / 2 - 3}
					placeholder={seeds[1]}
				/>
			</div>
		);
	};

	return (
		<div>
			{needsScroll && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: 6,
						fontSize: 12,
						color: T.faint,
						fontWeight: 700,
						marginBottom: 8,
					}}
				>
					<span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
						<Icon name="chevron" size={13} color={T.faint} />
					</span>
					横スクロールで全体表示
					<Icon name="chevron" size={13} color={T.faint} />
				</div>
			)}
			<div
				ref={wrapRef}
				style={{
					overflowX: "auto",
					overflowY: "hidden",
					WebkitOverflowScrolling: "touch",
				}}
			>
				<div
					style={{
						position: "relative",
						width: scaledW,
						height: (canvasH + LABEL_H) * fitScale,
						margin: "0 auto",
					}}
				>
					<div
						style={{
							position: "relative",
							width: contentW,
							height: canvasH + LABEL_H,
							transform: `scale(${fitScale})`,
							transformOrigin: "top left",
						}}
					>
						{ROUNDS.map((r, i) => (
							<div
								key={r}
								style={{
									position: "absolute",
									top: 4,
									left: colX(i),
									width: colW,
									textAlign: "center",
									fontFamily: "Archivo",
									fontWeight: 800,
									fontSize: 12,
									letterSpacing: 1.2,
									color: T.sub,
								}}
							>
								{LABELS[r]}
							</div>
						))}
						<div
							style={{
								position: "absolute",
								top: 4,
								left: champX,
								width: colW,
								textAlign: "center",
								fontFamily: "Archivo",
								fontWeight: 800,
								fontSize: 12,
								letterSpacing: 1.2,
								color: T.gold,
							}}
						>
							優勝
						</div>
						<div
							style={{
								position: "absolute",
								top: LABEL_H,
								left: 0,
								width: contentW,
								height: canvasH,
							}}
						>
							<svg
								width={contentW}
								height={canvasH}
								style={{
									position: "absolute",
									inset: 0,
									pointerEvents: "none",
								}}
							>
								{connectors.map((d, i) => (
									<path
										key={i}
										d={d}
										fill="none"
										stroke={T.line}
										strokeWidth="1.5"
									/>
								))}
							</svg>
							{ROUNDS.map((round, r) =>
								der.matches[round].map((_, idx) => (
									<MatchCard key={round + idx} round={round} r={r} idx={idx} />
								)),
							)}
							<div
								onClick={() => champ && setSquadCode(champ.code)}
								style={{
									position: "absolute",
									left: champX,
									top: champCenterY - 48,
									width: colW,
									height: 96,
									borderRadius: 16,
									background: champ
										? `linear-gradient(160deg, ${T.gold}33, ${T.card})`
										: T.card,
									boxShadow: `inset 0 0 0 1.5px ${champ ? T.gold : T.line}`,
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									justifyContent: "center",
									gap: 4,
									cursor: champ ? "pointer" : "default",
								}}
							>
								<Icon name="trophy" size={24} color={T.gold} />
								<div style={{ fontSize: 28 }}>
									{champ ? <Flag code={champ.code} size={28} /> : "🏆"}
								</div>
								<div
									style={{
										fontWeight: 800,
										fontSize: 14,
										color: champ ? T.text : T.faint,
									}}
								>
									{champ ? champ.ja : champEmptyLabel}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
			{squadCode && (
				<SquadSheet T={T} code={squadCode} onClose={() => setSquadCode(null)} />
			)}
		</div>
	);
}

Object.assign(window, { OptionViewScreen, KnockoutView });
