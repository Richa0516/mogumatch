// 架空の店舗と距離・価格。実店舗APIへの切り替え地点です。
export const areas = ["長瀬・近畿大学周辺", "梅田", "なんば", "天王寺"];
export type Restaurant = {
  id: string;
  name: string;
  genre: string;
  distance: number;
  distanceUnknown?: boolean;
  price: number;
  description: string;
  color: string;
  source?: "hotpepper";
  budgetLabel?: string;
  address?: string;
  imageUrl?: string;
  detailUrl?: string;
};
const samples: Restaurant[] = [
  {
    id: "curry",
    name: "スパイス食堂 ひとさじ",
    genre: "カレー",
    distance: 350,
    price: 950,
    description:
      "香りのよいスパイスと、じっくり煮込んだチキン。午後の元気をひと皿に。",
    color: "#f4b844",
  },
  {
    id: "noodle",
    name: "麺とだし 晴れ",
    genre: "ラーメン",
    distance: 450,
    price: 900,
    description: "澄んだだしと細麺の、あっさりした一杯。気軽なランチに。",
    color: "#ead3a3",
  },
  {
    id: "rice",
    name: "まちの定食 こめ日和",
    genre: "和食・定食",
    distance: 600,
    price: 1100,
    description: "炊きたてのごはんに、選べる主菜と小鉢。しっかり食べたい日に。",
    color: "#97bca5",
  },
  {
    id: "pasta",
    name: "パスタキッチン Lino",
    genre: "イタリアン",
    distance: 750,
    price: 1400,
    description:
      "トマトソースのパスタとサラダ。みんなでゆっくり過ごせるランチ。",
    color: "#ef9c80",
  },
  {
    id: "burger",
    name: "GOOD DAY BURGER",
    genre: "ハンバーガー",
    distance: 800,
    price: 1300,
    description: "香ばしいバンズにジューシーなパティ。ポテトも一緒に。",
    color: "#d6ba8b",
  },
  {
    id: "cafe",
    name: "喫茶 よりみち",
    genre: "カフェ",
    distance: 950,
    price: 1200,
    description: "サンドイッチとコーヒーでひと休み。おしゃべりしたい日に。",
    color: "#aabacc",
  },
  {
    id: "grill",
    name: "鉄板ダイニング まる",
    genre: "鉄板焼き",
    distance: 1200,
    price: 1800,
    description: "熱々の鉄板で焼き上げる、ごはんが進むお昼のセット。",
    color: "#c4a199",
  },
  {
    id: "sushi",
    name: "鮨とごはん いろは",
    genre: "寿司",
    distance: 1400,
    price: 2300,
    description: "彩り豊かな握りと汁物。今日は少しだけ特別なランチに。",
    color: "#bfc49b",
  },
];
export function findSamples(radius: number, budget: number) {
  return samples.filter((r) => r.distance <= radius && (budget === 0 || r.price <= budget));
}
export const priceLabel = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// Shared search choices and outward-rounded radius bands.
export const radiusOptions = [500, 1000, 1500, 2000, 2500, 3000];
export function distanceBandLabel(distance: number, unknown = false, origin = "現在地") {
  if (unknown) return "地名・住所で検索";
  const band = radiusOptions.find(limit => distance <= limit);
  return band ? `${origin}から${band / 1000}km圏内` : `${origin}から3km圏外`;
}
export function restaurantBudgetLabel(restaurant: Restaurant) {
  return restaurant.source ? (restaurant.budgetLabel || "予算情報なし") : `${priceLabel(restaurant.price)} / 人`;
}
