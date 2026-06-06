/* ============================================================
   画面: グループ順位予想（順番タップ式・オプション）
   props: T, member, pred, setGroupRank(groupKey, codeArray), goBack
   ============================================================ */
function GroupRankScreen({ T, member, pred, setGroupRank, goBack, wide = false }) {
  const GK = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const groups = window.WC.GROUPS || {};
  const TEAM = window.WC.TEAM || {};
  const gr = pred.groupRank || {};

  const doneCount = GK.filter((k) => (gr[k] || []).length >= 3).length;

  // タップ：選択済みなら解除（後続繰り上げ）、未選択かつ3未満なら末尾追加
  function tap(k, code) {
    const cur = (gr[k] || []).slice();
    const idx = cur.indexOf(code);
    if (idx >= 0) { cur.splice(idx, 1); }
    else if (cur.length < 3) { cur.push(code); }
    setGroupRank(k, cur);
  }

  const posMeta = (i) => i === 0 ? { n: '1', c: T.gold } : i === 1 ? { n: '2', c: T.silver } : { n: '3', c: T.sub };

  const Card = ({ k }) => {
    const members = (groups[k] || []).filter(Boolean);
    const order = (gr[k] || []).filter(Boolean);
    const auto4 = order.length === 3 ? members.find((c) => !order.includes(c)) : null;
    return (
      <div style={{ background: T.card, borderRadius: 18, padding: 14, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 15, color: T.accent }}>GROUP {k}</span>
          <span style={{ fontSize: 11, color: order.length >= 3 ? T.accent : T.faint, fontWeight: 700 }}>
            {order.length >= 3 ? '完了' : `${order.length}/3`}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {members.map((code) => {
            const tm = TEAM[code]; if (!tm) return null;
            const i = order.indexOf(code);
            const picked = i >= 0;
            const meta = picked ? posMeta(i) : null;
            const isAuto = code === auto4;
            return (
              <button key={code} onClick={() => tap(k, code)} disabled={isAuto} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                border: 'none', cursor: isAuto ? 'default' : 'pointer', fontFamily: 'inherit',
                background: picked ? `${meta.c}1A` : 'rgba(255,255,255,0.03)',
                opacity: isAuto ? 0.5 : 1,
                borderRadius: 10, padding: '8px 10px',
                boxShadow: picked ? `inset 0 0 0 1px ${meta.c}59` : 'none' }}>
                <span style={{ fontSize: 20 }}>{tm.flag}</span>
                <span style={{ fontWeight: 700, color: T.text, fontSize: 14, flex: 1, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{tm.ja}</span>
                {picked && <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 12, color: meta.c,
                  background: `${meta.c}22`, borderRadius: 6, padding: '3px 8px' }}>{meta.n}位</span>}
                {isAuto && <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 12, color: T.faint }}>4位</span>}
                {!picked && !isAuto && <span style={{ fontSize: 12, color: T.faint }}>タップ</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px' }}>
      <button onClick={goBack} style={{ border: 'none', background: 'transparent', color: T.accent,
        fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron" size={15} color={T.accent} /></span>予想ハブに戻る
      </button>
      <Eyebrow T={T}>OPTION · {member.name}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 3, marginBottom: 4 }}>
        <div style={{ fontSize: wide ? 26 : 22, fontWeight: 800, color: T.text }}>グループ順位予想</div>
        <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 15,
          color: doneCount === 12 ? T.accent : T.text }}>{doneCount}<span style={{ color: T.faint, fontSize: 12 }}>/12組</span></span>
      </div>
      <p style={{ color: T.sub, fontSize: 13, lineHeight: 1.55, margin: '0 0 14px' }}>
        各組をタップした順に1位→2位→3位。もう一度タップで取消。3位まで決めると4位は自動です。</p>
      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(auto-fill, minmax(240px, 1fr))' : '1fr', gap: 12 }}>
        {GK.map((k) => <Card key={k} k={k} />)}
      </div>
      <OptionSaveBar T={T} onSave={goBack}
        hint="入力はその場で自動保存されています。ボタンで保存を確定し、予想ハブに戻ります。" />
    </div>
  );
}

Object.assign(window, { GroupRankScreen });
