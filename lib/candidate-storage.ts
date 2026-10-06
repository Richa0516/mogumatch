import type { Restaurant } from "./restaurants";

// Persist only the identifiers needed to associate votes, plus app-calculated
// distance. Provider descriptions, prices, addresses and photo URLs stay out of DB.
export function storedCandidates(restaurants: Restaurant[]) {
  return restaurants.map(r => r.source === "hotpepper" ? {
    id: r.id, source: "hotpepper", distance: r.distance,
    distanceUnknown: !!r.distanceUnknown,
  } : r);
}
export function candidatePlaceholders(value: string): Restaurant[] {
  return JSON.parse(value).map((r: Restaurant) => r.source === "hotpepper" ? {
    id: r.id, source: "hotpepper", distance: r.distance,
    distanceUnknown: !!r.distanceUnknown, name: "店舗情報を確認できません",
    genre: "", price: 0, description: "掲載情報は現在取得できません。", color: "#f5ede1",
  } : r);
}
