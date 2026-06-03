const { useState, useEffect } = React;

// ノックアウト実結果（採点の正解）。各ラウンド＝その段階に「到達」したチームの集合。
const KNOCKOUT_ROUNDS = [
  { key: 'r32', label: 'ベスト32（勝者16）', cap: 16 },
  { key: 'r16', label: 'ベスト16（勝者8）', cap: 8 },
  { key: 'qf', label: '準々決勝（勝者4）', cap: 4 },
  { key: 'sf', label: '準決勝（勝者2）', cap: 2 },
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

  // ---- 実際の3位枠割当 ----
  function setThird(slot, code) {
    setCfg((c) => {
      const ta = { ...c.result.thirdAssign };
      if (code) ta[slot] = code; else delete ta[slot];
      return { ...c, result: { ...c.result, thirdAssign: ta } };
    });
  }

  // ---- 得点ランキング ----
  function addScorer() { setCfg((c) => ({ ...c, scorers: [...c.scorers, { name: '', goals: 0 }] })); }
  function setScorer(i, patch) { setCfg((c) => ({ ...c, scorers: c.scorers.map((s, j) => (j === i ? { ...s, ...patch } : s)) })); }
  function delScorer(i) { setCfg((c) => ({ ...c, scorers: c.scorers.filter((_, j) => j !== i) })); }

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
          <label>得点王 <input list="scorers" value={cfg.result.topScorer} onChange={(e) => upResult({ topScorer: e.target.value })} style={inputStyle} />
            <datalist id="scorers">{cfg.scorerSuggest.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
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
        <div style={{ fontSize: 13, color: '#9aa', margin: '14px 0 6px', fontWeight: 800 }}>実際の3位枠割当（ノックアウト表の対戦カード用）</div>
        <p style={{ fontSize: 12, color: '#6a7', margin: '0 0 8px' }}>各スロットに、許可グループの実際の3位チームを割り当てます（未割当可）。</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {(window.WC?.WILDCARD_SLOTS || []).map((slot) => {
            const permitted = (window.WC?.PERMITTED || {})[slot] || [];
            const opts = teams.filter((t) => {
              const g = Object.keys(cfg.groups).find((gk) => (cfg.groups[gk] || []).includes(t.code));
              return g && permitted.includes(g);
            });
            return (
              <label key={slot} style={{ fontSize: 12 }}>{slot} <span style={{ color: '#6a7' }}>({permitted.join('/')})</span><br />
                <select value={cfg.result.thirdAssign[slot] || ''} onChange={(e) => setThird(slot, e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {opts.map((t) => <option key={t.code} value={t.code}>{t.flag} {t.ja}</option>)}
                </select>
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="得点ランキング（実際の得点数）">
        {cfg.scorers.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <input value={s.name} placeholder="選手名" onChange={(e) => setScorer(i, { name: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
            <input type="number" min="0" value={s.goals} onChange={(e) => setScorer(i, { goals: Math.max(0, parseInt(e.target.value, 10) || 0) })} style={{ ...inputStyle, width: 70, textAlign: 'center' }} />
            <span style={{ fontSize: 12, color: '#9aa' }}>点</span>
            <button onClick={() => delScorer(i)} style={{ ...inputStyle, cursor: 'pointer', color: '#FF6B6B' }}>削除</button>
          </div>
        ))}
        <button onClick={addScorer} style={{ ...inputStyle, cursor: 'pointer', marginTop: 6 }}>＋ 得点者を追加</button>
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
      const rawKo = baseResult.knockout && typeof baseResult.knockout === 'object' ? baseResult.knockout : {};
      const knockout = { r32: rawKo.r32 || [], r16: rawKo.r16 || [], qf: rawKo.qf || [], sf: rawKo.sf || [] };
      const thirdAssign = baseResult.thirdAssign && typeof baseResult.thirdAssign === 'object' ? baseResult.thirdAssign : {};
      const cfg = {
        ...raw,
        result: { champion: baseResult.champion ?? null, runnerUp: baseResult.runnerUp ?? null, topScorer: baseResult.topScorer ?? '', knockout, thirdAssign },
        scorerSuggest: Array.isArray(raw.scorerSuggest) ? raw.scorerSuggest : [],
        schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
        groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
        groupResult: raw.groupResult && typeof raw.groupResult === 'object' ? raw.groupResult : {},
        groupMatches: raw.groupMatches && typeof raw.groupMatches === 'object' ? raw.groupMatches : {},
        scorers: Array.isArray(raw.scorers) ? raw.scorers : [],
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
