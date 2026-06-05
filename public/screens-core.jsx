/* ============================================================
   画面: サマリー（home）＋ 予想入力
   props で T / state などを受け取る
   ============================================================ */

// ===== サマリー画面 =========================================
function SummaryScreen({ T, state, member, pred, goTab, wide = false, dashboard = false, solo = false }) {
  const champ = window.WC.TEAM[pred.champion];
  const runner = window.WC.TEAM[pred.runnerUp];
  const M = state.members;
  const [shareOpen, setShareOpen] = React.useState(false);

  // 大きな表彰台カード
  const PodiumHero = () => (
    <div style={{
      borderRadius: 26, padding: '22px 20px 24px', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(170deg, ${T.gold}1F 0%, ${T.card} 42%)`,
      boxShadow: `inset 0 0 0 1px ${T.line}`,
    }}>
      <div style={{ position: 'absolute', top: -30, right: -20, opacity: 0.10 }}>
        <Icon name="trophy" size={150} color={T.gold} fill="none" sw={1} />
      </div>
      <Eyebrow color={T.gold} T={T}>CHAMPION · 優勝</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        <div style={{
          width: 62, height: 62, borderRadius: 18, display: 'grid', placeItems: 'center',
          fontSize: 40, background: 'rgba(255,255,255,0.06)',
          boxShadow: `0 0 0 2px ${T.gold}66`,
        }}>{champ ? champ.flag : '🏳️'}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: T.text, lineHeight: 1.05,
            letterSpacing: -0.5 }}>{champ ? champ.ja : '未選択'}</div>
          <div style={{ fontFamily: 'Archivo, system-ui', fontWeight: 700, fontSize: 13,
            letterSpacing: 2, color: T.faint, marginTop: 3 }}>{champ ? champ.code : '—'}</div>
        </div>
      </div>
    </div>
  );

  const MiniPick = ({ label, sub, code, scorer, color, icon }) => (
    <div style={{
      flex: 1, background: T.card, borderRadius: 20, padding: '15px 14px',
      boxShadow: `inset 0 0 0 1px ${T.line}`, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name={icon} size={17} color={color} />
        <span style={{ fontFamily: 'Archivo, system-ui', fontWeight: 800, fontSize: 10.5,
          letterSpacing: 1.6, color: color }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
        {code
          ? <div style={{ fontSize: 30 }}>{window.WC.TEAM[code]?.flag}</div>
          : <div style={{ width: 38, height: 38, borderRadius: 10, display: 'grid',
              placeItems: 'center', background: T.panel2, fontSize: 20 }}>⚽️</div>}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginTop: 8,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {code ? window.WC.TEAM[code]?.ja : (scorer || '未選択')}
      </div>
      <div style={{ fontSize: 11.5, color: T.faint, marginTop: 1 }}>{sub}</div>
    </div>
  );

  const Header = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <Eyebrow T={T}>MY 予想</Eyebrow>
        <div style={{ fontSize: wide ? 27 : 23, fontWeight: 800, color: T.text, marginTop: 3 }}>
          {member.name}の予想</div>
      </div>
      <button onClick={() => setShareOpen(true)} style={{ flexShrink: 0, border: 'none',
        cursor: 'pointer', fontFamily: 'inherit', borderRadius: 999, padding: '9px 16px',
        display: 'flex', alignItems: 'center', gap: 6, background: T.accent, color: T.accentInk,
        fontWeight: 800, fontSize: 13.5 }}>
        <Icon name="share" size={15} color={T.accentInk} sw={2.2} />共有
      </button>
    </div>
  );

  const Picks = () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <MiniPick label="準優勝" sub="RUNNER-UP" code={pred.runnerUp} color={T.silver} icon="medal" />
      <MiniPick label="得点王" sub="TOP SCORER" scorer={pred.topScorer} color={T.boot} icon="boot" />
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
          fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2,
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
            <PodiumHero />
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
            <PodiumHero />
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
      <PodiumHero />
      <Picks />
      <Options />
      {!solo && <Everyone />}
      {shareSheet}
    </div>
  );
}

// ===== 予想入力画面 =========================================
function InputScreen({ T, member, pred, setPick, onRemove, canRemove, goOption, wide = false, solo = false }) {
  const gr = pred.groupRank || {};
  const ta = pred.thirdAssign || {};
  const grDone = ['A','B','C','D','E','F','G','H','I','J','K','L'].filter((k) => (gr[k] || []).length >= 3).length;
  const wcCount = (window.WC.WILDCARD_SLOTS || []).length || 8;
  const taDone = (window.WC.WILDCARD_SLOTS || []).filter((s) => ta[s]).length;
  const koReady = grDone === 12 && taDone === wcCount;
  const [sheet, setSheet] = React.useState(null); // 'champ' | 'runner' | 'scorer'
  const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => { setConfirm(false); }, [member.id]);

  const Row = ({ field, label, sub, color, icon, code, scorer }) => {
    const filled = code || scorer;
    const sm = scorer ? (/^(.*)\s+\(([A-Za-z]{2,3})\)$/.exec(scorer) || []) : [];
    const scFlag = sm[2] ? (window.WC.TEAM[sm[2]] || {}).flag : '';
    const scName = sm[1] || scorer;
    return (
      <button onClick={() => setSheet(field)} style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: T.card, borderRadius: 20, padding: 16,
        boxShadow: `inset 0 0 0 1px ${filled ? color + '55' : T.line}`,
        display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'inherit',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 13, display: 'grid', placeItems: 'center',
          background: `${color}1F`, flexShrink: 0 }}>
          <Icon name={icon} size={24} color={color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>{label}</span>
            <span style={{ fontFamily: 'Archivo', fontWeight: 700, fontSize: 10,
              letterSpacing: 1.5, color: T.faint, whiteSpace: 'nowrap' }}>{sub}</span>
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {(code ? window.WC.TEAM[code].flag : scFlag) &&
              <span style={{ fontSize: 24, flexShrink: 0 }}>{code ? window.WC.TEAM[code].flag : scFlag}</span>}
            <span style={{ fontSize: 18, fontWeight: 800, color: filled ? T.text : T.faint,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {code ? window.WC.TEAM[code].ja : (scorer ? scName : 'タップして選ぶ')}
            </span>
          </div>
        </div>
        <Icon name="chevron" size={20} color={T.faint} />
      </button>
    );
  };

  return (
    <div style={{ padding: wide ? '4px 0 24px' : '4px 16px 16px' }}>
      <Eyebrow T={T}>EDIT · {member.name}</Eyebrow>
      <div style={{ fontSize: 23, fontWeight: 800, color: T.text, marginTop: 3, marginBottom: 4 }}>
        3つを予想しよう</div>
      <p style={{ color: T.sub, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>
        {solo ? '優勝・準優勝・得点王を選ぶと自動で保存されます。'
              : '優勝・準優勝・得点王を選ぶと自動で保存。上の人物アイコンで仲間を切り替えられます。'}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Row field="champ" label="優勝" sub="CHAMPION" color={T.gold} icon="trophy" code={pred.champion} />
        <Row field="runner" label="準優勝" sub="RUNNER-UP" color={T.silver} icon="medal" code={pred.runnerUp} />
        <Row field="scorer" label="得点王" sub="TOP SCORER" color={T.boot} icon="boot" scorer={pred.topScorer} />
      </div>

      {/* オプション予想の入口 */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 11, letterSpacing: 1.4,
          color: T.accent, marginBottom: 10 }}>■ オプション予想（やりたい人）</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OptionCard T={T} emoji="📊" title="グループ順位予想" sub={`12組の1〜3位 · ${grDone}/12組`}
            onClick={() => goOption('grouprank')} />
          <OptionCard T={T} emoji="🎯" title="3位ワイルドカード" sub={`${wcCount}枠に3位を割当 · ${taDone}/${wcCount}枠`}
            onClick={() => goOption('thirdwild')} />
          <OptionCard T={T} emoji="🏟" title="ノックアウト予想" sub={koReady ? 'ベスト32→決勝' : '先にグループ順位予想を'}
            onClick={() => koReady && goOption('knockout')} disabled={!koReady} />
        </div>
      </div>

      {/* 参加者の削除 */}
      {!solo && (
      <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${T.line}` }}>
        {!confirm ? (
          <button onClick={() => setConfirm(true)} disabled={!canRemove} style={{
            width: '100%', border: 'none', borderRadius: 14, padding: '13px',
            fontFamily: 'inherit', fontWeight: 800, fontSize: 14.5,
            cursor: canRemove ? 'pointer' : 'default',
            background: 'transparent', color: canRemove ? '#FF6B6B' : T.faint,
            boxShadow: `inset 0 0 0 1.5px ${canRemove ? '#FF6B6B44' : T.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="trash" size={17} color={canRemove ? '#FF6B6B' : T.faint} />
            {member.name}を削除
          </button>
        ) : (
          <div style={{ background: T.card, borderRadius: 16, padding: '14px 16px',
            boxShadow: `inset 0 0 0 1px #FF6B6B44` }}>
            <div style={{ fontWeight: 800, color: T.text, fontSize: 14.5, marginBottom: 3 }}>
              「{member.name}」を削除しますか？</div>
            <p style={{ color: T.sub, fontSize: 12.5, lineHeight: 1.5, margin: '0 0 12px' }}>
              この参加者の予想データも消えます。元に戻せません。</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirm(false)} style={{
                flex: 1, border: 'none', borderRadius: 12, padding: '11px',
                fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                background: T.panel2, color: T.sub }}>キャンセル</button>
              <button onClick={() => onRemove(member.id)} style={{
                flex: 1, border: 'none', borderRadius: 12, padding: '11px',
                fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                background: '#FF6B6B', color: '#fff' }}>削除する</button>
            </div>
          </div>
        )}
        {!canRemove && (
          <p style={{ color: T.faint, fontSize: 11.5, textAlign: 'center', margin: '8px 0 0' }}>
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
    </div>
  );
}

function OptionCard({ T, emoji, title, sub, onClick, disabled = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
      border: 'none', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
      background: T.card, borderRadius: 14, padding: '13px 14px', opacity: disabled ? 0.55 : 1,
      boxShadow: `inset 0 0 0 1px ${T.line}` }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{title}</div>
        <div style={{ fontSize: 11.5, color: T.faint, marginTop: 1 }}>{sub}</div>
      </div>
      <Icon name="chevron" size={18} color={T.faint} />
    </button>
  );
}

Object.assign(window, { SummaryScreen, InputScreen });
