/* ============================================================
   W杯2026 予想アプリ — データ層
   window.WC に集約。Babel前に普通の<script>で読み込む。
   ============================================================ */
(function () {
  // ---- 出場国プール（32）------------------------------------
  // code / 日本語名 / 国旗 / チームカラー
  const TEAMS = [
    { code: 'BRA', ja: 'ブラジル',       flag: '🇧🇷', c: '#FBE14B' },
    { code: 'ARG', ja: 'アルゼンチン',   flag: '🇦🇷', c: '#75AADB' },
    { code: 'FRA', ja: 'フランス',       flag: '🇫🇷', c: '#2D5BC4' },
    { code: 'ENG', ja: 'イングランド',   flag: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', c: '#E64A4A' },
    { code: 'ESP', ja: 'スペイン',       flag: '🇪🇸', c: '#E03A3A' },
    { code: 'GER', ja: 'ドイツ',         flag: '🇩🇪', c: '#3A3A3A' },
    { code: 'POR', ja: 'ポルトガル',     flag: '🇵🇹', c: '#1E8A4C' },
    { code: 'NED', ja: 'オランダ',       flag: '🇳🇱', c: '#F5821F' },
    { code: 'ITA', ja: 'イタリア',       flag: '🇮🇹', c: '#2C7DB5' },
    { code: 'BEL', ja: 'ベルギー',       flag: '🇧🇪', c: '#D62B30' },
    { code: 'CRO', ja: 'クロアチア',     flag: '🇭🇷', c: '#D1334A' },
    { code: 'URU', ja: 'ウルグアイ',     flag: '🇺🇾', c: '#4FA0DA' },
    { code: 'COL', ja: 'コロンビア',     flag: '🇨🇴', c: '#F4C430' },
    { code: 'USA', ja: 'アメリカ',       flag: '🇺🇸', c: '#3B4C99' },
    { code: 'MEX', ja: 'メキシコ',       flag: '🇲🇽', c: '#1E7C45' },
    { code: 'CAN', ja: 'カナダ',         flag: '🇨🇦', c: '#D9322E' },
    { code: 'JPN', ja: '日本',           flag: '🇯🇵', c: '#1B2A6B' },
    { code: 'KOR', ja: '韓国',           flag: '🇰🇷', c: '#C8334A' },
    { code: 'MAR', ja: 'モロッコ',       flag: '🇲🇦', c: '#16704A' },
    { code: 'SEN', ja: 'セネガル',       flag: '🇸🇳', c: '#1E8A4C' },
    { code: 'SUI', ja: 'スイス',         flag: '🇨🇭', c: '#D62B30' },
    { code: 'DEN', ja: 'デンマーク',     flag: '🇩🇰', c: '#C63A3A' },
    { code: 'ECU', ja: 'エクアドル',     flag: '🇪🇨', c: '#F4C430' },
    { code: 'NGA', ja: 'ナイジェリア',   flag: '🇳🇬', c: '#1E8A4C' },
    { code: 'AUS', ja: 'オーストラリア', flag: '🇦🇺', c: '#E0A100' },
    { code: 'SRB', ja: 'セルビア',       flag: '🇷🇸', c: '#B23A48' },
    { code: 'POL', ja: 'ポーランド',     flag: '🇵🇱', c: '#D6334C' },
    { code: 'GHA', ja: 'ガーナ',         flag: '🇬🇭', c: '#D6334C' },
    { code: 'EGY', ja: 'エジプト',       flag: '🇪🇬', c: '#C8334A' },
    { code: 'IRN', ja: 'イラン',         flag: '🇮🇷', c: '#1E8A4C' },
    { code: 'KSA', ja: 'サウジアラビア', flag: '🇸🇦', c: '#127A4A' },
    { code: 'NOR', ja: 'ノルウェー',     flag: '🇳🇴', c: '#C63A4A' },
  ];
  const TEAM = {};
  TEAMS.forEach(t => { TEAM[t.code] = t; });

  // ---- 仲間4人（初期サンプル） --------------------------------
  const MEMBERS = [
    { id: 'hikaru', name: 'ひかる', initial: 'ひ', c: '#FF5C7A' },
    { id: 'sobe',   name: 'そべ',   initial: 'そ', c: '#2DD4BF' },
    { id: 'gan',    name: 'ガン',   initial: 'ガ', c: '#FBBF24' },
    { id: 'mizu',   name: '水谷',   initial: '水', c: '#8B7CFF' },
  ];

  // 新規参加者に割り当てる色（順番に使用）
  const MEMBER_COLORS = [
    '#FF8A3D', '#34D399', '#60A5FA', '#F472B6',
    '#A78BFA', '#22D3EE', '#FB7185', '#FACC15',
    '#4ADE80', '#F87171', '#818CF8', '#2DD4BF',
  ];

  // ---- 決勝トーナメント（ベスト16）の組み合わせ --------------
  // 8試合ぶんのチーム（左→右、上から）
  const R16_TEAMS = [
    'BRA', 'MAR',   // M0
    'POR', 'USA',   // M1
    'ARG', 'JPN',   // M2
    'NED', 'MEX',   // M3
    'FRA', 'URU',   // M4
    'ESP', 'CRO',   // M5
    'ENG', 'BEL',   // M6
    'GER', 'COL',   // M7
  ];

  // ---- 配点 ---------------------------------------------------
  const SCORING = {
    champion: 25,
    runnerUp: 15,
    topScorer: 20,
    bracket: { r16: 2, qf: 4, sf: 6, final: 10 }, // 的中1つあたり
  };

  // ---- 結果（デモ用サンプル） --------------------------------
  // 実際の大会はこれから。順位を見せるためのサンプル結果。
  const RESULT = {
    champion: 'ARG',
    runnerUp: 'FRA',
    topScorer: 'ムバッペ',
    bracket: {
      r16:   ['BRA', 'POR', 'ARG', 'NED', 'FRA', 'ESP', 'ENG', 'GER'],
      qf:    ['BRA', 'ARG', 'FRA', 'ENG'],
      sf:    ['ARG', 'FRA'],
      final: ['ARG'],
    },
  };

  // ---- 各メンバーの初期予想（シード） ------------------------
  const SEED = {
    hikaru: {
      champion: 'ARG', runnerUp: 'ENG', topScorer: 'ムバッペ',
      bracket: {
        r16:   ['BRA', 'POR', 'ARG', 'MEX', 'FRA', 'ESP', 'ENG', 'GER'],
        qf:    ['BRA', 'ARG', 'FRA', 'ENG'],
        sf:    ['ARG', 'FRA'],
        final: ['ARG'],
      },
    },
    sobe: {
      champion: 'FRA', runnerUp: 'ARG', topScorer: 'ハーランド',
      bracket: {
        r16:   ['BRA', 'POR', 'ARG', 'NED', 'URU', 'ESP', 'ENG', 'COL'],
        qf:    ['BRA', 'ARG', 'ESP', 'ENG'],
        sf:    ['ARG', 'ENG'],
        final: ['ARG'],
      },
    },
    gan: {
      champion: 'ARG', runnerUp: 'FRA', topScorer: 'メッシ',
      bracket: {
        r16:   ['BRA', 'POR', 'ARG', 'NED', 'FRA', 'ESP', 'ENG', 'GER'],
        qf:    ['BRA', 'ARG', 'FRA', 'ENG'],
        sf:    ['ARG', 'FRA'],
        final: ['ARG'],
      },
    },
    mizu: {
      champion: 'BRA', runnerUp: 'FRA', topScorer: 'ムバッペ',
      bracket: {
        r16:   ['BRA', 'POR', 'ARG', 'NED', 'FRA', 'CRO', 'ENG', 'COL'],
        qf:    ['BRA', 'ARG', 'FRA', 'ENG'],
        sf:    ['ARG', 'FRA'],
        final: ['ARG'],
      },
    },
  };

  // ---- 得点王候補（自由入力のサジェスト用） ------------------
  const SCORER_SUGGEST = [
    'ムバッペ', 'ハーランド', 'メッシ', 'ヴィニシウス', 'ヤマル',
    'ベリンガム', 'ケイン', 'グリーズマン', 'ラウタロ', '三笘',
  ];

  // ---- テーマ（Tweaksで切替） --------------------------------
  const THEMES = {
    pitch: {
      label: 'ピッチナイト',
      bg: '#0A1410', panel: '#10211A', panel2: '#16302410',
      card: '#13241C', line: 'rgba(255,255,255,0.09)',
      text: '#F3F7F2', sub: 'rgba(226,240,228,0.62)', faint: 'rgba(226,240,228,0.4)',
      accent: '#B6FF3C', accentInk: '#0A1410',
      gold: '#F6C744', silver: '#C9D2DA', boot: '#FF8A3D',
      grad: 'radial-gradient(120% 80% at 50% -10%, #16382650 0%, transparent 60%)',
    },
    classic: {
      label: 'クラシック',
      bg: '#EEF1F6', panel: '#FFFFFF', panel2: '#F4F6FA',
      card: '#FFFFFF', line: 'rgba(20,30,60,0.10)',
      text: '#141B2E', sub: 'rgba(20,27,46,0.58)', faint: 'rgba(20,27,46,0.4)',
      accent: '#1E50E6', accentInk: '#FFFFFF',
      gold: '#E4A413', silver: '#8A97A6', boot: '#E2582B',
      grad: 'radial-gradient(120% 80% at 50% -10%, #1E50E60D 0%, transparent 55%)',
    },
    bold: {
      label: 'ボールド',
      bg: '#120B1F', panel: '#1E1233', panel2: '#241640',
      card: '#1C1030', line: 'rgba(255,255,255,0.10)',
      text: '#F6F1FF', sub: 'rgba(232,221,255,0.62)', faint: 'rgba(232,221,255,0.42)',
      accent: '#FF3D8B', accentInk: '#FFFFFF',
      gold: '#FFD23D', silver: '#C7CBE0', boot: '#21E6C1',
      grad: 'radial-gradient(120% 80% at 50% -10%, #FF3D8B22 0%, transparent 58%)',
    },
  };

  // ---- localStorage 永続化 -----------------------------------
  const KEY = 'wc2026_predict_v1';

  // 空の予想（新規参加者の初期値）
  function emptyPred() {
    return {
      champion: null, runnerUp: null, topScorer: '',
      bracket: { r16: [], qf: [], sf: [], final: [] },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        // 旧データ救済：members が無ければ初期メンバーを補完
        if (!Array.isArray(s.members) || !s.members.length) {
          s.members = JSON.parse(JSON.stringify(MEMBERS));
        }
        // current が消えていたら先頭に
        if (!s.preds[s.current]) s.current = s.members[0].id;
        return s;
      }
    } catch (e) {}
    // 初期化：シードを複製
    const preds = {};
    MEMBERS.forEach(m => { preds[m.id] = JSON.parse(JSON.stringify(SEED[m.id])); });
    const init = { current: 'hikaru', members: JSON.parse(JSON.stringify(MEMBERS)), preds };
    save(init);
    return init;
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    return load();
  }

  // ---- 参加者を追加 / 削除 ------------------------------------
  function addMember(state, name) {
    const nm = (name || '').trim();
    if (!nm) return state;
    const id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const members = state.members || [];
    const c = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
    const initial = Array.from(nm)[0] || '?';
    const member = { id, name: nm, initial, c, custom: true };
    const next = {
      ...state,
      members: [...members, member],
      preds: { ...state.preds, [id]: emptyPred() },
      current: id,
    };
    save(next);
    return next;
  }
  function removeMember(state, id) {
    const members = (state.members || []).filter(m => m.id !== id);
    if (!members.length) return state; // 全消しは防ぐ
    const preds = { ...state.preds };
    delete preds[id];
    const current = state.current === id ? members[0].id : state.current;
    const next = { ...state, members, preds, current };
    save(next);
    return next;
  }

  // ---- 採点ロジック ------------------------------------------
  function scoreMember(pred) {
    const s = { champion: 0, runnerUp: 0, topScorer: 0, bracket: 0, total: 0, hits: [] };
    if (pred.champion === window.WC.RESULT.champion) { s.champion = SCORING.champion; }
    if (pred.runnerUp === window.WC.RESULT.runnerUp) { s.runnerUp = SCORING.runnerUp; }
    if (pred.topScorer && window.WC.RESULT.topScorer &&
        pred.topScorer.trim() === window.WC.RESULT.topScorer.trim()) { s.topScorer = SCORING.topScorer; }
    // bracket
    const b = pred.bracket || {};
    const rb = window.WC.RESULT.bracket || {};
    let bp = 0, r16h = 0, qfh = 0, sfh = 0, fh = 0;
    ['r16', 'qf', 'sf', 'final'].forEach(r => {
      const mine = b[r] || [], act = rb[r] || [];
      mine.forEach(code => { if (act.includes(code)) {
        bp += SCORING.bracket[r];
        if (r === 'r16') r16h++; if (r === 'qf') qfh++;
        if (r === 'sf') sfh++; if (r === 'final') fh++;
      }});
    });
    s.bracket = bp;
    s.bracketHits = { r16: r16h, qf: qfh, sf: sfh, final: fh };
    s.total = s.champion + s.runnerUp + s.topScorer + s.bracket;
    return s;
  }

  window.WC = {
    TEAMS, TEAM, MEMBERS, MEMBER_COLORS, R16_TEAMS, SCORING, RESULT, SEED, SCORER_SUGGEST, THEMES,
    load, save, reset, scoreMember, emptyPred, addMember, removeMember,
  };

  // ---- 共有設定の取得（KVバックエンド）----------------------
  // 取得成功時に window.WC の各データを上書き。失敗時はデフォルト維持。
  window.WC.SCHEDULE = [];
  window.WC.fetchConfig = async function fetchConfig() {
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      if (!res.ok) return false;
      const cfg = await res.json();
      if (Array.isArray(cfg.teams) && cfg.teams.length) {
        window.WC.TEAMS = cfg.teams;
        const map = {};
        cfg.teams.forEach((t) => { map[t.code] = t; });
        window.WC.TEAM = map;
      }
      if (Array.isArray(cfg.r16Teams) && cfg.r16Teams.length === 16) {
        window.WC.R16_TEAMS = cfg.r16Teams;
      }
      if (Array.isArray(cfg.scorerSuggest)) window.WC.SCORER_SUGGEST = cfg.scorerSuggest;
      if (cfg.result && typeof cfg.result === 'object') window.WC.RESULT = cfg.result;
      if (Array.isArray(cfg.schedule)) window.WC.SCHEDULE = cfg.schedule;
      return true;
    } catch (e) {
      return false;
    }
  };
})();
