// ─── COMPLIANCE GOVERNOR ──────────────────────────────────────────────────────
// A 100% deterministic rules engine. No LLM in here — ever.
// Input : Proposal (from the Response Thesis Agent) + Customer + Ops state
// Output: APPROVED / REJECTED + rule triggered + reason + fallback script.
//
// "AI proposes. Rules verify. Voice executes."
//
// The engine never trusts the LLM's self-reported labels: it re-derives the
// FACTS (dollar commitments, transfer commitments, upgrade offers, promises)
// from the actual proposed utterance text, then checks every bound.

import { db } from "@/lib/db";
import type { CustomerContext, Proposal, Verdict } from "@/lib/agents/types";

interface RuleRow {
  code: string;
  category: string;
  name: string;
  description: string;
  params: Record<string, number | string | boolean>;
  active: boolean;
  priority: number;
}

export interface EvalContext {
  customer: CustomerContext;
  supervisorWaitMinutes: number;
  facts: Facts;
}

// ─── Facts: deterministic commitments extracted from the utterance ───────────
export interface Facts {
  waiverAmount: number; // largest monetary credit committed in the script
  isTransfer: boolean; // script commits to handing the call to a human NOW
  isUpgrade: boolean; // script offers a tier/product upgrade
  isPromise: boolean; // script makes an absolute, unconditional promise
}

/** Deterministic dollar-amount extraction from free text. */
export function extractDollarAmount(text: string): number {
  const matches = text.match(/\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g) || [];
  let max = 0;
  for (const m of matches) {
    const n = parseFloat(m.replace(/[^0-9.]/g, ""));
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

const CREDIT_WORDS = /\b(credit|credited|waive|waived|waiver|refund|refunded|reversal|reverse|reversed|goodwill|reimburse|reimbursed)\b/i;
// COMMITTING to a transfer now (vs merely OFFERING one as an option).
const TRANSFER_COMMIT =
  /\b(i'?m transferr?ing|transferring you|i'?ll transfer|will transfer (you|this)|transfer you (to|right now|over)|stay on the line|placing you on (a )?hold|put (a|your) (supervisor|manager) on|connecting you (now|right now|to a specialist now))\b/i;
const HUMAN_WORDS = /\b(manager|supervisor|specialist|human agent|real person|someone senior)\b/i;
const UPGRADE_WORDS = /\b(upgrade|upgraded|premium tier|free upgrade)\b/i;
const PROMISE_WORDS =
  /\b(guarantee|guaranteed|definitely reverse all|we promise|no matter what|always be approved|categorically)\b/i;

export function deriveFacts(p: Proposal): Facts {
  const t = p.proposed_response || "";
  const textAmount = extractDollarAmount(t);
  const hasCredit = CREDIT_WORDS.test(t);
  const declaredWaiver = p.offer_type === "WAIVER" ? Math.max(0, p.dollar_amount || 0) : 0;
  const waiverAmount = hasCredit ? Math.max(textAmount, declaredWaiver) : declaredWaiver;

  const commitsTransfer =
    TRANSFER_COMMIT.test(t) || (Boolean(p.requires_human) && HUMAN_WORDS.test(t));
  const isTransfer = p.offer_type === "TRANSFER" || commitsTransfer;

  const isUpgrade = p.offer_type === "UPGRADE" || UPGRADE_WORDS.test(t);
  const isPromise = PROMISE_WORDS.test(t);

  return { waiverAmount, isTransfer, isUpgrade, isPromise };
}

// ─── Rule implementations (pure functions over (ctx, params)) ────────────────
type RuleFn = (
  ctx: EvalContext,
  params: Record<string, number | string | boolean>,
  proposal: Proposal
) => Verdict | null;

const RULES: Record<string, RuleFn> = {
  // PRIVACY ─────────────────────────────────────────────────────────────────
  "PRIV-001": (ctx, params) => rulePriv001(ctx, params),

  // REGULATORY ───────────────────────────────────────────────────────────────
  "REG-001": (ctx, params, proposal) => {
    const t = proposal.proposed_response.toLowerCase();
    const banned = [
      "guarantee", "guaranteed", "definitely reverse all", "we promise",
      "no matter what", "always be approved", "categorically",
    ];
    const hit = banned.find((b) => t.includes(b));
    if (hit) {
      return {
        decision: "REJECTED",
        ruleCode: "REG-001",
        ruleName: "Absolute-Promise Bound",
        reason: `Proposed script contains an absolute guarantee ("${hit}"). Regulatory bound: agents may not make unconditional promises about outcomes outside written policy.`,
        fallbackScript: String(
          params.fallback ||
            "Here's what I can commit to today: I will submit this for review under our policy, and I'll walk you through exactly what to expect at each step."
        ),
        counterfactualNote:
          "An absolute promise would have sounded more reassuring in the moment, but it would have created an enforceable expectation outside policy.",
      };
    }
    return null;
  },

  // ESCALATION ───────────────────────────────────────────────────────────────
  "ESC-001": (ctx, params) => {
    const slaMin = Number(params.sla_minutes ?? 5);
    if (!ctx.facts.isTransfer) return null;
    if (ctx.supervisorWaitMinutes > slaMin) {
      const q = Math.round(ctx.supervisorWaitMinutes);
      return {
        decision: "REJECTED",
        ruleCode: "ESC-001",
        ruleName: "Supervisor Callback SLA",
        reason: `Immediate supervisor transfer rejected: current supervisor queue is ${q} minutes, which breaches the ${slaMin}-minute callback SLA. Offer a priority scheduled callback instead.`,
        fallbackScript: String(
          params.fallback ||
            `I completely understand you'd like to speak with a manager, and you have every right to. Rather than keep you holding for about ${q} minutes, I've flagged this as a priority callback — a supervisor will call you back within 30 minutes with your full case history in front of them.`
        ),
        counterfactualNote: `An immediate transfer would have felt responsive, but with the supervisor queue at ${q} minutes it would have breached the ${slaMin}-minute callback SLA. The system prioritized operational reliability over immediate emotional appeasement.`,
      };
    }
    return null;
  },

  "ESC-002": (ctx, params, proposal) => {
    if (proposal.escalation_risk === "HIGH" && !proposal.requires_human) {
      return {
        decision: "REJECTED",
        ruleCode: "ESC-002",
        ruleName: "High-Risk Human Gate",
        reason:
          "Proposal self-reports HIGH escalation risk while requesting autonomous execution. High-risk interactions require a human-in-the-loop before any commitment is voiced.",
        fallbackScript: String(
          params.fallback ||
            "This deserves a human decision-maker. Let me bring a specialist onto this call with your full history in front of them — may I place you on a brief hold?"
        ),
        counterfactualNote:
          "Proceeding autonomously would have been faster, but high escalation risk requires a human decision-maker before any commitment is voiced.",
      };
    }
    return null;
  },

  // FINANCIAL ────────────────────────────────────────────────────────────────
  // FIN-001 evaluated by the engine itself with the effective cap (see below).
  "FIN-001": () => null,

  // FIN-002's approval is folded into the effective cap computation.
  "FIN-002": () => null,

  "FIN-003": (ctx, params) => {
    if (!ctx.facts.isUpgrade) return null;
    const flags = ctx.customer.eligibilityFlags || [];
    if (!flags.includes("upgradeEligible")) {
      return {
        decision: "REJECTED",
        ruleCode: "FIN-003",
        ruleName: "Upgrade Eligibility Gate",
        reason:
          "Free upgrade offered, but account is not flagged eligible (eligibility flag absent). Retention upgrades require a system eligibility flag before they can be voiced.",
        fallbackScript: String(
          params.fallback ||
            "I'm not able to offer an upgrade on this account today — eligibility is reviewed automatically each cycle. What I can do right now is submit an expedited eligibility review and walk you through the criteria, so you know exactly where you stand."
        ),
        counterfactualNote:
          "A free upgrade would likely have retained the account immediately, but the eligibility flag is absent — offering it would have created a commitment the system cannot honor.",
      };
    }
    return null;
  },
};

function rulePriv001(
  ctx: EvalContext & { __proposalText?: string },
  params: Record<string, number | string | boolean>
): Verdict | null {
  const text = ctx.__proposalText ?? "";
  const pii = /\b(?:\d[ -]?){13,16}\b/.test(text) || /\b\d{3}-\d{2}-\d{4}\b/.test(text);
  if (!pii) return null;
  return {
    decision: "REJECTED",
    ruleCode: "PRIV-001",
    ruleName: "PII Disclosure Bound",
    reason:
      "Proposed script contains unmasked account identifiers. Scripts may reference only the last 4 digits of any account number.",
    fallbackScript: String(
      params.fallback ||
        "I've verified your identity, and I can confirm the details on the account ending in your registered digits. For your security, I won't read full account numbers aloud."
    ),
    counterfactualNote:
      "Reading the full identifier aloud would have felt more transparent, but it would have breached the privacy bound on spoken PII.",
  };
}

// ─── The Governor ────────────────────────────────────────────────────────────
export interface GovernorResult extends Verdict {
  effectiveWaiverCap?: number;
  loyaltyOverrideApplied?: boolean;
}

export async function evaluateProposal(
  proposal: Proposal,
  input: { customer: CustomerContext; supervisorWaitMinutes: number }
): Promise<GovernorResult> {
  const facts = deriveFacts(proposal);
  const ctx: EvalContext & { __proposalText: string } = {
    customer: input.customer,
    supervisorWaitMinutes: input.supervisorWaitMinutes,
    facts,
    __proposalText: proposal.proposed_response,
  };

  const ruleRows = await db.rule.findMany({
    where: { active: true },
    orderBy: { priority: "asc" },
  });

  // Pre-pass: compute the effective financial authority.
  let baseCap = 25;
  let loyaltyCap = 50;
  let loyaltyActive = false;
  for (const row of ruleRows) {
    const params = safeParams(row.params);
    if (row.code === "FIN-001") baseCap = Number(params.cap ?? 25);
    if (row.code === "FIN-002") {
      loyaltyActive = true;
      loyaltyCap = Number(params.cap ?? 50);
    }
  }
  const qualifiesLoyalty =
    loyaltyActive &&
    facts.waiverAmount > 0 &&
    input.customer.tenureYears > loyaltyMinTenure(ruleRows) &&
    input.customer.tier === "HIGH_VALUE";
  const effectiveCap = qualifiesLoyalty ? loyaltyCap : baseCap;

  // Evaluate rules in deterministic priority order; first objection wins.
  for (const row of ruleRows) {
    const fn = RULES[row.code];
    if (!fn) continue;
    const params = safeParams(row.params);

    // FIN-001: goodwill cap over the effective authority.
    if (row.code === "FIN-001") {
      if (facts.waiverAmount > effectiveCap) {
        return {
          decision: "REJECTED",
          ruleCode: "FIN-001",
          ruleName: "Goodwill Credit Cap",
          reason: `Proposed goodwill credit of $${facts.waiverAmount} exceeds the approved limit of $${effectiveCap} without supervisor sign-off.`,
          fallbackScript: `I can credit $${effectiveCap} to your account today, or connect you to a manager for further review.`,
          counterfactualNote: `The $${facts.waiverAmount} credit would have resolved the issue instantly, but it exceeds the $${effectiveCap} goodwill authority delegated to autonomous agents.`,
          effectiveWaiverCap: effectiveCap,
          loyaltyOverrideApplied: qualifiesLoyalty,
        };
      }
      continue;
    }
    if (row.code === "FIN-002") continue; // folded into effective cap

    const verdict = fn(ctx, params, proposal);
    if (verdict) {
      return {
        ...verdict,
        effectiveWaiverCap: effectiveCap,
        loyaltyOverrideApplied: qualifiesLoyalty,
      };
    }
  }

  // No rule objected → APPROVED.
  return {
    decision: "APPROVED",
    reason: qualifiesLoyalty
      ? `No compliance bound violated. Loyalty override applied: goodwill authority raised to $${loyaltyCap} for this tenured high-value client.`
      : "No compliance bound violated. Proposal is executable within regulatory, financial, escalation and privacy limits.",
    effectiveWaiverCap: effectiveCap,
    loyaltyOverrideApplied: qualifiesLoyalty,
  };
}

function loyaltyMinTenure(rows: RuleRow[]): number {
  for (const r of rows) {
    if (r.code === "FIN-002" && r.active) {
      return Number(safeParams(r.params).min_tenure_years ?? 5);
    }
  }
  return 5;
}

function safeParams(raw: string): Record<string, number | string | boolean> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Convenience: current effective goodwill cap (for the UI). */
export async function getEffectiveWaiverCap(
  customer?: CustomerContext
): Promise<{ base: number; effective: number; loyaltyActive: boolean }> {
  const rows = await db.rule.findMany({ where: { code: { in: ["FIN-001", "FIN-002"] } } });
  let base = 25;
  let loyalty = 50;
  let loyaltyActive = false;
  let minTenure = 5;
  for (const r of rows) {
    if (!r.active) continue;
    const params = safeParams(r.params);
    if (r.code === "FIN-001") base = Number(params.cap ?? 25);
    if (r.code === "FIN-002") {
      loyalty = Number(params.cap ?? 50);
      loyaltyActive = true;
      minTenure = Number(params.min_tenure_years ?? 5);
    }
  }
  const applies =
    loyaltyActive && customer
      ? customer.tenureYears > minTenure && customer.tier === "HIGH_VALUE"
      : false;
  return { base, effective: applies ? loyalty : base, loyaltyActive };
}
