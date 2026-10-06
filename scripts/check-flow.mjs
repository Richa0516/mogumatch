import assert from "node:assert/strict";
const origin = process.argv[2] || "http://localhost:5173";
function client() {
  let cookie = "";
  return async (path, body, expected = 200) => {
    const response = await fetch(origin + path, {
      method: body ? "POST" : "GET",
      headers: {
        cookie,
        ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const set = response.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const data = await response.json();
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
    return data;
  };
}
const host = client(),
  guest = client(),
  outsider = client();
await host(
  "/api/rooms",
  { name: "", area: "なんば", radius: 1000, budget: 2000 },
  400,
);
const created = await host("/api/rooms", {
  name: "テストホスト",
  area: "長瀬・近畿大学周辺",
  radius: 1000,
  budget: 2000,
});
const path = `/api/rooms/${created.id}`;
let state = await host(path);
assert.equal(state.me.isHost, true);
assert.equal(state.candidates.length, 6);
assert.ok(state.candidates.every((r) => r.distance <= 1000 && r.price <= 2000));
let preview = await guest(path);
assert.equal(preview.me, null);
assert.equal(preview.members.length, 0);
assert.equal(preview.results.length, 0);
state = await guest(path, { action: "join", name: "テスト参加者" });
assert.equal(state.members.length, 2);
assert.equal(
  (await guest(path, { action: "join", name: "再参加" })).members.length,
  2,
);
await guest(path, { action: "start" }, 403);
await guest(path, { action: "vote", restaurantId: "curry", liked: true }, 409);
await outsider(
  path,
  { action: "vote", restaurantId: "curry", liked: true },
  403,
);
await host(path, { action: "start" });
await outsider(path, { action: "join", name: "遅刻" }, 409);
await guest(
  path,
  { action: "vote", restaurantId: "unknown", liked: true },
  400,
);
await guest(path, { action: "vote", restaurantId: "curry", liked: "yes" }, 400);
await Promise.all(
  Array.from({ length: 4 }, () =>
    host(path, { action: "vote", restaurantId: "curry", liked: true }),
  ),
);
state = await host(path);
assert.equal(state.totalVotes, 1);
state = await guest(path, {
  action: "vote",
  restaurantId: "curry",
  liked: true,
});
assert.equal(state.results[0].likes, 2);
assert.equal(state.results[0].pending, 0);
await host(path, { action: "vote", restaurantId: "noodle", liked: false });
state = await host(path);
assert.equal(state.results.find((r) => r.id === "noodle").pending, 1);
assert.equal(state.results.find((r) => r.id === "noodle").dislikes, 1);
await guest(path, { action: "close" }, 403);
for (const r of state.candidates) {
  if (!(r.id in state.myVotes))
    await host(path, {
      action: "vote",
      restaurantId: r.id,
      liked: r.id === "rice",
    });
  if (r.id !== "curry")
    await guest(path, {
      action: "vote",
      restaurantId: r.id,
      liked: r.id === "rice",
    });
}
state = await host(path);
assert.equal(state.allDone, true);
assert.equal(state.totalVotes, 12);
assert.deepEqual(
  state.results.slice(0, 2).map((r) => r.id),
  ["curry", "rice"],
);
await host(path, { action: "close" });
state = await guest(path);
assert.equal(state.status, "closed");
assert.equal(state.allDone, true);
await guest(path, { action: "vote", restaurantId: "curry", liked: false }, 409);
await host(path, { action: "start" }, 409);
assert.equal((await host(path)).totalVotes, 12);
await host("/api/rooms/not-a-room", undefined, 404);
const second = await host("/api/rooms", {
  name: "早期終了",
  area: "梅田",
  radius: 500,
  budget: 1000,
});
await host(`/api/rooms/${second.id}`, { action: "start" });
const early = await host(`/api/rooms/${second.id}`, { action: "close" });
assert.equal(early.allDone, false);
assert.ok(
  early.results.every(
    (r) => r.pending === 1 && r.likes === 0 && r.dislikes === 0,
  ),
);
console.log(
  "PASS: create, filters, cookies, join, idempotency, permissions, concurrent duplicate votes, ranking, pending votes, close, late join, invalid input, reload.",
);
console.log(`Test room: ${origin}/?room=${created.id}`);
