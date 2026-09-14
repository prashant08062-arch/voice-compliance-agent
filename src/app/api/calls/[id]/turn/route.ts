import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeCall, serializeDecision, parseJson } from "@/lib/serialize";
import { runListeningAgents } from "@/lib/agents/listening";
import { runThesisAgent } from "@/lib/agents/thesis";
import { evaluateProposal } from "@/lib/compliance/engine";
import { generateCustomerUtterance, getPersonas } from "@/lib/agents/persona";
import type {
  AudioIntel,
  CustomerContext,
  Proposal,
  TranscriptTurn,
  TurnResponse,
  Verdict,
} from "@/lib/agents/types";

// POST /api/calls/[id]/turn
// Body: { text?: string, autopilot?: boolean, audioIntel?: AudioIntel }
// audioIntel is attached when the utterance arrived via the AssemblyAI
// voice-intake path (speech-to-text + sentiment) — it grounds the Empathy
// listening agent with real acoustic evidence.
// Runs the FULL pipeline: Listening Agents → Thesis Agent → Compliance Governor
// → Voice Executor script selection. Returns every stage for the sidebar.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const started = Date.now();
  const { id } = await context.params;
  try {
    const body = await req.json().catch(() => ({}));
    const call = await db.call.findUnique({
      where: { id },
      include: { customer: true, decisions: true },
    });
    if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
    if (call.status !== "ACTIVE") {
      return NextResponse.json({ error: "Call already completed" }, { status: 400 });
    }

    const transcript = parseJson<TranscriptTurn[]>(call.transcript, []);

    // ── 1. Obtain the customer utterance ─────────────────────────────────────
    // Optional AssemblyAI audio intel (voice-intake path): validated shape only.
    const rawIntel = body.audioIntel as Partial<AudioIntel> | undefined;
    const audioIntel: AudioIntel | undefined =
      rawIntel &&
      (rawIntel.sentiment === "POSITIVE" || rawIntel.sentiment === "NEGATIVE" || rawIntel.sentiment === "NEUTRAL") &&
      typeof rawIntel.transcript === "string"
        ? {
            provider: rawIntel.provider === "assemblyai" ? "assemblyai" : "demo",
            transcript: rawIntel.transcript,
            sentiment: rawIntel.sentiment,
            sentimentConfidence:
              typeof rawIntel.sentimentConfidence === "number" ? rawIntel.sentimentConfidence : 0.5,
            durationSec: typeof rawIntel.durationSec === "number" ? rawIntel.durationSec : undefined,
            words: typeof rawIntel.words === "number" ? rawIntel.words : undefined,
          }
        : undefined;

    let customerText = typeof body.text === "string" ? body.text.trim() : "";
    let autopilotUsedFallback = false;
    if (!customerText && body.autopilot) {
      const persona = getPersonas().find((p) => p.key === call.customer.personaKey);
      if (persona) {
        const gen = await generateCustomerUtterance(persona, transcript, transcript.length);
        customerText = gen.text;
        autopilotUsedFallback = gen.usedFallback;
      } else {
        return NextResponse.json({ error: "Autopilot unavailable for this call" }, { status: 400 });
      }
    }
    if (!customerText) {
      return NextResponse.json({ error: "No customer utterance provided" }, { status: 400 });
    }

    const customerMessage: TranscriptTurn = {
      role: "customer",
      text: customerText,
      ts: new Date().toISOString(),
    };
    const transcriptWithCustomer = [...transcript, customerMessage];

    const customerCtx: CustomerContext = {
      id: call.customer.id,
      name: call.customer.name,
      tenureYears: call.customer.tenureYears,
      tier: call.customer.tier,
      accountBalance: call.customer.accountBalance,
      lateFeesYTD: call.customer.lateFeesYTD,
      openLateFee: call.customer.openLateFee,
      eligibilityFlags: parseJson<string[]>(call.customer.eligibilityFlags, []),
      riskProfile: call.customer.riskProfile,
    };

    const state = await db.systemState.findUnique({ where: { id: "main" } });
    const supervisorWaitMinutes = state?.supervisorWaitMinutes ?? 7;

    // ── 2. Listening Agents (committee) ──────────────────────────────────────
    const { signals, usedFallback: listeningFallback } = await runListeningAgents(
      transcriptWithCustomer,
      customerCtx,
      audioIntel
    );

    // ── 3. Response Thesis Agent (AI proposes) ───────────────────────────────
    const { proposal, usedFallback: thesisFallback } = await runThesisAgent(
      transcriptWithCustomer,
      customerCtx,
      signals,
      supervisorWaitMinutes
    );

    // ── 4. Compliance Governor (deterministic rules verify) ──────────────────
    const verdict: Verdict = await evaluateProposal(proposal, {
      customer: customerCtx,
      supervisorWaitMinutes,
    });

    // ── 5. Voice Executor script selection ───────────────────────────────────
    const executedScript =
      verdict.decision === "APPROVED" ? proposal.proposed_response : verdict.fallbackScript || proposal.proposed_response;

    const agentMessage: TranscriptTurn = {
      role: "agent",
      text: executedScript,
      ts: new Date().toISOString(),
    };
    const newTranscript = [...transcriptWithCustomer, agentMessage];

    const seq = call.decisions.length + 1;
    const usedFallbackAI = listeningFallback || thesisFallback || autopilotUsedFallback;

    // ── 6. Persist decision (counterfactual memory) + transcript ─────────────
    const decision = await db.decision.create({
      data: {
        callId: call.id,
        seq,
        customerIssue: signals.knowledge.issue_type.replace(/_/g, " ").toLowerCase(),
        proposal: JSON.stringify(proposal),
        signals: JSON.stringify(signals),
        decision: verdict.decision,
        ruleCode: verdict.ruleCode ?? null,
        reason: verdict.reason,
        fallbackScript: verdict.fallbackScript ?? null,
        executedScript,
        executed: true,
        usedFallbackAI,
        counterfactual: verdict.counterfactualNote ?? null,
      },
    });

    await db.call.update({
      where: { id: call.id },
      data: { transcript: JSON.stringify(newTranscript) },
    });

    const updated = await db.call.findUnique({
      where: { id: call.id },
      include: { customer: true, decisions: { orderBy: { seq: "asc" } } },
    });

    const response: TurnResponse = {
      customerMessage,
      stages: {
        listening: signals,
        thesis: proposal,
        governor: verdict,
        executedScript,
        decisionId: decision.id,
        usedFallbackAI,
        latencyMs: Date.now() - started,
      },
      decision: serializeDecision(decision),
    };

    return NextResponse.json({ ...response, call: serializeCall(updated!) });
  } catch (err) {
    console.error("[turn POST]", err);
    return NextResponse.json({ error: "Pipeline failure: " + (err as Error).message }, { status: 500 });
  }
}
