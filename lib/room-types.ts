import type { Restaurant } from "./restaurants";
export type Member = {
  id: string;
  name: string;
  isHost: boolean;
  voted: number;
};
export type Room = {
  detailsIncluded: boolean;
  detailsFetchedAt?: number;
  id: string;
  expiresAt: number;
  area: string;
  radius: number;
  budget: number;
  status: "lobby" | "voting" | "closed";
  candidates: Restaurant[];
  members: Member[];
  me: Member | null;
  myVotes: Record<string, boolean>;
  totalVotes: number;
  allDone: boolean;
  results: (Restaurant & {
    likes: number;
    dislikes: number;
    pending: number;
  })[];
};
