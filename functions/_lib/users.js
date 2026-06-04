// User（名前＋予想1つ＋同期コード）の生成・検証（純関数）。
// 認証なしエンドポイント向けに名前長・payload に上限を設ける。
import { genId } from './ids.js';
import { emptyPred, validatePred } from './predictions.js';
import { normalizeCode } from './codes.js';

export const USER_LIMITS = { name: 20, postBytes: 64 * 1024 };

const trimName = (name) => {
  if (typeof name !== 'string') return null;
  const nm = name.trim();
  if (!nm) return null;
  return Array.from(nm).slice(0, USER_LIMITS.name).join('');
};

// 名前とコードから新規 User を生成。名前不正なら null。
export function makeUser(name, code) {
  const nm = trimName(name);
  if (!nm) return null;
  return {
    version: 1,
    id: genId('u'),
    name: nm,
    code: normalizeCode(code),
    pred: emptyPred(),
    updatedAt: new Date().toISOString(),
  };
}

// 他者に見せてよい公開ビュー。秘密の同期コード(code)を除外する。
// 部屋の見比べボードや id 指定取得など、本人以外も読みうる応答で使う。
export function publicUser(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    id: user.id,
    name: user.name,
    pred: user.pred,
    updatedAt: user.updatedAt ?? null,
  };
}

// 保存済み/受信した User を安全な形へ正規化。必須項目（id）が無ければ null。
export function validateUser(input) {
  if (!input || typeof input !== 'object') return null;
  if (typeof input.id !== 'string' || !input.id) return null;
  const nm = trimName(input.name) || '';
  return {
    version: 1,
    id: input.id,
    name: nm,
    code: normalizeCode(input.code),
    pred: validatePred(input.pred).value,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
  };
}
