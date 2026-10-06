import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function moduleUrl(path, replacements = {}) {
  let source = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const guardsUrl = await moduleUrl("../lib/request-guards.ts");
const { readJson, assertRoomActive, ROOM_LIFETIME_MS } = await import(guardsUrl);
const { normalizeShops, distanceMeters, searchRestaurants, refreshRestaurants } = await import(await moduleUrl("../lib/hotpepper.ts", { '"./request-guards"': JSON.stringify(guardsUrl) }));
const request = body => new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body });
assert.deepEqual(await readJson(request('{"name":"けいた"}')), { name: "けいた" });
await assert.rejects(readJson(request(JSON.stringify({ name: "あ".repeat(1500) }))), e => e.status === 413);
await assert.rejects(readJson(request("[]")), e => e.status === 400);
await assert.rejects(readJson(request("{")), e => e.status === 400);
assertRoomActive(1000, 1000 + ROOM_LIFETIME_MS - 1);
assert.throws(() => assertRoomActive(1000, 1000 + ROOM_LIFETIME_MS), e => e.status === 410);
assert.equal(distanceMeters(35,135,35,135),0);
const shop = { id: "J1", name: "テスト店舗", lat:35, lng:135, budget: { name: "1001～1500円" }, urls: { pc: "https://www.hotpepper.jp/test" }, photo: { pc: { l: "javascript:alert(1)" } } };
const found = normalizeShops([shop,shop,{...shop,id:"expensive",budget:{name:"3001～4000円"}},{...shop,id:"unknown",budget:{name:"未定"}},{...shop,id:"distant",lat:36}],35,135,1000,2000);
assert.equal(found.length,1);
assert.equal(found[0].budgetLabel,"1001～1500円");
assert.equal(found[0].imageUrl,undefined);
const { distanceBandLabel } = await import(await moduleUrl("../lib/restaurants.ts"));
assert.equal(distanceBandLabel(350), "現在地から0.5km圏内");
assert.equal(distanceBandLabel(500), "現在地から0.5km圏内");
assert.equal(distanceBandLabel(501), "現在地から1km圏内");
assert.equal(distanceBandLabel(1250), "現在地から1.5km圏内");
assert.equal(distanceBandLabel(0,true), "地名・住所で検索");
assert.equal(distanceBandLabel(700,false,"検索地点"), "検索地点から1km圏内");
const noBudget = normalizeShops([shop,{...shop,id:"unknown",budget:undefined},{...shop,id:"expensive",budget:{name:"5001～7000円"}}],35,135,1000,0);
assert.equal(noBudget.length,3);
assert.equal(noBudget.find(x => x.id === "unknown").budgetLabel, "");
const { storedCandidates, candidatePlaceholders } = await import(await moduleUrl("../lib/candidate-storage.ts"));
const stored = storedCandidates(found);
assert.deepEqual(Object.keys(stored[0]).sort(), ["distance", "distanceUnknown", "id", "source"]);
assert.equal(JSON.stringify(stored).includes("テスト店舗"),false);
const placeholders = candidatePlaceholders(JSON.stringify(found));
assert.equal(placeholders[0].imageUrl,undefined);
assert.notEqual(placeholders[0].name,shop.name);
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => Response.json({ results: { shop: [shop] } });
  assert.equal((await searchRestaurants("fake-secret",35,135,1000,2000)).length,1);
  globalThis.fetch = async url => {
    assert.equal(new URL(url).searchParams.get("range"), "5");
    return Response.json({ results: { shop: [shop] } });
  };
  await searchRestaurants("fake-secret",35,135,3000,2000);
  globalThis.fetch = async url => {
    const params = new URL(url).searchParams;
    assert.equal(params.get("keyword"), "梅田");
    assert.equal(params.has("lat"), false);
    assert.equal(params.has("range"), false);
    return Response.json({ results: { shop: [shop] } });
  };
  const byName = await searchRestaurants("fake-secret",0,0,0,2000,"梅田");
  assert.equal(byName.length,1);
  assert.equal(byName[0].distanceUnknown,true);
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).searchParams.get("id"), "J1");
    assert.equal(options.cache, "no-store");
    return Response.json({ results: { shop: [{...shop,name:"更新後の店舗"}] } });
  };
  const refreshed = await refreshRestaurants("fake-secret",placeholders);
  assert.equal(refreshed[0].name,"更新後の店舗");
  assert.equal(refreshed[0].distance,placeholders[0].distance);
  globalThis.fetch = async () => Response.json({results:{shop:[]}});
  assert.equal((await refreshRestaurants("fake-secret",placeholders))[0].imageUrl,undefined);
  globalThis.fetch = async () => Response.json({ results: { error: [{ message: "fake-secret" }] } });
  await assert.rejects(searchRestaurants("fake-secret",35,135,1000,2000),e => e.status === 503 && !e.message.includes("fake-secret"));
} finally { globalThis.fetch = originalFetch; }
console.log("PASS: byte limit, invalid JSON, expiry boundary, distance, budget bands, duplicate shops, unsafe URL, provider failure without secret disclosure.");
