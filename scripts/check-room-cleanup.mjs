import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function moduleUrl(path, replacements = {}) {
  let code = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const guardUrl = await moduleUrl("../lib/request-guards.ts");
const { ROOM_LIFETIME_MS, assertRoomActive } = await import(guardUrl);
const { purgeExpiredRooms } = await import(await moduleUrl("../lib/room-cleanup.ts", { '"./request-guards"': JSON.stringify(guardUrl) }));
assert.equal(ROOM_LIFETIME_MS, 3600000);
const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON; CREATE TABLE rooms(id TEXT PRIMARY KEY, created_at INTEGER); CREATE TABLE members(id TEXT PRIMARY KEY, room_id TEXT REFERENCES rooms(id)); CREATE TABLE votes(room_id TEXT REFERENCES rooms(id), member_id TEXT REFERENCES members(id)); CREATE TABLE create_limits(key TEXT PRIMARY KEY, expires_at INTEGER);");
const now = 10000000;
for (const [id, age] of [["expired", 3600000], ["older", 7200000], ["active", 3599999]]) {
  sql.prepare("INSERT INTO rooms VALUES (?, ?)").run(id, now-age);
  sql.prepare("INSERT INTO members VALUES (?, ?)").run(id,id);
  sql.prepare("INSERT INTO votes VALUES (?, ?)").run(id,id);
}
sql.prepare("INSERT INTO create_limits VALUES (?, ?)").run("old",now);
sql.prepare("INSERT INTO create_limits VALUES (?, ?)").run("new",now+1);
const db = {
  prepare(query) { return { bind(...params) { return () => ({ meta: { changes: Number(sql.prepare(query).run(...params).changes) } }); } }; },
  async batch(statements) {
    sql.exec("BEGIN");
    try { const result = statements.map(run => run()); sql.exec("COMMIT"); return result; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  },
};
assertRoomActive(now-3599999, now);
assert.throws(() => assertRoomActive(now-3600000, now), error => error.status === 410);
assert.equal((await purgeExpiredRooms(db,now)).deletedRooms,2);
for (const table of ["rooms","members","votes"]) assert.equal(sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,1);
assert.equal(sql.prepare("SELECT id FROM rooms").get().id,"active");
assert.equal(sql.prepare("SELECT key FROM create_limits").get().key,"new");
assert.equal((await purgeExpiredRooms(db,now)).deletedRooms,0);
assert.equal((await purgeExpiredRooms(db,now+1)).deletedRooms,1);
sql.close();
console.log("PASS: one-hour boundary, expired rooms/members/votes removed, active rooms preserved, quotas cleaned, repeat cleanup safe.");
