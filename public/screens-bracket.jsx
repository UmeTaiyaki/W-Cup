/* ============================================================
   画面: 決勝トーナメント（ベスト16ブラケット）予想
   横スクロールの本格ブラケット。タップで勝者を選択。
   ============================================================ */

// ブラケットの整合性を保つ（上流変更で下流の無効な勝者を消す）
function deriveBracket(b) {
  const RT = window.WC.R16_TEAMS;
  const r16m = [];
  for (let i = 0; i < 8; i++) r16m.push([RT[2 * i], RT[2 * i + 1]]);
  const r16w = (b.r16 || []).slice(0, 8);
  while (r16w.length < 8) r16w.push(null);

  const qfm = [];
  for (let j = 0; j < 4; j++) qfm.push([r16w[2 * j] || null, r16w[2 * j + 1] || null]);
  let qfw = (b.qf || []).slice(0, 4);
  while (qfw.length < 4) qfw.push(null);
  qfw = qfw.map((w, j) => (w && qfm[j].includes(w)) ? w : null);

  const sfm = [];
  for (let k = 0; k < 2; k++) sfm.push([qfw[2 * k] || null, qfw[2 * k + 1] || null]);
  let sfw = (b.sf || []).slice(0, 2);
  while (sfw.length < 2) sfw.push(null);
  sfw = sfw.map((w, k) => (w && sfm[k].includes(w)) ? w : null);

  const fm = [[sfw[0] || null, sfw[1] || null]];
  let fw = (b.final || []).slice(0, 1);
  while (fw.length < 1) fw.push(null);
  fw = fw.map(w => (w && fm[0].includes(w)) ? w : null);

  return { matches: { r16: r16m, qf: qfm, sf: sfm, final: fm },
           winners: { r16: r16w, qf: qfw, sf: sfw, final: fw } };
}

function BracketScreen({ T, member, pred, setBracket, wide = false, availWidth = 0 }) {
  const ROUNDS = ['r16', 'qf', 'sf', 'final'];
  const LABELS = { r16: 'ベスト16', qf: '準々決勝', sf: '準決勝', final: '決勝' };
  const der = deriveBracket(pred.bracket || {});
  const champion = der.winners.final[0];
  const finalists = der.matches.final[0];
  const runnerUp = champion ? finalists.find(t => t && t !== champion) : null;

  // レイアウト定数
  const rowH = 72, cardH = 56, colW = 148, stepX = 188, LABEL_H = 30;
  const canvasH = 8 * rowH;
  const centerY = (r, idx) => {
    if (r === 0) return (idx + 0.5) * rowH;
    if (r === 1) return (2 * idx + 1) * rowH;
    if (r === 2) return (4 * idx + 2) * rowH;
    return 4 * rowH; // final & champion
  };
  const colX = r => r * stepX;
  const champX = 4 * stepX;

  function pick(round, matchIdx, team) {
    if (!team) return;
    const b = JSON.parse(JSON.stringify(pred.bracket || {}));
    ['r16', 'qf', 'sf', 'final'].forEach(r => {
      const len = { r16: 8, qf: 4, sf: 2, final: 1 }[r];
      b[r] = (b[r] || []).slice(0, len);
      while (b[r].length < len) b[r].push(null);
    });
    b[round][matchIdx] = team;
    // 整合性を取り直して保存
    const d = deriveBracket(b);
    setBracket(d.winners);
  }

  // 接続線（SVG）
  const connectors = [];
  [1, 2, 3].forEach(r => {
    const n = { 1: 4, 2: 2, 3: 1 }[r];
    for (let i = 0; i < n; i++) {
      const px = colX(r), py = centerY(r, i);
      const childBaseX = colX(r - 1) + colW;
      const midX = childBaseX + (stepX - colW) / 2;
      [2 * i, 2 * i + 1].forEach(ci => {
        const cy = centerY(r - 1, ci);
        connectors.push(`M ${childBaseX} ${cy} H ${midX} V ${py} H ${px}`);
      });
    }
  });
  // 決勝→優勝への線
  connectors.push(`M ${colX(3) + colW} ${centerY(3, 0)} H ${champX}`);

  const TeamRow = ({ team, isWinner, dimmed, onClick, placeholder }) => (
    <button onClick={onClick} disabled={!team} style={{
      display: 'flex', alignItems: 'center', gap: 7, width: '100%', height: cardH / 2,
      border: 'none', background: isWinner ? T.accent : 'transparent',
      cursor: team ? 'pointer' : 'default', padding: '0 9px', fontFamily: 'inherit',
      borderRadius: isWinner ? 9 : 0, opacity: dimmed ? 0.4 : 1, minWidth: 0,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>
        {team ? window.WC.TEAM[team].flag : '⚪️'}</span>
      <span style={{
        fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', flex: 1, textAlign: 'left',
        color: isWinner ? T.accentInk : (team ? T.text : T.faint),
      }}>{team ? window.WC.TEAM[team].ja : (placeholder || '勝者')}</span>
      {isWinner && <Icon name="check" size={14} color={T.accentInk} sw={2.6} />}
    </button>
  );

  const MatchCard = ({ round, r, idx }) => {
    const teams = der.matches[round][idx];
    const winner = der.winners[round][idx];
    return (
      <div style={{
        position: 'absolute', left: colX(r), top: centerY(r, idx) - cardH / 2,
        width: colW, height: cardH, background: T.card, borderRadius: 12,
        boxShadow: `inset 0 0 0 1px ${winner ? T.accent + '66' : T.line}`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: 3, boxSizing: 'border-box', gap: 2,
      }}>
        <TeamRow team={teams[0]} isWinner={winner && winner === teams[0]}
          dimmed={winner && winner !== teams[0]} onClick={() => pick(round, idx, teams[0])} />
        <div style={{ height: 1, background: T.line, margin: '0 6px' }} />
        <TeamRow team={teams[1]} isWinner={winner && winner === teams[1]}
          dimmed={winner && winner !== teams[1]} onClick={() => pick(round, idx, teams[1])} />
      </div>
    );
  };

  const champTeam = champion ? window.WC.TEAM[champion] : null;

  // デスクトップ：盤面をコンテナ幅にフィットさせる倍率
  const contentW = champX + colW;
  const fitScale = wide && availWidth
    ? Math.max(0.55, Math.min(1.3, (availWidth - 8) / contentW))
    : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: wide ? 'auto' : '100%' }}>
      {/* ヘッダー */}
      <div style={{ padding: wide ? '4px 0 12px' : '4px 16px 12px' }}>
        <Eyebrow T={T}>KNOCKOUT · {member.name}</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginTop: 3 }}>
          <div style={{ fontSize: wide ? 27 : 23, fontWeight: 800, color: T.text }}>決勝トーナメント</div>
        </div>
        {/* 結果サマリーチップ */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, background: T.card, borderRadius: 14, padding: '10px 12px',
            boxShadow: `inset 0 0 0 1px ${champion ? T.gold + '55' : T.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="trophy" size={14} color={T.gold} />
              <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 9.5,
                letterSpacing: 1.4, color: T.gold }}>優勝</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
              <span style={{ fontSize: 20 }}>{champTeam ? champTeam.flag : '🏆'}</span>
              <span style={{ fontWeight: 800, fontSize: 15, color: champion ? T.text : T.faint }}>
                {champTeam ? champTeam.ja : '決勝で決定'}</span>
            </div>
          </div>
          <div style={{ flex: 1, background: T.card, borderRadius: 14, padding: '10px 12px',
            boxShadow: `inset 0 0 0 1px ${T.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="medal" size={14} color={T.silver} />
              <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 9.5,
                letterSpacing: 1.4, color: T.silver }}>準優勝</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 6 }}>
              <span style={{ fontSize: 20 }}>{runnerUp ? window.WC.TEAM[runnerUp].flag : '🥈'}</span>
              <span style={{ fontWeight: 800, fontSize: 15, color: runnerUp ? T.text : T.faint }}>
                {runnerUp ? window.WC.TEAM[runnerUp].ja : '—'}</span>
            </div>
          </div>
        </div>
        <p style={{ color: T.faint, fontSize: 12, margin: '10px 0 0', lineHeight: 1.5 }}>
          各カードで勝ち上がるチームをタップ。{wide ? '決勝までの全試合を一画面で予想できます。' : '横スクロールで決勝まで進めます。'}</p>
      </div>

      {/* ブラケット本体 */}
      <div style={{ flex: wide ? 'none' : 1, overflow: wide ? 'visible' : 'auto', WebkitOverflowScrolling: 'touch',
        padding: wide ? '0 0 8px' : '0 16px 20px 16px',
        display: wide ? 'flex' : 'block', justifyContent: 'center' }}>
        <div style={{
          position: 'relative',
          width: wide ? contentW * fitScale : champX + colW,
          height: (canvasH + LABEL_H) * (wide ? fitScale : 1),
          flexShrink: 0 }}>
          <div style={{ position: 'relative', width: champX + colW, height: canvasH + LABEL_H,
            transform: wide ? `scale(${fitScale})` : 'none', transformOrigin: 'top left' }}>
          {/* ラウンド見出し */}
          {ROUNDS.map((r, i) => (
            <div key={r} style={{ position: 'absolute', top: 4, left: colX(i), width: colW,
              textAlign: 'center', fontFamily: 'Archivo', fontWeight: 800, fontSize: 10.5,
              letterSpacing: 1.4, color: T.sub, textTransform: 'uppercase' }}>{LABELS[r]}</div>
          ))}
          <div style={{ position: 'absolute', top: 4, left: champX, width: colW, textAlign: 'center',
            fontFamily: 'Archivo', fontWeight: 800, fontSize: 10.5, letterSpacing: 1.4,
            color: T.gold }}>優勝</div>

          {/* 盤面（見出しぶん下げる） */}
          <div style={{ position: 'absolute', top: LABEL_H, left: 0, width: champX + colW, height: canvasH }}>
            <svg width={champX + colW} height={canvasH}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {connectors.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={T.line} strokeWidth="1.5" />
              ))}
            </svg>
            {ROUNDS.map((round, r) =>
              der.matches[round].map((_, idx) => (
                <MatchCard key={round + idx} round={round} r={r} idx={idx} />
              ))
            )}
            {/* 優勝カード */}
            <div style={{
              position: 'absolute', left: champX, top: centerY(3, 0) - 44,
              width: colW, height: 88, borderRadius: 16,
              background: champion ? `linear-gradient(160deg, ${T.gold}33, ${T.card})` : T.card,
              boxShadow: `inset 0 0 0 1.5px ${champion ? T.gold : T.line}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 4 }}>
              <Icon name="trophy" size={22} color={T.gold} />
              <div style={{ fontSize: 26 }}>{champTeam ? champTeam.flag : '🏆'}</div>
              <div style={{ fontWeight: 800, fontSize: 13, color: champion ? T.text : T.faint }}>
                {champTeam ? champTeam.ja : '優勝国'}</div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BracketScreen, deriveBracket });
