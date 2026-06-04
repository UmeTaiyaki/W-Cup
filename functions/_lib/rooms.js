// Room（部屋名＋参加コード＋メンバーIDの配列）の生成・メンバー追加（純関数）。
import { genId } from './ids.js';
import { normalizeCode } from './codes.js';

export const ROOM_LIMITS = { name: 24, members: 50, postBytes: 16 * 1024 };

const trimName = (name) => {
  if (typeof name !== 'string') return null;
  const nm = name.trim();
  if (!nm) return null;
  return Array.from(nm).slice(0, ROOM_LIMITS.name).join('');
};

// 部屋名・参加コード・作成者IDから新規 Room を生成。作成者は最初のメンバー。
export function makeRoom(name, code, ownerId) {
  const nm = trimName(name);
  if (!nm) return null;
  if (typeof ownerId !== 'string' || !ownerId) return null;
  const now = new Date().toISOString();
  return {
    version: 1,
    id: genId('r'),
    name: nm,
    code: normalizeCode(code),
    members: [ownerId],
    ownerId,
    createdAt: now,
    updatedAt: now,
  };
}

// userId をメンバーに追加（不変）。重複は無視、上限超過は ok:false。
export function addMember(room, userId) {
  if (!room || typeof userId !== 'string' || !userId) {
    return { ok: false, room, reason: 'invalid' };
  }
  if (room.members.includes(userId)) {
    return { ok: true, room };
  }
  if (room.members.length >= ROOM_LIMITS.members) {
    return { ok: false, room, reason: 'full' };
  }
  return {
    ok: true,
    room: { ...room, members: [...room.members, userId], updatedAt: new Date().toISOString() },
  };
}
