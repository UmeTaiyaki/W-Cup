/* ============================================================
   IdentityGate — 遅延インライン身分作成ゲート
   旧 全画面オンボーディング・ウィザードを置換。
   予想/部屋/アカウントタブに identity が無いとき、タブ内に表示する。
   window.IdentityGate に export。
   props: { T, siteKey, purpose: 'input'|'rooms'|'account', onCreated(user) }
   ============================================================ */

// 8桁コードを XXXX-XXXX 表示に整形
const fmtCode = (c) => (c || "").replace(/(.{4})(?=.)/g, "$1-");

// purpose 別の見出し・説明文
const GATE_COPY = {
	input: {
		title: "予想をはじめよう",
		sub: "ニックネームを決めると予想を入力できます。ログインは不要です。",
	},
	rooms: {
		title: "仲間と見比べよう",
		sub: "ニックネームを決めると部屋を作成・参加できます。ログインは不要です。",
	},
	account: {
		title: "アカウントを作成",
		sub: "ニックネームを決めると予想を保存できます。ログインは不要です。",
	},
};

function IdentityGate({ T, siteKey, purpose = "input", onCreated }) {
	const { useState } = React;
	const [step, setStep] = useState("name"); // name | sync | saved
	const [createdUser, setCreatedUser] = useState(null);
	const [name, setName] = useState("");
	const [codeInput, setCodeInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState("");
	const [copied, setCopied] = useState(false);
	const [token, setToken] = useState(null); // Turnstile トークン（siteKey なしなら不要）
	const [tsKey, setTsKey] = useState(0); // 失敗時にウィジェットを再マウントするためのキー

	const copy = GATE_COPY[purpose] || GATE_COPY.input;

	async function commitName() {
		const nm = name.trim();
		if (!nm || busy) return;
		if (siteKey && !token) {
			setErr("「私はロボットではありません」の確認を完了してください");
			return;
		}
		setBusy(true);
		setErr("");
		try {
			const out = await window.WC.Me.create(nm, token);
			setCreatedUser(out.user);
			setStep("saved");
		} catch (e) {
			setErr(e.message || "作成に失敗しました");
			// Turnstile トークンは使い切りのため、失敗時はウィジェットを作り直す。
			if (siteKey) {
				setToken(null);
				setTsKey((k) => k + 1);
			}
		} finally {
			setBusy(false);
		}
	}

	async function commitSync() {
		const c = codeInput.trim();
		if (!c || busy) return;
		setBusy(true);
		setErr("");
		try {
			const out = await window.WC.Me.sync(c);
			onCreated(out.user);
		} catch (e) {
			setErr(
				e.status === 404
					? "コードに該当するユーザーがいません"
					: e.message || "復元に失敗しました",
			);
		} finally {
			setBusy(false);
		}
	}

	function copyCode() {
		try {
			navigator.clipboard.writeText(createdUser.code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch (e) {}
	}

	// ---- インライン用の枠（タブ内に収まる中央カード）----
	const frame = (children) => (
		<div
			style={{
				maxWidth: 480,
				margin: "0 auto",
				padding: "8px 16px 28px",
				animation: "wcFade .4s ease both",
			}}
		>
			{children}
		</div>
	);

	const primaryBtn = (label, onClick, disabled) => (
		<button
			onClick={onClick}
			disabled={disabled}
			style={{
				width: "100%",
				border: "none",
				borderRadius: 16,
				padding: "15px",
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

	const errLine = err ? (
		<p
			style={{
				color: T.danger,
				fontSize: 13,
				fontWeight: 700,
				margin: "12px 2px 0",
			}}
		>
			{err}
		</p>
	) : null;

	// ============ name ============
	if (step === "name") {
		return frame(
			<div>
				<div
					style={{
						fontSize: 24,
						fontWeight: 900,
						color: T.text,
						letterSpacing: -0.5,
						marginTop: 8,
					}}
				>
					{copy.title} ⚽️
				</div>
				<p
					style={{
						color: T.sub,
						fontSize: 14,
						lineHeight: 1.7,
						margin: "8px 0 22px",
					}}
				>
					<DotBreak>{copy.sub}</DotBreak>
				</p>
				<input
					autoFocus
					value={name}
					maxLength={10}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && name.trim()) commitName();
					}}
					placeholder="ニックネーム（10文字まで）"
					style={{
						width: "100%",
						border: "none",
						outline: "none",
						boxSizing: "border-box",
						background: T.panel2,
						color: T.text,
						fontSize: 17,
						fontFamily: "inherit",
						fontWeight: 700,
						padding: "15px 16px",
						borderRadius: 14,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
					}}
				/>
				<TurnstileWidget
					key={tsKey}
					siteKey={siteKey}
					onToken={setToken}
					theme={T.isDark === false ? "light" : "dark"}
				/>
				{errLine}
				<div style={{ marginTop: 16 }}>
					{primaryBtn(
						busy ? "…" : "はじめる",
						commitName,
						!name.trim() || busy || (siteKey && !token),
					)}
				</div>
				<button
					onClick={() => {
						setErr("");
						setStep("sync");
					}}
					style={{
						marginTop: 18,
						width: "100%",
						border: "none",
						background: "transparent",
						color: T.sub,
						fontFamily: "inherit",
						fontWeight: 700,
						fontSize: 14,
						cursor: "pointer",
						textDecoration: "underline",
						textUnderlineOffset: 3,
					}}
				>
					別の端末から続ける（同期コードを入力）
				</button>
			</div>,
		);
	}

	// ============ sync ============
	if (step === "sync") {
		return frame(
			<div>
				<div
					style={{
						fontSize: 22,
						fontWeight: 900,
						color: T.text,
						marginTop: 8,
					}}
				>
					別の端末から続ける
				</div>
				<p
					style={{
						color: T.sub,
						fontSize: 14,
						lineHeight: 1.7,
						margin: "8px 0 22px",
					}}
				>
					前の端末で表示された同期コードを入力すると、あなたの予想を復元できます。
				</p>
				<input
					autoFocus
					value={codeInput}
					maxLength={12}
					onChange={(e) => setCodeInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && codeInput.trim()) commitSync();
					}}
					placeholder="XXXX-XXXX"
					style={{
						width: "100%",
						border: "none",
						outline: "none",
						boxSizing: "border-box",
						background: T.panel2,
						color: T.text,
						fontSize: 19,
						fontFamily: "Archivo, monospace",
						fontWeight: 800,
						letterSpacing: 3,
						textAlign: "center",
						padding: "15px 16px",
						borderRadius: 14,
						boxShadow: `inset 0 0 0 1px ${T.line}`,
					}}
				/>
				{errLine}
				<div style={{ marginTop: 16 }}>
					{primaryBtn(
						busy ? "…" : "復元する",
						commitSync,
						!codeInput.trim() || busy,
					)}
				</div>
				<button
					onClick={() => {
						setErr("");
						setStep("name");
					}}
					style={{
						marginTop: 18,
						width: "100%",
						border: "none",
						background: "transparent",
						color: T.sub,
						fontFamily: "inherit",
						fontWeight: 700,
						fontSize: 14,
						cursor: "pointer",
					}}
				>
					← 戻る
				</button>
			</div>,
		);
	}

	// ============ saved（作成完了 → 同期コード保存）============
	return frame(
		<div>
			<div style={{ display: "grid", placeItems: "center", marginBottom: 14 }}>
				<div
					style={{
						width: 60,
						height: 60,
						borderRadius: 18,
						background: T.accent,
						display: "grid",
						placeItems: "center",
						boxShadow: `0 10px 30px ${T.accent}40`,
						animation: "wcPop .5s cubic-bezier(.22,1.2,.36,1) both",
					}}
				>
					<Icon name="check" size={34} color={T.accentInk} sw={2.6} />
				</div>
			</div>
			<div
				style={{
					fontSize: 23,
					fontWeight: 900,
					color: T.text,
					textAlign: "center",
				}}
			>
				ようこそ！
			</div>
			<p
				style={{
					color: T.sub,
					fontSize: 14,
					lineHeight: 1.7,
					margin: "10px 0 20px",
					textAlign: "center",
				}}
			>
				{createdUser ? `${createdUser.name} さんとして登録しました。` : ""}
			</p>

			{/* 同期コード */}
			<div
				style={{
					background: T.card,
					borderRadius: 18,
					padding: 18,
					boxShadow: `inset 0 0 0 1px ${T.line}`,
				}}
			>
				<Eyebrow T={T}>あなたの同期コード</Eyebrow>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						marginTop: 10,
					}}
				>
					<div
						style={{
							flex: 1,
							fontFamily: "Archivo, monospace",
							fontWeight: 900,
							fontSize: 26,
							letterSpacing: 3,
							color: T.text,
						}}
					>
						{fmtCode(createdUser && createdUser.code)}
					</div>
					<button
						onClick={copyCode}
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
				<p
					style={{
						color: T.faint,
						fontSize: 12,
						lineHeight: 1.6,
						margin: "12px 0 0",
					}}
				>
					別の端末で予想を続けるときに使います。
					<br />
					<b style={{ color: T.sub }}>無くすと復元できません</b>
					ので、スクショなどで保管してください。
				</p>
			</div>

			<div style={{ marginTop: 20 }}>
				{primaryBtn("はじめる", () => onCreated(createdUser))}
			</div>
		</div>,
	);
}

Object.assign(window, { IdentityGate });
