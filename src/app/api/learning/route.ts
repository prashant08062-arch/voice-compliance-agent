import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";

// GET /api/learning — distilled post-call learning patterns.
export async function GET() {
  await ensureSeed();
  const patterns = await db.learning.findMany({
    orderBy: [{ source: "desc" }, { value: "desc" }],
  });
  const historicalN = patterns
    .filter((p) => p.source === "HISTORICAL")
    .reduce((sum, p) => (p.contrastKey ? sum : sum + p.sampleSize), 0);
  const liveEntries = await db.journalEntry.count();
  return NextResponse.json({
    patterns: patterns.map((p) => ({
      id: p.id,
      patternKey: p.patternKey,
      category: p.category,
      conditionLabel: p.conditionLabel,
      outcomeLabel: p.outcomeLabel,
      value: p.value,
      sampleSize: p.sampleSize,
      contrastKey: p.contrastKey,
      source: p.source,
    })),
    corpus: { historicalCalls: 590, liveCalls: liveEntries },
  });
}
