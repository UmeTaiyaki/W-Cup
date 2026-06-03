const { useState, useEffect } = React;

const ROUNDS = [
  { key: 'r16', label: 'ベスト16進出（8）' },
  { key: 'qf', label: 'ベスト8進出（4）' },
  { key: 'sf', label: 'ベスト4進出（2）' },
  { key: 'final', label: '決勝進出/優勝（1）' },
];

function api(path, opts) {
  return fetch(path, { cache: 'no-store', ...opts });
}

function Login({ onOk, externalError }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setErr('');
    try {
      const r = await api('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      if (r.ok) { onOk(pw); } else { setErr('パスワードが違います'); }
    } catch (e) { setErr('通信エラー'); }
    setBusy(false);
  }
  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontSize: 20 }}>管理ログイン</h1>
      <input type="password" value={pw} autoFocus placeholder="管理パスワード"
        onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #333', background: '#13241C', color: '#fff', fontSize: 16 }} />
      {(err || externalError) && <p style={{ color: '#FF6B6B', fontSize: 13 }}>{err || externalError}</p>}
      <button onClick={submit} disabled={busy || !pw} style={{ marginTop: 14, width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#B6FF3C', color: '#0A1410', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>ログイン</button>
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

function Editor({ password, initial }) {
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
  function upBracket(round, arr) { setCfg((c) => ({ ...c, result: { ...c.result, bracket: { ...c.result.bracket, [round]: arr } } })); }

  // 出場国
  function setTeam(i, patch) { up({ teams: teams.map((t, j) => (j === i ? { ...t, ...patch } : t)) }); }
  function addTeam() { up({ teams: [...teams, { code: '', ja: '', flag: '', c: '#888888' }] }); }
  function delTeam(i) { up({ teams: teams.filter((_, j) => j !== i) }); }

  // bracket toggle
  function toggleBracket(round, code) {
    const cur = cfg.result.bracket[round] || [];
    upBracket(round, cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]);
  }

  // scorerSuggest chips
  const [chip, setChip] = useState('');
  function addChip() { const v = chip.trim(); if (v && !cfg.scorerSuggest.includes(v)) up({ scorerSuggest: [...cfg.scorerSuggest, v] }); setChip(''); }
  function delChip(v) { up({ scorerSuggest: cfg.scorerSuggest.filter((s) => s !== v) }); }

  // schedule
  const sched = cfg.schedule || [];
  function setSched(i, patch) { up({ schedule: sched.map((s, j) => (j === i ? { ...s, ...patch } : s)) }); }
  function addSched() { up({ schedule: [...sched, { date: '', round: '', a: '', b: '', note: '' }] }); }
  function delSched(i) { up({ schedule: sched.filter((_, j) => j !== i) }); }

  async function save() {
    setBusy(true); setMsg('');
    try {
      const r = await api('/api/config', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + password }, body: JSON.stringify(cfg) });
      const data = await r.json().catch(() => ({}));
      if (r.ok) setMsg('✅ 保存しました（' + data.updatedAt + '）');
      else setMsg('❌ ' + (data.error || '保存失敗'));
    } catch (e) { setMsg('❌ 通信エラー'); }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 18px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 22 }}>大会設定 管理</h1>
        <a href="/">予想アプリ →</a>
      </div>

      <Section title="グループ（所属＋最終順位）">
        {GROUP_KEYS.map((k) => {
          const members = cfg.groups[k] || ['', '', '', ''];
          const memberTeams = teams.filter((t) => (cfg.groups[k] || []).includes(t.code));
          const ranks = cfg.groupResult[k] || [];
          return (
            <div key={k} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #222' }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>グループ {k}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {[0, 1, 2, 3].map((i) => (
                  <TeamSelect key={i} teams={teams} value={members[i]} onChange={(c) => setGroupMember(k, i, c)} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: '#9aa', marginBottom: 4 }}>最終順位</div>
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

      <Section title={`出場国（${teams.length}）`}>
        {teams.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <input value={t.code} placeholder="CODE" onChange={(e) => setTeam(i, { code: e.target.value.toUpperCase() })} style={{ ...inputStyle, width: 70 }} />
            <input value={t.ja} placeholder="国名" onChange={(e) => setTeam(i, { ja: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            <input value={t.flag} placeholder="🏳" onChange={(e) => setTeam(i, { flag: e.target.value })} style={{ ...inputStyle, width: 60 }} />
            <input type="color" value={t.c || '#888888'} onChange={(e) => setTeam(i, { c: e.target.value })} style={{ width: 36, height: 34, padding: 0, border: 'none', background: 'none' }} />
            <button onClick={() => delTeam(i)} style={{ ...inputStyle, cursor: 'pointer', color: '#FF6B6B' }}>削除</button>
          </div>
        ))}
        <button onClick={addTeam} style={{ ...inputStyle, cursor: 'pointer', marginTop: 6 }}>＋ 出場国を追加</button>
      </Section>

      <Section title="正解（勝敗）">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <label>優勝 <TeamSelect teams={teams} value={cfg.result.champion} onChange={(c) => upResult({ champion: c })} /></label>
          <label>準優勝 <TeamSelect teams={teams} value={cfg.result.runnerUp} onChange={(c) => upResult({ runnerUp: c })} /></label>
          <label>得点王 <input list="scorers" value={cfg.result.topScorer} onChange={(e) => upResult({ topScorer: e.target.value })} style={inputStyle} />
            <datalist id="scorers">{cfg.scorerSuggest.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
        </div>
        {ROUNDS.map((r) => (
          <div key={r.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: '#9aa', marginBottom: 4 }}>{r.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {teams.map((t) => {
                const on = (cfg.result.bracket[r.key] || []).includes(t.code);
                return (
                  <button key={t.code} onClick={() => toggleBracket(r.key, t.code)} style={{ ...inputStyle, cursor: 'pointer', background: on ? '#B6FF3C' : '#0f1a15', color: on ? '#0A1410' : '#ccc', fontWeight: on ? 800 : 400 }}>{t.flag} {t.code}</button>
                );
              })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="得点王候補（将来の選手名簿の足場）">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {cfg.scorerSuggest.map((s) => (
            <span key={s} style={{ ...inputStyle, display: 'inline-flex', gap: 6 }}>{s}<a onClick={() => delChip(s)} style={{ cursor: 'pointer' }}>×</a></span>
          ))}
        </div>
        <input value={chip} placeholder="名前を追加" onChange={(e) => setChip(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addChip(); }} style={inputStyle} />
        <button onClick={addChip} style={{ ...inputStyle, cursor: 'pointer', marginLeft: 6 }}>追加</button>
      </Section>

      <Section title="試合日程（参考）">
        {sched.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={s.date} onChange={(e) => setSched(i, { date: e.target.value })} style={inputStyle} />
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
  const [password, setPassword] = useState('');
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  async function afterLogin(pw) {
    setPassword(pw); setLoading(true); setLoadError('');
    try {
      const r = await api('/api/config');
      const raw = await r.json();
      // 正規化（欠損フィールド補完・イミュータブル）
      const baseResult = raw.result && typeof raw.result === 'object' ? raw.result : {};
      const rawBracket = baseResult.bracket && typeof baseResult.bracket === 'object' ? baseResult.bracket : {};
      const bracket = { r16: rawBracket.r16 || [], qf: rawBracket.qf || [], sf: rawBracket.sf || [], final: rawBracket.final || [] };
      const cfg = {
        ...raw,
        result: { champion: baseResult.champion ?? null, runnerUp: baseResult.runnerUp ?? null, topScorer: baseResult.topScorer ?? '', bracket },
        r16Teams: Array.isArray(raw.r16Teams) && raw.r16Teams.length === 16 ? raw.r16Teams : Array(16).fill(''),
        scorerSuggest: Array.isArray(raw.scorerSuggest) ? raw.scorerSuggest : [],
        schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
        groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
        groupResult: raw.groupResult && typeof raw.groupResult === 'object' ? raw.groupResult : {},
      };
      setCfg(cfg);
    } catch (e) { setLoadError('設定の取得に失敗しました。もう一度お試しください'); }
    setLoading(false);
  }

  if (!cfg) return <Login onOk={afterLogin} externalError={loadError} />;
  if (loading) return <p style={{ padding: 40 }}>読み込み中…</p>;
  return <Editor password={password} initial={cfg} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Admin />);
