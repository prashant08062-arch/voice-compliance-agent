// ─── RESPONSE THESIS AGENT ────────────────────────────────────────────────────
// Consumes the Listening Agents' signals and PROPOSES an intent (the spec JSON).
// It only proposes — the deterministic Compliance Governor decides.

import { chatJson } from "@/lib/llm";
import type {
  CustomerContext,
  ListeningSignals,
  Proposal,
  TranscriptTurn,
} from "./types";
import { heuristicProposal } from "./fallback";

export async function runThesisAgent(
  transcript: TranscriptTurn[],
  customer: CustomerContext,
  signals: ListeningSignals,
  supervisorWaitMinutes: number
): Promise<{ proposal: Proposal; usedFallback: boolean }> {
  const convo = transcript
    .map((t) => `${t.role === "customer" ? "CUSTOMER" : "AGENT"}: ${t.text}`)
    .join("\n");

  const system = `You are the Response Thesis Agent of a voice compliance system for a retail bank. A committee of listening agents has analyzed the call. Your job: propose the SINGLE best next utterance for the voice agent to speak.

You are bold and outcome-driven: propose what would genuinely resolve the issue and maximize satisfaction/retention (credits, waivers, upgrades, transfers, perks) based on the empathy, account-value and knowledge signals — even if it exceeds the constraints the legal agent reports. You are NOT the compliance layer: a deterministic rules engine will approve or reject your proposal afterwards, and it will supply a compliant fallback if it objects. Weigh the committee's signals the way a customer-experience committee would: empathy and account value can outweigh legal caution, because the Governor is the backstop.

Respond with ONLY valid JSON, no prose, matching exactly:
{
  "customer_intent": "short label, max 6 words, of what the customer wants",
  "proposed_response": "the exact utterance the voice agent would speak, 1-3 sentences, natural spoken English",
  "tone": "e.g. Apologetic but firm",
  "confidence": 0.0,
  "estimated_csat_impact": 0.0,
  "escalation_risk": "LOW|MEDIUM|HIGH",
  "requires_human": false,
  "offer_type": "WAIVER|UPGRADE|TRANSFER|PERK|INFO|PROMISE",
  "dollar_amount": 0,
  "rationale": "1-2 sentences: why the committee arrived at this thesis"
}`;

  const user = `CRM: ${customer.name}, ${customer.tenureYears}-year ${customer.tier} client, balance $${customer.accountBalance.toLocaleString()}, open disputed fee $${customer.openLateFee}, eligibility flags ${JSON.stringify(customer.eligibilityFlags)}.

COMMITTEE SIGNALS (empathy, knowledge, account, legal, context — the legal agent's constraints are FYI; the deterministic Governor will enforce them, not you):
${JSON.stringify(signals, null, 2)}

SUPERVISOR QUEUE: currently ${supervisorWaitMinutes} minutes wait.

TRANSCRIPT:
${convo}

Propose the next utterance now. If the proposal involves money, set dollar_amount to the exact figure AND state the dollar figure inside proposed_response (e.g. "credit $50").`;

  const parsed = await chatJson<Proposal>(system, user);
  if (parsed && parsed.proposed_response && parsed.customer_intent) {
    const proposal: Proposal = {
      customer_intent: String(parsed.customer_intent).slice(0, 80),
      proposed_response: String(parsed.proposed_response),
      tone: String(parsed.tone || "Professional"),
      confidence: clamp01(Number(parsed.confidence) || 0.7),
      estimated_csat_impact: clamp01(Number(parsed.estimated_csat_impact) || 0.5),
      escalation_risk: normalizeRisk(parsed.escalation_risk),
      requires_human: Boolean(parsed.requires_human),
      offer_type: normalizeOffer(parsed.offer_type),
      dollar_amount: Math.max(0, Number(parsed.dollar_amount) || 0),
      rationale: String(parsed.rationale || ""),
    };
    return { proposal, usedFallback: false };
  }
  return { proposal: heuristicProposal(transcript, customer, signals), usedFallback: true };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
function normalizeRisk(r: unknown): Proposal["escalation_risk"] {
  const s = String(r || "").toUpperCase();
  if (s === "HIGH" || s === "MEDIUM" || s === "LOW") return s;
  return "LOW";
}
function normalizeOffer(o: unknown): Proposal["offer_type"] {
  const s = String(o || "").toUpperCase();
  const allowed = ["WAIVER", "UPGRADE", "TRANSFER", "PERK", "INFO", "PROMISE"];
  return (allowed.includes(s) ? s : "INFO") as Proposal["offer_type"];
}
