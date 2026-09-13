import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { serializeCall } from "@/lib/serialize";
import { getPersonas } from "@/lib/agents/persona";

// POST /api/calls — start a new call with a persona
export async function POST(req: NextRequest) {
  await ensureSeed();
  try {
    const { personaKey, openingAutopilot } = await req.json();
    const persona = getPersonas().find((p) => p.key === personaKey);
    if (!persona) {
      return NextResponse.json({ error: "Unknown persona" }, { status: 400 });
    }

    const customer = await db.customer.create({
      data: {
        name: persona.customer.name,
        personaKey: persona.key,
        tenureYears: persona.customer.tenureYears,
        tier: persona.customer.tier,
        accountBalance: persona.customer.accountBalance,
        lateFeesYTD: persona.customer.lateFeesYTD,
        openLateFee: persona.customer.openLateFee,
        eligibilityFlags: JSON.stringify(persona.customer.eligibilityFlags),
        riskProfile: persona.customer.riskProfile,
      },
    });

    const transcript = openingAutopilot
      ? [{ role: "customer", text: persona.openingLine, ts: new Date().toISOString() }]
      : [];

    const call = await db.call.create({
      data: {
        customerId: customer.id,
        status: "ACTIVE",
        transcript: JSON.stringify(transcript),
      },
      include: { customer: true, decisions: true },
    });

    return NextResponse.json({ call: serializeCall(call) });
  } catch (err) {
    console.error("[calls POST]", err);
    return NextResponse.json({ error: "Failed to start call" }, { status: 500 });
  }
}
