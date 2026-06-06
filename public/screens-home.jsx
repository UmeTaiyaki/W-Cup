/* ホームタブ：試合日程ビュー（読み取り専用・直近フォーカス型） */

// 小さな旗 or 未確定プレースホルダ
function MiniFlag({ T, team, size = 20 }) {
  const box = {
    width: size, height: size, borderRadius: size * 0.3, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)', fontSize: size * 0.95, lineHeight: 1,
  };
  if (team.resolved) return <div style={box}><span style={{ transform: 'scale(1.3)' }}>{team.flag}</span></div>;
  return <div style={{ ...box, color: T.faint, fontSize: size * 0.6 }}>?</div>;
}

// タイムライン1行：時刻 / A vs B / 章ラベル
function MatchRow({ T, match, last }) {
  const teamMap = window.WC.TEAM || {};
  const a = window.WC.formatMatchTeam(match.a, teamMap);
  const b = window.WC.formatMatchTeam(match.b, teamMap);
  const label = window.WC.roundLabel(match.round);
  const sideStyle = { fontWeight: 800, fontSize: 13, color: T.text, whiteSpace: 'nowrap' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '9px 4px',
      borderBottom: last ? 'none' : `1px solid ${T.line}`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, width: 46, flexShrink: 0 }}>
        {match.time || '--:--'}
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

  const focusDate = window.WC.pickFocusDate(groups.map((g) => g.date), window.WC.jstToday());
  const focusIdx = groups.findIndex((g) => g.date === focusDate);
  const rest = groups.slice(focusIdx + 1).filter((g) => g.date !== null);

  return (
    <div>
      <DayTimeline T={T} groups={rest} />
    </div>
  );
}

Object.assign(window, { HomeScreen, MatchRow });
