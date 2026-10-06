import { ApiError } from "./request-guards";
import type { Restaurant } from "./restaurants";

type Shop = {
  id?: string; name?: string; lat?: number; lng?: number;
  genre?: { name?: string }; budget?: { name?: string };
  catch?: string; address?: string; urls?: { pc?: string };
  photo?: { pc?: { l?: string } };
};
export function distanceMeters(lat: number, lng: number, a: number, b: number) {
  const rad = Math.PI / 180;
  const h = Math.sin((a-lat)*rad/2)**2 + Math.cos(lat*rad)*Math.cos(a*rad)*Math.sin((b-lng)*rad/2)**2;
  return Math.round(6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))));
}
function safeUrl(value: unknown, hosts: string[]) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !hosts.includes(url.hostname) || url.username || url.password) return undefined;
    url.protocol = "https:";
    return url.href;
  } catch { return undefined; }
}
export function normalizeShops(shops: Shop[], lat: number, lng: number, radius: number, budget: number, keywordMode = false): Restaurant[] {
  const seen = new Set<string>();
  const result: Restaurant[] = [];
  for (const shop of shops) {
    if (!shop.id || !shop.name || seen.has(shop.id) || !Number.isFinite(Number(shop.lat)) || !Number.isFinite(Number(shop.lng))) continue;
    // Only numeric, bounded dinner-price bands can satisfy an upper budget.
    const band = shop.budget?.name ?? "";
    const match = band.replaceAll(",", "").match(/^(\d+)\s*[～〜~－-]\s*(\d+)円$/);
    if (budget !== 0 && !match) continue;
    const upper = match ? Number(match[2]) : 0;
    const distance = keywordMode ? 0 : distanceMeters(lat, lng, Number(shop.lat), Number(shop.lng));
    if ((budget !== 0 && upper > budget) || distance > radius) continue;
    seen.add(shop.id);
    result.push({ id: shop.id, name: shop.name, genre: shop.genre?.name ?? "飲食店", distance,
      distanceUnknown: keywordMode, price: upper, budgetLabel: band, description: shop.catch ?? "", address: shop.address,
      detailUrl: safeUrl(shop.urls?.pc, ["www.hotpepper.jp", "hotpepper.jp"]),
      imageUrl: safeUrl(shop.photo?.pc?.l, ["imgfp.hotp.jp", "imgfp.hotpepper.jp"]),
      color: "#f5ede1", source: "hotpepper" });
  }
  return (keywordMode ? result : result.sort((a,b) => a.distance-b.distance)).slice(0,20);
}
export async function searchRestaurants(key: string, lat: number, lng: number, radius: number, budget: number, keyword?: string) {
  const url = new URL("https://webservice.recruit.co.jp/hotpepper/gourmet/v1/");
  url.search = new URLSearchParams({ key,
    ...(keyword ? { keyword } : { lat: String(lat), lng: String(lng), range: String(radius <= 500 ? 2 : radius <= 1000 ? 3 : radius <= 2000 ? 4 : 5) }),
    count: "100", order: keyword ? "4" : "1", format: "json" }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) throw new Error();
    const payload = await response.json() as { results?: { error?: unknown; shop?: Shop[] } };
    if (payload.results?.error || !Array.isArray(payload.results?.shop)) throw new Error();
    return normalizeShops(payload.results.shop, lat, lng, radius, budget, !!keyword);
  } catch {
    // Never expose or log the upstream URL, which contains the API key.
    throw new ApiError(503, "店舗情報を取得できませんでした。時間をおいてお試しください。");
  }
}

// ID lookups refresh display data without creating a persistent provider cache.
export async function refreshRestaurants(key: string, refs: Restaurant[]) {
  const ids = refs.filter(r => r.source === "hotpepper").map(r => r.id);
  if (!ids.length) return refs;
  if (!key || ids.length > 20) throw new ApiError(503, "店舗情報の取得設定を確認してください。");
  const url = new URL("https://webservice.recruit.co.jp/hotpepper/gourmet/v1/");
  url.search = new URLSearchParams({ key, id: ids.join(","), count: "20", format: "json" }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) throw new Error();
    const payload = await response.json() as { results?: { error?: unknown; shop?: Shop[] } };
    if (payload.results?.error || !Array.isArray(payload.results?.shop)) throw new Error();
    const fresh = normalizeShops(payload.results.shop,0,0,0,0,true);
    return refs.map(ref => {
      const found = fresh.find(r => r.id === ref.id);
      return found ? { ...found, distance: ref.distance, distanceUnknown: ref.distanceUnknown } : ref;
    });
  } catch { throw new ApiError(503, "店舗情報を更新できませんでした。時間をおいて再読み込みしてください。"); }
}
