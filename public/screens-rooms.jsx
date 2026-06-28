/* ============================================================
   部屋（ルーム）: 一覧 / 作成 / 参加 ＋ 部屋ビュー
   入室直後はシンプルなポイント順位リーダーボード（RoomLeaderboard）。
   カードタップで RoomMemberDetail（予想と結果のスコアカード＝国旗+的中表示）へ遷移。
   window に RoomsScreen / RoomCompareScreen / RoomMemberDetail / RoomLeaderboard を export。
   ============================================================ */

const roomFmtCode = (c) => (c || "").replace(/(.{4})(?=.)/g, "$1-");

// 招待シート: リンク（ネイティブ共有＋LINE/X＋コピー）/ 参加コード を切替表示
function InviteSheet({ T, room, onClose }) {
	const { useState } = React;
	const [view, setView] = useState("link"); // 'link' | 'code'
	const [copied, setCopied] = useState(""); // '' | 'url' | 'code'
	const url = window.WC.roomInviteURL(room.code);
	const text = `「${room.name || "部屋"}」の予想に参加しよう！`;
	const canNativeShare =
		typeof navigator !== "undefined" && typeof navigator.share === "function";

	function flash(kind) {
		setCopied(kind);
		setTimeout(() => setCopied(""), 1600);
	}
	function copy(kind, value) {
		try {
			navigator.clipboard.writeText(value);
			flash(kind);
		} catch (e) {}
	}
	function openWin(href) {
		try {
			window.open(href, "_blank", "noopener");
		} catch (e) {}
	}
	async function nativeShare() {
		try {
			await navigator.share({ title: "W杯予想 部屋への招待", text, url });
		} catch (e) {
			/* キャンセル等は無視 */
		}
	}
	const shareLine = () =>
		openWin(
			"https://line.me/R/share?text=" + encodeURIComponent(text + "\n" + url),
		);
	const shareX = () =>
		openWin(
			"https://x.com/intent/tweet?text=" +
				encodeURIComponent(text) +
				"&url=" +
				encodeURIComponent(url),
		);

	const tile = (label, bg, glyph, onClick) => (
		<button
			onClick={onClick}
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 7,
				border: "none",
				background: "transparent",
				cursor: "pointer",
				fontFamily: "inherit",
				padding: 0,
			}}
		>
			<span
				style={{
					width: 52,
					height: 52,
					borderRadius: 16,
					background: bg,
					display: "grid",
					placeItems: "center",
					boxShadow: `inset 0 0 0 1px ${T.line}`,
				}}
			>
				{glyph}
			</span>
			<span style={{ fontSize: 12, fontWeight: 700, color: T.sub }}>
				{label}
			</span>
		</button>
	);
	const brand = (txt, color) => (
		<span
			style={{
				fontFamily: "Archivo, sans-serif",
				fontWeight: 900,
				fontSize: 16,
				color,
				letterSpacing: -0.5,
			}}
		>
			{txt}
		</span>
	);

	const seg = (id, label) => {
		const active = view === id;
		return (
			<button
				key={id}
				onClick={() => setView(id)}
				style={{
					flex: 1,
					border: "none",
					borderRadius: 9,
					padding: "9px",
					cursor: "pointer",
					fontFamily: "inherit",
					fontWeight: 800,
					fontSize: 14,
					background: active ? T.accent : "transparent",
					color: active ? T.accentInk : T.sub,
				}}
			>
				{label}
			</button>
		);
	};

	return (
		<Sheet open onClose={onClose} T={T} title="仲間を招待">
			<div style={{ padding: "0 18px 4px" }}>
				<p
					style={{
						color: T.faint,
						fontSize: 13,
						lineHeight: 1.5,
						margin: "0 0 14px",
					}}
				>
					「{room.name || "部屋"}」に招待して、予想を見比べましょう。
				</p>

				<div
					style={{
						display: "flex",
						gap: 6,
						background: T.panel2,
						borderRadius: 12,
						padding: 4,
						marginBottom: 16,
					}}
				>
					{seg("link", "リンク")}
					{seg("code", "参加コード")}
				</div>

				{view === "link" ? (
					<div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								background: T.card,
								borderRadius: 14,
								padding: "12px 14px",
								boxShadow: `inset 0 0 0 1px ${T.line}`,
								marginBottom: 16,
							}}
						>
							<div
								style={{
									flex: 1,
									minWidth: 0,
									fontSize: 13,
									color: T.sub,
									fontWeight: 600,
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{url}
							</div>
							<button
								onClick={() => copy("url", url)}
								style={{
									border: "none",
									borderRadius: 10,
									padding: "8px 12px",
									cursor: "pointer",
									background: copied === "url" ? T.card : `${T.accent}1A`,
									color: T.accent,
									fontFamily: "inherit",
									fontWeight: 800,
									fontSize: 13,
									display: "flex",
									alignItems: "center",
									gap: 5,
									flexShrink: 0,
									boxShadow:
										copied === "url" ? `inset 0 0 0 1.5px ${T.accent}` : "none",
								}}
							>
								<Icon
									name={copied === "url" ? "check" : "copy"}
									size={14}
									color={T.accent}
									sw={2.4}
								/>
								{copied === "url" ? "コピー済" : "コピー"}
							</button>
						</div>
						<div style={{ display: "flex", gap: 4 }}>
							{tile("LINE", "#06C755", brand("LINE", "#fff"), shareLine)}
							{tile("X", "#000", brand("X", "#fff"), shareX)}
							{canNativeShare &&
								tile(
									"その他",
									T.panel2,
									<Icon name="share" size={22} color={T.text} />,
									nativeShare,
								)}
							{tile(
								"コピー",
								T.panel2,
								<Icon
									name={copied === "url" ? "check" : "copy"}
									size={21}
									color={copied === "url" ? T.accent : T.text}
									sw={2.2}
								/>,
								() => copy("url", url),
							)}
						</div>
					</div>
				) : (
					<div style={{ textAlign: "center", padding: "4px 0 4px" }}>
						<div
							style={{
								fontFamily: "Archivo, monospace",
								fontWeight: 900,
								fontSize: 30,
								letterSpacing: 4,
								color: T.text,
							}}
						>
							{roomFmtCode(room.code)}
						</div>
						<button
							onClick={() => copy("code", room.code)}
							style={{
								margin: "16px auto 0",
								border: "none",
								borderRadius: 12,
								padding: "11px 18px",
								cursor: "pointer",
								background: copied === "code" ? T.card : `${T.accent}1A`,
								color: T.accent,
								fontFamily: "inherit",
								fontWeight: 800,
								fontSize: 14,
								display: "flex",
								alignItems: "center",
								gap: 7,
								boxShadow:
									copied === "code" ? `inset 0 0 0 1.5px ${T.accent}` : "none",
							}}
						>
							<Icon
								name={copied === "code" ? "check" : "copy"}
								size={16}
								color={T.accent}
								sw={2.4}
							/>
							{copied === "code" ? "コピー済" : "コードをコピー"}
						</button>
						<p
							style={{
								color: T.faint,
								fontSize: 12,
								lineHeight: 1.5,
								margin: "14px 0 0",
							}}
						>
							アプリの「部屋」→「コードで参加」にこのコードを入力すると参加できます。
						</p>
					</div>
				)}
			</div>
		</Sheet>
	);
}

// me.rooms に部屋参照を重複なく足した新しい me を返す
function withRoom(me, room) {
	const rooms = Array.isArray(me.rooms) ? me.rooms : [];
	if (rooms.some((r) => r && r.id === room.id)) return me;
	return {
		...me,
		rooms: [...rooms, { id: room.id, code: room.code, name: room.name }],
	};
}

// 部屋一覧＋作る/参加
function RoomsScreen({ T, me, setMe, onOpenRoom, wide = false, siteKey }) {
	const { useState } = React;
	const [mode, setMode] = useState(null); // 'create' | 'join' | null
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [created, setCreated] = useState(null); // 作成直後に参加コードを見せる
	const [copied, setCopied] = useState(false);
	const [token, setToken] = useState(null); // Turnstile トークン（siteKey なしなら不要）
	const [tsKey, setTsKey] = useState(0); // 失敗時にウィジェットを再マウントするためのキー
	const rooms = Array.isArray(me.rooms) ? me.rooms : [];

	function commitMe(nextMe) {
		setMe(nextMe);
		window.WC.Me.cacheUser(nextMe);
	}

	async function doCreate() {
		const nm = name.trim();
		if (!nm || busy) return;
		if (siteKey && !token) {
			setErr("「私はロボットではありません」の確認を完了してください");
			return;
		}
		setBusy(true);
		setErr("");
		try {
			const out = await window.WC.Rooms.create(me.id, nm, token);
			commitMe(withRoom(me, out.room));
			setCreated(out.room);
			setName("");
		} catch (e) {
			setErr(e.message || "作成に失敗しました");
			if (siteKey) {
				setToken(null);
				setTsKey((k) => k + 1);
			} // 使い切りトークンを作り直す
		} finally {
			setBusy(false);
		}
	}
	async function doJoin() {
		const c = code.trim();
		if (!c || busy) return;
		setBusy(true);
		setErr("");
		try {
			const out = await window.WC.Rooms.join(me.id, c);
			commitMe(withRoom(me, out.room));
			setCode("");
			setMode(null);
			onOpenRoom(out.room);
		} catch (e) {
			setErr(
				e.status === 404
					? "コードに該当する部屋がありません"
					: e.message || "参加に失敗しました",
			);
		} finally {
			setBusy(false);
		}
	}
	function copyCreated() {
		try {
			navigator.clipboard.writeText(created.code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch (e) {}
	}

	const pad = wide ? "4px 0 24px" : "4px 16px 16px";
	const input = (val, set, ph, mono) => (
		<input
			autoFocus
			value={val}
			maxLength={mono ? 12 : 24}
			onChange={(e) => set(e.target.value)}
			placeholder={ph}
			style={{
				width: "100%",
				border: "none",
				outline: "none",
				boxSizing: "border-box",
				background: T.panel2,
				color: T.text,
				fontSize: mono ? 19 : 17,
				fontFamily: mono ? "Archivo, monospace" : "inherit",
				fontWeight: mono ? 800 : 700,
				letterSpacing: mono ? 3 : 0,
				textAlign: mono ? "center" : "left",
				padding: "14px 16px",
				borderRadius: 14,
				boxShadow: `inset 0 0 0 1px ${T.line}`,
			}}
		/>
	);
	const primary = (label, onClick, disabled) => (
		<button
			onClick={onClick}
			disabled={disabled}
			style={{
				width: "100%",
				border: "none",
				borderRadius: 14,
				padding: "14px",
				fontFamily: "inherit",
				fontWeight: 800,
				fontSize: 16,
				cursor: disabled ? "default" : "pointer",
				background: disabled ? T.card : T.accent,
				color: disabled ? T.faint : T.accentInk,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 8,
			}}
		>
			{label}
		</button>
	);

	return (
		<div style={{ padding: pad }}>
			<Eyebrow T={T}>ROOMS</Eyebrow>
			<div
				style={{
					fontSize: wide ? 27 : 23,
					fontWeight: 800,
					color: T.text,
					marginTop: 3,
					marginBottom: 4,
				}}
			>
				部屋で見比べ
			</div>
			<p
				style={{
					color: T.sub,
					fontSize: 14,
					lineHeight: 1.6,
					margin: "0 0 16px",
				}}
			>
				<DotBreak>
					仲間と予想を見比べる部屋です。新しく作るか、もらったコードで参加できます。
				</DotBreak>
			</p>

			{/* 部屋一覧 */}
			{rooms.length > 0 ? (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 8,
						marginBottom: 16,
					}}
				>
					{rooms.map((r) => (
						<button
							key={r.id}
							onClick={() => onOpenRoom(r)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								width: "100%",
								textAlign: "left",
								border: "none",
								cursor: "pointer",
								fontFamily: "inherit",
								background: T.card,
								borderRadius: 16,
								padding: "13px 14px",
								boxShadow: `inset 0 0 0 1px ${T.line}`,
							}}
						>
							<div
								style={{
									width: 38,
									height: 38,
									borderRadius: 11,
									display: "grid",
									placeItems: "center",
									background: `${T.accent}1F`,
								}}
							>
								<Icon name="people" size={20} color={T.accent} />
							</div>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{
										fontWeight: 800,
										fontSize: 15,
										color: T.text,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{r.name || "（無名の部屋）"}
								</div>
								<div
									style={{
										fontFamily: "Archivo, monospace",
										fontSize: 12,
										color: T.faint,
										letterSpacing: 1.5,
										marginTop: 1,
									}}
								>
									{roomFmtCode(r.code)}
								</div>
							</div>
							<Icon name="chevron" size={18} color={T.faint} />
						</button>
					))}
				</div>
			) : (
				<div
					style={{
						background: T.card,
						borderRadius: 16,
						padding: "18px 16px",
						marginBottom: 16,
						textAlign: "center",
						color: T.faint,
						fontSize: 14,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
					}}
				>
					まだ部屋がありません
				</div>
			)}

			{/* アクション or フォーム */}
			{mode === null && !created && (
				<div style={{ display: "flex", gap: 10 }}>
					{primary("＋ 部屋を作る", () => {
						setErr("");
						setMode("create");
					})}
					<button
						onClick={() => {
							setErr("");
							setMode("join");
						}}
						style={{
							width: "100%",
							border: "none",
							borderRadius: 14,
							padding: "14px",
							fontFamily: "inherit",
							fontWeight: 800,
							fontSize: 16,
							cursor: "pointer",
							background: T.card,
							color: T.text,
							boxShadow: `inset 0 0 0 1.5px ${T.line}`,
						}}
					>
						コードで参加
					</button>
				</div>
			)}

			{/* 作成フォーム */}
			{mode === "create" && !created && (
				<div
					style={{
						background: T.card,
						borderRadius: 16,
						padding: 16,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
					}}
				>
					<div
						style={{
							fontWeight: 800,
							color: T.text,
							fontSize: 15,
							marginBottom: 10,
						}}
					>
						部屋を作る
					</div>
					{input(name, setName, "部屋名（例：会社の予想大会）", false)}
					<TurnstileWidget
						key={tsKey}
						siteKey={siteKey}
						onToken={setToken}
						theme={T.isDark === false ? "light" : "dark"}
					/>
					{err && (
						<p
							style={{
								color: T.danger,
								fontSize: 13,
								fontWeight: 700,
								margin: "10px 2px 0",
							}}
						>
							{err}
						</p>
					)}
					<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
						<button
							onClick={() => {
								setMode(null);
								setErr("");
							}}
							style={{
								flex: 1,
								border: "none",
								borderRadius: 12,
								padding: "12px",
								fontFamily: "inherit",
								fontWeight: 800,
								fontSize: 14,
								cursor: "pointer",
								background: T.panel2,
								color: T.sub,
							}}
						>
							キャンセル
						</button>
						<div style={{ flex: 1 }}>
							{primary(
								busy ? "…" : "作成",
								doCreate,
								!name.trim() || busy || (siteKey && !token),
							)}
						</div>
					</div>
				</div>
			)}

			{/* 作成完了→参加コード表示 */}
			{created && (
				<div
					style={{
						background: T.card,
						borderRadius: 16,
						padding: 16,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
					}}
				>
					<div style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>
						「{created.name}」を作成しました
					</div>
					<p
						style={{
							color: T.faint,
							fontSize: 13,
							lineHeight: 1.6,
							margin: "6px 0 12px",
						}}
					>
						この参加コードを仲間に共有してください。
					</p>
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<div
							style={{
								flex: 1,
								fontFamily: "Archivo, monospace",
								fontWeight: 900,
								fontSize: 24,
								letterSpacing: 3,
								color: T.text,
							}}
						>
							{roomFmtCode(created.code)}
						</div>
						<button
							onClick={copyCreated}
							style={{
								border: "none",
								borderRadius: 12,
								padding: "10px 14px",
								cursor: "pointer",
								background: copied ? T.card : `${T.accent}1A`,
								color: T.accent,
								fontFamily: "inherit",
								fontWeight: 800,
								fontSize: 14,
								display: "flex",
								alignItems: "center",
								gap: 6,
								boxShadow: copied ? `inset 0 0 0 1.5px ${T.accent}` : "none",
							}}
						>
							<Icon
								name={copied ? "check" : "copy"}
								size={16}
								color={T.accent}
								sw={2.4}
							/>
							{copied ? "コピー済" : "コピー"}
						</button>
					</div>
					<div style={{ marginTop: 14 }}>
						{primary("この部屋を見る", () => {
							const r = created;
							setCreated(null);
							setMode(null);
							onOpenRoom(r);
						})}
					</div>
				</div>
			)}

			{/* 参加フォーム */}
			{mode === "join" && (
				<div
					style={{
						background: T.card,
						borderRadius: 16,
						padding: 16,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
					}}
				>
					<div
						style={{
							fontWeight: 800,
							color: T.text,
							fontSize: 15,
							marginBottom: 10,
						}}
					>
						コードで参加
					</div>
					{input(code, setCode, "XXXX-XXXX", true)}
					{err && (
						<p
							style={{
								color: T.danger,
								fontSize: 13,
								fontWeight: 700,
								margin: "10px 2px 0",
							}}
						>
							{err}
						</p>
					)}
					<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
						<button
							onClick={() => {
								setMode(null);
								setErr("");
							}}
							style={{
								flex: 1,
								border: "none",
								borderRadius: 12,
								padding: "12px",
								fontFamily: "inherit",
								fontWeight: 800,
								fontSize: 14,
								cursor: "pointer",
								background: T.panel2,
								color: T.sub,
							}}
						>
							キャンセル
						</button>
						<div style={{ flex: 1 }}>
							{primary(busy ? "…" : "参加", doJoin, !code.trim() || busy)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// 部屋用スコア: 得点王は大会終了（決勝確定=RESULT.champion）まで計上しない。
// 終了まで「結果待ち」とする方針に合わせ、コア/総合の合計からも得点王分を除く。
function roomScoreMember(pred) {
	const s = window.WC.scoreMember(pred);
	const over = !!(window.WC.RESULT && window.WC.RESULT.champion);
	const ts = s.core.topScorer;
	if (over || !ts) return s;
	return {
		...s,
		core: { ...s.core, topScorer: 0, total: s.core.total - ts },
		coreTotal: s.coreTotal - ts,
		grandTotal: s.grandTotal - ts,
	};
}

// ISO日時 → "6月5日 21:34"（JST）
function roomFmtDateTime(iso) {
	if (!iso) return null;
	const d = new Date(iso);
	if (isNaN(d.getTime())) return null;
	return d.toLocaleString("ja-JP", {
		timeZone: "Asia/Tokyo",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

// 部屋のポイント順位リーダーボード（シンプルなランキングリスト）。
// 行タップで onSelectMember に {id,member,rank,score,resultsLive,division} を渡す。
function RoomLeaderboard({ T, state, wide = false, onSelectMember }) {
	const { useState } = React;
	const M = state.members;
	const R = window.WC.RESULT || {};
	const [division, setDivision] = useState("grand"); // 'grand'=総合 / 'core'=コア
	const keyOf = (s) => (division === "core" ? s.coreTotal : s.grandTotal);
	const scored = M.map((m) => ({
		m,
		s: roomScoreMember(state.preds[m.id]),
	})).sort((a, b) => keyOf(b.s) - keyOf(a.s));

	// 採点が意味を持つか（確定 or 暫定結果が1つでもあるか）。RankingScreen と同一ロジック。
	const KO_ROUNDS = ["r32", "r16", "qf", "sf"];
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

	const medalColor = (i) =>
		!resultsLive
			? T.faint
			: i === 0
				? T.gold
				: i === 1
					? T.silver
					: i === 2
						? T.boot
						: T.sub;
	const rankText = (i) => (resultsLive ? i + 1 : "–");

	const seg = (id, label) => {
		const active = division === id;
		return (
			<button
				key={id}
				onClick={() => setDivision(id)}
				style={{
					border: "none",
					cursor: "pointer",
					fontFamily: "inherit",
					fontWeight: 800,
					fontSize: 12,
					padding: "5px 12px",
					borderRadius: 999,
					background: active ? T.card : "transparent",
					boxShadow: active ? `inset 0 0 0 1px ${T.line}` : "none",
					color: active ? T.text : T.faint,
				}}
			>
				{label}
			</button>
		);
	};

	return (
		<div>
			{/* ヘッダー: 見出し＋小さなコア/総合トグル */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					margin: "2px 2px 12px",
				}}
			>
				<span style={{ fontWeight: 800, fontSize: 15, color: T.text }}>
					ポイント順位
				</span>
				<div
					style={{
						display: "flex",
						gap: 2,
						background: T.panel2,
						borderRadius: 999,
						padding: 3,
					}}
				>
					{seg("core", "コア")}
					{seg("grand", "総合")}
				</div>
			</div>

			{!resultsLive && (
				<div
					style={{
						fontSize: 12,
						color: T.faint,
						margin: "0 2px 12px",
						lineHeight: 1.5,
					}}
				>
					試合結果が出ると順位がつきます。
				</div>
			)}

			{/* 順位リスト */}
			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				{scored.map((item, i) => {
					const isMe = item.m.id === state.current;
					return (
						<button
							key={item.m.id}
							onClick={() =>
								onSelectMember({
									id: item.m.id,
									member: item.m,
									rank: resultsLive ? i + 1 : null,
									score: item.s,
									resultsLive,
									division,
								})
							}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								width: "100%",
								textAlign: "left",
								border: "none",
								cursor: "pointer",
								fontFamily: "inherit",
								background: isMe ? `${T.accent}0F` : T.card,
								borderRadius: 14,
								padding: "12px 14px",
								boxShadow: isMe
									? `inset 0 0 0 1.5px ${T.accent}66`
									: `inset 0 0 0 1px ${T.line}`,
							}}
						>
							<span
								style={{
									fontFamily: "Archivo",
									fontWeight: 900,
									fontSize: 17,
									color: medalColor(i),
									width: 20,
									textAlign: "center",
									flexShrink: 0,
								}}
							>
								{rankText(i)}
							</span>
							<Avatar m={item.m} size={32} T={T} />
							<span
								style={{
									flex: 1,
									minWidth: 0,
									fontWeight: 800,
									fontSize: 15,
									color: T.text,
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{item.m.name}
								{isMe ? "（あなた）" : ""}
							</span>
							<span
								style={{
									fontFamily: "Archivo",
									fontWeight: 900,
									fontSize: 18,
									color: T.text,
									flexShrink: 0,
								}}
							>
								{keyOf(item.s)}
								<span style={{ fontSize: 11, color: T.faint, fontWeight: 700 }}>
									{" "}
									pt
								</span>
							</span>
							<Icon name="chevron" size={16} color={T.faint} />
						</button>
					);
				})}
			</div>
		</div>
	);
}

// 国旗＋国名（スコアカード用の1行表示）。code が無く name があれば得点王名として表示。
function RoomFlagName({ T, code, name, size = 18, muted = false }) {
	const TEAM = window.WC.TEAM || {};
	const tm = code ? TEAM[code] : null;
	const hasPick = !!(code || (name && name !== ""));
	const text = name != null && name !== "" ? name : tm ? tm.ja : code;
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				minWidth: 0,
			}}
		>
			{code ? (
				<Flag code={code} size={size} />
			) : name && name !== "" ? (
				<Icon name="boot" size={Math.round(size * 0.85)} color={T.boot} />
			) : null}
			<span
				style={{
					fontWeight: 800,
					fontSize: 14,
					color: hasPick ? (muted ? T.sub : T.text) : T.faint,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{hasPick ? text : "未予想"}
			</span>
		</span>
	);
}

// 的中 / はずれ / 結果待ち / 未予想 のステータスチップ
function RoomStatusTag({ T, kind, pts }) {
	if (kind === "hit") {
		return (
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 4,
					flexShrink: 0,
					background: `${T.accent}1A`,
					color: T.accent,
					fontWeight: 800,
					fontSize: 12,
					padding: "4px 9px",
					borderRadius: 999,
				}}
			>
				<Icon name="check" size={12} color={T.accent} sw={2.6} />
				的中 +{pts}
			</span>
		);
	}
	const label =
		kind === "miss" ? "はずれ" : kind === "pending" ? "結果待ち" : "未予想";
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				flexShrink: 0,
				color: T.faint,
				fontWeight: 700,
				fontSize: 12,
				padding: "4px 2px",
			}}
		>
			{kind === "miss" && (
				<Icon name="close" size={12} color={T.faint} sw={2.6} />
			)}
			{label}
		</span>
	);
}

// コア予想1行（ラベル＋予想国/選手＋ステータス＋はずれ時の正解）
function RoomCorePick({
	T,
	label,
	code,
	name,
	kind,
	pts,
	correctCode,
	correctName,
}) {
	return (
		<div>
			<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
				<span
					style={{
						width: 52,
						flexShrink: 0,
						fontSize: 12,
						fontWeight: 700,
						color: T.sub,
					}}
				>
					{label}
				</span>
				<div style={{ flex: 1, minWidth: 0 }}>
					<RoomFlagName T={T} code={code} name={name} />
				</div>
				<RoomStatusTag T={T} kind={kind} pts={pts} />
			</div>
			{kind === "miss" && (correctCode || correctName) && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						margin: "6px 0 0 62px",
						fontSize: 12,
					}}
				>
					<span style={{ color: T.faint, fontWeight: 700 }}>正解</span>
					<RoomFlagName
						T={T}
						code={correctCode}
						name={correctName}
						size={15}
						muted
					/>
				</div>
			)}
		</div>
	);
}

// グループ順位の予想を全表示（位置ごとに的中✓/はずれ✗）
// 予想チップ（国旗＋国名＋的中✓/はずれ✗/結果待ち＋獲得ポイント）
function RoomResultChip({ T, code, lead, status, pts }) {
	const TEAM = window.WC.TEAM || {};
	const tm = TEAM[code];
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				background: T.panel2,
				borderRadius: 8,
				padding: "3px 7px",
				opacity: status === "miss" ? 0.55 : 1,
			}}
		>
			{lead != null && (
				<span style={{ fontSize: 10, fontWeight: 800, color: T.faint }}>
					{lead}
				</span>
			)}
			<Flag code={code} size={14} />
			<span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
				{tm ? tm.ja : code}
			</span>
			{status === "hit" && (
				<Icon name="check" size={11} color={T.accent} sw={2.6} />
			)}
			{status === "miss" && (
				<Icon name="close" size={11} color={T.faint} sw={2.6} />
			)}
			{status === "hit" && pts ? (
				<span style={{ fontSize: 10, fontWeight: 800, color: T.accent }}>
					+{pts}
				</span>
			) : null}
		</span>
	);
}

// グループ順位の予想を全表示（1〜4位・位置ごとに✓/✗/結果待ち・的中1〜3位は+1）
function RoomGroupRankDetail({ T, pred, grRes }) {
	const GROUPS = window.WC.GROUPS || {};
	const gr = (pred && pred.groupRank) || {};
	const letters = Object.keys(gr)
		.filter((k) => (gr[k] || []).some(Boolean))
		.sort();
	if (!letters.length)
		return (
			<div style={{ fontSize: 12, color: T.faint }}>
				グループ順位の予想はありません。
			</div>
		);
	const POS = ["1位", "2位", "3位", "4位"];
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			{letters.map((k) => {
				const mine = (gr[k] || []).slice(0, 3);
				const members = GROUPS[k] || [];
				// 予想4位 = グループ4チームのうち予想top3に含まれない1チーム
				const myFull =
					mine.length === 3 && members.length === 4
						? [...mine, members.find((c) => !mine.includes(c))]
						: mine.slice();
				const actTop3 = (grRes[k] || []).slice(0, 3);
				const act4 =
					actTop3.filter(Boolean).length === 3 && members.length === 4
						? members.find((c) => !actTop3.includes(c))
						: null;
				const actAt = (i) => (i < 3 ? actTop3[i] : act4);
				return (
					<div
						key={k}
						style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
					>
						<span
							style={{
								width: 16,
								flexShrink: 0,
								fontFamily: "Archivo",
								fontWeight: 900,
								fontSize: 13,
								color: T.sub,
								lineHeight: "24px",
							}}
						>
							{k}
						</span>
						<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
							{myFull.map((code, i) => {
								if (!code) return null;
								const a = actAt(i);
								const decided = !!a;
								const status = !decided
									? "pending"
									: code === a
										? "hit"
										: "miss";
								return (
									<RoomResultChip
										key={i}
										T={T}
										code={code}
										lead={POS[i]}
										status={status}
										pts={i < 3 ? 1 : 0}
									/>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ノックアウト勝ち上がり予想を全表示。
// 終了したラウンド（満枠＝全試合終了）のみ✗を確定し、未終了の試合は「結果待ち」にする。
function RoomKnockoutDetail({ T, pred, koRes }) {
	const ko = (pred && pred.knockout) || {};
	const order = ["r32", "r16", "qf", "sf"];
	const LENS = { r32: 16, r16: 8, qf: 4, sf: 2 };
	// ラウンド名（ノックアウトは32強から）。各ラウンドの勝ち上がり予想を表示する。
	const LABEL = { r32: "32強", r16: "16強", qf: "8強", sf: "4強" };
	const has = order.some((r) => (ko[r] || []).some(Boolean));
	if (!has)
		return (
			<div style={{ fontSize: 12, color: T.faint }}>
				ノックアウトの予想はありません。
			</div>
		);
	// チーム t が round[ri] へ勝ち上がったか。hit / miss(終了済で外れ) / pending(未終了)。
	const statusOf = (t, ri) => {
		for (let j = 0; j <= ri; j++) {
			const s = order[j];
			const arr = koRes[s] || [];
			if (arr.includes(t)) {
				if (j === ri) return "hit";
				continue;
			}
			// 当該ラウンドが満枠なら全試合終了→脱落確定、未満なら未終了→結果待ち
			return arr.length >= LENS[s] ? "miss" : "pending";
		}
		return "pending";
	};
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			{order.map((r, ri) => {
				const mine = (ko[r] || []).filter(Boolean);
				if (!mine.length) return null;
				return (
					<div
						key={r}
						style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
					>
						<span
							style={{
								width: 30,
								flexShrink: 0,
								fontSize: 11,
								fontWeight: 800,
								color: T.sub,
								lineHeight: "24px",
							}}
						>
							{LABEL[r]}
						</span>
						<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
							{mine.map((code, i) => (
								<RoomResultChip
									key={i}
									T={T}
									code={code}
									status={statusOf(code, ri)}
									pts={1}
								/>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// メンバー詳細: 順位ヘッダー → 予想と結果(コア・国旗+的中) → グループ/ノックアウト(開閉)
// detail は RoomLeaderboard.onSelectMember が渡す {id,member,rank,score,resultsLive,division}
function RoomMemberDetail({
	T,
	state,
	member,
	pred,
	detail,
	isMe,
	wide,
	onBack,
}) {
	const { useState } = React;
	const R = window.WC.RESULT || {};
	const p = pred || {};
	const score = detail.score || roomScoreMember(pred);
	const resultsLive = !!detail.resultsLive;
	const tournamentOver = !!R.champion; // 決勝確定＝得点王が確定するタイミング
	const rank = detail.rank; // number | null（未確定時は null）
	const grRes = window.WC.scoringGroupResult
		? window.WC.scoringGroupResult()
		: R.groupResult || {};
	const koRes = R.knockout || {};
	const [openGroup, setOpenGroup] = useState(false);
	const [openKo, setOpenKo] = useState(false);

	const medal =
		!resultsLive || !rank
			? T.faint
			: rank === 1
				? T.gold
				: rank === 2
					? T.silver
					: rank === 3
						? T.boot
						: T.faint;

	// コア予想のステータス（none=未予想 / pending=結果待ち / hit / miss）
	const champKind = !p.champion
		? "none"
		: !R.champion
			? "pending"
			: score.core.champion > 0
				? "hit"
				: "miss";
	const runnerKind = !p.runnerUp
		? "none"
		: !R.runnerUp
			? "pending"
			: score.core.runnerUp > 0
				? "hit"
				: "miss";
	const scorerSet = !!(p.topScorer && p.topScorer.trim());
	// 得点王は大会終了（決勝確定）まで「結果待ち」にする
	const scorerDecided = tournamentOver && !!(R.topScorer && R.topScorer.trim());
	const scorerKind = !scorerSet
		? "none"
		: !scorerDecided
			? "pending"
			: score.core.topScorer > 0
				? "hit"
				: "miss";

	const koTotal =
		score.option.koHits.r32 +
		score.option.koHits.r16 +
		score.option.koHits.qf +
		score.option.koHits.sf;

	const sectionWrap = {
		background: T.card,
		borderRadius: 18,
		boxShadow: `inset 0 0 0 1px ${T.line}`,
		marginTop: 10,
		overflow: "hidden",
	};
	const collapsible = (title, summary, open, setOpen, body) => (
		<div style={sectionWrap}>
			<button
				onClick={() => setOpen(!open)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					width: "100%",
					border: "none",
					background: "transparent",
					cursor: "pointer",
					fontFamily: "inherit",
					padding: "14px 16px",
					textAlign: "left",
				}}
			>
				<span style={{ fontWeight: 800, fontSize: 14, color: T.text, flex: 1 }}>
					{title}
				</span>
				<span style={{ fontSize: 12, fontWeight: 700, color: T.sub }}>
					{summary}
				</span>
				<div
					style={{
						transform: open ? "rotate(90deg)" : "none",
						transition: ".2s ease",
					}}
				>
					<Icon name="chevron" size={16} color={T.faint} />
				</div>
			</button>
			{open && <div style={{ padding: "0 16px 16px" }}>{body}</div>}
		</div>
	);

	return (
		<div>
			<button
				onClick={onBack}
				style={{
					border: "none",
					background: "transparent",
					color: T.sub,
					fontFamily: "inherit",
					fontWeight: 700,
					fontSize: 13,
					cursor: "pointer",
					display: "inline-flex",
					alignItems: "center",
					gap: 2,
					padding: "2px 0",
					marginBottom: 10,
				}}
			>
				← 順位へ
			</button>

			{/* 予想の最終更新日時 */}
			{roomFmtDateTime(member && member.updatedAt) && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 5,
						margin: "0 2px 10px",
						fontSize: 12,
						color: T.faint,
						fontWeight: 700,
					}}
				>
					<Icon name="refresh" size={12} color={T.faint} sw={2} />
					予想の最終更新 {roomFmtDateTime(member.updatedAt)}
				</div>
			)}

			{/* ヘッダーカード */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					background: T.card,
					borderRadius: 18,
					padding: 16,
					boxShadow: `inset 0 0 0 1px ${T.line}`,
				}}
			>
				<div style={{ width: 40, textAlign: "center", flexShrink: 0 }}>
					<div
						style={{
							fontFamily: "Archivo",
							fontWeight: 900,
							fontSize: 24,
							color: medal,
						}}
					>
						{resultsLive && rank ? rank : "–"}
					</div>
					<div style={{ fontSize: 10, color: T.faint, fontWeight: 700 }}>
						位
					</div>
				</div>
				<Avatar m={member} size={46} T={T} />
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							fontWeight: 800,
							fontSize: 17,
							color: T.text,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{member.name}
						{isMe ? "（あなた）" : ""}
					</div>
					<div
						style={{
							fontSize: 12,
							color: T.faint,
							fontWeight: 700,
							marginTop: 2,
						}}
					>
						{resultsLive ? "現在の順位" : "結果待ち"}
					</div>
				</div>
				<div style={{ textAlign: "right", flexShrink: 0 }}>
					<span
						style={{
							fontFamily: "Archivo",
							fontWeight: 900,
							fontSize: 30,
							color: T.text,
						}}
					>
						{score.grandTotal}
					</span>
					<span style={{ fontSize: 12, color: T.faint, fontWeight: 700 }}>
						{" "}
						pt
					</span>
				</div>
			</div>

			{/* 予想と結果（コア: 優勝/準優勝/得点王） */}
			<div
				style={{
					background: T.card,
					borderRadius: 18,
					padding: 16,
					boxShadow: `inset 0 0 0 1px ${T.line}`,
					marginTop: 10,
				}}
			>
				<div
					style={{
						fontWeight: 800,
						fontSize: 14,
						color: T.text,
						marginBottom: 14,
					}}
				>
					予想と結果
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
					<RoomCorePick
						T={T}
						label="優勝"
						code={p.champion}
						kind={champKind}
						pts={25}
						correctCode={R.champion}
					/>
					<RoomCorePick
						T={T}
						label="準優勝"
						code={p.runnerUp}
						kind={runnerKind}
						pts={15}
						correctCode={R.runnerUp}
					/>
					<RoomCorePick
						T={T}
						label="得点王"
						name={p.topScorer}
						kind={scorerKind}
						pts={20}
						correctName={R.topScorer}
					/>
				</div>
				{!resultsLive && (
					<div
						style={{
							fontSize: 12,
							color: T.faint,
							marginTop: 14,
							lineHeight: 1.5,
						}}
					>
						試合結果が出ると的中・得点が反映されます。
					</div>
				)}
			</div>

			{/* グループ順位（開閉式・全予想に的中マーク） */}
			{collapsible(
				"グループ順位",
				`${score.option.rankHits}/36的中 +${score.option.groupRank}`,
				openGroup,
				setOpenGroup,
				<RoomGroupRankDetail T={T} pred={p} grRes={grRes} />,
			)}

			{/* ノックアウト到達（開閉式・全予想に的中マーク） */}
			{collapsible(
				"ノックアウト到達",
				`${koTotal}的中 +${score.option.knockout}`,
				openKo,
				setOpenKo,
				<RoomKnockoutDetail T={T} pred={p} koRes={koRes} />,
			)}
		</div>
	);
}

// 部屋ビュー: 入室直後はポイント順位リーダーボード（RankingScreen 流用）。
// カードタップで RoomMemberDetail（得点の内訳＋予想内容）へ遷移する。
function RoomCompareScreen({
	T,
	me,
	room,
	goBack,
	wide = false,
	availWidth,
	refreshKey = 0,
}) {
	const { useState, useEffect } = React;
	const [data, setData] = useState(null); // {room, members}
	const [err, setErr] = useState("");
	const [detail, setDetail] = useState(null); // null=リーダーボード / {id,member,rank,score,resultsLive,division}
	const [showInvite, setShowInvite] = useState(false);
	const COLORS = window.WC.MEMBER_COLORS || [
		"#FF8A3D",
		"#34D399",
		"#60A5FA",
		"#F472B6",
		"#A78BFA",
		"#22D3EE",
	];

	function load() {
		return window.WC.Rooms.get(room.id)
			.then((d) => {
				setData(d);
				setErr("");
			})
			.catch((e) => setErr(e.message || "部屋を取得できません"));
	}
	// room 切替 or プル更新(refreshKey)で再取得
	useEffect(() => {
		let alive = true;
		load().then(() => {
			if (!alive) setData(null);
		});
		return () => {
			alive = false;
		};
	}, [room.id, refreshKey]);
	// 部屋を切り替えたら詳細表示はリセット
	useEffect(() => {
		setDetail(null);
	}, [room.id]);

	// publicUser[] → 既存 screens 用の state（members に色/イニシャルを付与。自分を先頭に）
	// 自分のアバターは常にアクセント色（右上のアイコンと一致）。他メンバーはパレット色を順に割当。
	const state = data
		? (() => {
				const ordered = [...data.members].sort((a, b) =>
					a.id === me.id ? -1 : b.id === me.id ? 1 : 0,
				);
				let oi = 0;
				const members = ordered.map((u) => ({
					id: u.id,
					name: u.name || "名無し",
					c: u.id === me.id ? T.accent : COLORS[oi++ % COLORS.length],
					initial: Array.from(u.name || "?")[0] || "?",
					updatedAt: u.updatedAt || null,
				}));
				const preds = {};
				ordered.forEach((u) => {
					preds[u.id] = u.pred || window.WC.emptyPred();
				});
				return { current: me.id, members, preds };
			})()
		: null;

	// 詳細表示中にメンバーが消えた場合の安全策
	const detailMember =
		state && detail ? state.members.find((m) => m.id === detail.id) : null;
	const detailPred = state && detail ? state.preds[detail.id] : null;

	const pad = wide ? "4px 0 24px" : "4px 16px 16px";

	return (
		<div style={{ padding: pad }}>
			{/* 控えめなヘッダー: 一覧へ / 部屋名 / 招待ボタン */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 12,
					flexWrap: "wrap",
				}}
			>
				<button
					onClick={goBack}
					style={{
						border: "none",
						background: "transparent",
						color: T.sub,
						fontFamily: "inherit",
						fontWeight: 700,
						fontSize: 13,
						cursor: "pointer",
						display: "inline-flex",
						alignItems: "center",
						gap: 2,
						padding: "2px 0",
					}}
				>
					← 一覧
				</button>
				<span style={{ color: T.line }}>|</span>
				<span
					style={{
						color: T.sub,
						fontWeight: 700,
						fontSize: 13,
						maxWidth: 150,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{room.name || "部屋"}
				</span>
				<button
					onClick={() => setShowInvite(true)}
					title="仲間を招待"
					style={{
						marginLeft: "auto",
						border: "none",
						borderRadius: 999,
						padding: "6px 13px",
						background: `${T.accent}1A`,
						color: T.accent,
						fontFamily: "inherit",
						fontWeight: 800,
						fontSize: 13,
						cursor: "pointer",
						display: "inline-flex",
						alignItems: "center",
						gap: 5,
					}}
				>
					<Icon name="share" size={14} color={T.accent} sw={2.2} />
					招待
				</button>
			</div>

			{showInvite && (
				<InviteSheet T={T} room={room} onClose={() => setShowInvite(false)} />
			)}

			{err && (
				<div
					style={{
						color: T.danger,
						fontSize: 14,
						fontWeight: 700,
						padding: "12px 0",
					}}
				>
					{err}
				</div>
			)}
			{!data && !err && (
				<div
					style={{
						color: T.faint,
						fontSize: 14,
						padding: "20px 0",
						textAlign: "center",
					}}
				>
					読み込み中…
				</div>
			)}

			{/* 既定: ポイント順位リーダーボード（カードタップで詳細へ） */}
			{state && !detail && (
				<RoomLeaderboard
					T={T}
					state={state}
					wide={wide}
					onSelectMember={setDetail}
				/>
			)}

			{/* メンバー詳細（内訳＋予想内容） */}
			{state && detail && detailMember && (
				<RoomMemberDetail
					T={T}
					state={state}
					member={detailMember}
					pred={detailPred}
					detail={detail}
					isMe={detail.id === me.id}
					wide={wide}
					onBack={() => setDetail(null)}
				/>
			)}
		</div>
	);
}

Object.assign(window, {
	RoomsScreen,
	RoomCompareScreen,
	RoomMemberDetail,
	RoomLeaderboard,
});
