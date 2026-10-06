import { ROOM_LIFETIME_MS } from "./request-guards";

// One transaction, children first. Use the same cutoff throughout so a live
// room cannot lose its participants/ballots halfway through cleanup.
export async function purgeExpiredRooms(database: D1Database, now = Date.now()) {
  const expired = "SELECT id FROM rooms WHERE created_at <= ?";
  const cutoff = now - ROOM_LIFETIME_MS;
  const results = await database.batch([
    database.prepare(`DELETE FROM votes WHERE room_id IN (${expired})`).bind(cutoff),
    database.prepare(`DELETE FROM members WHERE room_id IN (${expired})`).bind(cutoff),
    database.prepare(`DELETE FROM rooms WHERE id IN (${expired})`).bind(cutoff),
    database.prepare("DELETE FROM create_limits WHERE expires_at <= ?").bind(now),
  ]);
  return { deletedRooms: results[2].meta.changes };
}
