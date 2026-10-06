export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Bound bytes while reading: Content-Length alone is not trustworthy.
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new ApiError(415, "JSONで送信してください。");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "入力形式が正しくありません。");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw new ApiError(413, "入力が長すぎます。");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiError(400, "入力形式が正しくありません。"); }
}

export const ROOM_LIFETIME_MS = 60 * 60 * 1000;
export function assertRoomActive(createdAt: number, now = Date.now()) {
  if (createdAt + ROOM_LIFETIME_MS <= now)
    throw new ApiError(410, "このルームは1時間の有効期限を過ぎました。新しく作成してください。");
}
