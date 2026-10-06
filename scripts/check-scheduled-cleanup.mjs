// Local integration test: does not call the app or its scheduled endpoint.
// The running Vite timer must remove the expired fixtures by itself.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
const prefix = `cleanup-test-${crypto.randomUUID()}`;
const expired = `${prefix}-expired`, active = `${prefix}-active`;
function query(sql) {
  const result = spawnSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state", "--command", sql, "--json"], { encoding: "utf8", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  if (result.status !== 0) throw new Error("Local fixture query failed");
  return JSON.parse(result.stdout);
}
const now = Date.now();
try {
  for (const [id, created] of [[expired, now-3600001], [active, now]]) {
    query(`INSERT INTO rooms (id,area,radius,budget,status,candidates,created_at) VALUES ('${id}','cleanup-test',1000,0,'voting','[]',${created}); INSERT INTO members(id,room_id,session_hash,name,is_host) VALUES ('${id}','${id}','test','test',1); INSERT INTO votes(room_id,member_id,restaurant_id,liked) VALUES ('${id}','${id}','fixture',1);`);
  }
  console.log("Waiting for the dev server's automatic cleanup (up to 90 seconds)...");
  const deadline = Date.now()+90000;
  let remaining = 1;
  do {
    await setTimeout(10000);
    remaining = query(`SELECT COUNT(*) n FROM rooms WHERE id='${expired}'`)[0].results[0].n;
  } while (remaining && Date.now()<deadline);
  assert.equal(remaining,0,"Automatic cleanup did not run; start/restart Vite before testing");
  for (const table of ["members","votes"]) assert.equal(query(`SELECT COUNT(*) n FROM ${table} WHERE room_id='${expired}'`)[0].results[0].n,0);
  assert.equal(query(`SELECT COUNT(*) n FROM rooms WHERE id='${active}'`)[0].results[0].n,1);
  console.log("PASS: expired fixtures deleted without a room request; active fixture preserved.");
} finally {
  query(`DELETE FROM votes WHERE room_id IN ('${expired}','${active}'); DELETE FROM members WHERE room_id IN ('${expired}','${active}'); DELETE FROM rooms WHERE id IN ('${expired}','${active}');`);
}
