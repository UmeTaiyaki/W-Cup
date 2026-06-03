/* ============================================================
   W杯2026 予想アプリ — データ層
   window.WC に集約。Babel前に普通の<script>で読み込む。
   ============================================================ */
(function () {
  // ---- 出場国プール（48）------------------------------------
  // code / 日本語名 / 国旗 / チームカラー
  const TEAMS = [
    { code: 'MEX', ja: 'メキシコ',             flag: '🇲🇽', c: '#1E7C45' },
    { code: 'KOR', ja: '韓国',                 flag: '🇰🇷', c: '#C8334A' },
    { code: 'RSA', ja: '南アフリカ',           flag: '🇿🇦', c: '#007A4D' },
    { code: 'CZE', ja: 'チェコ',               flag: '🇨🇿', c: '#2C5BB5' },
    { code: 'CAN', ja: 'カナダ',               flag: '🇨🇦', c: '#D9322E' },
    { code: 'SUI', ja: 'スイス',               flag: '🇨🇭', c: '#D62B30' },
    { code: 'QAT', ja: 'カタール',             flag: '🇶🇦', c: '#8A1538' },
    { code: 'BIH', ja: 'ボスニア・ヘルツェゴビナ', flag: '🇧🇦', c: '#2E4A9E' },
    { code: 'BRA', ja: 'ブラジル',             flag: '🇧🇷', c: '#FBE14B' },
    { code: 'MAR', ja: 'モロッコ',             flag: '🇲🇦', c: '#16704A' },
    { code: 'SCO', ja: 'スコットランド',       flag: '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', c: '#2A5BA8' },
    { code: 'HAI', ja: 'ハイチ',               flag: '🇭🇹', c: '#1E50E6' },
    { code: 'USA', ja: 'アメリカ',             flag: '🇺🇸', c: '#3B4C99' },
    { code: 'AUS', ja: 'オーストラリア',       flag: '🇦🇺', c: '#E0A100' },
    { code: 'PAR', ja: 'パラグアイ',           flag: '🇵🇾', c: '#C8334A' },
    { code: 'TUR', ja: 'トルコ',               flag: '🇹🇷', c: '#E03A3A' },
    { code: 'GER', ja: 'ドイツ',               flag: '🇩🇪', c: '#3A3A3A' },
    { code: 'ECU', ja: 'エクアドル',           flag: '🇪🇨', c: '#F4C430' },
    { code: 'CIV', ja: 'コートジボワール',     flag: '🇨🇮', c: '#F5821F' },
    { code: 'CUW', ja: 'キュラソー',           flag: '🇨🇼', c: '#1B2A6B' },
    { code: 'NED', ja: 'オランダ',             flag: '🇳🇱', c: '#F5821F' },
    { code: 'JPN', ja: '日本',                 flag: '🇯🇵', c: '#1B2A6B' },
    { code: 'TUN', ja: 'チュニジア',           flag: '🇹🇳', c: '#C8334A' },
    { code: 'SWE', ja: 'スウェーデン',         flag: '🇸🇪', c: '#2C7DB5' },
    { code: 'BEL', ja: 'ベルギー',             flag: '🇧🇪', c: '#D62B30' },
    { code: 'IRN', ja: 'イラン',               flag: '🇮🇷', c: '#1E8A4C' },
    { code: 'EGY', ja: 'エジプト',             flag: '🇪🇬', c: '#C8334A' },
    { code: 'NZL', ja: 'ニュージーランド',     flag: '🇳🇿', c: '#1B2A6B' },
    { code: 'ESP', ja: 'スペイン',             flag: '🇪🇸', c: '#E03A3A' },
    { code: 'URU', ja: 'ウルグアイ',           flag: '🇺🇾', c: '#4FA0DA' },
    { code: 'KSA', ja: 'サウジアラビア',       flag: '🇸🇦', c: '#127A4A' },
    { code: 'CPV', ja: 'カーボベルデ',         flag: '🇨🇻', c: '#2D5BC4' },
    { code: 'FRA', ja: 'フランス',             flag: '🇫🇷', c: '#2D5BC4' },
    { code: 'SEN', ja: 'セネガル',             flag: '🇸🇳', c: '#1E8A4C' },
    { code: 'NOR', ja: 'ノルウェー',           flag: '🇳🇴', c: '#C63A4A' },
    { code: 'IRQ', ja: 'イラク',               flag: '🇮🇶', c: '#C8334A' },
    { code: 'ARG', ja: 'アルゼンチン',         flag: '🇦🇷', c: '#75AADB' },
    { code: 'AUT', ja: 'オーストリア',         flag: '🇦🇹', c: '#E64A4A' },
    { code: 'ALG', ja: 'アルジェリア',         flag: '🇩🇿', c: '#16704A' },
    { code: 'JOR', ja: 'ヨルダン',             flag: '🇯🇴', c: '#C8334A' },
    { code: 'POR', ja: 'ポルトガル',           flag: '🇵🇹', c: '#1E8A4C' },
    { code: 'COL', ja: 'コロンビア',           flag: '🇨🇴', c: '#F4C430' },
    { code: 'UZB', ja: 'ウズベキスタン',       flag: '🇺🇿', c: '#2C7DB5' },
    { code: 'COD', ja: 'DRコンゴ',             flag: '🇨🇩', c: '#2C9A4A' },
    { code: 'ENG', ja: 'イングランド',         flag: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', c: '#E64A4A' },
    { code: 'CRO', ja: 'クロアチア',           flag: '🇭🇷', c: '#D1334A' },
    { code: 'PAN', ja: 'パナマ',               flag: '🇵🇦', c: '#C8334A' },
    { code: 'GHA', ja: 'ガーナ',               flag: '🇬🇭', c: '#D6334C' },
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

  // ---- グループ（A〜L 各4チーム。所属の単一の真実）----------
  const GROUPS = {
    A: ['MEX', 'KOR', 'RSA', 'CZE'],
    B: ['CAN', 'SUI', 'QAT', 'BIH'],
    C: ['BRA', 'MAR', 'SCO', 'HAI'],
    D: ['USA', 'AUS', 'PAR', 'TUR'],
    E: ['GER', 'ECU', 'CIV', 'CUW'],
    F: ['NED', 'JPN', 'TUN', 'SWE'],
    G: ['BEL', 'IRN', 'EGY', 'NZL'],
    H: ['ESP', 'URU', 'KSA', 'CPV'],
    I: ['FRA', 'SEN', 'NOR', 'IRQ'],
    J: ['ARG', 'AUT', 'ALG', 'JOR'],
    K: ['POR', 'COL', 'UZB', 'COD'],
    L: ['ENG', 'CRO', 'PAN', 'GHA'],
  };

  // ---- 結果（デモ用サンプル） --------------------------------
  // 実際の大会はこれから。順位を見せるためのサンプル結果。
  const RESULT = {
    champion: 'ARG',
    runnerUp: 'FRA',
    topScorer: 'ムバッペ',
    groupResult: {},
    knockout: { r32: [], r16: [], qf: [], sf: [] },
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
      groupRank: { A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [], J: [], K: [], L: [] },
      thirdAssign: { M1: null, M2: null, M7: null, M8: null, M11: null, M12: null, M15: null, M16: null },
      knockout: { r32: [], r16: [], qf: [], sf: [] },
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
        // Phase B: 旧予想にオプションフィールドを補完
        const blank = emptyPred();
        Object.keys(s.preds || {}).forEach((id) => {
          const p = s.preds[id] || {};
          s.preds[id] = {
            champion: p.champion ?? null,
            runnerUp: p.runnerUp ?? null,
            topScorer: p.topScorer ?? '',
            groupRank: p.groupRank || JSON.parse(JSON.stringify(blank.groupRank)),
            thirdAssign: p.thirdAssign || { ...blank.thirdAssign },
            knockout: p.knockout || JSON.parse(JSON.stringify(blank.knockout)),
          };
        });
        // current が消えていたら先頭に
        if (!s.preds[s.current]) s.current = s.members[0].id;
        return s;
      }
    } catch (e) {}
    // 初期化：シードを複製
    const preds = {};
    MEMBERS.forEach(m => {
      const seed = SEED[m.id] || {};
      preds[m.id] = {
        ...emptyPred(),
        champion: seed.champion ?? null,
        runnerUp: seed.runnerUp ?? null,
        topScorer: seed.topScorer ?? '',
      };
    });
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

  window.WC = {
    TEAMS, TEAM, MEMBERS, MEMBER_COLORS, GROUPS, GROUP_RESULT: {},
    RESULT, SEED, SCORER_SUGGEST, THEMES,
    load, save, reset, emptyPred, addMember, removeMember,
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
      if (Array.isArray(cfg.scorerSuggest)) window.WC.SCORER_SUGGEST = cfg.scorerSuggest;
      if (cfg.result && typeof cfg.result === 'object') {
        window.WC.RESULT = { ...window.WC.RESULT, ...cfg.result };
      }
      if (Array.isArray(cfg.schedule)) window.WC.SCHEDULE = cfg.schedule;
      if (cfg.groups && typeof cfg.groups === 'object') window.WC.GROUPS = cfg.groups;
      if (cfg.groupResult && typeof cfg.groupResult === 'object') {
        window.WC.GROUP_RESULT = cfg.groupResult;
        window.WC.RESULT = { ...window.WC.RESULT, groupResult: cfg.groupResult };
      }
      return true;
    } catch (e) {
      return false;
    }
  };
})();
