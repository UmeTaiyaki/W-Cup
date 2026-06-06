/* ============================================================
   画面: サマリー（home）＋ 予想入力
   props で T / state などを受け取る
   ============================================================ */

// ===== 共通カード（ホーム／予想タブで共有） =====================
function EditBtn({ T, onClick, label = '編集' }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      borderRadius: 999, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5,
      background: T.panel2, color: T.accent, fontWeight: 800, fontSize: 13,
      boxShadow: `inset 0 0 0 1px ${T.line}` }}>
      <Icon name="edit" size={14} color={T.accent} sw={2} />{label}
    </button>
  );
}

function PodiumHero({ T, champ, onEdit }) {
  return (
    <div style={{
      borderRadius: 26, padding: '22px 20px 24px', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(170deg, ${T.gold}1F 0%, ${T.card} 42%)`,
      boxShadow: `inset 0 0 0 1px ${T.line}`,
    }}>
      <div style={{ position: 'absolute', top: -30, right: -20, opacity: 0.10, pointerEvents: 'none' }}>
        <Icon name="trophy" size={150} color={T.gold} fill="none" sw={1} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <Eyebrow color={T.gold} T={T}>CHAMPION · 優勝</Eyebrow>
        {onEdit && <EditBtn T={T} onClick={onEdit} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        <div style={{
          width: 62, height: 62, borderRadius: 18, display: 'grid', placeItems: 'center',
          fontSize: 40, background: 'rgba(255,255,255,0.06)',
          boxShadow: `0 0 0 2px ${T.gold}66`,
        }}>{champ ? champ.flag : '🏳️'}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <FitText text={champ ? champ.ja : '未選択'} max={30} min={16} weight={800}
            color={T.text} lineHeight={1.05} letterSpacing={-0.5} />
          <div style={{ fontFamily: 'Archivo, system-ui', fontWeight: 700, fontSize: 13,
            letterSpacing: 2, color: T.faint, marginTop: 3 }}>{champ ? champ.code : '—'}</div>
        </div>
      </div>
    </div>
  );
}

function MiniPick({ T, label, sub, code, scorer, color, icon, onEdit }) {
  return (
    <div style={{
      flex: 1, background: T.card, borderRadius: 20, padding: '15px 14px',
      boxShadow: `inset 0 0 0 1px ${T.line}`, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <Icon name={icon} size={17} color={color} />
          <span style={{ fontFamily: 'Archivo, system-ui', fontWeight: 800, fontSize: 11,
            letterSpacing: 1.6, color: color }}>{label}</span>
        </div>
        {onEdit && (
          <button onClick={onEdit} style={{ flexShrink: 0, border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', borderRadius: 999, padding: 5, display: 'grid', placeItems: 'center',
            background: T.panel2, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
            <Icon name="edit" size={13} color={T.accent} sw={2} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
        {code
          ? <div style={{ fontSize: 30 }}>{window.WC.TEAM[code]?.flag}</div>
          : <div style={{ width: 38, height: 38, borderRadius: 10, display: 'grid',
              placeItems: 'center', background: T.panel2 }}><Icon name={icon} size={20} color={T.faint} /></div>}
      </div>
      <div style={{ marginTop: 8 }}>
        <FitText text={code ? window.WC.TEAM[code]?.ja : (scorer || '未選択')}
          max={17} min={11} weight={800} color={T.text} />
      </div>
      <div style={{ fontSize: 12, color: T.faint, marginTop: 1 }}>{sub}</div>
    </div>
  );
}

// ===== サマリー画面 =========================================
function SummaryScreen({ T, state, member, pred, goTab, wide = false, dashboard = false, solo = false, hideShare = false }) {
  const champ = window.WC.TEAM[pred.champion];
  const runner = window.WC.TEAM[pred.runnerUp];
  const M = state.members;
  const [shareOpen, setShareOpen] = React.useState(false);

  const Header = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <Eyebrow T={T}>MY 予想</Eyebrow>
        <div style={{ fontSize: wide ? 27 : 23, fontWeight: 800, color: T.text, marginTop: 3 }}>
          {member.name}の予想</div>
      </div>
      {!hideShare && (
        <button onClick={() => setShareOpen(true)} style={{ flexShrink: 0, border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', borderRadius: 999, padding: '9px 16px',
          display: 'flex', alignItems: 'center', gap: 6, background: T.accent, color: T.accentInk,
          fontWeight: 800, fontSize: 14 }}>
          <Icon name="share" size={15} color={T.accentInk} sw={2.2} />共有
        </button>
      )}
    </div>
  );

  const Picks = () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <MiniPick T={T} label="準優勝" sub="RUNNER-UP" code={pred.runnerUp} color={T.silver} icon="medal" />
      <MiniPick T={T} label="得点王" sub="TOP SCORER" scorer={pred.topScorer} color={T.boot} icon="boot" />
    </div>
  );

  // オプション予想（グループ順位/3位WC/ノックアウト）をその場にインライン表示
  const Options = () => (
    <OptionViewScreen embedded T={T} state={state} viewId={member.id}
      setViewId={() => {}} wide={wide} />
  );

  const Everyone = ({ flush = false }) => (
    <div style={{ marginTop: flush ? 0 : 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>みんなの優勝予想</span>
        <button onClick={() => goTab('rank')} style={{
          border: 'none', background: 'transparent', color: T.accent, fontWeight: 700,
          fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2,
          fontFamily: 'inherit' }}>
          ランキング<Icon name="chevron" size={15} color={T.accent} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {M.map(m => {
          const p = state.preds[m.id];
          const c = window.WC.TEAM[p.champion];
          return (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, background: T.card,
              borderRadius: 16, padding: '10px 14px', boxShadow: `inset 0 0 0 1px ${T.line}` }}>
              <Avatar m={m} size={32} T={T} />
              <span style={{ fontWeight: 700, color: T.text, fontSize: 15, flex: 1 }}>{m.name}</span>
              <span style={{ fontSize: 22 }}>{c ? c.flag : '🏳️'}</span>
              <span style={{ fontWeight: 700, color: T.sub, fontSize: 14 }}>{c ? c.ja : '—'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // 優勝予想の分布（ダッシュボード用）
  const ChampDist = () => {
    const counts = {};
    M.forEach(m => { const v = state.preds[m.id].champion; if (v) counts[v] = (counts[v] || 0) + 1; });
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...rows.map(r => r[1]));
    return (
      <div>
        <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>優勝予想の分布</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
          {rows.map(([code, n]) => {
            const tm = window.WC.TEAM[code];
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20, width: 26 }}>{tm.flag}</span>
                <span style={{ fontWeight: 700, color: T.text, fontSize: 14, width: 92 }}>{tm.ja}</span>
                <div style={{ flex: 1, height: 9, borderRadius: 5, background: T.panel2, overflow: 'hidden' }}>
                  <div style={{ width: `${(n / max) * 100}%`, height: '100%', borderRadius: 5,
                    background: T.accent }} />
                </div>
                <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 13,
                  color: T.sub, width: 28, textAlign: 'right' }}>{n}人</span>
              </div>
            );
          })}
          {rows.length === 0 && <div style={{ color: T.faint, fontSize: 13 }}>まだ予想がありません</div>}
        </div>
      </div>
    );
  };

  const Panel = ({ children, pad = 18 }) => (
    <div style={{ background: T.card, borderRadius: 22, padding: pad,
      boxShadow: `inset 0 0 0 1px ${T.line}` }}>{children}</div>
  );

  const shareSheet = (
    <ShareSheet T={T} member={member} pred={pred} open={shareOpen}
      onClose={() => setShareOpen(false)} />
  );

  // ----- ダッシュボード（デスクトップ・リッチ） -----
  if (wide && dashboard) {
    return (
      <div style={{ padding: '4px 0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Header />
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PodiumHero T={T} champ={champ} />
            <Picks />
            <Options />
          </div>
          {!solo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Panel><Everyone flush /></Panel>
              <Panel><ChampDist /></Panel>
            </div>
          )}
        </div>
        {shareSheet}
      </div>
    );
  }

  // ----- 2カラム（デスクトップ標準） -----
  if (wide) {
    return (
      <div style={{ padding: '4px 0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Header />
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PodiumHero T={T} champ={champ} />
            <Picks />
            <Options />
          </div>
          {!solo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Panel><Everyone flush /></Panel>
            </div>
          )}
        </div>
        {shareSheet}
      </div>
    );
  }

  // ----- モバイル（既存） -----
  return (
    <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Header />
      <PodiumHero T={T} champ={champ} />
      <Picks />
      <Options />
      {!solo && <Everyone />}
      {shareSheet}
    </div>
  );
}

// ===== 予想入力画面 =========================================
function InputScreen({ T, state, member, pred, setPick, onRemove = () => {}, canRemove = false, goOption, wide = false, solo = false }) {
  const champ = pred.champion ? window.WC.TEAM[pred.champion] : null;
  const [sheet, setSheet] = React.useState(null); // 'champ' | 'runner' | 'scorer'
  const [confirm, setConfirm] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  React.useEffect(() => { setConfirm(false); }, [member.id]);

  // 通常は呼び出し側が state を渡す。未指定時のフォールバックとして単一メンバーのシムを使う
  const viewState = state || { current: member.id, members: [member], preds: { [member.id]: pred } };

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px',
      display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow T={T}>EDIT · {member.name}</Eyebrow>
          <div style={{ fontSize: wide ? 27 : 23, fontWeight: 800, color: T.text, marginTop: 3 }}>
            予想を編集</div>
        </div>
        <button onClick={() => setShareOpen(true)} style={{ flexShrink: 0, border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', borderRadius: 999, padding: '9px 16px',
          display: 'flex', alignItems: 'center', gap: 6, background: T.accent, color: T.accentInk,
          fontWeight: 800, fontSize: 14 }}>
          <Icon name="share" size={15} color={T.accentInk} sw={2.2} />共有
        </button>
      </div>

      <PodiumHero T={T} champ={champ} onEdit={() => setSheet('champ')} />

      <div style={{ display: 'flex', gap: 12 }}>
        <MiniPick T={T} label="準優勝" sub="RUNNER-UP" code={pred.runnerUp} color={T.silver}
          icon="medal" onEdit={() => setSheet('runner')} />
        <MiniPick T={T} label="得点王" sub="TOP SCORER" scorer={pred.topScorer} color={T.boot}
          icon="boot" onEdit={() => setSheet('scorer')} />
      </div>

      {/* オプション予想（インライン表示＋各見出しの編集ボタン） */}
      <OptionViewScreen embedded editable T={T} state={viewState} viewId={member.id}
        setViewId={() => {}} wide={wide} onEdit={goOption} />

      {/* 参加者の削除 */}
      {!solo && (
      <div style={{ marginTop: 14, paddingTop: 18, borderTop: `1px solid ${T.line}` }}>
        {!confirm ? (
          <button onClick={() => setConfirm(true)} disabled={!canRemove} style={{
            width: '100%', border: 'none', borderRadius: 14, padding: '13px',
            fontFamily: 'inherit', fontWeight: 800, fontSize: 15,
            cursor: canRemove ? 'pointer' : 'default',
            background: 'transparent', color: canRemove ? T.danger : T.faint,
            boxShadow: `inset 0 0 0 1.5px ${canRemove ? T.dangerSoft : T.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="trash" size={17} color={canRemove ? T.danger : T.faint} />
            {member.name}を削除
          </button>
        ) : (
          <div style={{ background: T.card, borderRadius: 16, padding: '14px 16px',
            boxShadow: `inset 0 0 0 1px ${T.dangerSoft}` }}>
            <div style={{ fontWeight: 800, color: T.text, fontSize: 15, marginBottom: 3 }}>
              「{member.name}」を削除しますか？</div>
            <p style={{ color: T.sub, fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' }}>
              この参加者の予想データも消えます。元に戻せません。</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirm(false)} style={{
                flex: 1, border: 'none', borderRadius: 12, padding: '11px',
                fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                background: T.panel2, color: T.sub }}>キャンセル</button>
              <button onClick={() => onRemove(member.id)} style={{
                flex: 1, border: 'none', borderRadius: 12, padding: '11px',
                fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                background: T.danger, color: '#fff' }}>削除する</button>
            </div>
          </div>
        )}
        {!canRemove && (
          <p style={{ color: T.faint, fontSize: 12, textAlign: 'center', margin: '8px 0 0' }}>
            参加者が1人のときは削除できません。</p>
        )}
      </div>
      )}

      <TeamPicker open={sheet === 'champ'} onClose={() => setSheet(null)} T={T} centered={wide}
        title="優勝を選ぶ" onPick={c => setPick('champion', c)} />
      <TeamPicker open={sheet === 'runner'} onClose={() => setSheet(null)} T={T} centered={wide}
        title="準優勝を選ぶ" onPick={c => setPick('runnerUp', c)} exclude={[pred.champion]} />
      <ScorerPicker open={sheet === 'scorer'} onClose={() => setSheet(null)} T={T} centered={wide}
        title="得点王を選ぶ" onPick={v => setPick('topScorer', v)} />
      <ShareSheet T={T} member={member} pred={pred} open={shareOpen}
        onClose={() => setShareOpen(false)} />
    </div>
  );
}

Object.assign(window, { SummaryScreen, InputScreen });
