import assert from "node:assert/strict";
const origin = process.argv[2] || "http://localhost:5173";
function client() {
  let cookie = "";
  return async (path, body, expected = 200) => {
    const response = await fetch(origin + path, { method: body ? "POST" : "GET", headers: { cookie, Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  };
}
const host = client(), guest = client(), outsider = client();
const config = await host("/api/rooms");
const created = await host("/api/rooms", { name: "取り消しテスト", budget: 0, ...(config.restaurantMode === "live" ? { searchMode: "keyword", keyword: "梅田", radius: 0 } : { area: "梅田", radius: 1000 }) });
const path = `/api/rooms/${created.id}`;
let room = await host(path);
const [first, second] = room.candidates;
await guest(path, { action: "join", name: "参加者" });
await host(path, { action: "undo", restaurantId: first.id }, 409);
await host(path, { action: "start" });
await outsider(path, { action: "undo", restaurantId: first.id }, 403);
await host(path, { action: "undo", restaurantId: "missing" }, 400);
await guest(path, { action: "vote", restaurantId: first.id, liked: true });
await host(path, { action: "vote", restaurantId: first.id, liked: false });
await host(path, { action: "vote", restaurantId: second.id, liked: true });
await Promise.all([host(path, { action: "undo", restaurantId: second.id }), host(path, { action: "undo", restaurantId: second.id })]);
room = await host(path);
assert.equal(room.myVotes[first.id], false);
assert.equal(second.id in room.myVotes, false);
assert.equal(room.totalVotes, 2);
await host(path, { action: "undo", restaurantId: first.id });
room = await guest(path);
assert.equal(room.myVotes[first.id], true);
assert.equal(room.totalVotes, 1);
for (const restaurant of room.candidates) {
  await host(path, { action: "vote", restaurantId: restaurant.id, liked: true });
  await guest(path, { action: "vote", restaurantId: restaurant.id, liked: true });
}
assert.equal((await host(path)).allDone, true);
const last = room.candidates.at(-1).id;
room = await host(path, { action: "undo", restaurantId: last });
assert.equal(room.allDone, false);
assert.equal(room.results.find(r => r.id === last).pending, 1);
room = await host(path, { action: "vote", restaurantId: last, liked: false });
assert.equal(room.allDone, true);
await host(path, { action: "close" });
await host(path, { action: "undo", restaurantId: last }, 409);
assert.equal((await host(path)).myVotes[last], false);
console.log("PASS: own votes only, repeated undo, re-vote, completion undo, pending totals, reload, closed-room rejection.");
