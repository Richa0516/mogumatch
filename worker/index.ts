import app from "vinext/server/fetch-handler";
import { purgeExpiredRooms } from "../lib/room-cleanup";

export default {
  ...app,
  async scheduled(_controller: ScheduledController, env: Cloudflare.Env) {
    if (!env.DB) throw new Error("DB binding unavailable for cleanup");
    // Throw on failure so the platform records it as a failed invocation.
    await purgeExpiredRooms(env.DB);
  },
};
