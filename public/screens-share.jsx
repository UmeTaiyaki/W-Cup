/* ============================================================
   共有シート: 閲覧中メンバーの予想を画像カード化してSNS共有する。
   グループ順位 / トーナメント / 得点王 の3種から選択。
   プレビュー＝生成画像（同じ <canvas> を表示し、その canvas を共有）。
   props: T, member, pred, open, onClose
   ============================================================ */
function ShareSheet({ T, member, pred, open, onClose }) {
  const canvasRef = React.useRef(null);
  const [kind, setKind] = React.useState('group');
  const [status, setStatus] = React.useState('idle'); // idle|working|done|error
  const avail = window.WC.availableCards(pred || {});

  const KINDS = [
    { id: 'core', emoji: '🏆', label: '優勝予想' },
    { id: 'group', emoji: '📊', label: 'グループ' },
    { id: 'knockout', emoji: '🏟', label: 'トーナメント' },
  ];
  const memberId = member && member.id;

  // 開いたら、利用可能な最初の種別を選択
  React.useEffect(() => {
    if (!open) return;
    const first = KINDS.map((k) => k.id).find((k) => avail[k]) || 'group';
    setKind(first);
    setStatus('idle');
  }, [open, memberId]);

  // 種別/メンバー変更で再描画
  React.useEffect(() => {
    if (!open || !canvasRef.current || !member) return;
    let alive = true;
    setStatus('idle');
    (async () => {
      await window.WC.ensureFonts();
      if (!alive || !canvasRef.current) return;
      try {
        window.WC.drawShareCard(canvasRef.current, kind, { member, pred, T });
      } catch (e) {
        console.error('draw share card failed', e);
        setStatus('error');
      }
    })();
    return () => { alive = false; };
  }, [open, kind, memberId, pred]);

  async function handleShare() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatus('working');
    try {
      const blob = await window.WC.canvasToBlob(canvas);
      const filename = window.WC.shareFilename(member.name, kind);
      const text = window.WC.shareText(member.name, kind, location.origin);
      const res = await window.WC.shareOrDownload(blob, { filename, text });
      setStatus(res.method === 'cancelled' ? 'idle' : 'done');
    } catch (e) {
      console.error('share failed', e);
      setStatus('error');
    }
  }

  const noData = !avail.core && !avail.group && !avail.knockout;
  const btnLabel =
    status === 'working' ? '生成中…'
    : status === 'done' ? '閉じる'
    : status === 'error' ? '失敗。もう一度'
    : '画像で共有 / 保存';

  // 共有完了後はボタンを「閉じる」に切り替える（押下で再共有しない）
  function handleButton() {
    if (status === 'done') {
      onClose && onClose();
      return;
    }
    handleShare();
  }

  return (
    <Sheet open={open} onClose={onClose} T={T} title="予想を共有">
      <div style={{ padding: '4px 18px 18px' }}>
        {noData ? (
          <div style={{ color: T.faint, fontSize: 14, fontWeight: 700, textAlign: 'center', padding: '28px 0' }}>
            {member ? member.name : 'この人'}はまだ共有できる予想がありません
          </div>
        ) : (
          <>
            {/* 種別タブ */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {KINDS.map((k) => {
                const active = kind === k.id;
                const enabled = avail[k.id];
                return (
                  <button key={k.id} disabled={!enabled}
                    onClick={() => enabled && setKind(k.id)}
                    style={{
                      flex: 1, minWidth: 0, border: 'none', cursor: enabled ? 'pointer' : 'default',
                      fontFamily: 'inherit', borderRadius: 13, padding: '10px 6px',
                      background: active ? `${T.accent}1A` : T.panel2,
                      boxShadow: active ? `inset 0 0 0 1.5px ${T.accent}` : `inset 0 0 0 1px ${T.line}`,
                      opacity: enabled ? 1 : 0.4, transition: '.15s' }}>
                    <div style={{ fontSize: 18 }}>{k.emoji}</div>
                    <div style={{ marginTop: 3, fontFamily: 'Archivo', fontWeight: 800, fontSize: 11,
                      letterSpacing: 0.5, color: active ? T.accent : T.sub,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</div>
                    {!enabled && <div style={{ fontSize: 9.5, color: T.faint, marginTop: 1 }}>未予想</div>}
                  </button>
                );
              })}
            </div>

            {/* プレビュー（= 生成される画像そのもの）*/}
            <div style={{ borderRadius: 16, overflow: 'hidden', background: '#0b0d12',
              boxShadow: `inset 0 0 0 1px ${T.line}`, display: 'flex', justifyContent: 'center' }}>
              <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>

            {/* 共有ボタン */}
            <button onClick={handleButton} disabled={status === 'working'}
              style={{ marginTop: 14, width: '100%', border: 'none', borderRadius: 16, padding: '15px',
                cursor: status === 'working' ? 'default' : 'pointer', fontFamily: 'inherit',
                fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 9,
                background: status === 'error' ? T.card : T.accent,
                color: status === 'error' ? T.accent : T.accentInk,
                boxShadow: status === 'error' ? `inset 0 0 0 1.5px ${T.accent}` : 'none' }}>
              <Icon name={status === 'done' ? 'close' : 'share'} size={19}
                color={status === 'error' ? T.accent : T.accentInk} sw={2.2} />
              {btnLabel}
            </button>
            <p style={{ color: T.faint, fontSize: 11.5, textAlign: 'center', margin: '10px 0 0', lineHeight: 1.5 }}>
              スマホはOSの共有シートからX/LINE/Instagram等へ。PCは画像が保存されます。
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}

Object.assign(window, { ShareSheet });
