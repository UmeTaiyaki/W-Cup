const { useState, useEffect } = React;

// ノックアウト実結果（採点の正解）。各ラウンド＝その段階に「到達」したチームの集合。
const KNOCKOUT_ROUNDS = [
  { key: 'r32', label: 'ベスト32（勝者16）', cap: 16 },
  { key: 'r16', label: 'ベスト16（勝者8）', cap: 8 },
  { key: 'qf', label: '準々決勝（勝者4）', cap: 4 },
  { key: 'sf', label: '準決勝（勝者2）', cap: 2 },
];

const POS_OPTIONS = ['GK', 'DF', 'MF', 'FW'];

// 得点王セレクト用：国別(optgroup)・全選手。値は `NAME (CODE)`（ui.jsx と同形式）。
const scorerText = (p) => p.name;
const SCORER_FAVORITES = [
  ['FRA', 'MBAPPE'], ['NOR', 'BRAUT HAALAND'], ['ENG', 'KANE'], ['BRA', 'VINI JR.'],
  ['ESP', 'LAMINE YAMAL'], ['ARG', 'MESSI'], ['ARG', 'J. ALVAREZ'], ['ARG', 'L. MARTINEZ'],
  ['BRA', 'RAPHINHA'], ['ENG', 'BELLINGHAM'], ['FRA', 'DEMBELE'], ['POR', 'RONALDO'],
];
function scorerFavorites(cfg) {
  const TEAM = {}; (cfg.teams || []).forEach((t) => { TEAM[t.code] = t; });
  const out = [];
  SCORER_FAVORITES.forEach(([code, name]) => {
    const p = ((cfg.squads || {})[code] || []).find((x) => x.name === name);
    if (!p) return;
    out.push({ value: `${name} (${code})`, label: `${TEAM[code] ? TEAM[code].flag + ' ' : ''}${scorerText(p)}` });
  });
  return out;
}
function scorerGroups(cfg) {
  const TEAM = {}; (cfg.teams || []).forEach((t) => { TEAM[t.code] = t; });
  const KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const seen = new Set();
  const out = [];
  const push = (code) => {
    if (!code || seen.has(code)) return;
    const tm = TEAM[code]; if (!tm) return;
    const players = ((cfg.squads || {})[code] || []).filter((p) => p && p.name);
    if (!players.length) return;
    seen.add(code);
    out.push({ code, label: `${tm.flag} ${tm.ja}`, players });
  };
  KEYS.forEach((k) => ((cfg.groups || {})[k] || []).filter(Boolean).forEach(push));
  (cfg.teams || []).forEach((t) => push(t.code));
  return out;
}

function api(path, opts) {
  return fetch(path, { cache: 'no-store', ...opts });
}

const loginInputStyle = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #333', background: '#13241C', color: '#fff', fontSize: 16 };
const loginButtonStyle = { marginTop: 14, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#B6FF3C', color: '#0A1410', fontWeight: 800, fontSize: 15, cursor: 'pointer' };

// 2段階ログイン: ① パスワード → ② メール宛OTP。
// ① 成功時はトークンを発行せず challengeId を受け取り OTP 入力へ遷移。
// ② OTP 照合成功で初めてセッショントークンを受け取り onOk(token)。
function Login({ onOk, externalError }) {
  const [stage, setStage] = useState('password'); // 'password' | 'otp'
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitPassword() {
    setBusy(true); setErr('');
    try {
      const r = await api('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.requiresOtp && data.challengeId) {
        setChallengeId(data.challengeId); setCode(''); setStage('otp');
      } else if (r.status === 429) {
        setErr(data.error || '試行が多すぎます。少し待って再度お試しください');
      } else if (r.status === 503 || r.status === 502) {
        setErr(data.error || '認証コードを送信できませんでした。時間をおいて再度お試しください');
      } else {
        setErr('パスワードが違います');
      }
    } catch (e) { setErr('通信エラー'); }
    setBusy(false);
  }

  function backToPassword(message) { setStage('password'); setChallengeId(''); setCode(''); setErr(message || ''); }

  async function submitOtp() {
    setBusy(true); setErr('');
    try {
      const r = await api('/api/auth-verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId, code }) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.token) { onOk(data.token); return; }
      if (data.reason === 'expired' || data.reason === 'too_many_attempts') { backToPassword(data.error); }
      else if (r.status === 429) { setErr(data.error || '試行が多すぎます。少し待って再度お試しください'); }
      else { setErr(data.error || 'コードが違います'); }
    } catch (e) { setErr('通信エラー'); }
    setBusy(false);
  }

  if (stage === 'otp') {
    return (
      <div style={{ maxWidth: 360, margin: '80px auto', padding: 24 }}>
        <h1 style={{ fontSize: 20 }}>認証コード入力</h1>
        <p style={{ fontSize: 13, color: '#9fb' }}>登録メールに送信した6桁のコードを入力してください。</p>
        <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} autoFocus placeholder="123456"
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => { if (e.key === 'Enter') submitOtp(); }}
          style={{ ...loginInputStyle, letterSpacing: 6, fontSize: 22, textAlign: 'center' }} />
        {(err || externalError) && <p style={{ color: '#FF6B6B', fontSize: 13 }}>{err || externalError}</p>}
        <button onClick={submitOtp} disabled={busy || code.length < 6} style={loginButtonStyle}>{busy ? '確認中…' : '認証する'}</button>
        <p style={{ marginTop: 14 }}><a href="#" onClick={(e) => { e.preventDefault(); backToPassword(); }}>← 最初からやり直す</a></p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontSize: 20 }}>管理ログイン</h1>
      <input type="password" value={pw} autoFocus placeholder="管理パスワード"
        onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitPassword(); }}
        style={loginInputStyle} />
      {(err || externalError) && <p style={{ color: '#FF6B6B', fontSize: 13 }}>{err || externalError}</p>}
      <button onClick={submitPassword} disabled={busy || !pw} style={loginButtonStyle}>{busy ? '送信中…' : 'ログイン'}</button>
      <p style={{ marginTop: 18 }}><a href="/">← 予想アプリに戻る</a></p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ background: '#13241C', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, padding: 18, marginBottom: 18 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>{title}</h2>
      {children}
    </section>
  );
}

const inputStyle = { padding: '8px 10px', borderRadius: 8, border: '1px solid #333', background: '#0f1a15', color: '#fff', fontSize: 14 };

function TeamSelect({ teams, value, onChange, allowEmpty = true }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value || null)} style={inputStyle}>
      {allowEmpty && <option value="">—</option>}
      {teams.map((t) => <option key={t.code} value={t.code}>{t.flag} {t.ja} ({t.code})</option>)}
    </select>
  );
}

function Editor({ token, onAuthExpired, initial }) {
  const [cfg, setCfg] = useState(initial);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const teams = cfg.teams;

  function up(patch) { setCfg((c) => ({ ...c, ...patch })); }
  const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  function setGroupMember(k, i, code) {
    setCfg((c) => {
      const arr = [...(c.groups[k] || ['', '', '', ''])];
      arr[i] = code || '';
      const g = { ...c.groups, [k]: arr };
      const members = new Set(arr.filter(Boolean));
      const gr = { ...c.groupResult, [k]: (c.groupResult[k] || []).filter((x) => !x || members.has(x)) };
      return { ...c, groups: g, groupResult: gr };
    });
  }
  function setGroupRank(k, i, code) {
    setCfg((c) => {
      const gr = { ...c.groupResult, [k]: [...(c.groupResult[k] || ['', '', '', ''])] };
      gr[k][i] = code || '';
      return { ...c, groupResult: gr };
    });
  }
  function upResult(patch) { setCfg((c) => ({ ...c, result: { ...c.result, ...patch } })); }
  function upKnockout(round, arr) { setCfg((c) => ({ ...c, result: { ...c.result, knockout: { ...c.result.knockout, [round]: arr } } })); }

  // knockout toggle（到達チームの集合をトグル）
  function toggleKnockout(round, code) {
    const cur = cfg.result.knockout[round] || [];
    upKnockout(round, cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]);
  }

  // ---- グループ試合スコア ----
  // 現メンバーから6試合のフィクスチャを生成し、既存スコアを {a,b} ペアで引き継ぐ
  function fixturesForCfg(c, k) {
    const members = (c.groups[k] || []).filter(Boolean);
    const gen = window.WC?.generateFixtures ? window.WC.generateFixtures(members) : [];
    const existing = c.groupMatches?.[k] || [];
    const find = (a, b) => existing.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
    return gen.map(({ a, b }) => {
      const e = find(a, b);
      return { a, b, ga: e ? (e.a === a ? e.ga : e.gb) : null, gb: e ? (e.a === a ? e.gb : e.ga) : null };
    });
  }
  function fixturesFor(k) { return fixturesForCfg(cfg, k); }
  function setMatchScore(k, idx, side, val) {
    setCfg((c) => {
      const list = fixturesForCfg(c, k);
      const v = val === '' ? null : Math.max(0, Math.min(99, parseInt(val, 10) || 0));
      list[idx] = { ...list[idx], [side]: v };
      return { ...c, groupMatches: { ...c.groupMatches, [k]: list } };
    });
  }
  function applyStandingsToRank(k) {
    setCfg((c) => {
      const members = (c.groups[k] || []).filter(Boolean);
      const rows = window.WC?.computeStandings ? window.WC.computeStandings(members, fixturesForCfg(c, k)) : [];
      const top = rows.map((r) => r.code).slice(0, 4);
      return { ...c, groupResult: { ...c.groupResult, [k]: top } };
    });
  }

  // ---- 実際に3位通過した8組（FIFA Annex C で枠へ自動割当）----
  function toggleThirdGroup(g) {
    setCfg((c) => {
      const cur = c.result.thirdGroups || [];
      const next = cur.includes(g)
        ? cur.filter((x) => x !== g)
        : (cur.length < 8 ? [...cur, g].sort() : cur);
      // 派生: 各組3位(groupResult[g][2])を Annex C で枠へ割り当てて materialize
      const alloc = window.WC?.resolveThirdAssign ? window.WC.resolveThirdAssign(c.groupResult, next) : {};
      const ta = {};
      Object.keys(alloc).forEach((s) => { if (alloc[s]) ta[s] = alloc[s]; });
      return { ...c, result: { ...c.result, thirdGroups: next, thirdAssign: ta } };
    });
  }

  // ---- 得点ランキング ----
  function addScorer() { setCfg((c) => ({ ...c, scorers: [...c.scorers, { name: '', goals: 0 }] })); }
  function setScorer(i, patch) { setCfg((c) => ({ ...c, scorers: c.scorers.map((s, j) => (j === i ? { ...s, ...patch } : s)) })); }
  function delScorer(i) { setCfg((c) => ({ ...c, scorers: c.scorers.filter((_, j) => j !== i) })); }

  // ---- 国別選手名簿 ----
  const squads = cfg.squads || {};
  const [openSquad, setOpenSquad] = useState(null); // 展開中の国コード
  function setSquadPlayer(code, i, patch) {
    setCfg((c) => {
      const list = (c.squads?.[code] || []).map((p, j) => (j === i ? { ...p, ...patch } : p));
      return { ...c, squads: { ...c.squads, [code]: list } };
    });
  }
  function addSquadPlayer(code) {
    setCfg((c) => ({ ...c, squads: { ...c.squads, [code]: [...(c.squads?.[code] || []), { name: '', pos: '', club: '' }] } }));
  }
  function delSquadPlayer(code, i) {
    setCfg((c) => ({ ...c, squads: { ...c.squads, [code]: (c.squads?.[code] || []).filter((_, j) => j !== i) } }));
  }

  // schedule
  const sched = cfg.schedule || [];
  function setSched(i, patch) { up({ schedule: sched.map((s, j) => (j === i ? { ...s, ...patch } : s)) }); }
  function addSched() { up({ schedule: [...sched, { date: '', time: '', round: '', a: '', b: '', note: '' }] }); }
  function delSched(i) { up({ schedule: sched.filter((_, j) => j !== i) }); }

  async function save() {
    setBusy(true); setMsg('');
    try {
      const r = await api('/api/config', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(cfg) });
      const data = await r.json().catch(() => ({}));
      if (r.ok) setMsg('✅ 保存しました（' + data.updatedAt + '）');
      else if (r.status === 401) { setMsg('❌ セッションの有効期限が切れました。再ログインします'); if (onAuthExpired) onAuthExpired(); }
      else setMsg('❌ ' + (data.error || '保存失敗'));
    } catch (e) { setMsg('❌ 通信エラー'); }
    setBusy(false);
  }

  // 得点王・得点ランキング共通の選手選択肢（名簿の全選手から）
  const scorerFavs = scorerFavorites(cfg);
  const scorerGrps = scorerGroups(cfg);
  const knownScorerValues = new Set([
    ...scorerFavs.map((f) => f.value),
    ...scorerGrps.flatMap((g) => g.players.map((p) => `${p.name} (${g.code})`)),
  ]);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 18px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 22 }}>大会設定 管理</h1>
        <a href="/">予想アプリ →</a>
      </div>

      <Section title="グループ（所属・試合スコア・最終順位）">
        {GROUP_KEYS.map((k) => {
          const members = cfg.groups[k] || ['', '', '', ''];
          const memberTeams = teams.filter((t) => (cfg.groups[k] || []).includes(t.code));
          const ranks = cfg.groupResult[k] || [];
          const nameOf = (code) => { const t = teams.find((x) => x.code === code); return t ? `${t.flag} ${t.ja}` : code; };
          return (
            <div key={k} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #222' }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>グループ {k}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {[0, 1, 2, 3].map((i) => (
                  <TeamSelect key={i} teams={teams} value={members[i]} onChange={(c) => setGroupMember(k, i, c)} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#9aa', margin: '6px 0 4px' }}>試合スコア</div>
              {fixturesFor(k).map((m, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 13 }}>
                  <span style={{ width: 150, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(m.a)}</span>
                  <input type="number" min="0" max="99" value={m.ga ?? ''} onChange={(e) => setMatchScore(k, idx, 'ga', e.target.value)} style={{ ...inputStyle, width: 48, textAlign: 'center' }} />
                  <span>-</span>
                  <input type="number" min="0" max="99" value={m.gb ?? ''} onChange={(e) => setMatchScore(k, idx, 'gb', e.target.value)} style={{ ...inputStyle, width: 48, textAlign: 'center' }} />
                  <span style={{ width: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(m.b)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 4px' }}>
                <span style={{ fontSize: 12, color: '#9aa' }}>最終順位</span>
                <button onClick={() => applyStandingsToRank(k)} style={{ ...inputStyle, cursor: 'pointer', fontSize: 12, padding: '5px 10px' }}>順位表から反映</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[0, 1, 2, 3].map((i) => (
                  <label key={i} style={{ fontSize: 13 }}>{i + 1}位{' '}
                    <TeamSelect teams={memberTeams} value={ranks[i]} onChange={(c) => setGroupRank(k, i, c)} />
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="正解（勝敗）">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <label>優勝 <TeamSelect teams={teams} value={cfg.result.champion} onChange={(c) => upResult({ champion: c })} /></label>
          <label>準優勝 <TeamSelect teams={teams} value={cfg.result.runnerUp} onChange={(c) => upResult({ runnerUp: c })} /></label>
        </div>
        <p style={{ fontSize: 12, color: '#9aa', margin: '4px 0 10px' }}>ノックアウトはベスト32から。各ラウンドの勝者を選択（採点はこの集合との一致で加点）。</p>
        {KNOCKOUT_ROUNDS.map((r) => {
          const sel = cfg.result.knockout[r.key] || [];
          const over = sel.length > r.cap;
          return (
            <div key={r.key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: over ? '#FF6B6B' : '#9aa', marginBottom: 4 }}>
                {r.label} <span style={{ fontWeight: 800 }}>{sel.length}/{r.cap}</span>{over ? ' ⚠ 多すぎます' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {teams.map((t) => {
                  const on = sel.includes(t.code);
                  return (
                    <button key={t.code} onClick={() => toggleKnockout(r.key, t.code)} style={{ ...inputStyle, cursor: 'pointer', background: on ? '#B6FF3C' : '#0f1a15', color: on ? '#0A1410' : '#ccc', fontWeight: on ? 800 : 400 }}>{t.flag} {t.code}</button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 13, color: '#9aa', margin: '14px 0 6px', fontWeight: 800 }}>3位通過した8組（ノックアウト表の対戦カード用）</div>
        <p style={{ fontSize: 12, color: '#6a7', margin: '0 0 8px' }}>
          実際に3位で勝ち上がった8組を選択。ベスト32のどの枠に入るかは FIFA 公式の組み合わせ表（Annex C）で自動決定されます（{(cfg.result.thirdGroups || []).length}/8組）。</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['A','B','C','D','E','F','G','H','I','J','K','L'].map((g) => {
            const code = (cfg.groupResult[g] || [])[2] || '';
            const tm = teams.find((t) => t.code === code);
            const on = (cfg.result.thirdGroups || []).includes(g);
            const blocked = !on && (cfg.result.thirdGroups || []).length >= 8;
            return (
              <button key={g} onClick={() => toggleThirdGroup(g)} disabled={blocked}
                style={{ ...inputStyle, cursor: blocked ? 'default' : 'pointer', opacity: blocked ? 0.4 : 1,
                  background: on ? '#B6FF3C' : '#0f1a15', color: on ? '#0A1410' : '#ccc', fontWeight: on ? 800 : 400 }}>
                {g}: {tm ? `${tm.flag} ${tm.code}` : '3位未確定'}
              </button>
            );
          })}
        </div>
        {(cfg.result.thirdGroups || []).length === 8 && window.WC?.resolveThirdAssign && (() => {
          const alloc = window.WC.resolveThirdAssign(cfg.groupResult, cfg.result.thirdGroups);
          const struct = (window.WC.BRACKET_STRUCTURE || {}).r32 || [];
          const winnerSeed = {};
          struct.forEach((m) => { if (Array.isArray(m.bottom?.wc)) winnerSeed[m.id] = m.top; });
          return (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#6a7', marginBottom: 4 }}>自動割当プレビュー</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(window.WC.WILDCARD_SLOTS || []).map((slot) => {
                  const ws = winnerSeed[slot] || '';
                  const wg = ws[0] || '?';
                  const tcode = alloc[slot];
                  const ttm = teams.find((t) => t.code === tcode);
                  return (
                    <span key={slot} style={{ fontSize: 11, color: '#cde', background: '#0f1a15',
                      borderRadius: 6, padding: '4px 7px' }}>
                      {slot} {wg}1 vs {ttm ? `${ttm.flag}${ttm.code}` : '—'}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Section>

      <Section title="得点王">
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>得点王（正解・採点対象 ＋20点）</div>
        <p style={{ fontSize: 12, color: '#9aa', margin: '0 0 8px' }}>選手名簿の全選手から選択（⭐は注目候補）。予想がこの選手と一致すると加点されます。</p>
        <select className="wc-scorer-select" value={cfg.result.topScorer || ''} onChange={(e) => upResult({ topScorer: e.target.value })} style={{ ...inputStyle, maxWidth: 320 }}>
          <option value="">未選択</option>
          {cfg.result.topScorer && !knownScorerValues.has(cfg.result.topScorer) && (
            <option value={cfg.result.topScorer}>{cfg.result.topScorer}（旧データ）</option>
          )}
          {scorerFavs.length > 0 && (
            <optgroup label="⭐ 得点王候補">
              {scorerFavs.map((f, i) => <option key={'fav' + i} value={f.value}>{'　' + f.label}</option>)}
            </optgroup>
          )}
          {scorerGrps.map((g) => (
            <optgroup key={g.code} label={g.label}>
              {g.players.map((p, i) => <option key={g.code + i} value={`${p.name} (${g.code})`}>{'　' + scorerText(p)}</option>)}
            </optgroup>
          ))}
        </select>

        <div style={{ fontWeight: 800, fontSize: 13, margin: '20px 0 4px', borderTop: '1px solid #222', paddingTop: 16 }}>得点ランキング（実際の得点数）</div>
        <p style={{ fontSize: 12, color: '#9aa', margin: '0 0 8px' }}>選手名簿の全選手から選択。予想アプリのグループ画面に表示される、実際の得点者一覧。</p>
        {cfg.scorers.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <select className="wc-scorer-select" value={s.name || ''} onChange={(e) => setScorer(i, { name: e.target.value })} style={{ ...inputStyle, flex: 1 }}>
              <option value="">選手を選択</option>
              {s.name && !knownScorerValues.has(s.name) && (
                <option value={s.name}>{s.name}（旧データ）</option>
              )}
              {scorerFavs.length > 0 && (
                <optgroup label="⭐ 得点王候補">
                  {scorerFavs.map((f, j) => <option key={'fav' + j} value={f.value}>{'　' + f.label}</option>)}
                </optgroup>
              )}
              {scorerGrps.map((g) => (
                <optgroup key={g.code} label={g.label}>
                  {g.players.map((p, j) => <option key={g.code + j} value={`${p.name} (${g.code})`}>{'　' + scorerText(p)}</option>)}
                </optgroup>
              ))}
            </select>
            <input type="number" min="0" value={s.goals} onChange={(e) => setScorer(i, { goals: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={{ ...inputStyle, width: 70, textAlign: 'center' }} />
            <span style={{ fontSize: 12, color: '#9aa' }}>点</span>
            <button onClick={() => delScorer(i)} style={{ ...inputStyle, cursor: 'pointer', color: '#FF6B6B' }}>削除</button>
          </div>
        ))}
        <button onClick={addScorer} style={{ ...inputStyle, cursor: 'pointer', marginTop: 6 }}>＋ 得点者を追加</button>
      </Section>

      <Section title="選手名簿（国別）">
        <p style={{ fontSize: 12, color: '#9aa', margin: '0 0 12px' }}>
          国をタップして展開し、選手名とポジション（GK/DF/MF/FW）を登録します。予想アプリのグループ表で国名をタップすると表示されます。
        </p>
        {teams.map((t) => {
          const list = squads[t.code] || [];
          const open = openSquad === t.code;
          return (
            <div key={t.code} style={{ marginBottom: 8, border: '1px solid #222', borderRadius: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setOpenSquad(open ? null : t.code)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: open ? '#16271E' : '#0f1a15', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, textAlign: 'left' }}>
                <span style={{ fontSize: 18 }}>{t.flag}</span>
                <span style={{ fontWeight: 700, flex: 1 }}>{t.ja} <span style={{ color: '#6a7', fontWeight: 400 }}>({t.code})</span></span>
                <span style={{ fontSize: 12, color: '#9aa' }}>{list.length}名</span>
                <span style={{ color: '#9aa' }}>{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div style={{ padding: '10px 12px', background: '#0b1410' }}>
                  {list.map((p, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ width: 22, textAlign: 'right', fontSize: 12, color: '#6a7' }}>{i + 1}</span>
                      <select value={p.pos || ''} onChange={(e) => setSquadPlayer(t.code, i, { pos: e.target.value })} style={{ ...inputStyle, width: 70 }}>
                        <option value="">—</option>
                        {POS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <input value={p.name} placeholder="選手名" onChange={(e) => setSquadPlayer(t.code, i, { name: e.target.value })} style={{ ...inputStyle, flex: '1 1 120px', minWidth: 100 }} />
                      <input value={p.club || ''} placeholder="所属クラブ" onChange={(e) => setSquadPlayer(t.code, i, { club: e.target.value })} style={{ ...inputStyle, flex: '2 1 180px', minWidth: 120 }} />
                      <button onClick={() => delSquadPlayer(t.code, i)} style={{ ...inputStyle, cursor: 'pointer', color: '#FF6B6B' }}>削除</button>
                    </div>
                  ))}
                  <button onClick={() => addSquadPlayer(t.code)} style={{ ...inputStyle, cursor: 'pointer', marginTop: 4 }}>＋ 選手を追加</button>
                </div>
              )}
            </div>
          );
        })}
      </Section>

      <Section title="試合日程（参考）">
        {sched.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={s.date} onChange={(e) => setSched(i, { date: e.target.value })} style={inputStyle} />
            <input type="time" value={s.time || ''} onChange={(e) => setSched(i, { time: e.target.value })} style={{ ...inputStyle, width: 110 }} title="日本時間(JST)" />
            <input value={s.round} placeholder="GL/R16..." onChange={(e) => setSched(i, { round: e.target.value })} style={{ ...inputStyle, width: 90 }} />
            <input value={s.a} placeholder="A" onChange={(e) => setSched(i, { a: e.target.value })} style={{ ...inputStyle, width: 80 }} />
            <span>vs</span>
            <input value={s.b} placeholder="B" onChange={(e) => setSched(i, { b: e.target.value })} style={{ ...inputStyle, width: 80 }} />
            <input value={s.note} placeholder="メモ" onChange={(e) => setSched(i, { note: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => delSched(i)} style={{ ...inputStyle, cursor: 'pointer', color: '#FF6B6B' }}>削除</button>
          </div>
        ))}
        <button onClick={addSched} style={{ ...inputStyle, cursor: 'pointer', marginTop: 6 }}>＋ 試合を追加</button>
      </Section>

      <div style={{ position: 'sticky', bottom: 0, background: '#0b0d12', padding: '14px 0', borderTop: '1px solid #222' }}>
        <button onClick={save} disabled={busy} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: '#B6FF3C', color: '#0A1410', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>{busy ? '保存中…' : '保存する'}</button>
        {msg && <p style={{ textAlign: 'center', marginTop: 8 }}>{msg}</p>}
      </div>
    </div>
  );
}

function Admin() {
  const [token, setToken] = useState('');
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  // セッション失効時はトークンと設定を破棄してログイン画面へ戻す。
  function logout() { setToken(''); setCfg(null); setLoadError('セッションの有効期限が切れました。再度ログインしてください'); }

  async function afterLogin(tok) {
    setToken(tok); setLoading(true); setLoadError('');
    try {
      const r = await api('/api/config');
      const raw = await r.json();
      // 正規化（欠損フィールド補完・イミュータブル）
      const baseResult = raw.result && typeof raw.result === 'object' ? raw.result : {};
      const rawKo = baseResult.knockout && typeof baseResult.knockout === 'object' ? baseResult.knockout : {};
      const knockout = { r32: rawKo.r32 || [], r16: rawKo.r16 || [], qf: rawKo.qf || [], sf: rawKo.sf || [] };
      const thirdAssign = baseResult.thirdAssign && typeof baseResult.thirdAssign === 'object' ? baseResult.thirdAssign : {};
      const thirdGroups = Array.isArray(baseResult.thirdGroups) ? baseResult.thirdGroups : [];
      const cfg = {
        ...raw,
        result: { champion: baseResult.champion ?? null, runnerUp: baseResult.runnerUp ?? null, topScorer: baseResult.topScorer ?? '', knockout, thirdAssign, thirdGroups },
        schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
        groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
        groupResult: raw.groupResult && typeof raw.groupResult === 'object' ? raw.groupResult : {},
        groupMatches: raw.groupMatches && typeof raw.groupMatches === 'object' ? raw.groupMatches : {},
        scorers: Array.isArray(raw.scorers) ? raw.scorers : [],
        squads: raw.squads && typeof raw.squads === 'object' ? raw.squads : {},
      };
      setCfg(cfg);
    } catch (e) { setLoadError('設定の取得に失敗しました。もう一度お試しください'); }
    setLoading(false);
  }

  if (!cfg) return <Login onOk={afterLogin} externalError={loadError} />;
  if (loading) return <p style={{ padding: 40 }}>読み込み中…</p>;
  return <Editor token={token} onAuthExpired={logout} initial={cfg} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Admin />);
