// 永続化(KV)アクセスを集約する薄い層。API は env.CONFIG を直接叩かず、必ずこの
// store 経由で読み書きする。将来 Durable Objects / D1 へ載せ替える際の唯一の
// 差し替え点にすることが目的（呼び出し側＝APIハンドラを変えずにバックエンドを交換できる）。
//
// KV には CAS（compare-and-swap）が無いため、update() の楽観ロックは「書き込み直前に
// 読み直し、読んだ時と版(updatedAt)が変わっていたらやり直す」best-effort 実装。
// 同一データセンター内の read-after-write はおおむね整合するため同時参加の取りこぼしを
// 大幅に減らせるが、完全な直列化が必要になったら update() を Durable Object 実装へ
// 差し替える（このファイルだけ変えれば済む）。

// 2つのドキュメントが同じ版か（updatedAt をバージョン代わりに使う）。両方欠落は同一扱い。
function sameVersion(a, b) {
  const av = a && a.updatedAt != null ? a.updatedAt : null;
  const bv = b && b.updatedAt != null ? b.updatedAt : null;
  return av === bv;
}

// kv は Cloudflare KV バインディング（env.CONFIG）相当。テストではフェイクを渡す。
export function createStore(kv) {
  if (!kv || typeof kv.get !== 'function' || typeof kv.put !== 'function') {
    throw new Error('store: KV binding is required');
  }

  const getRaw = (key) => kv.get(key);
  const putRaw = (key, value) => kv.put(key, value);

  const getJSON = async (key) => {
    const s = await kv.get(key);
    if (s == null) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const putJSON = (key, value) => kv.put(key, JSON.stringify(value));

  // 読み込み→mutate→書き込みを retries 回まで再試行する楽観更新。
  // mutator(current) は次のいずれかを返す純関数を想定:
  //   - falsy            … 中断（{ ok:false, reason:'aborted' }）
  //   - { ok:false, reason } … 業務的に拒否（満員など。リトライしない）
  //   - { changed:false }    … 変更なし（書き込み省略＝無料枠の節約）
  //   - { changed:true, value } … value を書き込む
  // 競合（書き込み直前に版が変わっていた）を検知したら最新で mutate し直す。
  const update = async (key, mutator, { retries = 4 } = {}) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const current = await getJSON(key);
      const res = mutator(current);
      if (!res) return { ok: false, reason: 'aborted', value: current };
      if (res.ok === false) return { ok: false, reason: res.reason ?? 'rejected', value: current };
      if (res.changed === false) return { ok: true, changed: false, value: res.value ?? current };
      // 競合検知: 書き込み直前に読み直し、読んだ時と版が変わっていたらやり直す。
      const verify = await getJSON(key);
      if (!sameVersion(verify, current)) continue;
      await putJSON(key, res.value);
      return { ok: true, changed: true, value: res.value };
    }
    return { ok: false, reason: 'contended', value: null };
  };

  return { getRaw, putRaw, getJSON, putJSON, update };
}

// 永続データ（user/room/config）のバックエンドを選ぶ唯一の入口。現在は KV（env.CONFIG）。
// 将来 D1 や二重書き込みへ移行する際は、この関数だけ差し替えれば呼び出し側（API ハンドラ）は
// getStore(env) のまま無改修で載せ替えられる。
// 注意: session/otp など expirationTtl 依存の揮発データは TTL が必要なため、ここは通さず
//       引き続き env.CONFIG を直接使う（永続データではないので移行対象外）。
export function getStore(env) {
  if (!env || !env.CONFIG) throw new Error('getStore: env.CONFIG is required');
  return createStore(env.CONFIG);
}
