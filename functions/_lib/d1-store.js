// D1 バインディングを store インターフェース（getRaw/putRaw/getJSON/putJSON/update）へ
// 適合させるアダプタ。KV 版（store.js の createStore）と同一の戻り値契約を守るため、
// 呼び出し側（API ハンドラ）は無改修で KV ⇄ D1 を載せ替えられる。
//
// データモデル: 単一テーブル kv(k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at TEXT)。
// JSON はパースせず v に丸ごと格納（KV と同形）。updated_at は doc.updatedAt のミラーで、
// update() の compare-and-swap（CAS）に使う。KV の best-effort 楽観ロックと違い、D1 では
// 条件付き UPDATE（WHERE updated_at IS ?）で真の CAS になり、競合は確実に直列化される。

const SELECT_SQL = 'SELECT v FROM kv WHERE k = ?';
const UPSERT_SQL =
  'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ' +
  'ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at';
const CAS_UPDATE_SQL = 'UPDATE kv SET v = ?, updated_at = ? WHERE k = ? AND updated_at IS ?';
const CAS_INSERT_SQL = 'INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO NOTHING';

// 文字列値から版（updatedAt）を取り出す。JSON でなければ／updatedAt が無ければ null。
function verOf(value) {
  if (typeof value !== 'string') return null;
  try {
    const o = JSON.parse(value);
    return o && o.updatedAt != null ? o.updatedAt : null;
  } catch {
    return null;
  }
}

export function createD1Store(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('createD1Store: D1 binding is required');
  }

  const getRaw = async (key) => {
    const row = await db.prepare(SELECT_SQL).bind(key).first();
    return row && row.v != null ? row.v : null;
  };

  // 書き込み。updated_at に doc.updatedAt をミラーして CAS に使えるようにする。
  const putRaw = async (key, value) => {
    await db.prepare(UPSERT_SQL).bind(key, value, verOf(value)).run();
  };

  const getJSON = async (key) => {
    const s = await getRaw(key);
    if (s == null) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const putJSON = (key, value) => putRaw(key, JSON.stringify(value));

  // CAS による楽観更新。mutator の契約は store.js の update() と同一:
  //   falsy → aborted / { ok:false, reason } → rejected / { changed:false } → 書き込み省略 /
  //   { changed:true, value } → CAS で書き込み。版が変わっていれば最新で mutate し直す。
  const update = async (key, mutator, { retries = 4 } = {}) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const current = await getJSON(key);
      const res = mutator(current);
      if (!res) return { ok: false, reason: 'aborted', value: current };
      if (res.ok === false) return { ok: false, reason: res.reason ?? 'rejected', value: current };
      if (res.changed === false) return { ok: true, changed: false, value: res.value ?? current };

      const nextRaw = JSON.stringify(res.value);
      const nextVer = verOf(nextRaw);
      if (current == null) {
        // 不在 → 挿入。同時に他者が挿入していたら changes:0 でやり直す。
        const r = await db.prepare(CAS_INSERT_SQL).bind(key, nextRaw, nextVer).run();
        if (r && r.meta && r.meta.changes === 1) return { ok: true, changed: true, value: res.value };
        continue;
      }
      // 存在 → 読んだ版(updatedAt)が一致するときだけ更新（compare-and-swap）。
      const expected = current.updatedAt != null ? current.updatedAt : null;
      const r = await db.prepare(CAS_UPDATE_SQL).bind(nextRaw, nextVer, key, expected).run();
      if (r && r.meta && r.meta.changes === 1) return { ok: true, changed: true, value: res.value };
      // changes:0 → 競合（誰かが先に更新）。最新で mutate し直す。
    }
    return { ok: false, reason: 'contended', value: null };
  };

  return { getRaw, putRaw, getJSON, putJSON, update };
}
