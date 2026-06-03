// 結果スクリーン（読み取り専用）: グループリーグ / ノックアウト / 得点王 の3サブタブ。
function GroupScreen({ T, wide = false }) {
  const [sub, setSub] = React.useState('league'); // 'league' | 'ko' | 'scorer'
  const SUBS = [
    { id: 'league', label: 'グループリーグ' },
    { id: 'ko', label: 'ノックアウト' },
    { id: 'scorer', label: '得点王' },
  ];

  const SubTabs = () => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {SUBS.map((s) => {
        const active = sub === s.id;
        return (
          <button key={s.id} onClick={() => setSub(s.id)} style={{
            border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 999,
            padding: '8px 16px', fontWeight: 800, fontSize: 13.5,
            background: active ? T.accent : T.card,
            color: active ? T.accentInk : T.sub,
            boxShadow: active ? 'none' : `inset 0 0 0 1px ${T.line}`, transition: '.15s' }}>
            {s.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 11, letterSpacing: 1.4, color: T.faint }}>RESULTS</div>
        <div style={{ fontSize: wide ? 24 : 20, fontWeight: 800, color: T.text, marginTop: 2 }}>大会結果</div>
      </div>
      <SubTabs />
      {sub === 'league' && <LeagueTables T={T} />}
      {sub === 'ko' && <KnockoutResults T={T} />}
      {sub === 'scorer' && <ScorerRanking T={T} />}
    </div>
  );
}

// ---- ①グループリーグ（フルリーグ表）----
function LeagueTables({ T }) {
  const GK = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const groups = window.WC.GROUPS || {};
  const matches = window.WC.GROUP_MATCHES || {};
  const gr = window.WC.GROUP_RESULT || {};
  const TEAM = window.WC.TEAM || {};
  const compute = window.WC.computeStandings;

  const Card = ({ k }) => {
    const members = (groups[k] || []).filter(Boolean);
    const ms = matches[k] || [];
    const hasScores = ms.some((m) => typeof m.ga === 'number' && typeof m.gb === 'number');
    const rows = hasScores && compute ? compute(members, ms) : null;
    // フォールバック: 最終順位の並び（数値なし）
    const order = (gr[k] || []).filter(Boolean);
    const fallback = order.length ? [...order, ...members.filter((c) => !order.includes(c))] : members;

    return (
      <div style={{ background: T.card, borderRadius: 18, padding: 14, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 15, color: T.accent }}>GROUP {k}</span>
        </div>
        {rows ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Archivo', fontWeight: 800,
              fontSize: 10, color: T.faint, padding: '0 4px 6px' }}>
              <span style={{ width: 16 }} /><span style={{ flex: 1 }} />
              <span style={{ width: 28, textAlign: 'center' }}>勝点</span>
              <span style={{ width: 18, textAlign: 'center' }}>試</span>
              <span style={{ width: 46, textAlign: 'center' }}>勝分敗</span>
              <span style={{ width: 30, textAlign: 'right' }}>得失</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {rows.map((r, i) => {
                const tm = TEAM[r.code]; if (!tm) return null;
                const posColor = i === 0 ? T.gold : i === 1 ? T.silver : i < 2 ? T.sub : T.faint;
                return (
                  <div key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <span style={{ width: 16, textAlign: 'center', fontFamily: 'Archivo', fontWeight: 800, color: posColor }}>{i + 1}</span>
                    <span style={{ fontSize: 18 }}>{tm.flag}</span>
                    <span style={{ fontWeight: 700, color: T.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tm.ja}</span>
                    <span style={{ width: 28, textAlign: 'center', fontWeight: 900, color: T.text }}>{r.pts}</span>
                    <span style={{ width: 18, textAlign: 'center', color: T.sub }}>{r.played}</span>
                    <span style={{ width: 46, textAlign: 'center', color: T.sub, fontSize: 12 }}>{r.w}-{r.d}-{r.l}</span>
                    <span style={{ width: 30, textAlign: 'right', color: T.sub, fontSize: 12 }}>{r.gd > 0 ? '+' : ''}{r.gd}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {fallback.map((code) => {
              const tm = TEAM[code]; if (!tm) return null;
              const pos = order.length ? order.indexOf(code) : -1;
              const posColor = pos === 0 ? T.gold : pos === 1 ? T.silver : pos >= 0 ? T.sub : T.faint;
              return (
                <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 18, textAlign: 'center', fontFamily: 'Archivo', fontWeight: 800, fontSize: 13, color: posColor }}>{pos >= 0 ? pos + 1 : '–'}</span>
                  <span style={{ fontSize: 20 }}>{tm.flag}</span>
                  <span style={{ fontWeight: 700, color: T.text, fontSize: 14, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tm.ja}</span>
                </div>
              );
            })}
            {fallback.length === 0 && <div style={{ color: T.faint, fontSize: 13 }}>未設定</div>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
      {GK.map((k) => <Card key={k} k={k} />)}
    </div>
  );
}

// ---- ②ノックアウト（ホームと同じ KnockoutView を実結果で）----
function KnockoutResults({ T }) {
  const R = window.WC.RESULT || {};
  const gr = window.WC.GROUP_RESULT || {};
  const TEAM = window.WC.TEAM || {};
  const ROUNDS = ['r32', 'r16', 'qf', 'sf'];
  const LABELS = { r32: 'ベスト32', r16: 'ベスト16', qf: '準々決勝', sf: '準決勝' };
  const der = window.WC.deriveKnockoutFromSets
    ? window.WC.deriveKnockoutFromSets(gr, R.thirdAssign || {}, R.knockout || {})
    : null;
  const champ = R.champion ? TEAM[R.champion] : null;
  const koAny = der && ROUNDS.some((r) => (der.winners[r] || []).some(Boolean));

  if (!der || (!koAny && !champ)) {
    return (
      <div style={{ background: T.card, borderRadius: 16, padding: '26px 18px', textAlign: 'center',
        boxShadow: `inset 0 0 0 1px ${T.line}`, color: T.faint, fontSize: 14, fontWeight: 700 }}>
        ノックアウトの結果はまだありません
      </div>
    );
  }
  return <window.KnockoutView T={T} der={der} champ={champ} ROUNDS={ROUNDS} LABELS={LABELS} />;
}

// ---- ③得点王ランキング ----
function ScorerRanking({ T }) {
  const scorers = [...(window.WC.SCORERS || [])]
    .filter((s) => s && s.name)
    .sort((a, b) => (b.goals || 0) - (a.goals || 0));
  if (scorers.length === 0) {
    return (
      <div style={{ background: T.card, borderRadius: 16, padding: '26px 18px', textAlign: 'center',
        boxShadow: `inset 0 0 0 1px ${T.line}`, color: T.faint, fontSize: 14, fontWeight: 700 }}>
        得点者はまだ登録されていません
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {scorers.map((s, i) => (
        <div key={s.name + i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.card,
          borderRadius: 12, padding: '11px 15px', boxShadow: `inset 0 0 0 1px ${T.line}` }}>
          <span style={{ width: 24, textAlign: 'center', fontFamily: 'Archivo', fontWeight: 900, fontSize: 16,
            color: i === 0 ? T.gold : i === 1 ? T.silver : i === 2 ? '#CD7F32' : T.faint }}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700, color: T.text, fontSize: 15 }}>{s.name}</span>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 18, color: T.accent }}>{s.goals}</span>
          <span style={{ fontSize: 12, color: T.faint, fontWeight: 700 }}>得点</span>
        </div>
      ))}
    </div>
  );
}
