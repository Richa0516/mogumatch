import { handleRoom } from "@/lib/room-server";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleRoom(request);
export const POST = (request: Request) => handleRoom(request);
