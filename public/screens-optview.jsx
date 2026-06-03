/* ============================================================
   画面: オプション予想ビューア（読み取り専用）
   各メンバーのグループ順位・3位ワイルドカード・ノックアウト予想を閲覧する。
   編集はしない。上部のメンバーチップで閲覧対象を切り替えられる。
   props: T, state, viewId, setViewId, goBack, wide, availWidth
   ============================================================ */
function OptionViewScreen({ T, state, viewId, setViewId, goBack, wide = false, availWidth = 0 }) {
  const members = state.members;
  const viewed = members.find((m) => m.id === viewId) || members[0];
  const pred = (viewed && state.preds[viewed.id]) || {};
  const TEAM = window.WC.TEAM || {};
  const GROUPS = window.WC.GROUPS || {};
  const SLOTS = window.WC.WILDCARD_SLOTS || [];
  const PERMITTED = window.WC.PERMITTED || {};
  const GK = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

  const gr = pred.groupRank || {};
  const ta = pred.thirdAssign || {};
  const grDone = GK.filter((k) => (gr[k] || []).length >= 3).length;
  const taDone = SLOTS.filter((s) => ta[s]).length;
  const der = window.WC.deriveKnockout(gr, ta, pred.knockout || {});
  const ROUNDS = ['r32', 'r16', 'qf', 'sf'];
  const LABELS = { r32: 'ベスト32', r16: 'ベスト16', qf: '準々決勝', sf: '準決勝' };
  const koAny = ROUNDS.some((r) => (der.winners[r] || []).some(Boolean));
  const champ = pred.champion ? TEAM[pred.champion] : null;
  const hasAny = grDone > 0 || taDone > 0 || koAny;

  const posMeta = (i) =>
    i === 0 ? { n: '1', c: T.gold } : i === 1 ? { n: '2', c: T.silver }
    : i === 2 ? { n: '3', c: T.sub } : { n: '4', c: T.faint };

  // ---- ヘッダー（戻る＋メンバー切替）----
  const Header = () => (
    <div style={{ padding: wide ? '4px 0 0' : '4px 16px 0' }}>
      <button onClick={goBack} style={{ border: 'none', background: 'transparent', color: T.accent,
        fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
          <Icon name="chevron" size={15} color={T.accent} /></span>ホームに戻る
      </button>
      <Eyebrow T={T}>OPTIONS · 閲覧</Eyebrow>
      <div style={{ fontSize: wide ? 27 : 23, fontWeight: 800, color: T.text, marginTop: 3, marginBottom: 12 }}>
        {viewed ? `${viewed.name}のオプション予想` : 'オプション予想'}</div>

      {/* メンバー切替チップ */}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4 }}>
        {members.map((m) => {
          const active = m.id === viewId;
          return (
            <button key={m.id} onClick={() => setViewId(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
              border: 'none', cursor: 'pointer', borderRadius: 999, fontFamily: 'inherit',
              padding: active ? '5px 13px 5px 5px' : '5px',
              background: active ? T.card : 'transparent',
              boxShadow: active ? `inset 0 0 0 1px ${m.c}66` : 'none', transition: '.18s' }}>
              <Avatar m={m} size={28} T={T} />
              {active && <span style={{ fontWeight: 800, fontSize: 13.5, color: T.text }}>{m.name}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ---- サマリーの統計バー ----
  const Stats = () => {
    const Item = ({ label, value, sub }) => (
      <div style={{ flex: 1, background: T.card, borderRadius: 14, padding: '11px 12px',
        boxShadow: `inset 0 0 0 1px ${T.line}`, minWidth: 0 }}>
        <div style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 10, letterSpacing: 1.2,
          color: T.faint }}>{label}</div>
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 19, color: T.text }}>{value}</span>
          {sub && <span style={{ fontSize: 11, color: T.faint, fontWeight: 700 }}>{sub}</span>}
        </div>
      </div>
    );
    return (
      <div style={{ display: 'flex', gap: 8, margin: '14px 0 6px' }}>
        <Item label="グループ順位" value={grDone} sub="/12組" />
        <Item label="3位WC" value={taDone} sub={`/${SLOTS.length}枠`} />
        <Item label="ノックアウト" value={koAny ? '予想あり' : '—'} />
      </div>
    );
  };

  // ---- セクション見出し ----
  const SectionTitle = ({ emoji, title, right }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 2px 10px' }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ fontWeight: 800, fontSize: 16, color: T.text }}>{title}</span>
      {right && <span style={{ marginLeft: 'auto', fontFamily: 'Archivo', fontWeight: 800,
        fontSize: 11, color: T.faint }}>{right}</span>}
    </div>
  );

  // ---- グループ順位（読み取り専用）----
  const GroupCard = ({ k }) => {
    const mem = (GROUPS[k] || []).filter(Boolean);
    const order = (gr[k] || []).filter(Boolean);
    const auto4 = order.length === 3 ? mem.find((c) => !order.includes(c)) : null;
    const ranked = auto4 ? [...order, auto4] : order;
    return (
      <div style={{ background: T.card, borderRadius: 16, padding: 13, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
          <span style={{ fontFamily: 'Archivo', fontWeight: 900, fontSize: 14, color: T.accent }}>GROUP {k}</span>
          <span style={{ fontSize: 11, color: order.length >= 3 ? T.accent : T.faint, fontWeight: 700 }}>
            {order.length >= 3 ? '完了' : `${order.length}/3`}</span>
        </div>
        {ranked.length === 0 ? (
          <div style={{ color: T.faint, fontSize: 12.5, padding: '4px 2px' }}>未予想</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {ranked.map((code, i) => {
              const tm = TEAM[code]; if (!tm) return null;
              const meta = posMeta(i);
              const isAuto = code === auto4;
              return (
                <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 9,
                  padding: '6px 8px', borderRadius: 9,
                  background: isAuto ? 'transparent' : `${meta.c}14`,
                  opacity: isAuto ? 0.6 : 1 }}>
                  <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 11, color: meta.c,
                    background: `${meta.c}22`, borderRadius: 6, padding: '2px 6px', minWidth: 22, textAlign: 'center' }}>
                    {meta.n}</span>
                  <span style={{ fontSize: 18 }}>{tm.flag}</span>
                  <span style={{ fontWeight: 700, color: T.text, fontSize: 13.5, flex: 1, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis' }}>{tm.ja}</span>
                  {isAuto && <span style={{ fontSize: 10.5, color: T.faint, fontWeight: 700 }}>自動</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ---- 3位ワイルドカード（読み取り専用）----
  const WildcardSlot = ({ slot }) => {
    const code = ta[slot];
    const tm = code ? TEAM[code] : null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: T.card,
        borderRadius: 14, padding: '11px 13px', boxShadow: `inset 0 0 0 1px ${code ? T.accent + '40' : T.line}` }}>
        <span style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 11, color: T.faint, width: 28 }}>{slot}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: T.faint, fontFamily: 'Archivo', letterSpacing: 0.5 }}>
            {(PERMITTED[slot] || []).join('/')} の3位</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 18 }}>{tm ? tm.flag : '⚪️'}</span>
            <span style={{ fontWeight: 800, fontSize: 14, color: code ? T.text : T.faint }}>
              {tm ? tm.ja : '未割当'}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: 24 }}>
      <Header />
      <div style={{ padding: wide ? '0' : '0 16px' }}>
        <Stats />

        {!hasAny && (
          <div style={{ marginTop: 14, background: T.card, borderRadius: 16, padding: '20px 18px',
            boxShadow: `inset 0 0 0 1px ${T.line}`, textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>🗒️</div>
            <div style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>まだオプション予想がありません</div>
            <p style={{ color: T.faint, fontSize: 12.5, lineHeight: 1.6, margin: '6px 0 0' }}>
              {viewed ? viewed.name : 'この人'}は「予想」タブのオプション予想をまだ入力していないようです。</p>
          </div>
        )}

        {/* グループ順位 */}
        {grDone > 0 && (
          <div style={{ marginTop: 18 }}>
            <SectionTitle emoji="📊" title="グループ順位予想" right={`${grDone}/12組`} />
            <div style={{ display: 'grid',
              gridTemplateColumns: wide ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(2, 1fr)',
              gap: 10 }}>
              {GK.map((k) => <GroupCard key={k} k={k} />)}
            </div>
          </div>
        )}

        {/* 3位ワイルドカード */}
        {taDone > 0 && (
          <div style={{ marginTop: 22 }}>
            <SectionTitle emoji="🎯" title="3位ワイルドカード" right={`${taDone}/${SLOTS.length}枠`} />
            <div style={{ display: 'grid',
              gridTemplateColumns: wide ? 'repeat(auto-fill, minmax(240px, 1fr))' : '1fr', gap: 9 }}>
              {SLOTS.map((s) => <WildcardSlot key={s} slot={s} />)}
            </div>
          </div>
        )}

        {/* ノックアウト */}
        {koAny && (
          <div style={{ marginTop: 22 }}>
            <SectionTitle emoji="🏟" title="ノックアウト予想" />
            <KnockoutView T={T} der={der} champ={champ} wide={wide} availWidth={availWidth}
              ROUNDS={ROUNDS} LABELS={LABELS} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ノックアウトの読み取り専用表示
   モバイル=ラウンドごとの試合リスト / デスクトップ=フルブラケット */
function KnockoutView({ T, der, champ, wide, availWidth, ROUNDS, LABELS }) {
  const LENS = { r32: 16, r16: 8, qf: 4, sf: 2 };

  const TeamRow = ({ team, isWinner, dimmed, half }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', height: half,
      background: isWinner ? T.accent : 'transparent', padding: '0 9px',
      borderRadius: isWinner ? 9 : 0, opacity: dimmed ? 0.4 : 1, minWidth: 0 }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{team ? window.WC.TEAM[team]?.flag : '⚪️'}</span>
      <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', flex: 1,
        color: isWinner ? T.accentInk : (team ? T.text : T.faint) }}>
        {team ? window.WC.TEAM[team]?.ja : '未定'}</span>
      {isWinner && <Icon name="check" size={12} color={T.accentInk} sw={2.6} />}
    </div>
  );

  // ===== モバイル：ラウンドごとのリスト =====
  if (!wide) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ROUNDS.map((round) => {
          const matches = der.matches[round];
          const winners = der.winners[round];
          if (!matches.some((t) => t[0] || t[1])) return null;
          return (
            <div key={round}>
              <div style={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 12, color: T.accent,
                letterSpacing: 1, marginBottom: 8 }}>{LABELS[round]}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {matches.map((teams, idx) => {
                  const w = winners[idx];
                  return (
                    <div key={idx} style={{ background: T.card, borderRadius: 11, padding: 4,
                      boxShadow: `inset 0 0 0 1px ${w ? T.accent + '55' : T.line}` }}>
                      <TeamRow team={teams[0]} isWinner={w && w === teams[0]} dimmed={w && w !== teams[0]} half={34} />
                      <div style={{ height: 1, background: T.line, margin: '0 8px' }} />
                      <TeamRow team={teams[1]} isWinner={w && w === teams[1]} dimmed={w && w !== teams[1]} half={34} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {/* 優勝 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          background: champ ? `linear-gradient(160deg, ${T.gold}22, ${T.card})` : T.card,
          borderRadius: 14, padding: '14px', boxShadow: `inset 0 0 0 1.5px ${champ ? T.gold + '88' : T.line}` }}>
          <Icon name="trophy" size={18} color={T.gold} />
          <span style={{ fontSize: 22 }}>{champ ? champ.flag : '🏆'}</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: champ ? T.text : T.faint }}>
            優勝予想：{champ ? champ.ja : '未選択'}</span>
        </div>
      </div>
    );
  }

  // ===== デスクトップ：フルブラケット =====
  const rowH = 42, cardH = 38, colW = 148, stepX = 184, LABEL_H = 26;
  const canvasH = 16 * rowH;
  const centerY = (r, idx) => (Math.pow(2, r) * (2 * idx + 1)) / 2 * rowH;
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
    return (
      <div style={{ position: 'absolute', left: colX(r), top: centerY(r, idx) - cardH / 2,
        width: colW, height: cardH, background: T.card, borderRadius: 11,
        boxShadow: `inset 0 0 0 1px ${w ? T.accent + '66' : T.line}`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 3, gap: 2 }}>
        <TeamRow team={teams[0]} isWinner={w && w === teams[0]} dimmed={w && w !== teams[0]} half={cardH / 2 - 3} />
        <div style={{ height: 1, background: T.line, margin: '0 6px' }} />
        <TeamRow team={teams[1]} isWinner={w && w === teams[1]} dimmed={w && w !== teams[1]} half={cardH / 2 - 3} />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
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
  );
}

Object.assign(window, { OptionViewScreen });
