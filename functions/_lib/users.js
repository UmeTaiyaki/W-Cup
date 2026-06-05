// User（名前＋予想1つ＋同期コード）の生成・検証（純関数）。
// 認証なしエンドポイント向けに名前長・payload に上限を設ける。
import { genId } from './ids.js';
import { emptyPred, validatePred } from './predictions.js';
import { normalizeCode } from './codes.js';

export const USER_LIMITS = { name: 8, postBytes: 64 * 1024, maxRooms: 50, roomName: 30 };

// 名前を trim → 最大長で丸める。空なら null。文字数は書記素ではなくコードポイント基準。
export const normalizeName = (name) => {
  if (typeof name !== 'string') return null;
  const nm = name.trim();
  if (!nm) return null;
  return Array.from(nm).slice(0, USER_LIMITS.name).join('');
};

const trimName = normalizeName;

// rooms 配列を {id, code, name} の形へ正規化（不正要素は除外、上限で丸め）。
function normalizeRooms(rooms) {
  if (!Array.isArray(rooms)) return [];
  const out = [];
  for (const r of rooms) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.id !== 'string' || !r.id) continue;
    const name = (typeof r.name === 'string' ? r.name.trim() : '').slice(0, USER_LIMITS.roomName);
    out.push({ id: r.id, code: normalizeCode(r.code), name });
    if (out.length >= USER_LIMITS.maxRooms) break;
  }
  return out;
}

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
    rooms: [],
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

// User.rooms に部屋参照 {id,code,name} を追記した新しい User を返す（不変）。
// 同じ id は重複追加しない。上限 maxRooms 超過時は追加しない。
export function addRoomToUser(user, room) {
  if (!user || typeof user !== 'object' || !room || typeof room.id !== 'string' || !room.id) {
    return user;
  }
  const rooms = Array.isArray(user.rooms) ? user.rooms : [];
  if (rooms.some((r) => r && r.id === room.id)) return { ...user, rooms };
  if (rooms.length >= USER_LIMITS.maxRooms) return { ...user, rooms };
  const name = (typeof room.name === 'string' ? room.name.trim() : '').slice(0, USER_LIMITS.roomName);
  return { ...user, rooms: [...rooms, { id: room.id, code: normalizeCode(room.code), name }] };
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
    rooms: normalizeRooms(input.rooms),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null,
  };
}
