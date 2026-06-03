/* ============================================================
   画面: 3位ワイルドカード割当（オプション）
   props: T, member, pred, setThirdAssign(slotId, code|null), goBack
   ============================================================ */
function ThirdWildScreen({ T, member, pred, setThirdAssign, goBack, wide = false }) {
  const SLOTS = window.WC.WILDCARD_SLOTS || [];
  const PERMITTED = window.WC.PERMITTED || {};
  const TEAM = window.WC.TEAM || {};
  const gr = pred.groupRank || {};
  const ta = pred.thirdAssign || {};
  const [openSlot, setOpenSlot] = React.useState(null);

  const usedCodes = SLOTS.map((s) => ta[s]).filter(Boolean);
  const doneCount = usedCodes.length;

  // ある枠で選べる候補：許可グループの3位コード（存在するもの）
  function candidates(slot) {
    return (PERMITTED[slot] || [])
      .map((g) => ({ g, code: (gr[g] || [])[2] || null }))
      .filter((x) => x.code);
  }

  function choose(slot, code) {
    setThirdAssign(slot, code);
    setOpenSlot(null);
  }

  const Slot = ({ slot }) => {
    const code = ta[slot];
    const tm = code ? TEAM[code] : null;
    return (
      <button onClick={() => setOpenSlot(slot)} style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        background: T.card, borderRadius: 16, padding: '12px 14px',
        boxShadow: `inset 0 0 0 1px ${code ? T.accent + '55' : T.line}` }}>
        <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 12, color: T.faint, width: 30 }}>{slot}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: T.faint, fontFamily: 'Archivo', letterSpacing: 0.5 }}>
            {(PERMITTED[slot] || []).join('/')} の3位</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 20 }}>{tm ? tm.flag : '⚪️'}</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: code ? T.text : T.faint }}>
              {tm ? tm.ja : 'タップして選ぶ'}</span>
          </div>
        </div>
        <Icon name="chevron" size={18} color={T.faint} />
      </button>
    );
  };

  const cand = openSlot ? candidates(openSlot) : [];

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px' }}>
      <button onClick={goBack} style={{ border: 'none', background: 'transparent', color: T.accent,
        fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron" size={15} color={T.accent} /></span>予想ハブに戻る
      </button>
      <Eyebrow T={T}>OPTION · {member.name}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 3, marginBottom: 4 }}>
        <div style={{ fontSize: wide ? 26 : 22, fontWeight: 800, color: T.text }}>3位ワイルドカード</div>
        <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 15,
          color: doneCount === 8 ? T.accent : T.text }}>{doneCount}<span style={{ color: T.faint, fontSize: 12 }}>/8枠</span></span>
      </div>
      <p style={{ color: T.sub, fontSize: 13, lineHeight: 1.55, margin: '0 0 14px' }}>
        ベスト32の8枠に、各グループ3位のうち1チームを割り当てます。各チームは1枠だけ。先にグループ順位予想で3位を決めておく必要があります。</p>
      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(auto-fill, minmax(260px, 1fr))' : '1fr', gap: 10 }}>
        {SLOTS.map((s) => <Slot key={s} slot={s} />)}
      </div>

      {/* 選択シート */}
      {openSlot && (
        <div onClick={() => setOpenSlot(null)} style={{ position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520,
            background: T.panel, borderRadius: '20px 20px 0 0', padding: 18, maxHeight: '70vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.text, marginBottom: 4 }}>
              {openSlot}：{(PERMITTED[openSlot] || []).join('/')} の3位</div>
            <p style={{ color: T.faint, fontSize: 12.5, margin: '0 0 12px' }}>使用済み・3位未予想のチームは選べません。</p>
            {ta[openSlot] && (
              <button onClick={() => choose(openSlot, null)} style={{ width: '100%', border: 'none',
                borderRadius: 12, padding: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800,
                fontSize: 14, background: T.panel2, color: T.sub, marginBottom: 8 }}>この枠を空にする</button>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {cand.map(({ g, code }) => {
                const tm = TEAM[code];
                const usedElsewhere = usedCodes.includes(code) && ta[openSlot] !== code;
                return (
                  <button key={code} onClick={() => !usedElsewhere && choose(openSlot, code)} disabled={usedElsewhere}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      border: 'none', cursor: usedElsewhere ? 'default' : 'pointer', fontFamily: 'inherit',
                      background: T.card, borderRadius: 12, padding: '11px 13px', opacity: usedElsewhere ? 0.4 : 1,
                      boxShadow: ta[openSlot] === code ? `inset 0 0 0 1px ${T.accent}` : `inset 0 0 0 1px ${T.line}` }}>
                    <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 12, color: T.accent, width: 18 }}>{g}</span>
                    <span style={{ fontSize: 20 }}>{tm ? tm.flag : '🏳️'}</span>
                    <span style={{ fontWeight: 700, color: T.text, fontSize: 14, flex: 1 }}>{tm ? tm.ja : code}</span>
                    {usedElsewhere && <span style={{ fontSize: 11, color: T.faint }}>使用済み</span>}
                  </button>
                );
              })}
              {cand.length === 0 && <div style={{ color: T.faint, fontSize: 13, padding: '8px 0' }}>
                このグループ群の3位がまだ予想されていません。先にグループ順位予想を進めてください。</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ThirdWildScreen });
