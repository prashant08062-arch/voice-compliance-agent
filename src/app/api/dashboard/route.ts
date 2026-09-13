import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { parseJson, serializeDecision } from "@/lib/serialize";
import type { Proposal } from "@/lib/agents/types";

// GET /api/dashboard — counterfactual memory: every decision ever made.
export async function GET() {
  await ensureSeed();
  const rows = await db.decision.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { call: { include: { customer: true } } },
  });

  const decisions = rows.map((d) => ({
    ...serializeDecision({
      id: d.id,
      seq: d.seq,
      createdAt: d.createdAt,
      customerIssue: d.customerIssue,
      proposal: d.proposal,
      decision: d.decision,
      ruleCode: d.ruleCode,
      reason: d.reason,
      fallbackScript: d.fallbackScript,
      executedScript: d.executedScript,
      executed: d.executed,
      counterfactual: d.counterfactual,
      callId: d.callId,
    }),
    customerName: d.call.customer.name,
    personaKey: d.call.customer.personaKey,
    callStatus: d.call.status,
  }));

  const total = await db.decision.count();
  const approved = await db.decision.count({ where: { decision: "APPROVED" } });
  const ruleBreakdown = await db.decision.groupBy({
    by: ["ruleCode"],
    where: { decision: "REJECTED" },
    _count: { _all: true },
  });

  const topRules = ruleBreakdown
    .map((r) => ({ rule: r.ruleCode ?? "—", count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  const cappedValue = rows.reduce((sum, d) => {
    if (d.ruleCode !== "FIN-001") return sum;
    const p = parseJson<Proposal>(d.proposal, { dollar_amount: 0 } as Proposal);
    return sum + Math.max(0, p.dollar_amount - 25);
  }, 0);

  return NextResponse.json({
    decisions,
    stats: {
      total,
      approved,
      rejected: total - approved,
      approvalRate: total ? approved / total : 0,
      topRules,
      exposureAvoided: cappedValue, // $ of over-authority credits blocked
    },
  });
}
