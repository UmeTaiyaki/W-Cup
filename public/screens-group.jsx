// グループステージのリーグ表（読み取り専用）。window.WC.GROUPS / GROUP_RESULT を表示。
function GroupScreen({ T, wide = false }) {
  const GK = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const groups = window.WC.GROUPS || {};
  const gr = window.WC.GROUP_RESULT || {};
  const TEAM = window.WC.TEAM || {};

  const Card = ({ k }) => {
    const members = (groups[k] || []).filter(Boolean);
    const order = (gr[k] || []).filter(Boolean);
    const rest = order.length ? members.filter((c) => !order.includes(c)) : members;
    const list = order.length ? [...order, ...rest] : members;
    return (
      <div style={{ background: T.card, borderRadius: 18, padding: 14, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 15, color: T.accent }}>GROUP {k}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {list.map((code) => {
            const tm = TEAM[code];
            if (!tm) return null;
            const pos = order.length ? order.indexOf(code) : -1;
            const posColor = pos === 0 ? T.gold : pos === 1 ? T.silver : pos >= 0 ? T.sub : T.faint;
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 18, textAlign: 'center', fontFamily: 'Archivo', fontWeight: 800,
                  fontSize: 13, color: posColor }}>{pos >= 0 ? pos + 1 : '–'}</span>
                <span style={{ fontSize: 20 }}>{tm.flag}</span>
                <span style={{ fontWeight: 700, color: T.text, fontSize: 14, flex: 1, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{tm.ja}</span>
              </div>
            );
          })}
          {list.length === 0 && <div style={{ color: T.faint, fontSize: 13 }}>未設定</div>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 11, letterSpacing: 1.4, color: T.faint }}>GROUP STAGE</div>
        <div style={{ fontSize: wide ? 24 : 20, fontWeight: 800, color: T.text, marginTop: 2 }}>グループリーグ</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
        {GK.map((k) => <Card key={k} k={k} />)}
      </div>
    </div>
  );
}
