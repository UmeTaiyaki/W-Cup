/* ホームタブ：試合日程ビュー（読み取り専用・直近フォーカス型） */

// 小さな旗（枠なしの絵文字）。未確定チームは何も表示しない。
function MiniFlag({ team, size = 20 }) {
  if (!team.resolved) return null;
  return <span style={{ fontSize: size, lineHeight: 1, flexShrink: 0 }}>{team.flag}</span>;
}

// ライブ状態の小バッジ（LIVE=赤・終了=控えめ）
function LiveBadge({ T, status }) {
  const isLive = status === 'LIVE';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
      background: isLive ? 'rgba(255,90,90,0.16)' : 'rgba(255,255,255,0.06)',
      color: isLive ? '#ff5a5a' : T.sub,
      border: `1px solid ${isLive ? 'rgba(255,90,90,0.35)' : T.line}`,
    }}>
      {isLive && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#ff5a5a' }} />}
      {isLive ? 'LIVE' : '終了'}
    </span>
  );
}

// タイムライン1行：時刻(or スコア) / A vs B / 章ラベル
function MatchRow({ T, match, last }) {
  const teamMap = window.WC.TEAM || {};
  const a = window.WC.formatMatchTeam(match.a, teamMap, match.round);
  const b = window.WC.formatMatchTeam(match.b, teamMap, match.round);
  const label = window.WC.roundLabel(match.round);
  const live = window.WC.liveForMatch ? window.WC.liveForMatch(match) : null;
  const sideStyle = { fontWeight: 800, fontSize: 13, color: T.text, whiteSpace: 'nowrap' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 4px',
      borderBottom: last ? 'none' : `1px solid ${T.line}`,
    }}>
      <div style={{
        fontSize: live ? 13 : 12, fontWeight: 800,
        color: live ? (live.status === 'LIVE' ? '#ff5a5a' : T.text) : T.accent,
        width: 46, flexShrink: 0,
      }}>
        {live ? `${live.a ?? 0}-${live.b ?? 0}` : (match.time || '--:--')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
        <MiniFlag T={T} team={a} />
        <span style={sideStyle}>{a.resolved ? a.code : a.label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.faint, padding: '0 6px' }}>vs</span>
        <span style={sideStyle}>{b.resolved ? b.code : b.label}</span>
        <MiniFlag T={T} team={b} />
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
        background: 'rgba(255,255,255,0.06)', color: T.sub, border: `1px solid ${T.line}`,
        flexShrink: 0, marginLeft: 8,
      }}>{label}</span>
    </div>
  );
}

// 日本語の曜日付き日付表記（'2026-06-13' → '6月13日(土)'）
function formatDateJa(dateStr) {
  if (!dateStr) return '日付未定';
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日(${wd})`;
}

// 翌日以降の日付グループを順に表示
function DayTimeline({ T, groups }) {
  if (!groups.length) return null;
  return (
    <div>
      {groups.map((g) => (
        <div key={g.date || 'tbd'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 4px 8px' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: T.accent }} />
            <span style={{ fontWeight: 800, fontSize: 13, color: T.text }}>{formatDateJa(g.date)}</span>
            <span style={{ fontSize: 11, color: T.faint }}>{g.matches.length}試合</span>
          </div>
          <Card T={T} style={{ padding: '4px 12px' }}>
            {g.matches.map((m, i) => (
              <MatchRow key={`${m.time || 'x'}-${m.a}-${m.b}`} T={T} match={m} last={i === g.matches.length - 1} />
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

// 日数差（'YYYY-MM-DD' 同士）。today→focus が何日後か。
function daysUntil(today, focus) {
  if (!today || !focus) return 0;
  const a = Date.UTC(...today.split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n));
  const b = Date.UTC(...focus.split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n));
  return Math.round((b - a) / 86400000);
}

// フォーカス日の試合をスワイプ/矢印/ドットで切替表示
function MatchCarousel({ T, dateStr, matches, today }) {
  const [idx, setIdx] = React.useState(0);
  const touch = React.useRef(null);
  const n = matches.length;
  const cur = matches[Math.min(idx, n - 1)];
  const teamMap = window.WC.TEAM || {};
  const a = window.WC.formatMatchTeam(cur.a, teamMap, cur.round);
  const b = window.WC.formatMatchTeam(cur.b, teamMap, cur.round);
  const diff = daysUntil(today, dateStr);
  const countdown = diff <= 0 ? '本日' : `あと${diff}日`;
  const live = window.WC.liveForMatch ? window.WC.liveForMatch(cur) : null;

  const go = (delta) => setIdx((p) => Math.max(0, Math.min(n - 1, p + delta)));
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touch.current = null;
  };

  // 控えめなオーバーレイ矢印（枠・背景なし、カード左右端に重ねる）
  const arrow = (delta, char, on, edge) => (
    <button onClick={() => go(delta)} disabled={!on} aria-label={delta < 0 ? '前の試合' : '次の試合'} style={{
      position: 'absolute', top: '50%', [edge]: 2, transform: 'translateY(-50%)',
      width: 26, height: 40, border: 'none', background: 'transparent', padding: 0,
      color: T.faint, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 22, lineHeight: 1, cursor: on ? 'pointer' : 'default',
      opacity: on ? 0.5 : 0.12, userSelect: 'none',
    }}>{char}</button>
  );

  const side = (team) => (
    <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
      <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {team.resolved && <span style={{ fontSize: 42, lineHeight: 1 }}>{team.flag}</span>}
      </div>
      <div style={{ fontWeight: 800, fontSize: 13, color: T.text, marginTop: 6 }}>
        {team.resolved ? team.code : team.label}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '2px 6px 8px' }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: T.text }}>📅 {formatDateJa(dateStr)} の試合</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.faint }}>{idx + 1} / {n}</span>
      </div>
      <div style={{ position: 'relative' }}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Card T={T} style={{ borderColor: 'rgba(182,255,60,0.30)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
              background: 'rgba(182,255,60,0.14)', color: T.accent, border: '1px solid rgba(182,255,60,0.25)',
            }}>{window.WC.roundLabel(cur.round)}</span>
            {live
              ? <LiveBadge T={T} status={live.status} />
              : <span style={{ fontSize: 11, fontWeight: 700, color: T.faint }}>{countdown}</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {side(a)}
            <div style={{ textAlign: 'center', minWidth: 64 }}>
              {live
                ? (
                  <div>
                    <div style={{ fontSize: 27, fontWeight: 800, color: T.text, letterSpacing: 1 }}>
                      {live.a ?? 0}<span style={{ color: T.faint, margin: '0 6px' }}>-</span>{live.b ?? 0}
                    </div>
                    <div style={{ fontSize: 10, color: live.status === 'LIVE' ? '#ff5a5a' : T.faint }}>
                      {live.status === 'LIVE' ? 'LIVE' : '終了'}
                    </div>
                  </div>
                )
                : (
                  <div>
                    <div style={{ fontSize: 23, fontWeight: 800, color: T.text }}>{cur.time || '--:--'}</div>
                    <div style={{ fontSize: 10, color: T.faint }}>KICK OFF</div>
                  </div>
                )}
            </div>
            {side(b)}
          </div>
          {live && live.result_info && (
            <div style={{ textAlign: 'center', fontSize: 11, color: T.faint, marginTop: 12 }}>{live.result_info}</div>
          )}
          {cur.note && (
            <div style={{ textAlign: 'center', fontSize: 11, color: T.faint, marginTop: 14 }}>📍 {cur.note}</div>
          )}
        </Card>
        {n > 1 && arrow(-1, '‹', idx > 0, 'left')}
        {n > 1 && arrow(1, '›', idx < n - 1, 'right')}
      </div>
      {n > 1 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
          {matches.map((_, i) => (
            <span key={i} style={{
              width: i === idx ? 18 : 7, height: 7, borderRadius: 4,
              background: i === idx ? T.accent : 'rgba(255,255,255,0.18)', transition: 'all .2s',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function HomeScreen({ T }) {
  const schedule = window.WC.SCHEDULE || [];
  const groups = window.WC.groupByDate(schedule);

  if (!groups.length) {
    return (
      <div style={{ padding: '40px 8px', textAlign: 'center', color: T.sub }}>
        日程は準備中です
      </div>
    );
  }

  const today = window.WC.jstToday();
  const focusDate = window.WC.pickFocusDate(groups.map((g) => g.date), today);
  const focusIdx = groups.findIndex((g) => g.date === focusDate);
  const focusGroup = groups[focusIdx];
  const rest = groups.slice(focusIdx + 1).filter((g) => g.date !== null);

  return (
    <div>
      <MatchCarousel T={T} dateStr={focusGroup.date} matches={focusGroup.matches} today={today} />
      <DayTimeline T={T} groups={rest} />
    </div>
  );
}

Object.assign(window, { HomeScreen, MatchRow });
