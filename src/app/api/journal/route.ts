import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { serializeJournal } from "@/lib/serialize";

// GET /api/journal — the conversation journal (post-call learning chain).
export async function GET() {
  await ensureSeed();
  const entries = await db.journalEntry.findMany({
    orderBy: { createdAt: "desc" },
    include: { call: { include: { customer: true } } },
    take: 40,
  });
  return NextResponse.json({
    entries: entries.map((j) => serializeJournal(j, j.call.customer.name)),
  });
}
