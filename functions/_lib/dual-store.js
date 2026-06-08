// 二重書き込みストア。KV と D1 の2つの store インスタンスを合成し、移行期間中は
// 両系へ書き込みつつ、読み出しは readBackend（'kv' | 'd1'）で選んだ側＝「正系」から行う。
//
// 設計方針（無停止移行のため）:
//   - put 系は両系へ書く。正系（readBackend 側）の書き込み失敗は伝播し、ユーザーに保存失敗を返す。
//     副系の失敗は握りつぶしてログのみ（可用性を落とさない。データはバックフィルで後追い整合可能）。
//   - update 系は正系で read-modify-write（CAS）し、変更があれば結果を副系へミラーする（best-effort）。
// これにより「読みは常に正系の最新」「副系は影として追従」が保たれ、readBackend を切り替えるだけで
// 段階移行・即時ロールバックができる。

export function createDualStore({ kvStore, d1Store, readBackend = 'kv' } = {}) {
  if (!kvStore || typeof kvStore.getRaw !== 'function') throw new Error('createDualStore: kvStore is required');
  if (!d1Store || typeof d1Store.getRaw !== 'function') throw new Error('createDualStore: d1Store is required');

  const primary = readBackend === 'd1' ? d1Store : kvStore;
  const secondary = readBackend === 'd1' ? kvStore : d1Store;
  const secondaryTag = readBackend === 'd1' ? 'KV' : 'D1';

  // 副系への書き込みは best-effort。失敗してもユーザー操作は成功扱いにし、ログだけ残す。
  const mirror = async (fn) => {
    try {
      await fn(secondary);
    } catch (e) {
      console.error(`dual-store: 副系(${secondaryTag})への書き込みに失敗（ログのみ・正系は成功）`, e);
    }
  };

  const getRaw = (key) => primary.getRaw(key);
  const getJSON = (key) => primary.getJSON(key);

  const putRaw = async (key, value) => {
    await primary.putRaw(key, value);            // 正系は失敗を伝播
    await mirror((s) => s.putRaw(key, value));    // 副系は握りつぶす
  };

  const putJSON = async (key, value) => {
    await primary.putJSON(key, value);
    await mirror((s) => s.putJSON(key, value));
  };

  const update = async (key, mutator, opts) => {
    const res = await primary.update(key, mutator, opts);
    // 実際に書き込まれた（changed:true）ときだけ副系へ最新値をミラーする。
    if (res && res.ok && res.changed && res.value !== undefined) {
      await mirror((s) => s.putJSON(key, res.value));
    }
    return res;
  };

  return { getRaw, putRaw, getJSON, putJSON, update };
}
