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

  // ---- 予想の保存（ハイブリッド：下書き=ローカル即時／保存=KV明示）----
  // 編集は端末の localStorage に「下書き」として即時保存する（無料・閉じても残る）。
  // KV への書き込みは commit()（＝「保存」ボタン）を押したときだけ行う＝書き込み激減。
  // 状態を購読者(UI)へ通知する：
  //   'idle'(同期済) | 'dirty'(未保存の下書きあり) | 'saving' | 'saved' | 'error'。
  // setPred は code 必須＝本人確認。
  const DRAFT_PREFIX = 'wc2026_draft_v1:';
  let saveState = 'idle';
  let failedPred = null;             // commit に失敗した予想（再試行用に保持）
  const saveSubs = new Set();

  // 下書きはユーザーごとに分離して保存（端末を共有しても混ざらない）。
  function draftKey() { const id = load(); return id ? DRAFT_PREFIX + id.userId : null; }
  function loadDraft() {
    try {
      const k = draftKey(); if (!k) return null;
      const raw = localStorage.getItem(k);
      const v = raw ? JSON.parse(raw) : null;
      return (v && v.pred) ? v.pred : null;
    } catch (e) { return null; }
  }
  function writeDraft(pred) {
    try { const k = draftKey(); if (k) localStorage.setItem(k, JSON.stringify({ pred })); } catch (e) {}
  }
  function removeDraft() {
    try { const k = draftKey(); if (k) localStorage.removeItem(k); } catch (e) {}
  }

  function setSaveState(s) {
    saveState = s;
    saveSubs.forEach((fn) => { try { fn(s); } catch (e) {} });
  }
  // UI が保存状態を購読する。登録直後に現在値を1回流す。戻り値で解除。
  function onSaveState(fn) {
    saveSubs.add(fn);
    try { fn(saveState); } catch (e) {}
    return () => { saveSubs.delete(fn); };
  }
  // KV 未反映の下書きが残っているか（離脱前の警告に使う）。
  function hasUnsaved() { return loadDraft() != null; }
  // KV に保存済みの値を取り込む際、未保存の下書きがあれば上書きせず温存する。
  function withDraft(user) {
    if (!user) return user;
    const d = loadDraft();
    return d ? { ...user, pred: d } : user;
  }

  // 編集のたびに呼ぶ：下書きをローカルに即時保存（KVは触らない）。
  function saveDraft(pred) {
    writeDraft(pred);
    failedPred = null;
    setSaveState('dirty');
  }

  // 「保存」：下書きを KV に1回だけ書き込む。成功で下書きを消し dirty を解除する。
  // 返り値は更新後の publicUser（呼び出し側が setMe で同期できる）。失敗時は throw。
  function commit() {
    const id = load();
    const pred = loadDraft();
    if (!id || pred == null) { setSaveState('idle'); return Promise.resolve(null); }
    setSaveState('saving');
    return postOp({ op: 'setPred', userId: id.userId, code: id.code, pred })
      .then((u) => { cacheUser(u); removeDraft(); failedPred = null; setSaveState('saved'); return u; })
      .catch((e) => {
        console.error('予想の保存に失敗しました', e);
        failedPred = pred;       // 下書きは消さないのでデータは安全。再度 commit で再試行可。
        setSaveState('error');
        throw e;
      });
  }

  if (typeof window !== 'undefined') {
    // 未保存の下書きが残ったままタブを閉じようとしたら警告（データ消失防止）。
    window.addEventListener('beforeunload', (e) => {
      if (hasUnsaved()) { e.preventDefault(); e.returnValue = ''; }
    });
    // 起動時：前回の未保存下書きが残っていれば「未保存」として表示する。
    if (loadDraft()) saveState = 'dirty';
  }

  // フィードバック送信（multipart）。{ ok } を返す。失敗時は error/status を持つ Error。
  async function sendFeedback({ text, imageFile, turnstileToken }) {
    const id = load();
    const fd = new FormData();
    fd.set('text', text || '');
    if (id && id.userId) fd.set('userId', id.userId);
    if (turnstileToken) fd.set('turnstileToken', turnstileToken);
    if (imageFile) fd.set('image', imageFile, imageFile.name || 'image.jpg');
    const res = await fetch('/api/feedback', { method: 'POST', body: fd, cache: 'no-store' });
    if (!res.ok) {
      let msg = '送信に失敗しました';
      const status = res.status;
      try { const e = await res.json(); if (e && e.error) msg = e.error; } catch (e2) {}
      const err = new Error(msg); err.status = status; throw err;
    }
    return res.json();
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
    load, cachedUser, clear, create, sync, refresh, setName, cacheUser,
    saveDraft, commit, loadDraft, withDraft, hasUnsaved, onSaveState,
  };
  window.WC.Rooms = { create: createRoom, join: joinRoom, get: getRoom };
  window.WC.Feedback = { send: sendFeedback };

  // 招待URL（?join=CODE）。受け取った端末は起動時に参加を促される。
  window.WC.roomInviteURL = (code) =>
    `${location.origin}/?join=${encodeURIComponent((code || '').replace(/-/g, ''))}`;
})();
