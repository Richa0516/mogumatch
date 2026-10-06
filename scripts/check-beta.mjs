import assert from "node:assert/strict";
const origin = process.argv[2] ?? "http://localhost:5173";
let cookie = "";
async function call(path, body, expected = 200, extra = {}) {
  const response = await fetch(origin+path, { method: body ? "POST" : "GET", headers: { cookie, Origin: origin, ...(body ? {"Content-Type":"application/json"} : {}), ...extra }, ...(body ? {body:JSON.stringify(body)} : {}) });
  if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text }; }
  assert.equal(response.status,expected,JSON.stringify(data));
  return data;
}
assert.equal((await call("/api/rooms")).restaurantMode,"demo","This test needs local demo mode");
const body = {name:"上限テスト",area:"梅田",radius:1000,budget:2000};
await call("/api/rooms",body,403,{Origin:"https://example.invalid"});
await call("/api/rooms",body,403,{"Sec-Fetch-Site":"cross-site"});
await call("/api/rooms",{...body,name:"あ".repeat(1500)},413);
for (let i=0;i<5;i++) {
  const created = await call("/api/rooms",body);
  const path = `/api/rooms/${created.id}`;
  const room = await call(path);
  assert.ok(room.expiresAt > Date.now());
  const outsider = await fetch(origin+path,{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify({action:"delete"})});
  assert.equal(outsider.status,403);
  assert.equal((await call(path,{action:"delete"})).deleted,true);
  await call(path,undefined,404);
}
await call("/api/rooms",body,429);
console.log("PASS: cross-site rejection, byte limit, expiry field, host-only deletion, deleted room unavailable, creation quota survives deletion.");
