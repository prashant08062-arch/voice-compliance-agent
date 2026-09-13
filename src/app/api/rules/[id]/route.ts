import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/serialize";

// PUT /api/rules/[id] — edit the rulebook (params / active).
// This is the only way rules change: a human flips a switch. The engine
// re-reads the rulebook from the DB on every single evaluation.
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const body = await req.json();
    const rule = await db.rule.findUnique({ where: { id } });
    if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    const params = parseJson<Record<string, number | string | boolean>>(rule.params, {});
    const nextParams = { ...params };
    if (body.params && typeof body.params === "object") {
      for (const [k, v] of Object.entries(body.params)) {
        nextParams[k] = v as number | string | boolean;
      }
    }

    const updated = await db.rule.update({
      where: { id },
      data: {
        params: JSON.stringify(nextParams),
        active: typeof body.active === "boolean" ? body.active : rule.active,
      },
    });

    return NextResponse.json({
      rule: {
        id: updated.id,
        code: updated.code,
        category: updated.category,
        name: updated.name,
        description: updated.description,
        params: parseJson<Record<string, number | string | boolean>>(updated.params, {}),
        active: updated.active,
        priority: updated.priority,
      },
    });
  } catch (err) {
    console.error("[rules PUT]", err);
    return NextResponse.json({ error: "Rule update failed" }, { status: 500 });
  }
}
