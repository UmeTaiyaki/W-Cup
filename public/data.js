/* ============================================================
   W杯2026 予想アプリ — データ層
   window.WC に集約。Babel前に普通の<script>で読み込む。
   ============================================================ */
(() => {
	// ---- 出場国プール（48）------------------------------------
	// code / 日本語名 / 国旗 / チームカラー
	const TEAMS = [
		{ code: "MEX", ja: "メキシコ", flag: "🇲🇽", c: "#1E7C45" },
		{ code: "KOR", ja: "韓国", flag: "🇰🇷", c: "#C8334A" },
		{ code: "RSA", ja: "南アフリカ", flag: "🇿🇦", c: "#007A4D" },
		{ code: "CZE", ja: "チェコ", flag: "🇨🇿", c: "#2C5BB5" },
		{ code: "CAN", ja: "カナダ", flag: "🇨🇦", c: "#D9322E" },
		{ code: "SUI", ja: "スイス", flag: "🇨🇭", c: "#D62B30" },
		{ code: "QAT", ja: "カタール", flag: "🇶🇦", c: "#8A1538" },
		{ code: "BIH", ja: "ボスニア・ヘルツェゴビナ", flag: "🇧🇦", c: "#2E4A9E" },
		{ code: "BRA", ja: "ブラジル", flag: "🇧🇷", c: "#FBE14B" },
		{ code: "MAR", ja: "モロッコ", flag: "🇲🇦", c: "#16704A" },
		{
			code: "SCO",
			ja: "スコットランド",
			flag: "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
			c: "#2A5BA8",
		},
		{ code: "HAI", ja: "ハイチ", flag: "🇭🇹", c: "#1E50E6" },
		{ code: "USA", ja: "アメリカ", flag: "🇺🇸", c: "#3B4C99" },
		{ code: "AUS", ja: "オーストラリア", flag: "🇦🇺", c: "#E0A100" },
		{ code: "PAR", ja: "パラグアイ", flag: "🇵🇾", c: "#C8334A" },
		{ code: "TUR", ja: "トルコ", flag: "🇹🇷", c: "#E03A3A" },
		{ code: "GER", ja: "ドイツ", flag: "🇩🇪", c: "#3A3A3A" },
		{ code: "ECU", ja: "エクアドル", flag: "🇪🇨", c: "#F4C430" },
		{ code: "CIV", ja: "コートジボワール", flag: "🇨🇮", c: "#F5821F" },
		{ code: "CUW", ja: "キュラソー", flag: "🇨🇼", c: "#1B2A6B" },
		{ code: "NED", ja: "オランダ", flag: "🇳🇱", c: "#F5821F" },
		{ code: "JPN", ja: "日本", flag: "🇯🇵", c: "#1B2A6B" },
		{ code: "TUN", ja: "チュニジア", flag: "🇹🇳", c: "#C8334A" },
		{ code: "SWE", ja: "スウェーデン", flag: "🇸🇪", c: "#2C7DB5" },
		{ code: "BEL", ja: "ベルギー", flag: "🇧🇪", c: "#D62B30" },
		{ code: "IRN", ja: "イラン", flag: "🇮🇷", c: "#1E8A4C" },
		{ code: "EGY", ja: "エジプト", flag: "🇪🇬", c: "#C8334A" },
		{ code: "NZL", ja: "ニュージーランド", flag: "🇳🇿", c: "#1B2A6B" },
		{ code: "ESP", ja: "スペイン", flag: "🇪🇸", c: "#E03A3A" },
		{ code: "URU", ja: "ウルグアイ", flag: "🇺🇾", c: "#4FA0DA" },
		{ code: "KSA", ja: "サウジアラビア", flag: "🇸🇦", c: "#127A4A" },
		{ code: "CPV", ja: "カーボベルデ", flag: "🇨🇻", c: "#2D5BC4" },
		{ code: "FRA", ja: "フランス", flag: "🇫🇷", c: "#2D5BC4" },
		{ code: "SEN", ja: "セネガル", flag: "🇸🇳", c: "#1E8A4C" },
		{ code: "NOR", ja: "ノルウェー", flag: "🇳🇴", c: "#C63A4A" },
		{ code: "IRQ", ja: "イラク", flag: "🇮🇶", c: "#C8334A" },
		{ code: "ARG", ja: "アルゼンチン", flag: "🇦🇷", c: "#75AADB" },
		{ code: "AUT", ja: "オーストリア", flag: "🇦🇹", c: "#E64A4A" },
		{ code: "ALG", ja: "アルジェリア", flag: "🇩🇿", c: "#16704A" },
		{ code: "JOR", ja: "ヨルダン", flag: "🇯🇴", c: "#C8334A" },
		{ code: "POR", ja: "ポルトガル", flag: "🇵🇹", c: "#1E8A4C" },
		{ code: "COL", ja: "コロンビア", flag: "🇨🇴", c: "#F4C430" },
		{ code: "UZB", ja: "ウズベキスタン", flag: "🇺🇿", c: "#2C7DB5" },
		{ code: "COD", ja: "DRコンゴ", flag: "🇨🇩", c: "#2C9A4A" },
		{
			code: "ENG",
			ja: "イングランド",
			flag: "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
			c: "#E64A4A",
		},
		{ code: "CRO", ja: "クロアチア", flag: "🇭🇷", c: "#D1334A" },
		{ code: "PAN", ja: "パナマ", flag: "🇵🇦", c: "#C8334A" },
		{ code: "GHA", ja: "ガーナ", flag: "🇬🇭", c: "#D6334C" },
	];
	const TEAM = {};
	TEAMS.forEach((t) => {
		TEAM[t.code] = t;
	});

	// 新規参加者に割り当てる色（順番に使用。見比べボードのアバター配色に使用）
	const MEMBER_COLORS = [
		"#FF8A3D",
		"#34D399",
		"#60A5FA",
		"#F472B6",
		"#A78BFA",
		"#22D3EE",
		"#FB7185",
		"#FACC15",
		"#4ADE80",
		"#F87171",
		"#818CF8",
		"#2DD4BF",
	];

	// ---- グループ（A〜L 各4チーム。所属の単一の真実）----------
	const GROUPS = {
		A: ["MEX", "KOR", "RSA", "CZE"],
		B: ["CAN", "SUI", "QAT", "BIH"],
		C: ["BRA", "MAR", "SCO", "HAI"],
		D: ["USA", "AUS", "PAR", "TUR"],
		E: ["GER", "ECU", "CIV", "CUW"],
		F: ["NED", "JPN", "TUN", "SWE"],
		G: ["BEL", "IRN", "EGY", "NZL"],
		H: ["ESP", "URU", "KSA", "CPV"],
		I: ["FRA", "SEN", "NOR", "IRQ"],
		J: ["ARG", "AUT", "ALG", "JOR"],
		K: ["POR", "COL", "UZB", "COD"],
		L: ["ENG", "CRO", "PAN", "GHA"],
	};

	// ---- 結果（確定結果。未確定なら空） ------------------------
	// 実際の大会結果は管理画面(KV)から fetchConfig で取得して上書きされる。
	// 未取得・未確定のあいだは空のまま＝採点は実際に入力された結果のみで行う。
	const RESULT = {
		champion: null,
		runnerUp: null,
		topScorer: "",
		groupResult: {},
		knockout: { r32: [], r16: [], qf: [], sf: [] },
		thirdAssign: {},
	};

	// ---- テーマ（Tweaksで切替） --------------------------------
	const THEMES = {
		pitch: {
			label: "ピッチナイト",
			bg: "#0A1410",
			panel: "#10211A",
			panel2: "#16302410",
			card: "#13241C",
			line: "rgba(255,255,255,0.09)",
			text: "#F3F7F2",
			sub: "rgba(226,240,228,0.62)",
			faint: "rgba(226,240,228,0.4)",
			accent: "#B6FF3C",
			accentInk: "#0A1410",
			gold: "#F6C744",
			silver: "#C9D2DA",
			boot: "#FF8A3D",
			danger: "#FF6B6B",
			dangerSoft: "rgba(255,107,107,0.27)",
			onSolid: "#FFFFFF",
			grad: "radial-gradient(120% 80% at 50% -10%, #16382650 0%, transparent 60%), radial-gradient(90% 55% at 105% 108%, rgba(182,255,60,0.06) 0%, transparent 55%)",
		},
		classic: {
			label: "クラシック",
			bg: "#EEF1F6",
			panel: "#FFFFFF",
			panel2: "#F4F6FA",
			card: "#FFFFFF",
			line: "rgba(20,30,60,0.10)",
			text: "#141B2E",
			sub: "rgba(20,27,46,0.58)",
			faint: "rgba(20,27,46,0.4)",
			accent: "#1E50E6",
			accentInk: "#FFFFFF",
			gold: "#E4A413",
			silver: "#8A97A6",
			boot: "#E2582B",
			danger: "#E5484D",
			dangerSoft: "rgba(229,72,77,0.27)",
			onSolid: "#FFFFFF",
			grad: "radial-gradient(120% 80% at 50% -10%, #1E50E60D 0%, transparent 55%), radial-gradient(90% 55% at 105% 108%, rgba(30,80,230,0.05) 0%, transparent 55%)",
		},
		bold: {
			label: "ボールド",
			bg: "#120B1F",
			panel: "#1E1233",
			panel2: "#241640",
			card: "#1C1030",
			line: "rgba(255,255,255,0.10)",
			text: "#F6F1FF",
			sub: "rgba(232,221,255,0.62)",
			faint: "rgba(232,221,255,0.42)",
			accent: "#FF3D8B",
			accentInk: "#FFFFFF",
			gold: "#FFD23D",
			silver: "#C7CBE0",
			boot: "#21E6C1",
			danger: "#FF6B6B",
			dangerSoft: "rgba(255,107,107,0.27)",
			onSolid: "#FFFFFF",
			grad: "radial-gradient(120% 80% at 50% -10%, #FF3D8B22 0%, transparent 58%), radial-gradient(90% 55% at 105% 108%, rgba(33,230,193,0.06) 0%, transparent 55%)",
		},
	};

	// 空の予想（新規参加者の初期値）。各画面・オンボーディングが window.WC.emptyPred で利用。
	function emptyPred() {
		return {
			champion: null,
			runnerUp: null,
			topScorer: "",
			groupRank: {
				A: [],
				B: [],
				C: [],
				D: [],
				E: [],
				F: [],
				G: [],
				H: [],
				I: [],
				J: [],
				K: [],
				L: [],
			},
			thirdGroups: [], // 3位通過すると予想する8グループ（FIFA Annex C でベスト32の枠へ自動割当）
			knockout: { r32: [], r16: [], qf: [], sf: [] },
		};
	}

	window.WC = {
		TEAMS,
		TEAM,
		MEMBER_COLORS,
		GROUPS,
		GROUP_RESULT: {},
		RESULT,
		THEMES,
		GROUP_MATCHES: {},
		SCORERS: [],
		SQUADS: {},
		emptyPred,
	};

	// ---- 共有設定の取得（KVバックエンド）----------------------
	// 取得成功時に window.WC の各データを上書き。失敗時はデフォルト維持。
	window.WC.SCHEDULE = [];
	window.WC.fetchConfig = async function fetchConfig() {
		try {
			const res = await fetch("/api/config", { cache: "no-store" });
			if (!res.ok) return false;
			const cfg = await res.json();
			if (Array.isArray(cfg.teams) && cfg.teams.length) {
				window.WC.TEAMS = cfg.teams;
				const map = {};
				cfg.teams.forEach((t) => {
					map[t.code] = t;
				});
				window.WC.TEAM = map;
			}
			if (cfg.result && typeof cfg.result === "object") {
				window.WC.RESULT = { ...window.WC.RESULT, ...cfg.result };
			}
			if (Array.isArray(cfg.schedule)) window.WC.SCHEDULE = cfg.schedule;
			if (cfg.groups && typeof cfg.groups === "object")
				window.WC.GROUPS = cfg.groups;
			if (cfg.groupResult && typeof cfg.groupResult === "object") {
				window.WC.GROUP_RESULT = cfg.groupResult;
				window.WC.RESULT = {
					...window.WC.RESULT,
					groupResult: cfg.groupResult,
				};
			}
			if (cfg.groupMatches && typeof cfg.groupMatches === "object") {
				window.WC.GROUP_MATCHES = cfg.groupMatches;
			}
			if (Array.isArray(cfg.scorers)) window.WC.SCORERS = cfg.scorers;
			if (cfg.squads && typeof cfg.squads === "object")
				window.WC.SQUADS = cfg.squads;
			// 得点王エイリアス。生配列を保持し、normalize(変種)→canonical の検索マップを構築。
			if (Array.isArray(cfg.aliases)) {
				window.WC.ALIASES = cfg.aliases;
				window.WC.ALIAS_MAP = window.WC.buildAliasMap
					? window.WC.buildAliasMap(cfg.aliases)
					: {};
			}
			// Turnstile（bot対策）サイトキー。未設定なら null＝フロントは素通り。
			window.WC.TURNSTILE_SITE_KEY = cfg.turnstileSiteKey || null;
			return true;
		} catch (e) {
			return false;
		}
	};

	// ---- 観戦ライブ（/api/live・WATCH_ENABLED）----------------------
	// SportMonks 由来の状態＋スコアを app_code ペアで索引化。OFF/失敗時は空＝既存表示のまま。
	window.WC.LIVE = {};
	// チームロゴ URL 索引（/api/live の image_url 由来）。OFF/失敗時は {} のまま。
	window.WC.TEAM_LOGOS = {};
	// 順不同の app_code ペアキー（schedule の match.a/match.b と突合）
	window.WC.liveKey = function liveKey(a, b) {
		if (!a || !b) return null;
		return [a, b].sort().join("|");
	};
	window.WC.fetchLive = async function fetchLive() {
		try {
			const res = await fetch("/api/live", { cache: "no-store" });
			if (!res.ok) return false;
			const data = await res.json();
			if (!data || data.enabled === false || !Array.isArray(data.fixtures)) {
				window.WC.LIVE = {};
				window.WC.TEAM_LOGOS = {};
				return false;
			}
			const index = {};
			const logos = {};
			for (const fx of data.fixtures) {
				const ha = fx.home && fx.home.app_code;
				const aa = fx.away && fx.away.app_code;
				const key = window.WC.liveKey(ha, aa);
				if (!key) continue; // プレースホルダ(未確定)はスキップ
				index[key] = {
					id: fx.id, // sm_fixture_id（詳細画面遷移に使用）
					status: fx.status, // NS / LIVE / FT
					state_id: fx.state_id,
					starting_at_ts: fx.starting_at_ts ?? null, // キックオフ epoch秒（ポーリング窓判定）
					result_info: fx.result_info || null,
					minute: fx.minute ?? null, // 進行中ピリオドの経過分（無→null）
					added_time: fx.added_time ?? null, // アディショナル分（無→null）
					scores: { [ha]: fx.home.score, [aa]: fx.away.score },
				};
				// ロゴ URL 索引（app_code → image_url）
				if (ha && fx.home.image_url) logos[ha] = fx.home.image_url;
				if (aa && fx.away.image_url) logos[aa] = fx.away.image_url;
			}
			window.WC.LIVE = index;
			window.WC.TEAM_LOGOS = logos;
			return true;
		} catch (e) {
			window.WC.LIVE = {};
			window.WC.TEAM_LOGOS = {};
			return false;
		}
	};
	// ---- 大会結果の自動反映（/api/results）----------------------
	// 手動(config.result)が非空なら手動優先。空フィールドだけ自動導出で埋める。
	function _isEmptyVal(v) {
		if (v == null || v === "") return true;
		if (Array.isArray(v)) return v.length === 0;
		return false;
	}
	// フィールド単位の「手動 ?? 自動」。object 値（groupResult/knockout/bracket）は
	// キー単位で再帰的に空判定して埋める。
	function _mergePreferManual(manual, auto) {
		if (!auto || typeof auto !== "object") return manual;
		const out = Array.isArray(manual) ? manual.slice() : { ...(manual || {}) };
		for (const k of Object.keys(auto)) {
			const mv = out[k];
			const av = auto[k];
			if (av && typeof av === "object" && !Array.isArray(av)) {
				// mv がプリミティブ（型不一致）のときは {} を土台にして文字列展開を防ぐ。
				out[k] = _mergePreferManual(mv && typeof mv === "object" ? mv : {}, av);
			} else if (_isEmptyVal(mv)) {
				out[k] = av;
			}
		}
		return out;
	}
	window.WC.fetchResults = async function fetchResults() {
		try {
			const res = await fetch("/api/results", { cache: "no-store" });
			if (!res.ok) return false;
			const data = await res.json();
			if (!data || data.enabled === false || !data.result) return false;
			window.WC.RESULT = _mergePreferManual(
				window.WC.RESULT || {},
				data.result,
			);
			if (data.result.groupResult) {
				window.WC.GROUP_RESULT = window.WC.RESULT.groupResult;
			}
			if (data.groupMatches) {
				window.WC.GROUP_MATCHES = _mergePreferManual(
					window.WC.GROUP_MATCHES || {},
					data.groupMatches,
				);
			}
			return true;
		} catch (e) {
			return false;
		}
	};
	// ---- チームAI分析（静的JSON /data/ai-teams.json）----------------------
	// 焼き込み済みの分析ドキュメント。未取得は null。失敗時も null
	// （フロントは「分析はまだありません」を表示）。一度取得したら再取得しない。
	window.WC.AI_ANALYSIS = null;
	window.WC.fetchAiAnalysis = async function fetchAiAnalysis() {
		if (window.WC.AI_ANALYSIS) return true;
		try {
			const res = await fetch("/data/ai-teams.json", { cache: "no-store" });
			if (!res.ok) return false;
			const doc = await res.json();
			window.WC.AI_ANALYSIS = doc && typeof doc === "object" ? doc : null;
			return !!window.WC.AI_ANALYSIS;
		} catch (e) {
			window.WC.AI_ANALYSIS = null;
			return false;
		}
	};
	// app_code → チームロゴURL（/api/live 由来）。無ければ null（呼び出し側で絵文字旗にフォールバック）。
	window.WC.teamLogo = function teamLogo(code) {
		if (!code || !window.WC.TEAM_LOGOS) return null;
		return window.WC.TEAM_LOGOS[code] || null;
	};
	// schedule の1試合に対応するライブ情報。未開始/未マッチは null（＝重ねない）。
	window.WC.liveForMatch = function liveForMatch(match) {
		if (!match || !window.WC.LIVE) return null;
		const key = window.WC.liveKey(match.a, match.b);
		if (!key) return null;
		const live = window.WC.LIVE[key];
		if (!live || live.status === "NS") return null;
		return {
			status: live.status,
			state_id: live.state_id ?? null, // ハーフタイム(=3)判定用
			a: live.scores[match.a],
			b: live.scores[match.b],
			result_info: live.result_info,
			minute: live.minute ?? null, // 経過分（LIVE中・進行ピリオドのみ）
			added_time: live.added_time ?? null, // アディショナル分
		};
	};
	// ライブ取得のポーリングを継続すべきか。
	// LIVE が1件でもあれば true。さらに「キックオフ間近〜開始後4時間」の NS 試合があれば true
	// （NS→LIVE 遷移を取りこぼさないため。これが無いと開始前に開いた画面が永久に NS のまま固まる）。
	window.WC.shouldPollLive = function shouldPollLive(nowMs) {
		const live = window.WC.LIVE;
		if (!live) return false;
		const nowSec = (nowMs ?? Date.now()) / 1000;
		const PRE = 300; // キックオフ5分前から
		const POST = 4 * 3600; // 開始後4時間まで（延長/中断の余裕込み）
		return Object.values(live).some((x) => {
			if (!x) return false;
			if (x.status === "LIVE") return true;
			if (x.status === "NS" && x.starting_at_ts != null) {
				return (
					nowSec >= x.starting_at_ts - PRE && nowSec < x.starting_at_ts + POST
				);
			}
			return false;
		});
	};
	// schedule の1試合(app_codeペア)→ sm_fixture_id（未マッチ/未確定は null）
	window.WC.fixtureIdForMatch = function fixtureIdForMatch(match) {
		if (!match || !window.WC.LIVE) return null;
		const key = window.WC.liveKey(match.a, match.b);
		const live = key ? window.WC.LIVE[key] : null;
		return live && live.id != null ? live.id : null;
	};
	// schedule の1試合の「確定結果（終了スコア）」を一元解決する。
	// 優先順: ライブ FT のスコア → GROUP_MATCHES の確定スコア（グループ戦のみ）。
	// まだ終わっていなければ null。戻り値の a/b は match.a/match.b 視点のスコア。
	window.WC.matchResult = function matchResult(match) {
		if (!match) return null;
		const live = window.WC.liveForMatch ? window.WC.liveForMatch(match) : null;
		if (live && live.status === "FT") {
			return { a: live.a ?? 0, b: live.b ?? 0, status: "FT" };
		}
		// グループ戦（round = 'A'〜'L'）は管理者入力スコアを結果として扱う。
		const list = (window.WC.GROUP_MATCHES || {})[match.round];
		if (Array.isArray(list)) {
			for (const g of list) {
				if (!g || g.ga == null || g.gb == null) continue;
				// 自動導出のライブ中エントリは確定結果にしない（順位表表示用に保持されているだけ）。
				// 手動入力エントリ(status 無し)は従来どおり確定結果扱い。
				if (g.status === "LIVE") continue;
				if (g.a === match.a && g.b === match.b)
					return { a: g.ga, b: g.gb, status: "FT" };
				if (g.a === match.b && g.b === match.a)
					return { a: g.gb, b: g.ga, status: "FT" };
			}
		}
		return null;
	};

	// ---- 放送メディア（日本国内・サブスクなび 2026 日程表より）----------------------
	// 全104試合で DAZN(有料) と BS4K(NHK BS4K・無料/要4K設備) は配信あり＝既定値。
	// 地上波(NHK/日テレ/フジ・無料)は一部試合のみ。下表は liveKey 同様のソート済み
	// app_code ペア（決勝Tはスロット表記 '2E|2I' / 'W74|W77'）をキーに地上波局を保持。
	// 3位決定戦・決勝は round で判定して NHK を付与する（スロットが流動的なため）。
	window.WC.MEDIA_TERRESTRIAL = {
		"MEX|RSA": ["NHK"],
		"BIH|CAN": ["NHK"],
		"HAI|SCO": ["NHK"],
		"AUS|TUR": ["日テレ"],
		"JPN|NED": ["NHK"],
		"SWE|TUN": ["日テレ"],
		"CPV|ESP": ["NHK"],
		"BEL|EGY": ["NHK"],
		"FRA|SEN": ["フジ"],
		"ALG|ARG": ["NHK"],
		"COD|POR": ["フジ"],
		"CZE|RSA": ["日テレ"],
		"KOR|MEX": ["NHK"],
		"AUS|USA": ["NHK"],
		"MAR|SCO": ["フジ"],
		"BRA|HAI": ["NHK"],
		"NED|SWE": ["NHK"],
		"CIV|GER": ["日テレ"],
		"JPN|TUN": ["NHK", "日テレ"],
		"ESP|KSA": ["NHK"],
		"NOR|SEN": ["NHK"],
		"POR|UZB": ["NHK"],
		"CRO|PAN": ["フジ"],
		"COD|COL": ["日テレ"],
		"CAN|SUI": ["NHK"],
		"CZE|MEX": ["NHK"],
		"JPN|SWE": ["NHK"],
		"TUR|USA": ["日テレ"],
		"FRA|NOR": ["NHK"],
		"ESP|URU": ["日テレ"],
		"BEL|NZL": ["日テレ"],
		"COL|POR": ["フジ"],
		"ARG|JOR": ["NHK"],
		"2E|2I": ["日テレ"],
		"2K|2L": ["日テレ"],
		"1J|2H": ["日テレ"],
		"W74|W77": ["日テレ"],
		"W83|W84": ["日テレ"],
	};
	// 1試合の放送メディア一覧 → [{ name, kind:'paid'|'free' }]。
	// 既定 DAZN(paid)+BS4K(paid) に、該当すれば地上波(free)を末尾追加。新規配列を返す（不変）。
	window.WC.mediaForMatch = function mediaForMatch(match) {
		const media = [
			{ name: "DAZN", kind: "paid" },
			{ name: "BS4K", kind: "paid" },
		];
		if (!match) return media;
		const key = window.WC.liveKey(match.a, match.b);
		let terrestrial = (key && window.WC.MEDIA_TERRESTRIAL[key]) || null;
		if (!terrestrial && (match.round === "決勝" || match.round === "3位")) {
			terrestrial = ["NHK"];
		}
		return terrestrial
			? [...media, ...terrestrial.map((name) => ({ name, kind: "free" }))]
			: media;
	};
	// /api/fixture?id= を取得。失敗/OFF/未マッチ時は null（既存に波及させない）
	window.WC.fetchFixtureDetail = async function fetchFixtureDetail(id) {
		if (id == null) return null;
		try {
			const res = await fetch("/api/fixture?id=" + encodeURIComponent(id), {
				cache: "no-store",
			});
			if (!res.ok) return null;
			const data = await res.json();
			if (!data || data.enabled === false) return null;
			return data.detail || null;
		} catch (e) {
			return null;
		}
	};
	// /api/player?id= を取得。失敗/OFF/未マッチは null。{profile, seasons} を返す。
	window.WC.fetchPlayerProfile = async function fetchPlayerProfile(id) {
		if (id == null) return null;
		try {
			const res = await fetch("/api/player?id=" + encodeURIComponent(id), {
				cache: "no-store",
			});
			if (!res.ok) return null;
			const data = await res.json();
			if (!data || data.enabled === false || !data.profile) return null;
			return data; // {profile, seasons}
		} catch (e) {
			return null;
		}
	};
})();
