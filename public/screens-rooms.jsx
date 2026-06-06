/* ============================================================
   部屋（ルーム）: 一覧 / 作成 / 参加 ＋ 見比べビュー
   既存 CompareScreen / RankingScreen を room.members で再利用。
   window に RoomsScreen / RoomCompareScreen を export。
   ============================================================ */

const roomFmtCode = (c) => (c || '').replace(/(.{4})(?=.)/g, '$1-');

// 招待シート: リンク（ネイティブ共有＋LINE/X＋コピー）/ 参加コード を切替表示
function InviteSheet({ T, room, onClose }) {
  const { useState } = React;
  const [view, setView] = useState('link');   // 'link' | 'code'
  const [copied, setCopied] = useState('');    // '' | 'url' | 'code'
  const url = window.WC.roomInviteURL(room.code);
  const text = `「${room.name || '部屋'}」の予想に参加しよう！`;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  function flash(kind) { setCopied(kind); setTimeout(() => setCopied(''), 1600); }
  function copy(kind, value) {
    try { navigator.clipboard.writeText(value); flash(kind); } catch (e) {}
  }
  function openWin(href) { try { window.open(href, '_blank', 'noopener'); } catch (e) {} }
  async function nativeShare() {
    try { await navigator.share({ title: 'W杯予想 部屋への招待', text, url }); }
    catch (e) { /* キャンセル等は無視 */ }
  }
  const shareLine = () => openWin('https://line.me/R/share?text=' + encodeURIComponent(text + '\n' + url));
  const shareX = () => openWin('https://x.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url));

  const tile = (label, bg, glyph, onClick) => (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
      border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
      <span style={{ width: 52, height: 52, borderRadius: 16, background: bg,
        display: 'grid', placeItems: 'center', boxShadow: `inset 0 0 0 1px ${T.line}` }}>{glyph}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.sub }}>{label}</span>
    </button>
  );
  const brand = (txt, color) => (
    <span style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 900, fontSize: 16, color, letterSpacing: -0.5 }}>{txt}</span>
  );

  const seg = (id, label) => {
    const active = view === id;
    return (
      <button key={id} onClick={() => setView(id)} style={{
        flex: 1, border: 'none', borderRadius: 9, padding: '9px', cursor: 'pointer',
        fontFamily: 'inherit', fontWeight: 800, fontSize: 14,
        background: active ? T.accent : 'transparent', color: active ? T.accentInk : T.sub }}>{label}</button>
    );
  };

  return (
    <Sheet open onClose={onClose} T={T} title="仲間を招待">
      <div style={{ padding: '0 18px 4px' }}>
        <p style={{ color: T.faint, fontSize: 13, lineHeight: 1.5, margin: '0 0 14px' }}>
          「{room.name || '部屋'}」に招待して、予想を見比べましょう。</p>

        <div style={{ display: 'flex', gap: 6, background: T.panel2, borderRadius: 12, padding: 4, marginBottom: 16 }}>
          {seg('link', 'リンク')}{seg('code', '参加コード')}
        </div>

        {view === 'link' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.card,
              borderRadius: 14, padding: '12px 14px', boxShadow: `inset 0 0 0 1px ${T.line}`, marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.sub, fontWeight: 600,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</div>
              <button onClick={() => copy('url', url)} style={{
                border: 'none', borderRadius: 10, padding: '8px 12px', cursor: 'pointer',
                background: copied === 'url' ? T.card : `${T.accent}1A`, color: T.accent, fontFamily: 'inherit',
                fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                boxShadow: copied === 'url' ? `inset 0 0 0 1.5px ${T.accent}` : 'none' }}>
                <Icon name={copied === 'url' ? 'check' : 'copy'} size={14} color={T.accent} sw={2.4} />
                {copied === 'url' ? 'コピー済' : 'コピー'}</button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {tile('LINE', '#06C755', brand('LINE', '#fff'), shareLine)}
              {tile('X', '#000', brand('X', '#fff'), shareX)}
              {canNativeShare && tile('その他', T.panel2, <Icon name="share" size={22} color={T.text} />, nativeShare)}
              {tile('コピー', T.panel2,
                <Icon name={copied === 'url' ? 'check' : 'copy'} size={21} color={copied === 'url' ? T.accent : T.text} sw={2.2} />,
                () => copy('url', url))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '4px 0 4px' }}>
            <div style={{ fontFamily: 'Archivo, monospace', fontWeight: 900, fontSize: 30,
              letterSpacing: 4, color: T.text }}>{roomFmtCode(room.code)}</div>
            <button onClick={() => copy('code', room.code)} style={{
              margin: '16px auto 0', border: 'none', borderRadius: 12, padding: '11px 18px', cursor: 'pointer',
              background: copied === 'code' ? T.card : `${T.accent}1A`, color: T.accent, fontFamily: 'inherit',
              fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7,
              boxShadow: copied === 'code' ? `inset 0 0 0 1.5px ${T.accent}` : 'none' }}>
              <Icon name={copied === 'code' ? 'check' : 'copy'} size={16} color={T.accent} sw={2.4} />
              {copied === 'code' ? 'コピー済' : 'コードをコピー'}</button>
            <p style={{ color: T.faint, fontSize: 12, lineHeight: 1.5, margin: '14px 0 0' }}>
              アプリの「部屋」→「コードで参加」にこのコードを入力すると参加できます。</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// me.rooms に部屋参照を重複なく足した新しい me を返す
function withRoom(me, room) {
  const rooms = Array.isArray(me.rooms) ? me.rooms : [];
  if (rooms.some((r) => r && r.id === room.id)) return me;
  return { ...me, rooms: [...rooms, { id: room.id, code: room.code, name: room.name }] };
}

// 部屋一覧＋作る/参加
function RoomsScreen({ T, me, setMe, onOpenRoom, wide = false, siteKey }) {
  const { useState } = React;
  const [mode, setMode] = useState(null);      // 'create' | 'join' | null
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null); // 作成直後に参加コードを見せる
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState(null);     // Turnstile トークン（siteKey なしなら不要）
  const [tsKey, setTsKey] = useState(0);        // 失敗時にウィジェットを再マウントするためのキー
  const rooms = Array.isArray(me.rooms) ? me.rooms : [];

  function commitMe(nextMe) { setMe(nextMe); window.WC.Me.cacheUser(nextMe); }

  async function doCreate() {
    const nm = name.trim(); if (!nm || busy) return;
    if (siteKey && !token) { setErr('「私はロボットではありません」の確認を完了してください'); return; }
    setBusy(true); setErr('');
    try {
      const out = await window.WC.Rooms.create(me.id, nm, token);
      commitMe(withRoom(me, out.room));
      setCreated(out.room); setName('');
    } catch (e) {
      setErr(e.message || '作成に失敗しました');
      if (siteKey) { setToken(null); setTsKey((k) => k + 1); }  // 使い切りトークンを作り直す
    }
    finally { setBusy(false); }
  }
  async function doJoin() {
    const c = code.trim(); if (!c || busy) return;
    setBusy(true); setErr('');
    try {
      const out = await window.WC.Rooms.join(me.id, c);
      commitMe(withRoom(me, out.room));
      setCode(''); setMode(null);
      onOpenRoom(out.room);
    } catch (e) {
      setErr(e.status === 404 ? 'コードに該当する部屋がありません' : (e.message || '参加に失敗しました'));
    } finally { setBusy(false); }
  }
  function copyCreated() {
    try { navigator.clipboard.writeText(created.code); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch (e) {}
  }

  const pad = wide ? '4px 0 24px' : '4px 16px 16px';
  const input = (val, set, ph, mono) => (
    <input autoFocus value={val} maxLength={mono ? 12 : 24} onChange={(e) => set(e.target.value)}
      placeholder={ph}
      style={{ width: '100%', border: 'none', outline: 'none', boxSizing: 'border-box',
        background: T.panel2, color: T.text, fontSize: mono ? 19 : 17, fontFamily: mono ? 'Archivo, monospace' : 'inherit',
        fontWeight: mono ? 800 : 700, letterSpacing: mono ? 3 : 0, textAlign: mono ? 'center' : 'left',
        padding: '14px 16px', borderRadius: 14, boxShadow: `inset 0 0 0 1px ${T.line}` }} />
  );
  const primary = (label, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', border: 'none', borderRadius: 14, padding: '14px', fontFamily: 'inherit',
      fontWeight: 800, fontSize: 16, cursor: disabled ? 'default' : 'pointer',
      background: disabled ? T.card : T.accent, color: disabled ? T.faint : T.accentInk,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{label}</button>
  );

  return (
    <div style={{ padding: pad }}>
      <Eyebrow T={T}>ROOMS</Eyebrow>
      <div style={{ fontSize: wide ? 27 : 23, fontWeight: 800, color: T.text, marginTop: 3, marginBottom: 4 }}>
        部屋で見比べ</div>
      <p style={{ color: T.sub, fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
        仲間と予想を見比べる部屋です。新しく作るか、もらったコードで参加できます。</p>

      {/* 部屋一覧 */}
      {rooms.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {rooms.map((r) => (
            <button key={r.id} onClick={() => onOpenRoom(r)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: T.card, borderRadius: 16, padding: '13px 14px',
              boxShadow: `inset 0 0 0 1px ${T.line}` }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center',
                background: `${T.accent}1F` }}>
                <Icon name="people" size={20} color={T.accent} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: T.text, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name || '（無名の部屋）'}</div>
                <div style={{ fontFamily: 'Archivo, monospace', fontSize: 12, color: T.faint,
                  letterSpacing: 1.5, marginTop: 1 }}>{roomFmtCode(r.code)}</div>
              </div>
              <Icon name="chevron" size={18} color={T.faint} />
            </button>
          ))}
        </div>
      ) : (
        <div style={{ background: T.card, borderRadius: 16, padding: '18px 16px', marginBottom: 16,
          textAlign: 'center', color: T.faint, fontSize: 14, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
          まだ部屋がありません</div>
      )}

      {/* アクション or フォーム */}
      {mode === null && !created && (
        <div style={{ display: 'flex', gap: 10 }}>
          {primary('＋ 部屋を作る', () => { setErr(''); setMode('create'); })}
          <button onClick={() => { setErr(''); setMode('join'); }} style={{
            width: '100%', border: 'none', borderRadius: 14, padding: '14px', fontFamily: 'inherit',
            fontWeight: 800, fontSize: 16, cursor: 'pointer', background: T.card, color: T.text,
            boxShadow: `inset 0 0 0 1.5px ${T.line}` }}>コードで参加</button>
        </div>
      )}

      {/* 作成フォーム */}
      {mode === 'create' && !created && (
        <div style={{ background: T.card, borderRadius: 16, padding: 16, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
          <div style={{ fontWeight: 800, color: T.text, fontSize: 15, marginBottom: 10 }}>部屋を作る</div>
          {input(name, setName, '部屋名（例：会社の予想大会）', false)}
          <TurnstileWidget key={tsKey} siteKey={siteKey} onToken={setToken} theme={T.isDark === false ? 'light' : 'dark'} />
          {err && <p style={{ color: T.danger, fontSize: 13, fontWeight: 700, margin: '10px 2px 0' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setMode(null); setErr(''); }} style={{
              flex: 1, border: 'none', borderRadius: 12, padding: '12px', fontFamily: 'inherit',
              fontWeight: 800, fontSize: 14, cursor: 'pointer', background: T.panel2, color: T.sub }}>キャンセル</button>
            <div style={{ flex: 1 }}>{primary(busy ? '…' : '作成', doCreate, !name.trim() || busy || (siteKey && !token))}</div>
          </div>
        </div>
      )}

      {/* 作成完了→参加コード表示 */}
      {created && (
        <div style={{ background: T.card, borderRadius: 16, padding: 16, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
          <div style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>「{created.name}」を作成しました</div>
          <p style={{ color: T.faint, fontSize: 13, lineHeight: 1.6, margin: '6px 0 12px' }}>
            この参加コードを仲間に共有してください。</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontFamily: 'Archivo, monospace', fontWeight: 900, fontSize: 24,
              letterSpacing: 3, color: T.text }}>{roomFmtCode(created.code)}</div>
            <button onClick={copyCreated} style={{
              border: 'none', borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
              background: copied ? T.card : `${T.accent}1A`, color: T.accent, fontFamily: 'inherit',
              fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: copied ? `inset 0 0 0 1.5px ${T.accent}` : 'none' }}>
              <Icon name={copied ? 'check' : 'copy'} size={16} color={T.accent} sw={2.4} />
              {copied ? 'コピー済' : 'コピー'}</button>
          </div>
          <div style={{ marginTop: 14 }}>
            {primary('この部屋を見る', () => { const r = created; setCreated(null); setMode(null); onOpenRoom(r); })}
          </div>
        </div>
      )}

      {/* 参加フォーム */}
      {mode === 'join' && (
        <div style={{ background: T.card, borderRadius: 16, padding: 16, boxShadow: `inset 0 0 0 1px ${T.line}` }}>
          <div style={{ fontWeight: 800, color: T.text, fontSize: 15, marginBottom: 10 }}>コードで参加</div>
          {input(code, setCode, 'XXXX-XXXX', true)}
          {err && <p style={{ color: T.danger, fontSize: 13, fontWeight: 700, margin: '10px 2px 0' }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setMode(null); setErr(''); }} style={{
              flex: 1, border: 'none', borderRadius: 12, padding: '12px', fontFamily: 'inherit',
              fontWeight: 800, fontSize: 14, cursor: 'pointer', background: T.panel2, color: T.sub }}>キャンセル</button>
            <div style={{ flex: 1 }}>{primary(busy ? '…' : '参加', doJoin, !code.trim() || busy)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// 部屋ビュー: メンバー丸アイコン切替＋選択メンバーのホーム風サマリー
// （見比べ / ランキングはサブタブで併存。既存 Summary/OptionView/Compare/Ranking を再利用）
function RoomCompareScreen({ T, me, room, goBack, wide = false, availWidth, refreshKey = 0 }) {
  const { useState, useEffect } = React;
  const [data, setData] = useState(null);   // {room, members}
  const [err, setErr] = useState('');
  const [view, setView] = useState('members'); // 'members' | 'compare' | 'rank'
  const [sel, setSel] = useState(me.id);       // 選択中メンバー
  const [showInvite, setShowInvite] = useState(false);
  const COLORS = window.WC.MEMBER_COLORS || ['#FF8A3D', '#34D399', '#60A5FA', '#F472B6', '#A78BFA', '#22D3EE'];

  function load() {
    return window.WC.Rooms.get(room.id)
      .then((d) => { setData(d); setErr(''); })
      .catch((e) => setErr(e.message || '部屋を取得できません'));
  }
  // room 切替 or プル更新(refreshKey)で再取得
  useEffect(() => { let alive = true; load().then(() => { if (!alive) setData(null); }); return () => { alive = false; }; }, [room.id, refreshKey]);

  // publicUser[] → 既存 screens 用の state（members に色/イニシャルを付与。自分を先頭に）
  // 自分のアバターは常にアクセント色（右上のアイコンと一致）。他メンバーはパレット色を順に割当。
  const state = data ? (() => {
    const ordered = [...data.members].sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : 0));
    let oi = 0;
    const members = ordered.map((u) => ({
      id: u.id, name: u.name || '名無し',
      c: u.id === me.id ? T.accent : COLORS[oi++ % COLORS.length],
      initial: Array.from(u.name || '?')[0] || '?',
    }));
    const preds = {};
    ordered.forEach((u) => { preds[u.id] = u.pred || window.WC.emptyPred(); });
    return { current: me.id, members, preds };
  })() : null;

  const members = state ? state.members : [];
  const curId = members.find((m) => m.id === sel) ? sel : (members[0] && members[0].id);
  const curMember = members.find((m) => m.id === curId) || null;
  const curPred = state ? state.preds[curId] : null;

  const pad = wide ? '4px 0 24px' : '4px 16px 16px';

  return (
    <div style={{ padding: pad }}>
      {/* 控えめなヘッダー: 一覧へ / 部屋名 / 招待ボタン */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={goBack} style={{
          border: 'none', background: 'transparent', color: T.sub, fontFamily: 'inherit',
          fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
          gap: 2, padding: '2px 0' }}>← 一覧</button>
        <span style={{ color: T.line }}>|</span>
        <span style={{ color: T.sub, fontWeight: 700, fontSize: 13, maxWidth: 150,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.name || '部屋'}</span>
        <button onClick={() => setShowInvite(true)} title="仲間を招待" style={{
          marginLeft: 'auto', border: 'none', borderRadius: 999, padding: '6px 13px',
          background: `${T.accent}1A`, color: T.accent, fontFamily: 'inherit',
          fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'inline-flex',
          alignItems: 'center', gap: 5 }}>
          <Icon name="share" size={14} color={T.accent} sw={2.2} />招待</button>
      </div>

      {showInvite && <InviteSheet T={T} room={room} onClose={() => setShowInvite(false)} />}

      {err && <div style={{ color: T.danger, fontSize: 14, fontWeight: 700, padding: '12px 0' }}>{err}</div>}
      {!data && !err && <div style={{ color: T.faint, fontSize: 14, padding: '20px 0', textAlign: 'center' }}>読み込み中…</div>}

      {state && (
        <div>
          {/* サブタブ: メンバー / 見比べ / ランキング */}
          <div style={{ display: 'flex', gap: 6, background: T.panel2, borderRadius: 12, padding: 4, marginBottom: 14 }}>
            {[['members', 'メンバー'], ['compare', '見比べ'], ['rank', 'ランキング']].map(([id, label]) => {
              const active = view === id;
              return (
                <button key={id} onClick={() => { setView(id); }} style={{
                  flex: 1, border: 'none', borderRadius: 9, padding: '9px', cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: 800, fontSize: 14,
                  background: active ? T.accent : 'transparent', color: active ? T.accentInk : T.sub }}>
                  {label}</button>
              );
            })}
          </div>

          {view === 'members' && (
            <div>
              {/* メンバー丸アイコン切替 */}
              <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4, marginBottom: 6 }}>
                {members.map((m) => {
                  const active = m.id === curId;
                  return (
                    <button key={m.id} onClick={() => setSel(m.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                      border: 'none', cursor: 'pointer', borderRadius: 999,
                      padding: active ? '5px 13px 5px 5px' : '5px',
                      background: active ? T.card : 'transparent',
                      boxShadow: active ? `inset 0 0 0 1px ${m.c}66` : 'none', transition: '.18s ease' }}>
                      <Avatar m={m} size={30} T={T} />
                      {active && <span style={{ fontWeight: 800, fontSize: 14, color: T.text,
                        whiteSpace: 'nowrap' }}>{m.name}{m.id === me.id ? '（あなた）' : ''}</span>}
                    </button>
                  );
                })}
              </div>

              <SummaryScreen solo hideShare T={T} state={state} member={curMember} pred={curPred} wide={wide} />
            </div>
          )}

          {view === 'compare' && <CompareScreen T={T} state={state} goTab={() => setView('rank')} wide={wide} />}
          {view === 'rank' && <RankingScreen T={T} state={state} wide={wide} />}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { RoomsScreen, RoomCompareScreen });
