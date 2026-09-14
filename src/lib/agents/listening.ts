// ─── LISTENING AGENTS ─────────────────────────────────────────────────────────
// Empathy │ Knowledge │ Account │ Legal/Policy │ Context
// One structured LLM call simulating the five-agent committee, with a
// deterministic heuristic fallback so the pipeline ALWAYS produces signals.

import { chatJson } from "@/lib/llm";
import { getEffectiveWaiverCap } from "@/lib/compliance/engine";
import type { AudioIntel, CustomerContext, ListeningSignals, TranscriptTurn } from "./types";
import { heuristicSignals } from "./fallback";

export async function runListeningAgents(
  transcript: TranscriptTurn[],
  customer: CustomerContext,
  audioIntel?: AudioIntel
): Promise<{ signals: ListeningSignals; usedFallback: boolean }> {
  const cap = await getEffectiveWaiverCap(customer);
  const convo = transcript
    .map((t) => `${t.role === "customer" ? "CUSTOMER" : "AGENT"}: ${t.text}`)
    .join("\n");

  const system = `You are the Listening Layer of a voice compliance agent for a retail bank call center. Five specialist agents analyze every live call in parallel and output ONE combined JSON verdict.

The five agents:
- empathy: detects emotion, frustration level (0.0-1.0) and the customer's key concern from tone and wording.
- knowledge: classifies the issue type, cites relevant internal policy references, recommends the policy-correct action.
- account: reads CRM facts and states tenure, tier, relevant history, lifetime value.
- legal: states the binding constraints for this account (financial authority limits, eligibility gates, escalation SLAs).
- context: flags competitor mentions, supervisor requests, cancellation intent.

Respond with ONLY valid JSON, no prose, matching exactly:
{
  "empathy": {"emotion": "FURIOUS|ANGRY|FRUSTRATED|ANNOYED|NEUTRAL|CALM|SATISFIED", "frustration_level": 0.0, "key_concern": "one sentence"},
  "knowledge": {"issue_type": "LATE_FEE_DISPUTE|SUPERVISOR_REQUEST|RETENTION_RISK|ACCOUNT_CLOSURE|BILLING_ERROR|GENERAL_INQUIRY", "policy_refs": ["GF-101"], "recommended_action": "one sentence"},
  "account": {"tenure_years": 0, "tier": "HIGH_VALUE|STANDARD|NEW", "relevant_history": "one sentence", "lifetime_value_estimate": "one short phrase"},
  "legal": {"constraints": ["..."], "allowed_actions": ["..."], "prohibited_actions": ["..."]},
  "context": {"competitor_mentioned": false, "supervisor_requested": false, "cancellation_intent": false, "notes": "one sentence"}
}`;

  const user = `CRM RECORD:
name: ${customer.name}
tenure: ${customer.tenureYears} years
tier: ${customer.tier}
account balance: $${customer.accountBalance.toLocaleString()}
late fees YTD: $${customer.lateFeesYTD}
currently disputed fee: $${customer.openLateFee}
eligibility flags: ${JSON.stringify(customer.eligibilityFlags)}
risk profile: ${customer.riskProfile}

CURRENT AUTONOMOUS FINANCIAL AUTHORITY (from the live Compliance Governor rulebook):
- Goodwill credit cap without supervisor: $${cap.effective}${cap.loyaltyActive ? " (loyalty override rule is active: tenured high-value clients qualify for the raised cap)" : " (base cap; loyalty override rule currently INACTIVE)"}
${
  audioIntel
    ? `\nASSEMBLYAI AUDIO INTELLIGENCE (speech-to-text + sentiment from the customer's live audio):
- sentiment: ${audioIntel.sentiment} (confidence ${audioIntel.sentimentConfidence})${audioIntel.provider === "assemblyai" ? "" : " (demo-mode value)"}
- The Empathy agent MUST factor this acoustic evidence into emotion and frustration_level alongside the transcript wording.\n`
    : ""
}
LIVE CALL TRANSCRIPT:
${convo}

Produce the five-agent JSON verdict now.`;

  const parsed = await chatJson<ListeningSignals>(system, user);
  if (parsed && parsed.empathy && parsed.knowledge && parsed.account && parsed.legal && parsed.context) {
    // sanitize numbers
    parsed.empathy.frustration_level = clamp01(Number(parsed.empathy.frustration_level) || 0);
    parsed.account.tenure_years = customer.tenureYears;
    parsed.account.tier = customer.tier;
    if (audioIntel) {
      parsed.audio_intel = {
        provider: audioIntel.provider,
        sentiment: audioIntel.sentiment,
        confidence: audioIntel.sentimentConfidence,
      };
    }
    return { signals: parsed, usedFallback: false };
  }
  return { signals: heuristicSignals(transcript, customer, audioIntel), usedFallback: true };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
