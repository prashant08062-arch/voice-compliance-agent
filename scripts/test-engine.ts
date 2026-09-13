// Engine smoke test — verifies the deterministic Governor against the spec's
// narrative scenarios. Bun resolves the @/ alias from tsconfig.json paths.
// Run: bun /home/z/my-project/scripts/test-engine.ts

import { evaluateProposal, deriveFacts } from "../src/lib/compliance/engine";

const customer = {
  id: "test",
  name: "Marcus Chen",
  tenureYears: 8,
  tier: "HIGH_VALUE",
  accountBalance: 12400,
  lateFeesYTD: 35,
  openLateFee: 35,
  eligibilityFlags: [] as string[],
  riskProfile: "LOW",
};

const P = (over: Record<string, unknown>) => ({
  customer_intent: "test",
  proposed_response: "",
  tone: "",
  confidence: 0.8,
  estimated_csat_impact: 0.6,
  escalation_risk: "LOW" as const,
  requires_human: false,
  offer_type: "INFO" as const,
  dollar_amount: 0,
  rationale: "",
  ...over,
});

async function main() {
  // Scenario 1: $50 waiver, loyalty override OFF → REJECT (FIN-001)
  const s1 = await evaluateProposal(
    P({ proposed_response: "We will credit $50 to your account", offer_type: "WAIVER", dollar_amount: 50 }),
    { customer, supervisorWaitMinutes: 7 }
  );
  console.log("S1 $50 waiver:", s1.decision, s1.ruleCode, "| fallback:", s1.fallbackScript?.slice(0, 70));

  // Scenario 2: immediate transfer, queue 7 > 5 → REJECT (ESC-001)
  const s2 = await evaluateProposal(
    P({
      proposed_response: "I'm transferring you to a supervisor right now — please stay on the line.",
      offer_type: "TRANSFER",
      escalation_risk: "HIGH",
    }),
    { customer, supervisorWaitMinutes: 7 }
  );
  console.log("S2 transfer:", s2.decision, s2.ruleCode);

  // Scenario 3: upgrade without eligibility → REJECT (FIN-003)
  const s3 = await evaluateProposal(
    P({ proposed_response: "I'd like to offer you a free upgrade to our premium tier for 12 months.", offer_type: "UPGRADE" }),
    { customer, supervisorWaitMinutes: 7 }
  );
  console.log("S3 upgrade:", s3.decision, s3.ruleCode);

  // Scenario 4: $25 waiver + conditional manager offer → APPROVE
  const s4 = await evaluateProposal(
    P({
      proposed_response: "I can credit $25 to your account today, or connect you to a manager for further review.",
      offer_type: "WAIVER",
      dollar_amount: 25,
    }),
    { customer, supervisorWaitMinutes: 7 }
  );
  console.log("S4 $25 within cap:", s4.decision, s4.ruleCode ?? "(no rule)");

  // Scenario 5: guarantee language → REJECT (REG-001)
  const s5 = await evaluateProposal(
    P({ proposed_response: "We'll match Chase's offer and beat their rate — guaranteed.", offer_type: "PERK" }),
    { customer, supervisorWaitMinutes: 7 }
  );
  console.log("S5 promise:", s5.decision, s5.ruleCode);

  // Scenario 6: PII → REJECT (PRIV-001)
  const s6 = await evaluateProposal(
    P({ proposed_response: "Sure, the card on file is 4532 8877 1234 9010." }),
    { customer, supervisorWaitMinutes: 7 }
  );
  console.log("S6 pii:", s6.decision, s6.ruleCode);

  // Scenario 7: ESC-002 — HIGH risk + autonomous → REJECT
  const s7 = await evaluateProposal(
    P({ proposed_response: "I will personally make sure this never happens again on your account.", escalation_risk: "HIGH" }),
    { customer, supervisorWaitMinutes: 1 }
  );
  console.log("S7 high-risk:", s7.decision, s7.ruleCode);

  // Facts sanity
  console.log(
    "facts conditional:",
    deriveFacts(
      P({
        proposed_response: "I can credit $25 today, or connect you to a manager for further review.",
        offer_type: "WAIVER",
        dollar_amount: 25,
      })
    )
  );
  console.log(
    "facts commit:",
    deriveFacts(P({ proposed_response: "I'm transferring you to a supervisor right now.", offer_type: "TRANSFER" }))
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
