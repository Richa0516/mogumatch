declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    HOTPEPPER_API_KEY?: string;
    RESTAURANT_MODE?: string;
  }
}
