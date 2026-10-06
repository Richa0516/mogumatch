import { env } from "cloudflare:workers";
import { areas, findSamples, type Restaurant } from "./restaurants";
import { ApiError, readJson, assertRoomActive, ROOM_LIFETIME_MS } from "./request-guards";
import { searchRestaurants, refreshRestaurants } from "./hotpepper";
import { storedCandidates, candidatePlaceholders } from "./candidate-storage";
import { purgeExpiredRooms } from "./room-cleanup";
type RoomRow = {
  id: string;
  area: string;
  radius: number;
  budget: number;
  status: string;
  candidates: string;
  created_at: number;
};
type MemberRow = {
  id: string;
  room_id: string;
  session_hash: string;
  name: string;
  is_host: number;
};
function db() {
  if (!env.DB) throw new Error("DB binding unavailable");
  return env.DB;
}
function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}
const id = () => crypto.randomUUID();
async function session(req: Request) {
  const existing = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)mm_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  const token =
    existing ??
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  const hash = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    hash,
    cookie: existing
      ? null
      : `mm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`,
  };
}
function nickname(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 20)
    fail(400, "名前を1〜20文字で入力してください。");
  return value.trim();
}
function validateId(value: string) {
  if (!/^[a-f0-9-]{36}$/.test(value))
    fail(404, "ルームが見つかりません。リンクを確認してください。");
}
async function readRoom(roomId: string, hash: string, includeDetails = true) {
  validateId(roomId);
  const database = db();
  // batchで同一時点のルーム・参加者・票を読みます。
  const [roomSet, memberSet, voteSet] = await database.batch([
    database.prepare("SELECT * FROM rooms WHERE id = ?").bind(roomId),
    database
      .prepare(
        "SELECT * FROM members WHERE room_id = ? ORDER BY is_host DESC, rowid",
      )
      .bind(roomId),
    database
      .prepare(
        "SELECT member_id, restaurant_id, liked FROM votes WHERE room_id = ?",
      )
      .bind(roomId),
  ]);
  const room = roomSet.results[0] as unknown as RoomRow | undefined;
  if (!room) fail(404, "ルームが見つかりません。リンクを確認してください。");
  if (room.created_at + ROOM_LIFETIME_MS <= Date.now()) await purgeExpiredRooms(database);
  assertRoomActive(room.created_at);
  if (["preparing", "failed"].includes(room.status)) fail(409, "店舗情報の準備が完了していません。");
  const people = memberSet.results as unknown as MemberRow[];
  const ballots = voteSet.results as unknown as {
    member_id: string;
    restaurant_id: string;
    liked: number;
  }[];
  const refs = candidatePlaceholders(room.candidates);
  const candidates = includeDetails ? await refreshRestaurants(env.HOTPEPPER_API_KEY ?? "", refs) : refs;
  const me = people.find((p) => p.session_hash === hash);
  const members = people.map((p) => ({
    id: p.id,
    name: p.name,
    isHost: !!p.is_host,
    voted: ballots.filter((v) => v.member_id === p.id).length,
  }));
  const results = me
    ? candidates
        .map((r) => {
          const v = ballots.filter((v) => v.restaurant_id === r.id);
          return {
            ...r,
            likes: v.filter((v) => v.liked === 1).length,
            dislikes: v.filter((v) => v.liked === 0).length,
            pending: people.length - v.length,
          };
        })
        .sort((a, b) => b.likes - a.likes || a.distance - b.distance)
    : [];
  if (room.created_at + ROOM_LIFETIME_MS <= Date.now()) await purgeExpiredRooms(database);
  assertRoomActive(room.created_at);
  return {
    detailsIncluded: includeDetails,
    detailsFetchedAt: includeDetails ? Date.now() : undefined,
    id: room.id,
    expiresAt: room.created_at + ROOM_LIFETIME_MS,
    area: room.area,
    radius: room.radius,
    budget: room.budget,
    status: room.status,
    candidates,
    members: me ? members : [],
    memberCount: people.length,
    me: members.find((p) => p.id === me?.id) ?? null,
    myVotes: Object.fromEntries(
      ballots
        .filter((v) => v.member_id === me?.id)
        .map((v) => [v.restaurant_id, !!v.liked]),
    ),
    totalVotes: me ? ballots.length : 0,
    allDone:
      people.length > 0 && ballots.length === people.length * candidates.length,
    results,
  };
}
export async function handleRoom(req: Request, roomId?: string) {
  let cookie: string | null = null;
  try {
    const current = await session(req);
    cookie = current.cookie;
    const database = db();
    let result: unknown;
    if (req.method === "GET")
      result = roomId ? await readRoom(roomId, current.hash, new URL(req.url).searchParams.get("state") !== "1") : { ready: true, restaurantMode: env.RESTAURANT_MODE === "live" ? "live" : "demo" };
    else {
      const origin = req.headers.get("origin");
      if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(req.url).origin))
        fail(403, "同じサイトの画面から操作してください。");
      const body = await readJson(req);
      if (!roomId) {
        const name = nickname(body.name);
        const live = env.RESTAURANT_MODE === "live";
        const keywordMode = live && body.searchMode === "keyword";
        const keyword = keywordMode && typeof body.keyword === "string" ? body.keyword.trim() : "";
        if (keywordMode && (keyword.length < 2 || keyword.length > 80)) fail(400, "地名・住所を2〜80文字で入力してください。");
        if (
          (!live && !areas.includes(body.area as string)) ||
          !((keywordMode ? [0] : [500, 1000, 1500, 2000, 2500, 3000]).includes(body.radius as number)) ||
          ![0, 1000, 2000, 3000].includes(body.budget as number)
        )
          fail(400, "エリア・距離・予算を選択してください。");
        const lat = body.latitude, lng = body.longitude;
        if (live && (!env.HOTPEPPER_API_KEY || env.HOTPEPPER_API_KEY.length < 8)) fail(503, "店舗検索の設定が完了していません。");
        if (live && !keywordMode && (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 20 || lat > 46 || lng < 122 || lng > 154)) fail(400, "日本国内の検索地点を指定してください。");
        let candidates = live ? [] : findSamples(body.radius as number, body.budget as number);
        if (!live && !candidates.length)
          fail(400, "候補がありません。条件を広げてください。");
        const hour = Math.floor(Date.now() / 3600000);
        const day = Math.floor(Date.now() / 86400000);
        const counterSql = "INSERT INTO create_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ?";
        const personalQuota = await database.prepare(counterSql).bind(`session:${current.hash}:${hour}`, (hour+1)*3600000, 5).run();
        if (!personalQuota.meta.changes) fail(429, "検索・作成は1時間5回までです。時間をおいてお試しください。");
        const globalQuota = await database.prepare(counterSql).bind(`global:${day}`, (day+1)*86400000, 100).run();
        if (!globalQuota.meta.changes) fail(429, "無料ベータ版の本日の検索・作成上限に達しました。");
        await database.prepare("DELETE FROM create_limits WHERE key IN (SELECT key FROM create_limits WHERE expires_at <= ? LIMIT 50)").bind(Date.now()).run();
        await purgeExpiredRooms(database);
        const newId = id();
        const inserted = await database.batch([
          database
            .prepare(
              "INSERT INTO rooms (id, area, radius, budget, candidates, status, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM rooms WHERE created_at > ?) < 100 AND (SELECT COUNT(*) FROM members JOIN rooms ON rooms.id = members.room_id WHERE members.session_hash = ? AND members.is_host = 1 AND rooms.created_at > ?) < 5",
            )
            .bind(
              newId,
              live ? (keywordMode ? keyword : "現在地の周辺") : body.area,
              body.radius,
              body.budget,
              JSON.stringify(candidates),
              live ? "preparing" : "lobby",
              Date.now(),
              Date.now() - ROOM_LIFETIME_MS,
              current.hash,
              Date.now() - 60 * 60 * 1000,
            ),
          database
            .prepare(
              "INSERT INTO members (id, room_id, session_hash, name, is_host) SELECT ?, id, ?, ?, 1 FROM rooms WHERE id = ?",
            )
            .bind(id(), current.hash, name, newId),
        ]);
        if (!inserted[0].meta.changes) fail(429, "作成上限に達しました。しばらく待ってからお試しください。");
        if (live) {
          try {
            candidates = await searchRestaurants(env.HOTPEPPER_API_KEY!, lat as number, lng as number, body.radius as number, body.budget as number, keywordMode ? keyword : undefined);
            if (!candidates.length) fail(400, "条件に合うお店が見つかりませんでした。検索範囲を広げるか、予算を「指定しない」にしてください。");
            await database.prepare("UPDATE rooms SET candidates = ?, status = 'lobby' WHERE id = ?").bind(JSON.stringify(storedCandidates(candidates)), newId).run();
          } catch (error) {
            await database.prepare("UPDATE rooms SET status = 'failed' WHERE id = ?").bind(newId).run();
            throw error;
          }
        }
        result = { id: newId };
      } else {
        validateId(roomId);
        const room = await database
          .prepare("SELECT * FROM rooms WHERE id = ?")
          .bind(roomId)
          .first<RoomRow>();
        if (!room) fail(404, "ルームが見つかりません。");
        if (room.created_at + ROOM_LIFETIME_MS <= Date.now()) await purgeExpiredRooms(database);
        assertRoomActive(room.created_at);
        let me = await database
          .prepare(
            "SELECT * FROM members WHERE room_id = ? AND session_hash = ?",
          )
          .bind(roomId, current.hash)
          .first<MemberRow>();
        if (body.action === "join") {
          if (!me) {
            const name = nickname(body.name);
            await database
              .prepare(
                "INSERT OR IGNORE INTO members (id, room_id, session_hash, name, is_host) SELECT ?, id, ?, ?, 0 FROM rooms WHERE id = ? AND status = 'lobby' AND created_at > ? AND (SELECT COUNT(*) FROM members WHERE room_id = ?) < 20",
              )
              .bind(id(), current.hash, name, roomId, Date.now() - ROOM_LIFETIME_MS, roomId)
              .run();
            me = await database
              .prepare(
                "SELECT * FROM members WHERE room_id = ? AND session_hash = ?",
              )
              .bind(roomId, current.hash)
              .first<MemberRow>();
            if (!me) fail(409, "参加受付は終了したか、定員20人に達しました。");
          }
        } else {
          if (!me) fail(403, "先にルームに参加してください。");
          if (body.action === "delete") {
            if (!me.is_host) fail(403, "この操作はホストのみ行えます。");
            await database.batch([
              database.prepare("DELETE FROM votes WHERE room_id = ?").bind(roomId),
              database.prepare("DELETE FROM members WHERE room_id = ?").bind(roomId),
              database.prepare("DELETE FROM rooms WHERE id = ?").bind(roomId),
            ]);
            return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
          } else if (body.action === "undo") {
            if (typeof body.restaurantId !== "string" || !(JSON.parse(room.candidates) as Restaurant[]).some(r => r.id === body.restaurantId))
              fail(400, "取り消す店舗が正しくありません。");
            // Delete only this participant's specified vote. Repeated requests must
            // never remove another vote, and closing the room wins atomically.
            const saved = await database.prepare("DELETE FROM votes WHERE room_id = ? AND member_id = ? AND restaurant_id = ? AND EXISTS (SELECT 1 FROM rooms WHERE id = ? AND status = 'voting' AND created_at > ?)")
              .bind(roomId, me.id, body.restaurantId, roomId, Date.now() - ROOM_LIFETIME_MS).run();
            if (!saved.meta.changes) {
              const active = await database.prepare("SELECT id FROM rooms WHERE id = ? AND status = 'voting' AND created_at > ?").bind(roomId, Date.now() - ROOM_LIFETIME_MS).first();
              if (!active) fail(409, "締め切り後は投票を取り消せません。");
            }
          } else if (body.action === "vote") {
            if (
              typeof body.liked !== "boolean" ||
              typeof body.restaurantId !== "string" ||
              !(JSON.parse(room.candidates) as Restaurant[]).some(
                (r) => r.id === body.restaurantId,
              )
            )
              fail(400, "投票内容が正しくありません。");
            // 投票締切と同時に送信されても、締切後のINSERTは許可しません。
            const saved = await database
              .prepare(
                "INSERT INTO votes (room_id, member_id, restaurant_id, liked) SELECT id, ?, ?, ? FROM rooms WHERE id = ? AND status = 'voting' AND created_at > ? ON CONFLICT(room_id, member_id, restaurant_id) DO UPDATE SET liked = excluded.liked",
              )
              .bind(me.id, body.restaurantId, body.liked ? 1 : 0, roomId, Date.now() - ROOM_LIFETIME_MS)
              .run();
            if (!saved.meta.changes)
              fail(409, "現在は投票を受け付けていません。");
          } else if (body.action === "start" || body.action === "close") {
            if (!me.is_host) fail(403, "この操作はホストのみ行えます。");
            const from = body.action === "start" ? "lobby" : "voting";
            const to = body.action === "start" ? "voting" : "closed";
            const saved = await database
              .prepare(
                "UPDATE rooms SET status = ? WHERE id = ? AND status = ? AND created_at > ?",
              )
              .bind(to, roomId, from, Date.now() - ROOM_LIFETIME_MS)
              .run();
            if (!saved.meta.changes && room.status !== to)
              fail(409, "ルームの状態が変わりました。再読み込みしてください。");
          } else fail(400, "不明な操作です。");
        }
        result = await readRoom(roomId, current.hash, false);
      }
    }
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        ...(cookie ? { "Set-Cookie": cookie } : {}),
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError))
      console.error("Room operation failed");
    return Response.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : "保存先に接続できません。少し待って、もう一度お試しください。",
      },
      {
        status: error instanceof ApiError ? error.status : 503,
        headers: {
          "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
          ...(cookie ? { "Set-Cookie": cookie } : {}),
        },
      },
    );
  }
}
