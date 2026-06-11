/* 試合前 ご当地応援バトルのテーマ表。
   国コード(IOC/3文字)ごとに、応援演出と国文字を定義。
   未定義国は DEFAULT_THEME で必ず成立する（破綻させない）。
   Babel前の普通の<script>で読み込み、window.WC.cheerTheme に集約。 */
(() => {
	window.WC = window.WC || {};

	// accent: バー/強調色。colors: 紙吹雪パレット。motifs: 落ちてくるモチーフ。
	// cry: シェア画像と演出に出す国文字。rays: 旗の背後に放射光を出すか。
	const THEME = {
		JPN: {
			cry: "GO JAPAN!",
			accent: "#ff3b6b",
			colors: ["#bc002d", "#ffffff", "#ff7a96"],
			motifs: ["🌸", "🎌"],
			rays: true,
		},
		BRA: {
			cry: "VAI BRASIL!",
			accent: "#2ec27e",
			colors: ["#2ec27e", "#ffd84d", "#1f8f5a"],
			motifs: ["⚽", "🟡", "🟢"],
			rays: false,
		},
		ARG: {
			cry: "VAMOS ARGENTINA!",
			accent: "#6cc4ff",
			colors: ["#6cc4ff", "#ffffff", "#f6d44b"],
			motifs: ["⚽", "☀️"],
			rays: true,
		},
		FRA: {
			cry: "ALLEZ LES BLEUS!",
			accent: "#3b6bff",
			colors: ["#0055a4", "#ffffff", "#ef4135"],
			motifs: ["🐓", "🇫🇷"],
			rays: false,
		},
		ESP: {
			cry: "¡VAMOS ESPAÑA!",
			accent: "#ff5a3c",
			colors: ["#aa151b", "#f1bf00", "#ff5a3c"],
			motifs: ["🐂", "🔴"],
			rays: false,
		},
		GER: {
			cry: "DEUTSCHLAND VOR!",
			accent: "#ffce00",
			colors: ["#000000", "#dd0000", "#ffce00"],
			motifs: ["🦅", "⚽"],
			rays: false,
		},
		ENG: {
			cry: "COME ON ENGLAND!",
			accent: "#e53935",
			colors: ["#ffffff", "#cf142b", "#1d3a8f"],
			motifs: ["🦁", "🏴"],
			rays: false,
		},
		POR: {
			cry: "FORÇA PORTUGAL!",
			accent: "#2ec27e",
			colors: ["#006600", "#ff0000", "#ffd84d"],
			motifs: ["🐓", "⚽"],
			rays: false,
		},
		NED: {
			cry: "HUP HOLLAND!",
			accent: "#ff7a18",
			colors: ["#ff7a18", "#ffffff", "#21468b"],
			motifs: ["🦁", "🟧"],
			rays: false,
		},
		USA: {
			cry: "GO USA!",
			accent: "#3b6bff",
			colors: ["#b22234", "#ffffff", "#3c3b6e"],
			motifs: ["🦅", "⭐"],
			rays: true,
		},
		MEX: {
			cry: "¡VAMOS MÉXICO!",
			accent: "#2ec27e",
			colors: ["#006847", "#ffffff", "#ce1126"],
			motifs: ["🦅", "🌶️"],
			rays: false,
		},
		KOR: {
			cry: "대~한민국!",
			accent: "#e53935",
			colors: ["#c60c30", "#003478", "#ffffff"],
			motifs: ["🐯", "⚽"],
			rays: true,
		},
		CRO: {
			cry: "IDEMO HRVATSKA!",
			accent: "#e53935",
			colors: ["#ff0000", "#ffffff", "#171796"],
			motifs: ["🏁", "⚽"],
			rays: false,
		},
		BEL: {
			cry: "ALLEZ LES DIABLES!",
			accent: "#ffce00",
			colors: ["#000000", "#ffd90c", "#ef3340"],
			motifs: ["😈", "⚽"],
			rays: false,
		},
		ITA: {
			cry: "FORZA AZZURRI!",
			accent: "#3b9bff",
			colors: ["#008c45", "#ffffff", "#cd212a"],
			motifs: ["💙", "⚽"],
			rays: false,
		},
		MAR: {
			cry: "ⵎⵖⵔⵉⴱ! DIMA MAGHRIB!",
			accent: "#2ec27e",
			colors: ["#c1272d", "#006233", "#ffffff"],
			motifs: ["⭐", "⚽"],
			rays: false,
		},
	};

	const DEFAULT_THEME = (team) => {
		const code = (team && team.code) || "";
		return {
			cry: code ? "GO " + code + "!" : "LET'S GO!",
			accent: "#b6ff60",
			colors: ["#b6ff60", "#ffffff", "#caff7a"],
			motifs: ["🎉", "⚽"],
			rays: false,
		};
	};

	// code（と表示用 team）から必ず有効なテーマを返す。
	function get(code, team) {
		return THEME[code] || DEFAULT_THEME(team || { code });
	}

	window.WC.cheerTheme = {
		THEME: THEME,
		DEFAULT_THEME: DEFAULT_THEME,
		get: get,
	};
})();
