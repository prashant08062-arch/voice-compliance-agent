import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeCall } from "@/lib/serialize";

// GET /api/calls/[id] — fetch full call state
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const call = await db.call.findUnique({
    where: { id },
    include: { customer: true, decisions: { orderBy: { seq: "asc" } } },
  });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  return NextResponse.json({ call: serializeCall(call) });
}
