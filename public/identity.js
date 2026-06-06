/* ============================================================
   W杯2026 — 匿名 identity（同期コード）データ層
   window.WC.Me に集約。Babel前の普通の<script>で読み込む。
   localStorage:
     wc2026_identity_v1 = {"userId","code"}
     wc2026_me_v1       = User キャッシュ JSON（即時描画用）
   ============================================================ */
(function () {
  const ID_KEY = 'wc2026_identity_v1';
  const ME_KEY = 'wc2026_me_v1';

  function load() {
    try {
      const raw = localStorage.getItem(ID_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return (v && v.userId && v.code) ? { userId: v.userId, code: v.code } : null;
    } catch (e) { return null; }
  }
  function cachedUser() {
    try { const raw = localStorage.getItem(ME_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function saveIdentity(userId, code, user) {
    try {
      localStorage.setItem(ID_KEY, JSON.stringify({ userId, code }));
      if (user) localStorage.setItem(ME_KEY, JSON.stringify(user));
    } catch (e) {}
  }
  function cacheUser(user) {
    try { if (user) localStorage.setItem(ME_KEY, JSON.stringify(user)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(ID_KEY); localStorage.removeItem(ME_KEY); } catch (e) {}
  }

  async function postOp(body) {
    const res = await fetch('/api/user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      keepalive: !!body.__keepalive,
    });
    if (!res.ok) {
      let msg = '通信に失敗しました';
      const status = res.status;
      try { const e = await res.json(); if (e && e.error) msg = e.error; } catch (e2) {}
      const err = new Error(msg); err.status = status; throw err;
    }
    return res.json();
  }

  // 名前で新規作成。{userId, code, user} を保存して返す。
  // turnstileToken: bot対策トークン（鍵未設定時は undefined のままで可）。
  async function create(name, turnstileToken) {
    const out = await postOp({ op: 'create', name, turnstileToken });
    saveIdentity(out.userId, out.code, out.user);
    return out;
  }
  // 同期コードで復元。{userId, code, user} を保存して返す。
  async function sync(code) {
    const out = await postOp({ op: 'sync', code });
    saveIdentity(out.userId, out.code, out.user);
    return out;
  }
  // 名前を変更（本人確認=code 必須）。キャッシュへ名前だけマージして返す。
  async function setName(name) {
    const id = load();
    if (!id) throw new Error('ログインが必要です');
    const out = await postOp({ op: 'setName', userId: id.userId, code: id.code, name });
    const merged = { ...(cachedUser() || {}), name: out.name, updatedAt: out.updatedAt };
    cacheUser(merged);
    return merged;
  }

  // 保存済み identity で最新 user を取得。失効(404)なら clear して null。
  async function refresh() {
    const id = load();
    if (!id) return null;
    try {
      const out = await postOp({ op: 'sync', code: id.code });
      saveIdentity(out.userId, out.code, out.user);
      return out.user;
    } catch (e) {
      if (e.status === 404) { clear(); return null; }
      return cachedUser(); // 通信失敗はキャッシュで継続
    }
  }

  // ---- 予想の debounce 保存（setPred は code 必須=本人確認）----
  let timer = null, pending = null;
  function scheduleSave(pred) {
    pending = pred;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushSave, 700);
  }
  function flushSave() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending == null) return;
    const id = load(); const pred = pending; pending = null;
    if (!id) return;
    postOp({ op: 'setPred', userId: id.userId, code: id.code, pred })
      .then((u) => cacheUser(u))
      .catch((e) => console.error('予想の保存に失敗しました', e));
  }
  function flushBeacon() {
    if (pending == null) return;
    const id = load(); const pred = pending; pending = null;
    if (timer) { clearTimeout(timer); timer = null; }
    if (!id) return;
    try {
      const body = JSON.stringify({ op: 'setPred', userId: id.userId, code: id.code, pred });
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/user', blob);
      else postOp({ op: 'setPred', userId: id.userId, code: id.code, pred, __keepalive: true }).catch(() => {});
    } catch (e) {}
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushBeacon);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushBeacon();
    });
  }

  // ---- 部屋（ルーム）API ----
  async function postRoom(body) {
    const res = await fetch('/api/room', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store',
    });
    if (!res.ok) {
      let msg = '通信に失敗しました'; const status = res.status;
      try { const e = await res.json(); if (e && e.error) msg = e.error; } catch (e2) {}
      const err = new Error(msg); err.status = status; throw err;
    }
    return res.json();
  }
  // 部屋を作成 → {roomId, code, room}（turnstileToken は鍵未設定時 undefined で可）
  async function createRoom(userId, name, turnstileToken) { return postRoom({ op: 'create', userId, name, turnstileToken }); }
  // 部屋に参加 → {roomId, room}
  async function joinRoom(userId, code) { return postRoom({ op: 'join', userId, code }); }
  // 部屋＋メンバー取得 → {room, members:[publicUser]}
  async function getRoom(roomId) {
    const res = await fetch('/api/room?id=' + encodeURIComponent(roomId), { cache: 'no-store' });
    if (!res.ok) { const err = new Error('部屋を取得できません'); err.status = res.status; throw err; }
    return res.json();
  }

  window.WC = window.WC || {};
  window.WC.Me = {
    load, cachedUser, clear, create, sync, refresh, setName,
    scheduleSave, flushSave, flushBeacon, cacheUser,
  };
  window.WC.Rooms = { create: createRoom, join: joinRoom, get: getRoom };

  // 招待URL（?join=CODE）。受け取った端末は起動時に参加を促される。
  window.WC.roomInviteURL = (code) =>
    `${location.origin}/?join=${encodeURIComponent((code || '').replace(/-/g, ''))}`;
})();
