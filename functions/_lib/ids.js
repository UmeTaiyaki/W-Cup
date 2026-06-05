// ランダムな内部ID生成（純関数）。crypto.randomUUID があれば優先利用。
// 既存 predictions.js の genId と同方針だが、prefix を引数化して再利用可能にした。
export function genId(prefix = '') {
  try {
    if (globalThis.crypto && globalThis.crypto.randomUUID) {
      return prefix + globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
  } catch (e) {
    // randomUUID 不可な環境はフォールバックへ
  }
  return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}
