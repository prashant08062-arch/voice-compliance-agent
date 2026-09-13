import { NextResponse } from "next/server";
import { getPersonas } from "@/lib/agents/persona";
import { ensureSeed } from "@/lib/seed";
import { db } from "@/lib/db";
import { getEffectiveWaiverCap } from "@/lib/compliance/engine";

export async function GET() {
  await ensureSeed();
  const state = await db.systemState.findUnique({ where: { id: "main" } });
  const cap = await getEffectiveWaiverCap();
  return NextResponse.json({
    personas: getPersonas(),
    supervisorWaitMinutes: state?.supervisorWaitMinutes ?? 7,
    effectiveWaiverCap: cap,
  });
}
