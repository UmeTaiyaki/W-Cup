/* 試合前 ご当地応援バトルのテーマ表＋クリーンなSVGモチーフ。
   絵文字は使わず、ベクター形状（24x24 viewBox の単一パス）で演出/シェアを描く。
   未定義国は DEFAULT_THEME で必ず成立する。
   Babel前の普通の<script>で読み込み、window.WC.cheerTheme に集約。 */
(() => {
	window.WC = window.WC || {};

	// 24x24 座標系の単一パス（fill前提）。SVG文字列とCanvas Path2Dの両方で使う。
	const SHAPES = {
		disc: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
		star: "M12 2l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.6l-5.88 3.09 1.12-6.55L2.48 8.92l6.58-.96L12 2Z",
		spark:
			"M12 2c.8 5.2 4 8.4 9.2 9.2C16 12 12.8 15.2 12 20.4 11.2 15.2 8 12 2.8 11.2 8 10.4 11.2 7.2 12 2Z",
		heart:
			"M12 21S3.5 14.5 3.5 8.8C3.5 5.9 5.8 4 8.3 4c1.7 0 3 .9 3.7 2.1C12.7 4.9 14 4 15.7 4c2.5 0 4.8 1.9 4.8 4.8C20.5 14.5 12 21 12 21Z",
		flame:
			"M13 2c.5 3.5 4 5.5 4 9.5a5 5 0 0 1-10 0c0-2 .8-3.2 1.8-4.2 0 1.3.9 2.2 1.9 2.2.6-2.6-.4-5.4 2.3-7.5Z",
		leaf: "M5 19C4 12 8 5 19 5c0 11-7 15-14 14Z",
	};

	function shapeSVG(name, color, size) {
		const d = SHAPES[name] || SHAPES.disc;
		return (
			'<svg width="' +
			size +
			'" height="' +
			size +
			'" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
			'<path d="' +
			d +
			'" fill="' +
			color +
			'"/></svg>'
		);
	}

	// Canvas へモチーフを描く（中心 x,y・一辺 size）。
	function drawShape(ctx, name, x, y, size, color) {
		const d = SHAPES[name] || SHAPES.disc;
		ctx.save();
		ctx.translate(x - size / 2, y - size / 2);
		ctx.scale(size / 24, size / 24);
		ctx.fillStyle = color;
		ctx.fill(new Path2D(d));
		ctx.restore();
	}

	// accent: バー/強調色。colors: 紙吹雪/モチーフのパレット。shapes: 使うSVG形状名。
	// cry: 国文字。rays: 旗背後の放射光を出すか。
	const THEME = {
		JPN: {
			cry: "がんばれニッポン！",
			accent: "#ff3b6b",
			colors: ["#bc002d", "#ffffff", "#ff7a96"],
			shapes: ["spark", "disc"],
			rays: true,
		},
		BRA: {
			cry: "VAI BRASIL!",
			accent: "#2ec27e",
			colors: ["#2ec27e", "#ffd84d", "#1f8f5a"],
			shapes: ["star", "disc"],
			rays: false,
		},
		ARG: {
			cry: "VAMOS ARGENTINA!",
			accent: "#6cc4ff",
			colors: ["#6cc4ff", "#ffffff", "#f6d44b"],
			shapes: ["star", "spark"],
			rays: true,
		},
		FRA: {
			cry: "ALLEZ LES BLEUS!",
			accent: "#3b6bff",
			colors: ["#0055a4", "#ffffff", "#ef4135"],
			shapes: ["star", "disc"],
			rays: false,
		},
		ESP: {
			cry: "¡VAMOS ESPAÑA!",
			accent: "#ff5a3c",
			colors: ["#aa151b", "#f1bf00", "#ff5a3c"],
			shapes: ["star", "flame"],
			rays: false,
		},
		GER: {
			cry: "DEUTSCHLAND VOR!",
			accent: "#ffce00",
			colors: ["#000000", "#dd0000", "#ffce00"],
			shapes: ["star", "spark"],
			rays: false,
		},
		ENG: {
			cry: "COME ON ENGLAND!",
			accent: "#e53935",
			colors: ["#ffffff", "#cf142b", "#1d3a8f"],
			shapes: ["star", "heart"],
			rays: false,
		},
		POR: {
			cry: "FORÇA PORTUGAL!",
			accent: "#2ec27e",
			colors: ["#006600", "#ff0000", "#ffd84d"],
			shapes: ["star", "leaf"],
			rays: false,
		},
		NED: {
			cry: "HUP HOLLAND!",
			accent: "#ff7a18",
			colors: ["#ff7a18", "#ffffff", "#21468b"],
			shapes: ["star", "spark"],
			rays: false,
		},
		USA: {
			cry: "GO USA!",
			accent: "#3b6bff",
			colors: ["#b22234", "#ffffff", "#3c3b6e"],
			shapes: ["star", "spark"],
			rays: true,
		},
		MEX: {
			cry: "¡VAMOS MÉXICO!",
			accent: "#2ec27e",
			colors: ["#006847", "#ffffff", "#ce1126"],
			shapes: ["star", "leaf"],
			rays: false,
		},
		KOR: {
			cry: "대~한민국!",
			accent: "#e53935",
			colors: ["#c60c30", "#003478", "#ffffff"],
			shapes: ["spark", "disc"],
			rays: true,
		},
		CRO: {
			cry: "IDEMO HRVATSKA!",
			accent: "#e53935",
			colors: ["#ff0000", "#ffffff", "#171796"],
			shapes: ["star", "spark"],
			rays: false,
		},
		BEL: {
			cry: "ALLEZ LES DIABLES!",
			accent: "#ffce00",
			colors: ["#000000", "#ffd90c", "#ef3340"],
			shapes: ["star", "flame"],
			rays: false,
		},
		ITA: {
			cry: "FORZA AZZURRI!",
			accent: "#3b9bff",
			colors: ["#008c45", "#ffffff", "#cd212a"],
			shapes: ["star", "heart"],
			rays: false,
		},
		MAR: {
			cry: "DIMA MAGHRIB!",
			accent: "#2ec27e",
			colors: ["#c1272d", "#006233", "#ffffff"],
			shapes: ["star", "spark"],
			rays: false,
		},
	};

	const DEFAULT_THEME = (team) => {
		const code = (team && team.code) || "";
		return {
			cry: code ? "GO " + code + "!" : "LET'S GO!",
			accent: "#b6ff60",
			colors: ["#b6ff60", "#ffffff", "#caff7a"],
			shapes: ["star", "disc"],
			rays: false,
		};
	};

	// 各国語の応援文言（THEMEに無い国も含め広くカバー）。未収録は "GO <CODE>!"。
	const CRY = {
		JPN: "がんばれニッポン！",
		KOR: "대한민국!",
		AUS: "AUSSIE AUSSIE AUSSIE!",
		IRN: "GO TEAM MELLI!",
		KSA: "يا أخضر!",
		QAT: "يلا قطر!",
		BRA: "VAI BRASIL!",
		ARG: "¡VAMOS ARGENTINA!",
		URU: "¡ARRIBA URUGUAY!",
		COL: "¡VAMOS COLOMBIA!",
		ECU: "¡VAMOS ECUADOR!",
		PAR: "¡VAMOS PARAGUAY!",
		PER: "¡ARRIBA PERÚ!",
		CHI: "¡VAMOS CHILE!",
		BOL: "¡VAMOS BOLIVIA!",
		VEN: "¡VAMOS VINOTINTO!",
		MEX: "¡VAMOS MÉXICO!",
		USA: "GO USA!",
		CAN: "GO CANADA GO!",
		CRC: "¡VAMOS TICOS!",
		PAN: "¡VAMOS PANAMÁ!",
		HON: "¡VAMOS HONDURAS!",
		JAM: "GO REGGAE BOYZ!",
		FRA: "ALLEZ LES BLEUS!",
		ESP: "¡VAMOS ESPAÑA!",
		GER: "AUF GEHT'S DEUTSCHLAND!",
		ENG: "COME ON ENGLAND!",
		POR: "FORÇA PORTUGAL!",
		NED: "HUP HOLLAND HUP!",
		ITA: "FORZA AZZURRI!",
		BEL: "ALLEZ LES DIABLES!",
		CRO: "IDEMO HRVATSKA!",
		SUI: "HOPP SCHWIIZ!",
		AUT: "AUF GEHT'S ÖSTERREICH!",
		POL: "POLSKA, BIAŁO-CZERWONI!",
		DEN: "KOM SÅ DANMARK!",
		SWE: "HEJA SVERIGE!",
		NOR: "HEIA NORGE!",
		SRB: "IDEMO SRBIJO!",
		SCO: "COME ON SCOTLAND!",
		WAL: "C'MON CYMRU!",
		TUR: "HAYDİ TÜRKİYE!",
		GRE: "PÁME ELLÁDA!",
		UKR: "VPERED UKRAÏNO!",
		SEN: "ALLEZ LES LIONS!",
		MAR: "DIMA MAGHRIB!",
		EGY: "يلا مصر!",
		TUN: "ALLEZ TUNISIE!",
		ALG: "VIVA L'ALGÉRIE!",
		NGA: "UP NAIJA!",
		GHA: "GO BLACK STARS!",
		CMR: "ALLEZ LES LIONS!",
		CIV: "ALLEZ LES ÉLÉPHANTS!",
		RSA: "GO BAFANA BAFANA!",
		NZL: "GO ALL WHITES!",
	};

	// code（と表示用 team）から必ず有効なテーマを返す。
	// 視覚は THEME（無ければデフォルト）、文言は CRY 優先（無ければ "GO <CODE>!"）。
	function get(code, team) {
		const base = THEME[code] || DEFAULT_THEME(team || { code: code });
		const cry = CRY[code] || base.cry;
		return Object.assign({}, base, { cry: cry });
	}

	window.WC.cheerTheme = {
		THEME: THEME,
		DEFAULT_THEME: DEFAULT_THEME,
		get: get,
		shapeSVG: shapeSVG,
		drawShape: drawShape,
	};
})();
