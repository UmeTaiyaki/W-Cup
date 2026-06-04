import { json } from '../_lib/http.js';
import { makeRoom, addMember, ROOM_LIMITS } from '../_lib/rooms.js';
import { validateUser } from '../_lib/users.js';
import { generateCode, normalizeCode } from '../_lib/codes.js';

const rKey = (id) => `room:${id}`;
const rcKey = (code) => `roomcode:${code}`;
const uKey = (id) => `user:${id}`;

async function readRoom(env, id) {
  if (!id) return null;
  let stored = null;
  try {
    stored = await env.CONFIG.get(rKey(id));
  } catch (e) {
    console.error('room: KV read failed', e);
    return null;
  }
  if (!stored) return null;
  try {
    const r = JSON.parse(stored);
    if (!r || !Array.isArray(r.members)) return null;
    return r;
  } catch (e) {
    console.error('room: stored JSON parse failed', e);
    return null;
  }
}

async function readUser(env, id) {
  if (!id) return null;
  try {
    const s = await env.CONFIG.get(uKey(id));
    return s ? validateUser(JSON.parse(s)) : null;
  } catch (e) {
    console.error('room: member read failed', e);
    return null;
  }
}

// 既存 roomcode と衝突しないコードを採番（最大5回試行）。
async function uniqueRoomCode(env) {
  for (let i = 0; i < 5; i++) {
    const c = generateCode();
    try {
      if (!(await env.CONFIG.get(rcKey(c)))) return c;
    } catch (e) {
      console.error('room: code uniqueness check failed', e);
      return c;
    }
  }
  return generateCode();
}

// GET /api/room?id=...  → { room, members: User[] }（見比べボード用）
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const room = await readRoom(env, url.searchParams.get('id'));
  if (!room) return json(404, { error: '部屋が見つかりません' });
  const members = (await Promise.all(room.members.map((uid) => readUser(env, uid)))).filter(Boolean);
  return json(200, { room, members });
}

// POST /api/room  { op: 'create' | 'join', ... }
export async function onRequestPost({ request, env }) {
  const cl = Number(request.headers.get('content-length') || 0);
  if (cl > ROOM_LIMITS.postBytes) return json(413, { error: 'データが大きすぎます' });

  let input;
  try {
    input = await request.json();
  } catch (e) {
    console.error('room POST: invalid json', e);
    return json(400, { error: 'JSONが不正です' });
  }

  const op = input && input.op;

  if (op === 'create') {
    if (typeof input.userId !== 'string' || !input.userId) {
      return json(400, { error: 'ユーザーが不明です' });
    }
    const code = await uniqueRoomCode(env);
    const room = makeRoom(input.name, code, input.userId);
    if (!room) return json(400, { error: '部屋名を入力してください' });
    try {
      await env.CONFIG.put(rKey(room.id), JSON.stringify(room));
      await env.CONFIG.put(rcKey(code), room.id);
    } catch (e) {
      console.error('room create: KV write failed', e);
      return json(500, { error: '保存に失敗しました' });
    }
    return json(200, { roomId: room.id, code, room });
  }

  if (op === 'join') {
    if (typeof input.userId !== 'string' || !input.userId) {
      return json(400, { error: 'ユーザーが不明です' });
    }
    const code = normalizeCode(input.code);
    if (!code) return json(400, { error: 'コードを入力してください' });
    let roomId = null;
    try {
      roomId = await env.CONFIG.get(rcKey(code));
    } catch (e) {
      console.error('room join: KV read failed', e);
      return json(500, { error: '読み込みに失敗しました' });
    }
    const room = await readRoom(env, roomId);
    if (!room) return json(404, { error: 'コードに該当する部屋がありません' });
    const res = addMember(room, input.userId);
    if (!res.ok) return json(409, { error: '部屋が満員です' });
    try {
      await env.CONFIG.put(rKey(room.id), JSON.stringify(res.room));
    } catch (e) {
      console.error('room join: KV write failed', e);
      return json(500, { error: '保存に失敗しました' });
    }
    return json(200, { roomId: room.id, room: res.room });
  }

  return json(400, { error: '不明な操作です' });
}
