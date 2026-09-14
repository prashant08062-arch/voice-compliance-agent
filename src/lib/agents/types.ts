// ─── Shared types for the Voice Compliance Agent pipeline ────────────────────
// Used by both server (API routes / agents) and client (UI).

export type EscalationRisk = "LOW" | "MEDIUM" | "HIGH";
export type OfferType =
  | "WAIVER"
  | "UPGRADE"
  | "TRANSFER"
  | "PERK"
  | "INFO"
  | "PROMISE";

/** The JSON the Response Thesis Agent proposes (spec format). */
export interface Proposal {
  customer_intent: string;
  proposed_response: string;
  tone: string;
  confidence: number; // 0..1
  estimated_csat_impact: number; // 0..1
  escalation_risk: EscalationRisk;
  requires_human: boolean;
  offer_type: OfferType;
  dollar_amount: number; // 0 when not a monetary offer
  rationale: string; // why the committee arrived at this thesis
}

/** Shared shape returned by the AssemblyAI voice-intake endpoint
 *  (speech-to-text + sentiment on the customer's audio). */
export interface AudioIntel {
  provider: "assemblyai" | "demo";
  transcript: string;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  sentimentConfidence: number;
  durationSec?: number;
  words?: number;
}

/** Structured output of the five Listening Agents. */
export interface ListeningSignals {
  /** Attached when the utterance arrived via the AssemblyAI voice-intake
   *  path — real acoustic evidence for the Empathy agent. */
  audio_intel?: {
    provider: "assemblyai" | "demo";
    sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    confidence: number;
  };
  empathy: {
    emotion: string; // e.g. FURIOUS, FRUSTRATED, CALM, SATISFIED
    frustration_level: number; // 0..1
    key_concern: string;
  };
  knowledge: {
    issue_type: string; // LATE_FEE_DISPUTE | SUPERVISOR_REQUEST | RETENTION_RISK | …
    policy_refs: string[];
    recommended_action: string;
  };
  account: {
    tenure_years: number;
    tier: string;
    relevant_history: string;
    lifetime_value_estimate: string;
  };
  legal: {
    constraints: string[]; // e.g. "Goodwill credit capped at $25 without supervisor"
    allowed_actions: string[];
    prohibited_actions: string[];
  };
  context: {
    competitor_mentioned: boolean;
    supervisor_requested: boolean;
    cancellation_intent: boolean;
    notes: string;
  };
}

export type VerdictDecision = "APPROVED" | "REJECTED";

/** Deterministic output of the Compliance Governor. */
export interface Verdict {
  decision: VerdictDecision;
  ruleCode?: string;
  ruleName?: string;
  reason: string;
  fallbackScript?: string;
  counterfactualNote?: string; // stored at proposal time: what the rejected action would have done
}

export interface CustomerContext {
  id: string;
  name: string;
  tenureYears: number;
  tier: string;
  accountBalance: number;
  lateFeesYTD: number;
  openLateFee: number;
  eligibilityFlags: string[];
  riskProfile: string;
}

export interface TranscriptTurn {
  role: "customer" | "agent";
  text: string;
  ts: string;
}

export interface TurnResponse {
  customerMessage: TranscriptTurn;
  stages: {
    listening: ListeningSignals;
    thesis: Proposal;
    governor: Verdict;
    executedScript: string;
    decisionId: string;
    usedFallbackAI: boolean;
    latencyMs: number;
  };
  decision: DecisionRecord;
}

export interface DecisionRecord {
  id: string;
  seq: number;
  createdAt: string;
  customerIssue: string;
  proposal: Proposal;
  decision: VerdictDecision;
  ruleCode?: string | null;
  reason: string;
  fallbackScript?: string | null;
  executedScript?: string | null;
  executed: boolean;
  counterfactual?: string | null;
  callId: string;
}

export interface CallRecord {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  csat?: number | null;
  retained?: boolean | null;
  escalated?: boolean | null;
  strategy?: string | null;
  transcript: TranscriptTurn[];
  customer: CustomerContext & { personaKey?: string | null; notes?: string };
  decisions: DecisionRecord[];
}

export interface RuleRecord {
  id: string;
  code: string;
  category: string;
  name: string;
  description: string;
  params: Record<string, number | string | boolean>;
  active: boolean;
  priority: number;
}

export interface JournalRecord {
  id: string;
  callId: string;
  createdAt: string;
  customerName: string;
  thesis: string;
  signalsUsed: ListeningSignals;
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
}

export interface LearningPattern {
  id: string;
  patternKey: string;
  category: string;
  conditionLabel: string;
  outcomeLabel: string;
  value: number;
  sampleSize: number;
  contrastKey?: string | null;
  source: string;
}

export interface Persona {
  key: string;
  label: string;
  name: string;
  description: string;
  personality: string;
  openingLine: string;
  customer: Omit<CustomerContext, "id">;
}
