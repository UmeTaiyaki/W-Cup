/* ============================================================
   レスポンシブ用インフラ
   - useContainerWidth : 要素の幅をResizeObserverで購読
   - Sidebar           : デスクトップの左ナビ（ナビ＋メンバー）
   - RightRail         : スプリット用の右サマリー
   window に export
   ============================================================ */

// 要素幅を購読（ウィンドウではなくコンテナ基準でレスポンシブにする）
function useContainerWidth(ref) {
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return w;
}

// 幅 → モード
function modeFor(w) {
  if (w < 720) return 'mobile';
  if (w < 1040) return 'tablet';
  return 'desktop';
}

// ---- デスクトップ左サイドバー ------------------------------
function Sidebar({ T, t, tab, setTab, tabs, members, current, setCurrent, onAdd, onReset, showWordmark }) {
  const NavItem = ({ tb }) => {
    const active = tab === tb.id;
    return (
      <button onClick={() => setTab(tb.id)} style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        padding: '11px 13px', borderRadius: 13,
        background: active ? `${T.accent}1A` : 'transparent',
        boxShadow: active ? `inset 0 0 0 1px ${T.accent}3D` : 'none',
        color: active ? T.accent : T.sub, transition: '.15s' }}>
        <Icon name={tb.icon} size={21} color={active ? T.accent : T.faint} sw={active ? 2.2 : 1.9} />
        <span style={{ fontWeight: active ? 800 : 700, fontSize: 15 }}>{tb.label}</span>
      </button>
    );
  };

  return (
    <div style={{
      width: 256, flexShrink: 0, height: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '22px 16px 18px',
      background: t.theme === 'classic' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.025)',
      borderRight: `1px solid ${T.line}` }}>

      {/* ロゴ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 16px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: T.accent,
          display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="trophy" size={21} color={T.accentInk} />
        </div>
        {showWordmark && (
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 15.5,
              color: T.text, letterSpacing: 0.3 }}>WORLD CUP 2026</div>
            <div style={{ fontSize: 10.5, color: T.faint, fontWeight: 700, marginTop: 2 }}>仲間内 予想バトル</div>
          </div>
        )}
      </div>

      {/* ナビ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {tabs.map(tb => <NavItem key={tb.id} tb={tb} />)}
      </div>

      {/* メンバー */}
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 10px 8px' }}>
        <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 10,
          letterSpacing: 1.6, color: T.faint }}>メンバー · {members.length}</span>
        <button onClick={onAdd} title="参加者を追加" style={{
          border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid',
          placeItems: 'center', width: 24, height: 24, borderRadius: 7,
          boxShadow: `inset 0 0 0 1.4px ${T.line}` }}>
          <Icon name="plus" size={15} color={T.sub} sw={2.6} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto',
        flex: 1, minHeight: 0, marginRight: -4, paddingRight: 4 }}>
        {members.map(m => {
          const active = m.id === current;
          return (
            <button key={m.id} onClick={() => setCurrent(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              padding: '7px 9px', borderRadius: 11,
              background: active ? T.card : 'transparent',
              boxShadow: active ? `inset 0 0 0 1px ${m.c}59` : 'none', transition: '.15s' }}>
              <Avatar m={m} size={28} T={T} />
              <span style={{ fontWeight: active ? 800 : 600, fontSize: 14,
                color: active ? T.text : T.sub, flex: 1, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
              {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent }} />}
            </button>
          );
        })}
      </div>

      {/* フッター */}
      <button onClick={onReset} style={{
        marginTop: 10, display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        padding: '10px 12px', borderRadius: 11, background: 'transparent', color: T.faint,
        boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <Icon name="refresh" size={16} color={T.faint} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>サンプルに戻す</span>
      </button>
    </div>
  );
}

// ---- スプリット用 右レール ---------------------------------
function RightRail({ T, state, member, pred, goTab }) {
  const champ = window.WC.TEAM[pred.champion];
  const runner = window.WC.TEAM[pred.runnerUp];
  const scored = state.members.map(m => ({ m, s: window.WC.scoreMember(state.preds[m.id]) }))
    .sort((a, b) => b.s.total - a.s.total);
  const rankColor = i => i === 0 ? T.gold : i === 1 ? T.silver : i === 2 ? T.boot : T.faint;

  const PickLine = ({ icon, color, label, code, scorer }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon name={icon} size={16} color={color} />
      <span style={{ fontSize: 12.5, color: T.faint, width: 48, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 18 }}>{code ? (window.WC.TEAM[code]?.flag) : (scorer ? '⚽️' : '—')}</span>
      <span style={{ fontWeight: 700, color: T.text, fontSize: 14, flex: 1, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {code ? window.WC.TEAM[code]?.ja : (scorer || '未選択')}</span>
    </div>
  );

  return (
    <div style={{ width: 300, flexShrink: 0, height: '100%', boxSizing: 'border-box',
      overflowY: 'auto', padding: '24px 20px 24px 4px', display: 'flex',
      flexDirection: 'column', gap: 14 }}>
      {/* 自分の予想 */}
      <div style={{ background: T.card, borderRadius: 20, padding: 16,
        boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Avatar m={member} size={28} T={T} />
            <span style={{ fontWeight: 800, fontSize: 14.5, color: T.text }}>{member.name}の予想</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <PickLine icon="trophy" color={T.gold} label="優勝" code={pred.champion} />
          <PickLine icon="medal" color={T.silver} label="準優勝" code={pred.runnerUp} />
          <PickLine icon="boot" color={T.boot} label="得点王" scorer={pred.topScorer} />
        </div>
        <button onClick={() => goTab('input')} style={{
          marginTop: 16, width: '100%', border: 'none', borderRadius: 12, padding: '11px',
          cursor: 'pointer', background: `${T.accent}1A`, color: T.accent, fontWeight: 800,
          fontSize: 13.5, fontFamily: 'inherit', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 7 }}>
          <Icon name="edit" size={16} color={T.accent} />予想を編集
        </button>
      </div>

      {/* ミニランキング */}
      <div style={{ background: T.card, borderRadius: 20, padding: 16,
        boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 14.5, color: T.text }}>ランキング</span>
          <button onClick={() => goTab('rank')} style={{ border: 'none', background: 'transparent',
            color: T.accent, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 1 }}>
            全部見る<Icon name="chevron" size={13} color={T.accent} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {scored.slice(0, 5).map((x, i) => (
            <div key={x.m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 15,
                color: rankColor(i), width: 16 }}>{i + 1}</span>
              <Avatar m={x.m} size={26} T={T} />
              <span style={{ fontWeight: 700, color: T.sub, fontSize: 13.5, flex: 1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.m.name}</span>
              <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 16,
                color: T.text }}>{x.s.total}</span>
              <span style={{ fontSize: 10.5, color: T.faint, fontWeight: 700 }}>pt</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { useContainerWidth, modeFor, Sidebar, RightRail });
