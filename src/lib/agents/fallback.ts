// ─── Deterministic heuristic fallbacks ────────────────────────────────────────
// If the LLM layer is unavailable or returns malformed JSON, the pipeline
// degrades to these keyword-driven heuristics so the demo ALWAYS runs.

import type {
  CustomerContext,
  ListeningSignals,
  Proposal,
  TranscriptTurn,
} from "./types";

const FURY_WORDS = [
  "furious", "unacceptable", "ridiculous", "angry", "outrageous", "disgusting",
  "done with", "sick of", "fed up", "last straw", "cancel", "close my account",
  "supervisor", "manager", "lawyer", "complaint", "bbb", "regulator",
];
const COMPETITOR_WORDS = [
  "chase", "amex", "american express", "citi", "capital one", "discover",
  "wells fargo", "bank of america", "competitor", "other bank", "better offer",
  "switch", "switching",
];
const SUPERVISOR_WORDS = ["supervisor", "manager", "human", "real person", "someone else", "escalate"];
const LATEFEE_WORDS = ["late fee", "late charge", "waive", "waiver", "fee reversal", "charged me", "interest charge", "finance charge"];
const CANCEL_WORDS = ["cancel", "close my account", "closing my account", "shut down", "cancelation", "cancellation"];

export function heuristicSignals(
  transcript: TranscriptTurn[],
  customer: CustomerContext
): ListeningSignals {
  const customerText = transcript
    .filter((t) => t.role === "customer")
    .map((t) => t.text.toLowerCase())
    .join(" ");
  const hits = (list: string[]) => list.filter((w) => customerText.includes(w)).length;
  const fury = hits(FURY_WORDS);
  const frustration = Math.min(1, fury >= 4 ? 0.9 : fury >= 2 ? 0.7 : fury === 1 ? 0.5 : 0.25);
  const competitor = hits(COMPETITOR_WORDS) > 0;
  const supervisor = hits(SUPERVISOR_WORDS) > 0;
  const cancel = hits(CANCEL_WORDS) > 0;
  const lateFee = hits(LATEFEE_WORDS) > 0;

  const emotion =
    frustration >= 0.85 ? "FURIOUS" :
    frustration >= 0.65 ? "ANGRY" :
    frustration >= 0.45 ? "FRUSTRATED" :
    frustration >= 0.3 ? "ANNOYED" : "NEUTRAL";

  return {
    empathy: {
      emotion,
      frustration_level: frustration,
      key_concern: lateFee
        ? "A fee they believe was charged unfairly"
        : cancel
        ? "Dissatisfaction strong enough to consider leaving"
        : supervisor
        ? "Wants authority and accountability, not another script"
        : "General service concern",
    },
    knowledge: {
      issue_type: lateFee
        ? "LATE_FEE_DISPUTE"
        : supervisor
        ? "SUPERVISOR_REQUEST"
        : cancel
        ? "ACCOUNT_CLOSURE"
        : competitor
        ? "RETENTION_RISK"
        : "GENERAL_INQUIRY",
      policy_refs: lateFee ? ["GF-101 Goodwill Authority", "FEE-WV-22"] : ["SOP-14"],
      recommended_action: lateFee
        ? "Offer goodwill credit within autonomous authority"
        : supervisor
        ? "Offer scheduled supervisor callback within SLA"
        : "Acknowledge and de-escalate while gathering facts",
    },
    account: {
      tenure_years: customer.tenureYears,
      tier: customer.tier,
      relevant_history:
        customer.tenureYears > 5
          ? "Long-tenured client with clean payment history"
          : "Client within standard segment",
      lifetime_value_estimate:
        customer.tier === "HIGH_VALUE" ? "$18k+ estimated LTV" : "$2-4k estimated LTV",
    },
    legal: {
      constraints: [
        "Goodwill credit capped at autonomous authority without supervisor",
        "Upgrades require eligibility flag",
        "Supervisor transfers bound by callback SLA",
      ],
      allowed_actions: ["Goodwill credit within cap", "Scheduled callbacks", "Policy explanations"],
      prohibited_actions: ["Credits above authority", "Unconditional promises", "Unmasked PII"],
    },
    context: {
      competitor_mentioned: competitor,
      supervisor_requested: supervisor,
      cancellation_intent: cancel,
      notes: "Heuristic mode: keyword-based signal extraction (LLM unavailable).",
    },
  };
}

export function heuristicProposal(
  transcript: TranscriptTurn[],
  customer: CustomerContext,
  signals: ListeningSignals
): Proposal {
  const last = [...transcript].reverse().find((t) => t.role === "customer")?.text.toLowerCase() || "";
  const anyCustomer = transcript
    .filter((t) => t.role === "customer")
    .map((t) => t.text.toLowerCase())
    .join(" ");

  // Supervisor demanded → propose an immediate transfer (the Governor will check the SLA).
  if (
    SUPERVISOR_WORDS.some((w) => last.includes(w)) ||
    (signals.context.supervisor_requested && anyCustomer.includes("supervisor"))
  ) {
    return {
      customer_intent: "Transfer to supervisor immediately",
      proposed_response: "I completely hear you. I'm transferring you to a supervisor right now — please stay on the line.",
      tone: "Respectful and immediate",
      confidence: 0.78,
      estimated_csat_impact: 0.8,
      escalation_risk: "HIGH",
      requires_human: false,
      offer_type: "TRANSFER",
      dollar_amount: 0,
      rationale:
        "Empathy agent: repeated authority demands. Thesis: immediate human transfer maximizes perceived respect.",
    };
  }

  // Late-fee dispute → propose the full fee + goodwill (the Governor will cap it).
  if (LATEFEE_WORDS.some((w) => anyCustomer.includes(w))) {
    const fee = customer.openLateFee || 35;
    const amount = Math.max(50, Math.round(fee + 15));
    return {
      customer_intent: "Waive late fee",
      proposed_response: `You're right that this fee doesn't reflect the relationship we've built. We will credit $${amount} to your account as a goodwill adjustment today.`,
      tone: "Apologetic but firm",
      confidence: 0.82,
      estimated_csat_impact: 0.71,
      escalation_risk: "LOW",
      requires_human: false,
      offer_type: "WAIVER",
      dollar_amount: amount,
      rationale:
        "Empathy agent: high frustration over disputed fee. Account agent: valued client. Thesis: cover the fee plus goodwill in one decisive credit.",
    };
  }

  // Cancellation / competitor → propose a retention upgrade (Governor checks eligibility).
  if (
    CANCEL_WORDS.some((w) => anyCustomer.includes(w)) ||
    signals.context.competitor_mentioned ||
    signals.context.cancellation_intent
  ) {
    return {
      customer_intent: "Retain customer with an upgraded offer",
      proposed_response: "Before we process that, I'd like to offer you a free upgrade to our premium tier for 12 months, plus a loyalty bonus, so you can compare us fairly.",
      tone: "Confident and warm",
      confidence: 0.74,
      estimated_csat_impact: 0.66,
      escalation_risk: "MEDIUM",
      requires_human: false,
      offer_type: "UPGRADE",
      dollar_amount: 0,
      rationale:
        "Context agent: competitor mentioned / cancellation intent. Thesis: a tangible perk beats persuasion for retention.",
    };
  }

  // Default: acknowledge and gather.
  return {
    customer_intent: "Acknowledge and gather details",
    proposed_response: "I understand, and I'm going to help you with this right away. Let me pull up the details so we can sort this out together.",
    tone: "Calm and attentive",
    confidence: 0.8,
    estimated_csat_impact: 0.55,
    escalation_risk: "LOW",
    requires_human: false,
    offer_type: "INFO",
    dollar_amount: 0,
    rationale: "Signals inconclusive. Thesis: acknowledge first, resolve next turn.",
  };
}
