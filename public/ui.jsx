/* ============================================================
   共有UIコンポーネント（テーマ T はpropで受け取る）
   window に export
   ============================================================ */

// ---- アイコン（SVGストローク系） ----------------------------
function Icon({ name, size = 24, color = 'currentColor', fill = 'none', sw = 1.9 }) {
  const p = { fill: fill === 'none' ? 'none' : color, stroke: fill === 'solid' ? 'none' : color,
              strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    trophy: <g {...p}><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/><path d="M10 14.5V17m4-2.5V17M8 20h8M9 20l.4-3h5.2l.4 3"/></g>,
    boot: <g {...p}><path d="M4 7h4l1 5 8 1c2 .3 3 1.7 3 3.5V19H4V7Z"/><path d="M4 14h5M4 19h17"/></g>,
    medal: <g {...p}><circle cx="12" cy="15" r="5"/><path d="M9 4l3 6 3-6M8.5 4h7M12 13.4l.9 1.7 1.9.2-1.4 1.3.4 1.9-1.8-1-1.8 1 .4-1.9-1.4-1.3 1.9-.2.9-1.7Z"/></g>,
    bracket: <g {...p}><path d="M3 5h5v6h4M3 19h5v-6M16 9h5M16 9v6M16 15h5"/></g>,
    grid: <g {...p}><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></g>,
    people: <g {...p}><circle cx="8.5" cy="9" r="2.6"/><circle cx="16" cy="9.5" r="2.2"/><path d="M3.5 18c.4-2.6 2.4-4.2 5-4.2s4.6 1.6 5 4.2M14.5 14c2.3.1 4 1.6 4.4 4"/></g>,
    edit: <g {...p}><path d="M5 19h14M7 15.5 16 6.5l2 2-9 9-2.6.6.6-2.6Z"/></g>,
    check: <g {...p}><path d="M5 12.5 10 17l9-10"/></g>,
    close: <g {...p}><path d="M6 6l12 12M18 6 6 18"/></g>,
    plus: <g {...p}><path d="M12 5v14M5 12h14"/></g>,
    trash: <g {...p}><path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13"/></g>,
    search: <g {...p}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></g>,
    chevron: <g {...p}><path d="M9 6l6 6-6 6"/></g>,
    flame: <g {...p}><path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1 .4-2 1-2.5C9 11 12 9 12 3Z"/></g>,
    refresh: <g {...p}><path d="M4 12a8 8 0 0 1 14-5m1-3v4h-4M20 12a8 8 0 0 1-14 5m-1 3v-4h4"/></g>,
    star: <g {...p}><path d="M12 3.5l2.5 5.3 5.5.7-4 3.9 1 5.6L12 16.9 7 19l1-5.6-4-3.9 5.5-.7L12 3.5Z"/></g>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      {paths[name] || null}
    </svg>
  );
}

// ---- 国旗バッジ（角丸で旗をクロップ） ----------------------
function Flag({ code, size = 30, T }) {
  const t = window.WC.TEAM[code];
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.95, lineHeight: 1, flexShrink: 0,
      background: 'rgba(255,255,255,0.06)',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
      userSelect: 'none',
    }}>
      <span style={{ transform: 'scale(1.35)' }}>{t ? t.flag : '🏳️'}</span>
    </div>
  );
}

// ---- チーム行（旗＋名前＋コード） ---------------------------
function TeamLine({ code, T, size = 30, big = false, codeRight = true }) {
  const t = window.WC.TEAM[code];
  if (!t) return <span style={{ color: T.faint }}>未選択</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Flag code={code} size={size} T={T} />
      <span style={{
        fontWeight: 700, color: T.text, fontSize: big ? 19 : 15.5,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{t.ja}</span>
      {codeRight && (
        <span style={{
          fontFamily: 'Archivo, system-ui', fontWeight: 700, fontSize: big ? 13 : 11,
          letterSpacing: 1, color: T.faint,
        }}>{t.code}</span>
      )}
    </div>
  );
}

// ---- メンバーアバター --------------------------------------
function Avatar({ m, size = 36, active = false, T }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.42, color: '#fff',
      background: m.c,
      boxShadow: active ? `0 0 0 2.5px ${T.bg}, 0 0 0 4.5px ${m.c}` : 'none',
    }}>{m.initial}</div>
  );
}

// ---- 小さなラベル見出し ------------------------------------
function Eyebrow({ children, color, T }) {
  return (
    <div style={{
      fontFamily: 'Archivo, system-ui', fontWeight: 800, fontSize: 11.5,
      letterSpacing: 2.2, textTransform: 'uppercase',
      color: color || T.accent,
    }}>{children}</div>
  );
}

// ---- カード -------------------------------------------------
function Card({ children, style, T, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: T.card, borderRadius: 20, padding: 16,
      boxShadow: `inset 0 0 0 1px ${T.line}`,
      ...style,
    }}>{children}</div>
  );
}

// ---- ボトムシート / 中央ダイアログ（モーダル） ------------
function Sheet({ open, onClose, children, T, title, centered = false }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: centered ? 'fixed' : 'absolute', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column',
      justifyContent: centered ? 'center' : 'flex-end',
      alignItems: centered ? 'center' : 'stretch',
      padding: centered ? 24 : 0, boxSizing: 'border-box',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.panel,
        borderRadius: centered ? 24 : '26px 26px 0 0',
        width: centered ? '100%' : 'auto', maxWidth: centered ? 460 : 'none',
        boxShadow: centered ? '0 30px 70px rgba(0,0,0,0.4)' : `0 -1px 0 ${T.line}`,
        maxHeight: centered ? '86%' : '82%',
        display: 'flex', flexDirection: 'column',
        paddingBottom: centered ? 18 : 26,
      }}>
        {!centered && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
            <div style={{ width: 38, height: 5, borderRadius: 9, background: T.line }} />
          </div>
        )}
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 18px 6px',
          }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: T.text }}>{title}</span>
            <button onClick={onClose} style={{
              border: 'none', background: T.panel2, width: 30, height: 30, borderRadius: '50%',
              display: 'grid', placeItems: 'center', cursor: 'pointer', color: T.sub,
            }}><Icon name="close" size={18} color={T.sub} /></button>
          </div>
        )}
        <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
      </div>
    </div>
  );
}

// ---- チーム選択シート --------------------------------------
function TeamPicker({ open, onClose, onPick, T, title = 'チームを選ぶ', exclude = [], centered = false }) {
  const [q, setQ] = React.useState('');
  React.useEffect(() => { if (open) setQ(''); }, [open]);
  const list = window.WC.TEAMS.filter(t =>
    !exclude.includes(t.code) &&
    (q === '' || t.ja.includes(q) || t.code.toLowerCase().includes(q.toLowerCase())));
  return (
    <Sheet open={open} onClose={onClose} T={T} title={title} centered={centered}>
      <div style={{ padding: '4px 18px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, background: T.panel2,
          borderRadius: 12, padding: '9px 12px',
        }}>
          <Icon name="search" size={18} color={T.faint} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="国名で検索"
            style={{
              border: 'none', outline: 'none', background: 'transparent',
              color: T.text, fontSize: 16, flex: 1, fontFamily: 'inherit',
            }} />
        </div>
      </div>
      <div style={{ padding: '0 12px' }}>
        {list.map(t => (
          <button key={t.code} onClick={() => { onPick(t.code); onClose(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '10px 8px', borderRadius: 12, textAlign: 'left',
            }}>
            <Flag code={t.code} size={32} T={T} />
            <span style={{ fontWeight: 700, color: T.text, fontSize: 16, flex: 1 }}>{t.ja}</span>
            <span style={{ fontFamily: 'Archivo, system-ui', fontWeight: 700, fontSize: 12,
              letterSpacing: 1, color: T.faint }}>{t.code}</span>
          </button>
        ))}
        {list.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: T.faint }}>該当なし</div>
        )}
      </div>
    </Sheet>
  );
}

// ---- 得点王（自由入力）シート ------------------------------
function ScorerPicker({ open, onClose, onPick, T, value, centered = false }) {
  const [v, setV] = React.useState(value || '');
  React.useEffect(() => { if (open) setV(value || ''); }, [open, value]);
  return (
    <Sheet open={open} onClose={onClose} T={T} title="得点王を予想" centered={centered}>
      <div style={{ padding: '4px 18px 14px' }}>
        <input autoFocus value={v} onChange={e => setV(e.target.value)}
          placeholder="選手名を入力"
          style={{
            width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none',
            background: T.panel2, borderRadius: 14, padding: '14px 16px',
            color: T.text, fontSize: 18, fontWeight: 700, fontFamily: 'inherit',
          }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {window.WC.SCORER_SUGGEST.map(s => (
            <button key={s} onClick={() => setV(s)} style={{
              border: `1px solid ${T.line}`, background: v === s ? T.accent : 'transparent',
              color: v === s ? T.accentInk : T.sub, borderRadius: 999,
              padding: '7px 13px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>{s}</button>
          ))}
        </div>
        <button onClick={() => { onPick(v.trim()); onClose(); }} disabled={!v.trim()}
          style={{
            marginTop: 18, width: '100%', border: 'none', borderRadius: 14,
            padding: '15px', fontSize: 17, fontWeight: 800, cursor: 'pointer',
            background: v.trim() ? T.accent : T.panel2,
            color: v.trim() ? T.accentInk : T.faint, fontFamily: 'inherit',
          }}>決定</button>
      </div>
    </Sheet>
  );
}

Object.assign(window, {
  Icon, Flag, TeamLine, Avatar, Eyebrow, Card, Sheet, TeamPicker, ScorerPicker,
});
