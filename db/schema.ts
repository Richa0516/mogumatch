import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  area: text("area").notNull(),
  radius: integer("radius").notNull(),
  budget: integer("budget").notNull(),
  status: text("status").notNull().default("lobby"),
  candidates: text("candidates").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("idx_rooms_created").on(table.createdAt)]);
export const createLimits = sqliteTable("create_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("idx_limits_expiry").on(table.expiresAt)]);
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    sessionHash: text("session_hash").notNull(),
    name: text("name").notNull(),
    isHost: integer("is_host").notNull().default(0),
  },
  (table) => [
    uniqueIndex("idx_members_room_session").on(table.roomId, table.sessionHash),
  ],
);
export const votes = sqliteTable(
  "votes",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id),
    restaurantId: text("restaurant_id").notNull(),
    liked: integer("liked").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.memberId, table.restaurantId] }),
  ],
);
