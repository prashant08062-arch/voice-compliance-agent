import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJson, serializeCall, serializeJournal } from "@/lib/serialize";
import { chatText } from "@/lib/llm";
import type { DecisionRecord, ListeningSignals, Proposal, TranscriptTurn } from "@/lib/agents/types";

// POST /api/calls/[id]/outcome
// Body: { csat: 1-5, retained: boolean, escalated: boolean }
// Closes the call → builds the journal chain → generates counterfactual
// explanations for every rejected utterance → distills LIVE learning patterns.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const body = await req.json();
    const csat = Math.max(1, Math.min(5, Number(body.csat) || 3));
    const retained = Boolean(body.retained);
    const escalated = Boolean(body.escalated);

    const call = await db.call.findUnique({
      where: { id },
      include: { customer: true, decisions: { orderBy: { seq: "asc" } } },
    });
    if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
    if (call.status === "COMPLETED") {
      return NextResponse.json({ error: "Call already completed" }, { status: 400 });
    }

    const decisions = call.decisions;
    if (decisions.length === 0) {
      return NextResponse.json({ error: "Cannot close a call with no decisions" }, { status: 400 });
    }

    const transcript = parseJson<TranscriptTurn[]>(call.transcript, []);
    const lastSignals = parseJson<ListeningSignals>(decisions[decisions.length - 1].signals, {
      empathy: { emotion: "NEUTRAL", frustration_level: 0.3, key_concern: "" },
      knowledge: { issue_type: "GENERAL_INQUIRY", policy_refs: [], recommended_action: "" },
      account: { tenure_years: call.customer.tenureYears, tier: call.customer.tier, relevant_history: "", lifetime_value_estimate: "" },
      legal: { constraints: [], allowed_actions: [], prohibited_actions: [] },
      context: { competitor_mentioned: false, supervisor_requested: false, cancellation_intent: false, notes: "" },
    });
    const firstProposal = parseJson<Proposal>(decisions[0].proposal, null as unknown as Proposal);

    // ── Strategy classification (deterministic) ──────────────────────────────
    const anyTransfer = decisions.some((d) =>
      parseJson<Proposal>(d.proposal, { offer_type: "INFO" } as Proposal).offer_type === "TRANSFER"
    );
    const rejectedAll = decisions.every((d) => d.decision === "REJECTED");
    const perkOffered = decisions.some((d) => {
      const p = parseJson<Proposal>(d.proposal, { offer_type: "INFO" } as Proposal);
      return p.offer_type === "PERK" || p.offer_type === "UPGRADE" || (p.offer_type === "WAIVER" && p.dollar_amount > 0);
    });
    const strategy = escalated
      ? "TRANSFER"
      : rejectedAll
      ? "AI_ONLY"
      : perkOffered
      ? "IMMEDIATE_RESOLUTION"
      : "IMMEDIATE_RESOLUTION";

    // ── Thesis verdict (deterministic) ───────────────────────────────────────
    const predictedCsat = firstProposal?.estimated_csat_impact ?? 0.5; // 0..1 → expect csat ≈ 1+4*predicted
    const predictedCsatScale = 1 + 4 * predictedCsat;
    const thesisVerdict =
      csat >= 4 && retained
        ? "RIGHT"
        : csat <= 2 || !retained
        ? "WRONG"
        : Math.abs(csat - predictedCsatScale) <= 1.5
        ? "RIGHT"
        : "INCONCLUSIVE";

    // ── Lesson generation (LLM with deterministic fallback) ──────────────────
    const decisionLog = decisions
      .map(
        (d) =>
          `#${d.seq} [${d.decision}] intent="${parseJson<Proposal>(d.proposal, { customer_intent: "" } as Proposal).customer_intent}" proposal="${parseJson<Proposal>(d.proposal, { proposed_response: "" } as Proposal).proposed_response}" rule=${d.ruleCode ?? "—"} reason="${d.reason}" executed="${d.executedScript ?? ""}"`
      )
      .join("\n");

    const lessonSystem = `You are the post-call learning module of a voice compliance agent. Write ONE crisp lesson (2-3 sentences, max ~60 words) in the voice of an analyst reviewing the AI's own conversational record. Reference concrete signals (tone, tenure, what was offered/rejected) and the outcome. No preamble, no quotes.`;

    const lessonUser = `CALL: ${call.customer.name} — ${call.customer.tenureYears}-yr ${call.customer.tier} client.
TONE AT PEAK: ${lastSignals.empathy.emotion} (frustration ${lastSignals.emotion && lastSignals.empathy.frustration_level})
ISSUE: ${lastSignals.knowledge.issue_type}
COMPETITOR MENTIONED: ${lastSignals.context.competitor_mentioned}
SUPERVISOR REQUESTED: ${lastSignals.context.supervisor_requested}

DECISION CHAIN:
${decisionLog}

OUTCOME: CSAT ${csat}/5, retained=${retained}, escalated=${escalated}.
THESIS VERDICT (computed): ${thesisVerdict}.

Write the LESSON entry for the conversation journal.`;

    let lesson = await chatText(lessonSystem, lessonUser, 20000);
    if (!lesson) {
      lesson = templateLesson(csat, retained, escalated, lastSignals.empathy.frustration_level, decisions.length);
    }
    lesson = lesson.slice(0, 600);

    // ── Counterfactual explanations for rejected utterances ──────────────────
    const rejected = decisions.filter((d) => d.decision === "REJECTED");
    for (const d of rejected) {
      if (d.counterfactual) continue; // stored at decision time
      const p = parseJson<Proposal>(d.proposal, { proposed_response: "" } as Proposal);
      const cfSystem = `You are the counterfactual memory module of a voice compliance agent. The customer asked (or later wondered) "Why didn't you say that?" — why wasn't the rejected utterance spoken? Write 2 sentences: (1) what the rejected action would plausibly have achieved emotionally/commercially, (2) why the deterministic rule was still right to block it. Calm, accountable, no blame. No preamble.`;
      const cfUser = `REJECTED UTTERANCE: "${p.proposed_response}"
RULE TRIGGERED: ${d.ruleCode ?? "—"}
OFFICIAL REASON: ${d.reason}
FINAL OUTCOME: CSAT ${csat}/5, retained=${retained}, escalated=${escalated}.
Write the counterfactual explanation now.`;
      let cf = await chatText(cfSystem, cfUser, 20000);
      if (!cf) {
        cf = d.reason; // deterministic fallback: the official reason
      }
      await db.decision.update({
        where: { id: d.id },
        data: { counterfactual: cf.slice(0, 500) },
      });
    }

    // ── Close the call ────────────────────────────────────────────────────────
    await db.call.update({
      where: { id: call.id },
      data: {
        status: "COMPLETED",
        endedAt: new Date(),
        csat,
        retained,
        escalated,
        strategy,
      },
    });

    // ── Journal entry ────────────────────────────────────────────────────────
    const thesisText =
      firstProposal && firstProposal.rationale
        ? firstProposal.rationale
        : "Resolve the customer's issue in one turn.";
    const decisionSummary = decisions
      .map((d) => `${d.decision}${d.ruleCode ? ` (${d.ruleCode})` : ""}`)
      .join(" → ");
    const journal = await db.journalEntry.create({
      data: {
        callId: call.id,
        thesis: thesisText,
        signalsUsed: JSON.stringify({
          tone: `${lastSignals.empathy.emotion} (${lastSignals.empathy.frustration_level})`,
          tenure: `${call.customer.tenureYears} years`,
          tier: call.customer.tier,
          history: lastSignals.account.relevant_history,
          competitor: lastSignals.context.competitor_mentioned,
          supervisor_requested: lastSignals.context.supervisor_requested,
        }),
        decisionSummary: `${decisions.length} proposal(s): ${decisionSummary}`,
        strategy,
        executionSummary:
          transcript.filter((t) => t.role === "agent").slice(-1)[0]?.text?.slice(0, 200) ?? "—",
        outcomeCsat: csat,
        outcomeRetained: retained,
        outcomeEscalated: escalated,
        frustrationLevel: lastSignals.empathy.frustration_level ?? 0.3,
        competitorMentioned: lastSignals.context.competitor_mentioned,
        perkOffered,
        thesisVerdict,
        lesson,
      },
    });

    // ── LIVE learning aggregation ────────────────────────────────────────────
    await updateLiveLearning();

    const updated = await db.call.findUnique({
      where: { id: call.id },
      include: { customer: true, decisions: { orderBy: { seq: "asc" } } },
    });

    return NextResponse.json({
      call: serializeCall(updated!),
      journal: serializeJournal(journal, call.customer.name),
    });
  } catch (err) {
    console.error("[outcome POST]", err);
    return NextResponse.json({ error: "Outcome failure: " + (err as Error).message }, { status: 500 });
  }
}

function templateLesson(
  csat: number,
  retained: boolean,
  escalated: boolean,
  frustration: number,
  nDecisions: number
): string {
  if (!retained) {
    return `Thesis was wrong about recoverability: ${nDecisions} proposal(s) could not prevent churn at CSAT ${csat}/5. Peak frustration ${Math.round(frustration * 100)}% with${escalated ? "" : "out"} human transfer. High frustration + AI-only scripting retains only 43% of cases corpus-wide — this call joins that pattern.`;
  }
  if (csat >= 4) {
    return `Thesis held: the approved path delivered CSAT ${csat}/5 and retention. Frustration peaked at ${Math.round(frustration * 100)}% but the executed scripts stayed inside authority. Empathy + immediate resolution remains the strongest pattern (92% corpus CSAT).`;
  }
  return `Mixed outcome: retained but at CSAT ${csat}/5. Frustration peaked at ${Math.round(frustration * 100)}%; the capped alternatives bought retention but cost warmth. Watch for over-reliance on AI-only scripts when frustration is high (43% corpus retention).`;
}

/** Recompute LIVE patterns from actual journal entries. */
async function updateLiveLearning() {
  const entries = await db.journalEntry.findMany();

  const agg = (
    filter: (e: (typeof entries)[number]) => boolean,
    pick: (e: (typeof entries)[number]) => number | null
  ) => {
    const vals = entries.filter(filter).map(pick).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return { value: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length };
  };

  const patterns: {
    key: string;
    category: string;
    conditionLabel: string;
    outcomeLabel: string;
    value: number;
    sampleSize: number;
    contrastKey?: string;
  }[] = [];

  const immediate = agg((e) => e.strategy === "IMMEDIATE_RESOLUTION", (e) => e.outcomeCsat);
  if (immediate) {
    patterns.push({
      key: "live_immediate_csat", category: "CSAT",
      conditionLabel: "Live calls — immediate resolution", outcomeLabel: "avg CSAT",
      value: immediate.value / 5, sampleSize: immediate.n, contrastKey: "live_scheduled_csat",
    });
  }
  const scheduled = agg(
    (e) => e.strategy === "SCHEDULED_CALLBACK" || e.strategy === "AI_ONLY",
    (e) => e.outcomeCsat
  );
  if (scheduled) {
    patterns.push({
      key: "live_scheduled_csat", category: "CSAT",
      conditionLabel: "Live calls — capped/callback path", outcomeLabel: "avg CSAT",
      value: scheduled.value / 5, sampleSize: scheduled.n, contrastKey: "live_immediate_csat",
    });
  }
  const fh = agg(
    (e) => e.frustrationLevel >= 0.7 && e.strategy === "TRANSFER",
    (e) => (e.outcomeRetained === null ? null : e.outcomeRetained ? 1 : 0)
  );
  if (fh) {
    patterns.push({
      key: "live_frustration_human", category: "RETENTION",
      conditionLabel: "Live — high frustration + transfer", outcomeLabel: "Retention",
      value: fh.value, sampleSize: fh.n, contrastKey: "live_frustration_ai",
    });
  }
  const fa = agg(
    (e) => e.frustrationLevel >= 0.7 && e.strategy !== "TRANSFER",
    (e) => (e.outcomeRetained === null ? null : e.outcomeRetained ? 1 : 0)
  );
  if (fa) {
    patterns.push({
      key: "live_frustration_ai", category: "RETENTION",
      conditionLabel: "Live — high frustration + AI-only", outcomeLabel: "Retention",
      value: fa.value, sampleSize: fa.n, contrastKey: "live_frustration_human",
    });
  }
  const cp = agg(
    (e) => e.competitorMentioned && e.perkOffered,
    (e) => (e.outcomeRetained === null ? null : e.outcomeRetained ? 1 : 0)
  );
  if (cp) {
    patterns.push({
      key: "live_competitor_perk", category: "WINBACK",
      conditionLabel: "Live — competitor + perk", outcomeLabel: "Win-back",
      value: cp.value, sampleSize: cp.n, contrastKey: "live_competitor_noperk",
    });
  }
  const cnp = agg(
    (e) => e.competitorMentioned && !e.perkOffered,
    (e) => (e.outcomeRetained === null ? null : e.outcomeRetained ? 1 : 0)
  );
  if (cnp) {
    patterns.push({
      key: "live_competitor_noperk", category: "WINBACK",
      conditionLabel: "Live — competitor + no perk", outcomeLabel: "Win-back",
      value: cnp.value, sampleSize: cnp.n, contrastKey: "live_competitor_perk",
    });
  }

  for (const p of patterns) {
    await db.learning.upsert({
      where: { patternKey: p.key },
      create: {
        patternKey: p.key,
        category: p.category,
        conditionLabel: p.conditionLabel,
        outcomeLabel: p.outcomeLabel,
        value: p.value,
        sampleSize: p.sampleSize,
        contrastKey: p.contrastKey ?? null,
        source: "LIVE",
      },
      update: {
        value: p.value,
        sampleSize: p.sampleSize,
        contrastKey: p.contrastKey ?? null,
        discoveredAt: new Date(),
      },
    });
  }
}
