import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { parseJson } from "@/lib/serialize";
import { getEffectiveWaiverCap } from "@/lib/compliance/engine";

// GET /api/rules — the Governor's live rulebook.
export async function GET() {
  await ensureSeed();
  const rules = await db.rule.findMany({ orderBy: { priority: "asc" } });
  const cap = await getEffectiveWaiverCap();
  return NextResponse.json({
    rules: rules.map((r) => ({
      id: r.id,
      code: r.code,
      category: r.category,
      name: r.name,
      description: r.description,
      params: parseJson<Record<string, number | string | boolean>>(r.params, {}),
      active: r.active,
      priority: r.priority,
    })),
    effectiveCap: cap,
  });
}
