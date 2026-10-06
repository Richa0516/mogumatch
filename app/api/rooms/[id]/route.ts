import { handleRoom } from "@/lib/room-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) => handleRoom(request, (await context.params).id);
export const POST = async (request: Request, context: Context) => handleRoom(request, (await context.params).id);
