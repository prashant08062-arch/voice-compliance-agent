import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";

// GET/PUT /api/system-state — live ops console (supervisor queue etc.)
export async function GET() {
  await ensureSeed();
  const state = await db.systemState.findUnique({ where: { id: "main" } });
  return NextResponse.json({
    supervisorWaitMinutes: state?.supervisorWaitMinutes ?? 7,
  });
}

export async function PUT(req: NextRequest) {
  await ensureSeed();
  try {
    const body = await req.json();
    const minutes = Math.max(0, Math.min(60, Number(body.supervisorWaitMinutes) || 0));
    await db.systemState.upsert({
      where: { id: "main" },
      create: { id: "main", supervisorWaitMinutes: minutes },
      update: { supervisorWaitMinutes: minutes },
    });
    return NextResponse.json({ supervisorWaitMinutes: minutes });
  } catch {
    return NextResponse.json({ error: "Failed to update system state" }, { status: 500 });
  }
}
