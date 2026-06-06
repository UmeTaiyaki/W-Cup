/* ============================================================
   画面: ノックアウト予想（オプション）
   対戦カードは groupRank+thirdAssign から自動導出。勝者をタップ。
   モバイル=ラウンド送りステッパー / デスクトップ=フルブラケット
   props: T, member, pred, setKnockout(winners), goBack, wide, availWidth
   ============================================================ */
function KnockoutScreen({ T, member, pred, setKnockout, goBack, wide = false, availWidth = 0 }) {
  const ROUNDS = ['r32', 'r16', 'qf', 'sf'];
  const LABELS = { r32: 'ベスト32', r16: 'ベスト16', qf: '準々決勝', sf: '準決勝' };
  const LENS = { r32: 16, r16: 8, qf: 4, sf: 2 };
  // フックは必ずトップで宣言（条件分岐の前）
  const [ri, setRi] = React.useState(0); // モバイルステッパーの現在ラウンド
  // 優勝・準優勝は各ラウンドで自動的に勝ち上がる（先頭=優勝が最優先）
  const forced = [pred.champion, pred.runnerUp].filter(Boolean);
  const forcedSet = new Set(forced);
  // 3位枠は thirdGroups（通過8組の選択）から FIFA Annex C で対戦相手を導出
  const ta = window.WC.resolveThirdAssign(pred.groupRank || {}, pred.thirdGroups || []);
  const der = window.WC.deriveKnockoutAuto(pred.groupRank || {}, ta, pred.knockout || {}, forced);
  const champ = pred.champion ? window.WC.TEAM[pred.champion] : null;

  // 入室時／優勝・準優勝の変更時に、自動勝ち上がりを予想（pred.knockout）へ反映して保存する。
  React.useEffect(() => {
    if (!forced.length) return;
    const d = window.WC.deriveKnockoutAuto(pred.groupRank || {}, ta, pred.knockout || {}, forced);
    if (JSON.stringify(d.winners) !== JSON.stringify(pred.knockout || {})) setKnockout(d.winners);
  }, [pred.champion, pred.runnerUp, JSON.stringify(pred.groupRank), JSON.stringify(pred.thirdGroups), JSON.stringify(pred.knockout)]);

  // 勝者を選んで整合を取り直して保存（優勝・準優勝が含まれるカードは自動勝ち上がりで固定）
  function pick(round, matchIdx, team) {
    if (!team) return;
    const card = der.matches[round][matchIdx] || [];
    if (card.some((t) => forcedSet.has(t))) return; // 自動勝ち上がり枠は変更不可
    const ko = JSON.parse(JSON.stringify(pred.knockout || {}));
    ROUNDS.forEach((r) => {
      ko[r] = (ko[r] || []).slice(0, LENS[r]);
      while (ko[r].length < LENS[r]) ko[r].push(null);
    });
    ko[round][matchIdx] = team;
    const d = window.WC.deriveKnockoutAuto(pred.groupRank || {}, ta, ko, forced);
    setKnockout(d.winners);
  }

  const TeamBtn = ({ team, isWinner, dimmed, onClick, half, placeholder }) => (
    <button onClick={onClick} disabled={!team} style={{
      display: 'flex', alignItems: 'center', gap: 7, width: '100%', height: half,
      border: 'none', background: isWinner ? T.accent : 'transparent',
      cursor: team ? 'pointer' : 'default', padding: '0 9px', fontFamily: 'inherit',
      borderRadius: isWinner ? 9 : 0, opacity: dimmed ? 0.4 : 1, minWidth: 0 }}>
      <span style={{ fontSize: 17, flexShrink: 0 }}>{team ? window.WC.TEAM[team]?.flag : '⚪️'}</span>
      <span style={{ fontSize: team ? 12.5 : 11.5, fontWeight: team ? 800 : 700, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'left',
        color: isWinner ? T.accentInk : (team ? T.text : T.faint) }}>
        {team ? window.WC.TEAM[team]?.ja : (placeholder || '未定')}</span>
      {isWinner && <Icon name="check" size={13} color={T.accentInk} sw={2.6} />}
    </button>
  );

  const Header = () => (
    <div style={{ padding: wide ? '4px 0 12px' : '4px 16px 12px' }}>
      <button onClick={goBack} style={{ border: 'none', background: 'transparent', color: T.accent,
        fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron" size={15} color={T.accent} /></span>予想ハブに戻る
      </button>
      <Eyebrow T={T}>KNOCKOUT · {member.name}</Eyebrow>
      <div style={{ fontSize: wide ? 26 : 22, fontWeight: 800, color: T.text, marginTop: 3 }}>ノックアウト予想</div>
      <p style={{ color: T.faint, fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
        <DotBreak>対戦カードはグループ順位予想と3位割当から自動で決まります。各試合で勝者をタップ。決勝の勝敗は「優勝予想」（コア）で決まります。</DotBreak></p>
    </div>
  );

  // ===== モバイル：ラウンド送りステッパー =====
  if (!wide) {
    const round = ROUNDS[ri];
    const matches = der.matches[round];
    const winners = der.winners[round];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Header />
        <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 13, color: T.accent, letterSpacing: 1 }}>
            {LABELS[round]}</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {ROUNDS.map((r, i) => (
              <div key={r} onClick={() => setRi(i)} style={{ width: i === ri ? 18 : 7, height: 7, borderRadius: 4,
                background: i === ri ? T.accent : T.line, cursor: 'pointer', transition: '.2s ease' }} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {matches.map((teams, idx) => {
              const w = winners[idx];
              const seeds = (der.seeds && der.seeds[round] && der.seeds[round][idx]) || [];
              return (
                <div key={idx} style={{ background: T.card, borderRadius: 12, padding: 4,
                  boxShadow: `inset 0 0 0 1px ${w ? T.accent + '66' : T.line}` }}>
                  <TeamBtn team={teams[0]} isWinner={w && w === teams[0]} dimmed={w && w !== teams[0]}
                    onClick={() => pick(round, idx, teams[0])} half={40} placeholder={seeds[0]} />
                  <div style={{ height: 1, background: T.line, margin: '0 8px' }} />
                  <TeamBtn team={teams[1]} isWinner={w && w === teams[1]} dimmed={w && w !== teams[1]}
                    onClick={() => pick(round, idx, teams[1])} half={40} placeholder={seeds[1]} />
                </div>
              );
            })}
          </div>
          {ri === ROUNDS.length - 1 && (
            <OptionSaveBar T={T} onSave={goBack}
              hint="勝者の選択はその場で自動保存されています。ボタンで保存を確定し、予想ハブに戻ります。" />
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '10px 16px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)', borderTop: `1px solid ${T.line}` }}>
          <button onClick={() => setRi(Math.max(0, ri - 1))} disabled={ri === 0} style={{
            flex: 1, border: 'none', borderRadius: 13, padding: '13px', fontFamily: 'inherit', fontWeight: 800,
            fontSize: 14, cursor: ri === 0 ? 'default' : 'pointer', opacity: ri === 0 ? 0.4 : 1,
            background: T.panel2, color: T.sub }}>前へ</button>
          {ri < ROUNDS.length - 1 ? (
            <button onClick={() => setRi(ri + 1)} style={{ flex: 2, border: 'none', borderRadius: 13, padding: '13px',
              fontFamily: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer',
              background: T.accent, color: T.accentInk }}>次のラウンドへ</button>
          ) : (
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: T.card, borderRadius: 13, boxShadow: `inset 0 0 0 1px ${T.gold}55` }}>
              <Icon name="trophy" size={16} color={T.gold} />
              <span style={{ fontSize: 13, fontWeight: 800, color: champ ? T.text : T.faint }}>
                優勝予想：{champ ? champ.ja : '未選択'}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== デスクトップ：フルブラケット =====
  const rowH = 44, cardH = 40, colW = 150, stepX = 186, LABEL_H = 28;
  const canvasH = 16 * rowH;
  const centerY = (r, idx) => {
    const span = Math.pow(2, r);
    return (span * (2 * idx + 1)) / 2 * rowH;
  };
  const colX = (r) => r * stepX;
  const champX = 4 * stepX;
  const contentW = champX + colW;
  const fitScale = availWidth ? Math.max(0.5, Math.min(1.2, (availWidth - 8) / contentW)) : 1;

  const connectors = [];
  [1, 2, 3].forEach((r) => {
    const n = LENS[ROUNDS[r]];
    for (let i = 0; i < n; i++) {
      const px = colX(r), py = centerY(r, i);
      const childBaseX = colX(r - 1) + colW;
      const midX = childBaseX + (stepX - colW) / 2;
      [2 * i, 2 * i + 1].forEach((ci) => {
        connectors.push(`M ${childBaseX} ${centerY(r - 1, ci)} H ${midX} V ${py} H ${px}`);
      });
    }
  });
  const champCenterY = (centerY(3, 0) + centerY(3, 1)) / 2;
  const midChampX = colX(3) + colW + (stepX - colW) / 2;
  [0, 1].forEach((i) => {
    connectors.push(`M ${colX(3) + colW} ${centerY(3, i)} H ${midChampX} V ${champCenterY} H ${champX}`);
  });

  const MatchCard = ({ round, r, idx }) => {
    const teams = der.matches[round][idx];
    const w = der.winners[round][idx];
    const seeds = (der.seeds && der.seeds[round] && der.seeds[round][idx]) || [];
    return (
      <div style={{ position: 'absolute', left: colX(r), top: centerY(r, idx) - cardH / 2,
        width: colW, height: cardH, background: T.card, borderRadius: 11,
        boxShadow: `inset 0 0 0 1px ${w ? T.accent + '66' : T.line}`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 3, gap: 2 }}>
        <TeamBtn team={teams[0]} isWinner={w && w === teams[0]} dimmed={w && w !== teams[0]}
          onClick={() => pick(round, idx, teams[0])} half={cardH / 2 - 3} placeholder={seeds[0]} />
        <div style={{ height: 1, background: T.line, margin: '0 6px' }} />
        <TeamBtn team={teams[1]} isWinner={w && w === teams[1]} dimmed={w && w !== teams[1]}
          onClick={() => pick(round, idx, teams[1])} half={cardH / 2 - 3} placeholder={seeds[1]} />
      </div>
    );
  };

  return (
    <div>
      <Header />
      <div style={{ padding: '0 0 8px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: contentW * fitScale, height: (canvasH + LABEL_H) * fitScale }}>
          <div style={{ position: 'relative', width: contentW, height: canvasH + LABEL_H,
            transform: `scale(${fitScale})`, transformOrigin: 'top left' }}>
            {ROUNDS.map((r, i) => (
              <div key={r} style={{ position: 'absolute', top: 4, left: colX(i), width: colW, textAlign: 'center',
                fontFamily: 'Archivo', fontWeight: 800, fontSize: 10, letterSpacing: 1.2, color: T.sub }}>{LABELS[r]}</div>
            ))}
            <div style={{ position: 'absolute', top: 4, left: champX, width: colW, textAlign: 'center',
              fontFamily: 'Archivo', fontWeight: 800, fontSize: 10, letterSpacing: 1.2, color: T.gold }}>優勝</div>
            <div style={{ position: 'absolute', top: LABEL_H, left: 0, width: contentW, height: canvasH }}>
              <svg width={contentW} height={canvasH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {connectors.map((d, i) => <path key={i} d={d} fill="none" stroke={T.line} strokeWidth="1.5" />)}
              </svg>
              {ROUNDS.map((round, r) => der.matches[round].map((_, idx) => (
                <MatchCard key={round + idx} round={round} r={r} idx={idx} />
              )))}
              <div style={{ position: 'absolute', left: champX, top: champCenterY - 40, width: colW, height: 80,
                borderRadius: 14, background: champ ? `linear-gradient(160deg, ${T.gold}33, ${T.card})` : T.card,
                boxShadow: `inset 0 0 0 1.5px ${champ ? T.gold : T.line}`, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <Icon name="trophy" size={20} color={T.gold} />
                <div style={{ fontSize: 22 }}>{champ ? champ.flag : '🏆'}</div>
                <div style={{ fontWeight: 800, fontSize: 12, color: champ ? T.text : T.faint }}>
                  {champ ? champ.ja : '優勝予想'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <OptionSaveBar T={T} onSave={goBack} style={{ maxWidth: 520, margin: '18px auto 0' }}
        hint="勝者の選択はその場で自動保存されています。ボタンで保存を確定し、予想ハブに戻ります。" />
    </div>
  );
}

Object.assign(window, { KnockoutScreen });
