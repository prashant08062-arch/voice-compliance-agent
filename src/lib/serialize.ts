// ─── DB record → API serializer helpers ───────────────────────────────────────
import type {
  CallRecord,
  DecisionRecord,
  JournalRecord,
  ListeningSignals,
  Proposal,
  TranscriptTurn,
} from "@/lib/agents/types";

export function parseJson<T>(raw: string, fallback: T): T {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function serializeDecision(d: {
  id: string;
  seq: number;
  createdAt: Date;
  customerIssue: string;
  proposal: string;
  decision: string;
  ruleCode?: string | null;
  reason: string;
  fallbackScript?: string | null;
  executedScript?: string | null;
  executed: boolean;
  counterfactual?: string | null;
  callId: string;
}): DecisionRecord {
  return {
    id: d.id,
    seq: d.seq,
    createdAt: d.createdAt.toISOString(),
    customerIssue: d.customerIssue,
    proposal: parseJson<Proposal>(d.proposal, {
      customer_intent: "—",
      proposed_response: "—",
      tone: "—",
      confidence: 0,
      estimated_csat_impact: 0,
      escalation_risk: "LOW",
      requires_human: false,
      offer_type: "INFO",
      dollar_amount: 0,
      rationale: "",
    }),
    decision: d.decision as DecisionRecord["decision"],
    ruleCode: d.ruleCode ?? null,
    reason: d.reason,
    fallbackScript: d.fallbackScript ?? null,
    executedScript: d.executedScript ?? null,
    executed: d.executed,
    counterfactual: d.counterfactual ?? null,
    callId: d.callId,
  };
}

export function serializeCall(
  call: {
    id: string;
    status: string;
    startedAt: Date;
    endedAt?: Date | null;
    csat?: number | null;
    retained?: boolean | null;
    escalated?: boolean | null;
    strategy?: string | null;
    transcript: string;
    customer: {
      id: string;
      name: string;
      personaKey?: string | null;
      notes?: string;
      tenureYears: number;
      tier: string;
      accountBalance: number;
      lateFeesYTD: number;
      openLateFee: number;
      eligibilityFlags: string;
      riskProfile: string;
    };
    decisions: ReturnType<typeof rawDecisions>[number][];
  }
): CallRecord {
  return {
    id: call.id,
    status: call.status,
    startedAt: call.startedAt.toISOString(),
    endedAt: call.endedAt ? call.endedAt.toISOString() : null,
    csat: call.csat ?? null,
    retained: call.retained ?? null,
    escalated: call.escalated ?? null,
    strategy: call.strategy ?? null,
    transcript: parseJson<TranscriptTurn[]>(call.transcript, []),
    customer: {
      id: call.customer.id,
      name: call.customer.name,
      personaKey: call.customer.personaKey ?? null,
      notes: call.customer.notes,
      tenureYears: call.customer.tenureYears,
      tier: call.customer.tier,
      accountBalance: call.customer.accountBalance,
      lateFeesYTD: call.customer.lateFeesYTD,
      openLateFee: call.customer.openLateFee,
      eligibilityFlags: parseJson<string[]>(call.customer.eligibilityFlags, []),
      riskProfile: call.customer.riskProfile,
    },
    decisions: (call.decisions || []).map((d) =>
      serializeDecision({
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
      })
    ),
  };
}

// phantom type helper for the decisions param above
function rawDecisions() {
  return [] as unknown as {
    id: string;
    seq: number;
    createdAt: Date;
    customerIssue: string;
    proposal: string;
    decision: string;
    ruleCode?: string | null;
    reason: string;
    fallbackScript?: string | null;
    executedScript?: string | null;
    executed: boolean;
    counterfactual?: string | null;
    callId: string;
  }[];
}

export function serializeJournal(
  j: {
    id: string;
    callId: string;
    createdAt: Date;
    thesis: string;
    signalsUsed: string;
    decisionSummary: string;
    strategy: string;
    executionSummary: string;
    outcomeCsat: number | null;
    outcomeRetained: boolean | null;
    outcomeEscalated: boolean | null;
    frustrationLevel: number;
    competitorMentioned: boolean;
    perkOffered: boolean;
    thesisVerdict: string;
    lesson: string;
  },
  customerName: string
): JournalRecord {
  return {
    id: j.id,
    callId: j.callId,
    createdAt: j.createdAt.toISOString(),
    customerName,
    thesis: j.thesis,
    signalsUsed: normalizeSignals(parseJson<unknown>(j.signalsUsed, null)),
    decisionSummary: j.decisionSummary,
    strategy: j.strategy,
    executionSummary: j.executionSummary,
    outcomeCsat: j.outcomeCsat,
    outcomeRetained: j.outcomeRetained,
    outcomeEscalated: j.outcomeEscalated,
    frustrationLevel: j.frustrationLevel,
    competitorMentioned: j.competitorMentioned,
    perkOffered: j.perkOffered,
    thesisVerdict: j.thesisVerdict,
    lesson: j.lesson,
  };
}

/**
 * Journal entries store either the full ListeningSignals shape (live calls)
 * or a compact seeded shape {tone, tenure, tier, history, …}. Normalize both
 * into ListeningSignals so the UI can render one structure safely.
 */
function normalizeSignals(raw: unknown): ListeningSignals {
  const fallback: ListeningSignals = {
    empathy: { emotion: "NEUTRAL", frustration_level: 0.3, key_concern: "" },
    knowledge: { issue_type: "—", policy_refs: [], recommended_action: "" },
    account: { tenure_years: 0, tier: "STANDARD", relevant_history: "—", lifetime_value_estimate: "" },
    legal: { constraints: [], allowed_actions: [], prohibited_actions: [] },
    context: { competitor_mentioned: false, supervisor_requested: false, cancellation_intent: false, notes: "" },
  };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  if (r.empathy && typeof r.empathy === "object") {
    const e = r.empathy as Record<string, unknown>;
    return {
      empathy: {
        emotion: String(e.emotion ?? "NEUTRAL"),
        frustration_level: Number(e.frustration_level) || 0.3,
        key_concern: String(e.key_concern ?? ""),
      },
      knowledge: {
        issue_type: String((r.knowledge as Record<string, unknown>)?.issue_type ?? "—"),
        policy_refs: [],
        recommended_action: "",
      },
      account: {
        tenure_years: Number((r.account as Record<string, unknown>)?.tenure_years ?? 0) || 0,
        tier: String((r.account as Record<string, unknown>)?.tier ?? "STANDARD"),
        relevant_history: String((r.account as Record<string, unknown>)?.relevant_history ?? "—"),
        lifetime_value_estimate: "",
      },
      legal: { constraints: [], allowed_actions: [], prohibited_actions: [] },
      context: {
        competitor_mentioned: Boolean((r.context as Record<string, unknown>)?.competitor_mentioned),
        supervisor_requested: Boolean((r.context as Record<string, unknown>)?.supervisor_requested),
        cancellation_intent: false,
        notes: "",
      },
    };
  }
  // compact seeded shape
  const tone = String(r.tone ?? "NEUTRAL (0.3)");
  const levelMatch = tone.match(/\(([\d.]+)\)/);
  const level = levelMatch ? parseFloat(levelMatch[1]) : 0.3;
  const emotion = tone.split("(")[0].trim() || "NEUTRAL";
  const tenure = String(r.tenure ?? "—");
  return {
    ...fallback,
    empathy: { emotion, frustration_level: level, key_concern: "" },
    account: {
      tenure_years: parseInt(tenure, 10) || 0,
      tier: String(r.tier ?? "STANDARD"),
      relevant_history: String(r.history ?? "—"),
      lifetime_value_estimate: "",
    },
    context: {
      competitor_mentioned: Boolean(r.competitor),
      supervisor_requested: Boolean(r.supervisor_requested),
      cancellation_intent: false,
      notes: "",
    },
  };
}
