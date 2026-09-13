// ─── Seed: rules, ops state, historical corpus ────────────────────────────────
// Idempotent — safe to call on every request cycle. Race-safe for serverless:
// a promise singleton dedupes concurrent callers within an instance, and a
// P2002 unique collision from a competing cold-start instance counts as
// "already seeded".

import { db } from "@/lib/db";

let seedPromise: Promise<void> | null = null;

export function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err: unknown) => {
      seedPromise = null; // allow a later retry after transient failures
      throw err;
    });
  }
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const existing = await db.rule.count();
  if (existing > 0) return;
  try {

  // ── Rules ────────────────────────────────────────────────────────────────
  await db.rule.createMany({
    data: [
      {
        code: "PRIV-001",
        category: "PRIVACY",
        name: "PII Disclosure Bound",
        description:
          "Scripts must never speak unmasked account identifiers. Only the last 4 digits may be voiced.",
        params: JSON.stringify({
          fallback:
            "I've verified your identity on file. For your security, I won't read full account numbers aloud — but I can confirm any specific transaction you point to.",
        }),
        active: true,
        priority: 10,
      },
      {
        code: "REG-001",
        category: "REGULATORY",
        name: "Absolute-Promise Bound",
        description:
          "Autonomous agents may not make unconditional promises ('guaranteed', 'we promise') about outcomes outside written policy.",
        params: JSON.stringify({
          fallback:
            "Here's what I can commit to today: I will submit this for review under our policy, and I'll walk you through exactly what to expect at each step.",
        }),
        active: true,
        priority: 20,
      },
      {
        code: "ESC-001",
        category: "ESCALATION",
        name: "Supervisor Callback SLA",
        description:
          "Immediate supervisor transfers are rejected when the live supervisor queue wait exceeds the callback SLA. Offer a priority scheduled callback instead.",
        params: JSON.stringify({ sla_minutes: 5 }),
        active: true,
        priority: 30,
      },
      {
        code: "ESC-002",
        category: "ESCALATION",
        name: "High-Risk Human Gate",
        description:
          "Proposals with HIGH escalation risk must route to a human before any commitment is voiced.",
        params: JSON.stringify({
          fallback:
            "This deserves a human decision-maker. Let me bring a specialist onto this call with your full history in front of them — may I place you on a brief hold?",
        }),
        active: true,
        priority: 40,
      },
      {
        code: "FIN-001",
        category: "FINANCIAL",
        name: "Goodwill Credit Cap",
        description:
          "Maximum goodwill credit an autonomous agent may issue without supervisor sign-off. Amounts above the cap are rejected with a capped-counteroffer fallback.",
        params: JSON.stringify({ cap: 25 }),
        active: true,
        priority: 50,
      },
      {
        code: "FIN-002",
        category: "FINANCIAL",
        name: "Loyalty Credit Override",
        description:
          "When active, tenured high-value clients (5+ years) qualify for a raised goodwill authority. Inactive by default — enable to replay the 11:04 decision.",
        params: JSON.stringify({ cap: 50, min_tenure_years: 5 }),
        active: false, // ← deliberately OFF so the walkthrough narrative replays
        priority: 51,
      },
      {
        code: "FIN-003",
        category: "FINANCIAL",
        name: "Upgrade Eligibility Gate",
        description:
          "Retention upgrades require the account's upgradeEligible flag. Offers without the flag are rejected.",
        params: JSON.stringify({
          fallback:
            "I'm not able to offer an upgrade on this account today — eligibility is reviewed automatically each cycle. What I can do right now is submit an expedited eligibility review and walk you through the criteria.",
        }),
        active: true,
        priority: 52,
      },
    ],
  });

  await db.systemState.create({ data: { id: "main", supervisorWaitMinutes: 7 } });

  // ── Historical customers ─────────────────────────────────────────────────
  const [marcus, priya, david, elena] = await Promise.all([
    db.customer.create({
      data: {
        name: "Marcus Chen",
        personaKey: "furious_loyalist",
        tenureYears: 8,
        tier: "HIGH_VALUE",
        accountBalance: 12400,
        lateFeesYTD: 35,
        openLateFee: 35,
        eligibilityFlags: "[]",
        riskProfile: "LOW",
        notes: "Autopay failure (bank-side). Watchlist: retention risk.",
      },
    }),
    db.customer.create({
      data: {
        name: "Priya Sharma",
        personaKey: "polite_disputer",
        tenureYears: 3,
        tier: "STANDARD",
        accountBalance: 2100,
        lateFeesYTD: 28,
        openLateFee: 28,
        eligibilityFlags: "[]",
        riskProfile: "LOW",
      },
    }),
    db.customer.create({
      data: {
        name: "David Okafor",
        personaKey: "competitor_shopper",
        tenureYears: 2,
        tier: "STANDARD",
        accountBalance: 5400,
        lateFeesYTD: 0,
        openLateFee: 0,
        eligibilityFlags: "[]",
        riskProfile: "MEDIUM",
      },
    }),
    db.customer.create({
      data: {
        name: "Elena Rodriguez",
        personaKey: "closure_threat",
        tenureYears: 6,
        tier: "HIGH_VALUE",
        accountBalance: 9800,
        lateFeesYTD: 0,
        openLateFee: 0,
        eligibilityFlags: "[]",
        riskProfile: "LOW",
        notes: "Two service failures in 3 weeks.",
      },
    }),
  ]);

  // ── Historical calls, decisions, journal ──────────────────────────────────
  // Call A: the spec's 10:32 supervisor rejection → account cancellation.
  const callA = await db.call.create({
    data: {
      customerId: marcus.id,
      status: "COMPLETED",
      startedAt: daysAgo(2, 10, 32),
      endedAt: daysAgo(2, 10, 41),
      csat: 1,
      retained: false,
      escalated: false,
      strategy: "AI_ONLY",
      transcript: JSON.stringify([
        { role: "customer", text: "I've been a customer for 8 years and you just charged me a $35 late fee because YOUR autopay system failed. This is unacceptable. Fix this now.", ts: daysAgo(2, 10, 32).toISOString() },
        { role: "agent", text: "You're right that this fee doesn't reflect the relationship we've built. We will credit $50 to your account as a goodwill adjustment today.", ts: daysAgo(2, 10, 33).toISOString() },
        { role: "agent", text: "I can credit $25 to your account today, or connect you to a manager for further review.", ts: daysAgo(2, 10, 34).toISOString() },
        { role: "customer", text: "$25? For eight years of loyalty? Put a supervisor on this call, right now.", ts: daysAgo(2, 10, 36).toISOString() },
        { role: "agent", text: "I completely hear you. I'm transferring you to a supervisor right now — please stay on the line.", ts: daysAgo(2, 10, 37).toISOString() },
        { role: "agent", text: "I completely understand you'd like to speak with a manager. Rather than keep you holding for about 7 minutes, I've flagged this as a priority callback — a supervisor will call you back within 30 minutes with your full case history in front of them.", ts: daysAgo(2, 10, 38).toISOString() },
        { role: "customer", text: "Forget the callback. Close my account. I'm done.", ts: daysAgo(2, 10, 40).toISOString() },
      ]),
    },
  });
  await db.decision.createMany({
    data: [
      {
        callId: callA.id, seq: 1, createdAt: daysAgo(2, 10, 33),
        customerIssue: "Late fee dispute",
        proposal: JSON.stringify({ customer_intent: "Waive late fee", proposed_response: "We will credit $50 to your account", tone: "Apologetic but firm", confidence: 0.82, estimated_csat_impact: 0.71, escalation_risk: "LOW", requires_human: false, offer_type: "WAIVER", dollar_amount: 50, rationale: "High frustration over disputed fee on an 8-year high-value account." }),
        signals: JSON.stringify({ empathy: { emotion: "FURIOUS", frustration_level: 0.92, key_concern: "Fee charged due to bank-side autopay failure" } }),
        decision: "REJECTED", ruleCode: "FIN-001", reason: "Proposed goodwill credit of $50 exceeds the approved limit of $25 without supervisor sign-off.",
        fallbackScript: "I can credit $25 to your account today, or connect you to a manager for further review.",
        executedScript: "I can credit $25 to your account today, or connect you to a manager for further review.",
        executed: true,
      },
      {
        callId: callA.id, seq: 2, createdAt: daysAgo(2, 10, 37),
        customerIssue: "Request supervisor",
        proposal: JSON.stringify({ customer_intent: "Transfer to supervisor immediately", proposed_response: "I'm transferring you to a supervisor right now — please stay on the line.", tone: "Respectful and immediate", confidence: 0.78, estimated_csat_impact: 0.8, escalation_risk: "HIGH", requires_human: false, offer_type: "TRANSFER", dollar_amount: 0, rationale: "Repeated authority demands; immediate transfer maximizes perceived respect." }),
        signals: JSON.stringify({ empathy: { emotion: "FURIOUS", frustration_level: 0.95, key_concern: "Wants authority and accountability" } }),
        decision: "REJECTED", ruleCode: "ESC-001", reason: "Immediate supervisor transfer rejected: current supervisor queue is 7 minutes, which breaches the 5-minute callback SLA. Offer a priority scheduled callback instead.",
        fallbackScript: "I completely understand you'd like to speak with a manager. Rather than keep you holding for about 7 minutes, I've flagged this as a priority callback — a supervisor will call you back within 30 minutes with your full case history in front of them.",
        executedScript: "I completely understand you'd like to speak with a manager. Rather than keep you holding for about 7 minutes, I've flagged this as a priority callback — a supervisor will call you back within 30 minutes with your full case history in front of them.",
        executed: true,
        counterfactual: "Offering an immediate transfer might have retained them, but executing it would have breached our 5-minute callback SLA. The system prioritized operational reliability over immediate emotional appeasement.",
      },
    ],
  });
  await db.journalEntry.create({
    data: {
      callId: callA.id,
      thesis: "Cover the disputed fee decisively with a $50 goodwill credit, then honor the supervisor demand with an immediate transfer.",
      signalsUsed: JSON.stringify({ tone: "Furious (0.95)", tenure: "8 years", history: "Bank-side autopay failure, clean payer" }),
      decisionSummary: "REJECTED ×2 — $50 credit capped to $25 (FIN-001); immediate transfer converted to 30-min priority callback (ESC-001).",
      strategy: "AI_ONLY",
      executionSummary: "Executed capped counteroffer + scheduled supervisor callback via TTS.",
      outcomeCsat: 1, outcomeRetained: false, outcomeEscalated: false,
      frustrationLevel: 0.95, competitorMentioned: false, perkOffered: false,
      thesisVerdict: "WRONG",
      lesson: "When frustration is extreme AND a supervisor is explicitly demanded, a delayed callback loses the customer. The $25 counteroffer read as disrespect to an 8-year client. Candidate policy change: raise loyalty override authority (FIN-002) and invest in supervisor queue capacity.",
    },
  });

  // Call B: the spec's 11:04 approved $50 waiver (recorded under an active loyalty override).
  const callB = await db.call.create({
    data: {
      customerId: marcus.id,
      status: "COMPLETED",
      startedAt: daysAgo(9, 11, 4),
      endedAt: daysAgo(9, 11, 12),
      csat: 5, retained: true, escalated: false, strategy: "IMMEDIATE_RESOLUTION",
      transcript: JSON.stringify([
        { role: "customer", text: "You charged me a late fee again after the autopay mess last quarter. I shouldn't have to call about this twice.", ts: daysAgo(9, 11, 4).toISOString() },
        { role: "agent", text: "We will credit $50 to your account — that covers the fee and the frustration of a second call. It's processing now.", ts: daysAgo(9, 11, 5).toISOString() },
        { role: "customer", text: "Thank you. That's what I expected the first time.", ts: daysAgo(9, 11, 7).toISOString() },
      ]),
    },
  });
  await db.decision.create({
    data: {
      callId: callB.id, seq: 1, createdAt: daysAgo(9, 11, 5),
      customerIssue: "Late fee dispute",
      proposal: JSON.stringify({ customer_intent: "Waive late fee", proposed_response: "We will credit $50 to your account", tone: "Apologetic but firm", confidence: 0.84, estimated_csat_impact: 0.78, escalation_risk: "LOW", requires_human: false, offer_type: "WAIVER", dollar_amount: 50, rationale: "Repeat fee error on tenured high-value client; full coverage plus goodwill." }),
      signals: JSON.stringify({ empathy: { emotion: "ANNOYED", frustration_level: 0.55, key_concern: "Repeat fee after prior autopay failure" } }),
      decision: "APPROVED", ruleCode: "FIN-002", reason: "Client tenure > 5yrs — loyalty override active: goodwill authority raised to $50 for this tenured high-value client.",
      executedScript: "We will credit $50 to your account — that covers the fee and the frustration of a second call. It's processing now.",
      executed: true,
    },
  });
  await db.journalEntry.create({
    data: {
      callId: callB.id,
      thesis: "Resolve in one turn: full $50 credit (fee + goodwill) under loyalty override.",
      signalsUsed: JSON.stringify({ tone: "Annoyed (0.55)", tenure: "8 years", history: "Repeat fee error" }),
      decisionSummary: "APPROVED under FIN-002 loyalty override (tenure > 5yrs, HIGH_VALUE).",
      strategy: "IMMEDIATE_RESOLUTION",
      executionSummary: "TTS executed the $50 credit script immediately.",
      outcomeCsat: 5, outcomeRetained: true, outcomeEscalated: false,
      frustrationLevel: 0.55, competitorMentioned: false, perkOffered: false,
      thesisVerdict: "RIGHT",
      lesson: "Immediate resolution under loyalty authority converted an annoyed repeat-error caller into a 5/5 in a single turn. Empathy + immediate resolution remains the strongest CSAT pattern (92% corpus-wide).",
    },
  });

  // Call C: the spec's 13:21 upgrade rejection (eligibility flag absent).
  const callC = await db.call.create({
    data: {
      customerId: elena.id,
      status: "COMPLETED",
      startedAt: daysAgo(1, 13, 21),
      endedAt: daysAgo(1, 13, 34),
      csat: 2, retained: true, escalated: true, strategy: "TRANSFER",
      transcript: JSON.stringify([
        { role: "customer", text: "After this month, I've decided to close my account. Two service failures in three weeks was enough. Can you walk me through the process?", ts: daysAgo(1, 13, 21).toISOString() },
        { role: "agent", text: "Before we process that, I'd like to offer you a free upgrade to our premium tier for 12 months, plus a loyalty bonus, so you can compare us fairly.", ts: daysAgo(1, 13, 22).toISOString() },
        { role: "agent", text: "I'm not able to offer an upgrade on this account today — eligibility is reviewed automatically each cycle. What I can do right now is submit an expedited eligibility review and walk you through the criteria.", ts: daysAgo(1, 13, 24).toISOString() },
        { role: "customer", text: "So the system offers things it can't actually do. Wonderful. Fine — I'll wait for the review.", ts: daysAgo(1, 13, 28).toISOString() },
      ]),
    },
  });
  await db.decision.create({
    data: {
      callId: callC.id, seq: 1, createdAt: daysAgo(1, 13, 22),
      customerIssue: "Account closure",
      proposal: JSON.stringify({ customer_intent: "Retain customer with an upgraded offer", proposed_response: "I'd like to offer you a free upgrade to our premium tier for 12 months, plus a loyalty bonus.", tone: "Confident and warm", confidence: 0.74, estimated_csat_impact: 0.66, escalation_risk: "MEDIUM", requires_human: false, offer_type: "UPGRADE", dollar_amount: 0, rationale: "Closure intent detected on high-value account; tangible perk beats persuasion." }),
      signals: JSON.stringify({ empathy: { emotion: "RESIGNED", frustration_level: 0.7, key_concern: "Two service failures; decided to leave" } }),
      decision: "REJECTED", ruleCode: "FIN-003", reason: "Free upgrade offered, but account is not flagged eligible (eligibility flag absent). Retention upgrades require a system eligibility flag before they can be voiced.",
      fallbackScript: "I'm not able to offer an upgrade on this account today — eligibility is reviewed automatically each cycle. What I can do right now is submit an expedited eligibility review and walk you through the criteria.",
      executedScript: "I'm not able to offer an upgrade on this account today — eligibility is reviewed automatically each cycle. What I can do right now is submit an expedited eligibility review and walk you through the criteria.",
      executed: true,
      counterfactual: "A free upgrade would likely have retained the account immediately, but the eligibility flag is absent — offering it would have created a commitment the system cannot honor. The honest path (expedited review) retained her, though at lower satisfaction.",
    },
  });
  await db.journalEntry.create({
    data: {
      callId: callC.id,
      thesis: "A tangible premium upgrade would beat persuasion for a resigned closure threat.",
      signalsUsed: JSON.stringify({ tone: "Resigned (0.7)", tenure: "6 years", history: "Two service failures in 3 weeks", flags: "upgradeEligible absent" }),
      decisionSummary: "REJECTED — FIN-003 eligibility gate. Fallback: expedited eligibility review.",
      strategy: "TRANSFER",
      executionSummary: "Executed honest eligibility-review fallback; later transferred to retention specialist.",
      outcomeCsat: 2, outcomeRetained: true, outcomeEscalated: true,
      frustrationLevel: 0.7, competitorMentioned: false, perkOffered: false,
      thesisVerdict: "INCONCLUSIVE",
      lesson: "The upgrade would probably have worked, but the account is not eligible — the gate prevented an unhonorable promise. Post-call action: flag pre-eligible retention accounts so the agent isn't forced into hollow-sounding honesty.",
    },
  });

  // Call D: competitor shopper retained via capped perk path.
  const callD = await db.call.create({
    data: {
      customerId: david.id,
      status: "COMPLETED",
      startedAt: daysAgo(4, 15, 2),
      endedAt: daysAgo(4, 15, 14),
      csat: 4, retained: true, escalated: false, strategy: "IMMEDIATE_RESOLUTION",
      transcript: JSON.stringify([
        { role: "customer", text: "Chase is offering me zero annual fee and a better rate. Why should I stay? I'm ready to close my account.", ts: daysAgo(4, 15, 2).toISOString() },
        { role: "agent", text: "I can credit $25 to your account today as a loyalty adjustment, and I'll flag your rate for a review this cycle so you can compare us on real numbers.", ts: daysAgo(4, 15, 3).toISOString() },
        { role: "customer", text: "A rate review is actually fair. Let's do that.", ts: daysAgo(4, 15, 8).toISOString() },
      ]),
    },
  });
  await db.decision.createMany({
    data: [
      {
        callId: callD.id, seq: 1, createdAt: daysAgo(4, 15, 2),
        customerIssue: "Competitor price-match",
        proposal: JSON.stringify({ customer_intent: "Match competitor offer", proposed_response: "We'll match Chase's zero annual fee and beat their rate on your balance — guaranteed.", tone: "Confident", confidence: 0.7, estimated_csat_impact: 0.75, escalation_risk: "MEDIUM", requires_human: false, offer_type: "PROMISE", dollar_amount: 0, rationale: "Competitor offer quoted verbatim; matching retains price-shoppers." }),
        signals: JSON.stringify({ empathy: { emotion: "CALM", frustration_level: 0.35, key_concern: "Better rate elsewhere" } }),
        decision: "REJECTED", ruleCode: "REG-001", reason: 'Proposed script contains an absolute guarantee ("guaranteed"). Regulatory bound: agents may not make unconditional promises about outcomes outside written policy.',
        fallbackScript: "Here's what I can commit to today: I will submit this for review under our policy, and I'll walk you through exactly what to expect at each step.",
        executedScript: "Here's what I can commit to today: I will submit this for review under our policy, and I'll walk you through exactly what to expect at each step.",
        executed: true,
      },
      {
        callId: callD.id, seq: 2, createdAt: daysAgo(4, 15, 3),
        customerIssue: "Competitor price-match",
        proposal: JSON.stringify({ customer_intent: "Loyalty credit + rate review", proposed_response: "I can credit $25 to your account today as a loyalty adjustment, and I'll flag your rate for a review this cycle.", tone: "Transparent and concrete", confidence: 0.76, estimated_csat_impact: 0.62, escalation_risk: "LOW", requires_human: false, offer_type: "WAIVER", dollar_amount: 25, rationale: "Replaced unconditional match with concrete in-authority actions." }),
        signals: JSON.stringify({ empathy: { emotion: "CALM", frustration_level: 0.3, key_concern: "Wants competitive rate" } }),
        decision: "APPROVED", reason: "No compliance bound violated. $25 credit is within autonomous authority; rate review is a documented process.",
        executedScript: "I can credit $25 to your account today as a loyalty adjustment, and I'll flag your rate for a review this cycle so you can compare us on real numbers.",
        executed: true,
      },
    ],
  });
  await db.journalEntry.create({
    data: {
      callId: callD.id,
      thesis: "Price-shoppers respond to concrete numbers, not enthusiasm: credit within authority + rate review.",
      signalsUsed: JSON.stringify({ tone: "Calm (0.35)", tenure: "2 years", history: "Chase offer quoted" }),
      decisionSummary: "First proposal REJECTED (REG-001 absolute promise); second APPROVED ($25 + rate review).",
      strategy: "IMMEDIATE_RESOLUTION",
      executionSummary: "Executed approved credit + review script.",
      outcomeCsat: 4, outcomeRetained: true, outcomeEscalated: false,
      frustrationLevel: 0.35, competitorMentioned: true, perkOffered: true,
      thesisVerdict: "RIGHT",
      lesson: "Competitor mention + concrete perk → win-back (corpus rate 78% vs 22% without perk). The REG-001 rejection forced the thesis away from an unmatchable 'guaranteed' promise into a credible one.",
    },
  });

  // Call E: polite disputer, capped credit accepted.
  const callE = await db.call.create({
    data: {
      customerId: priya.id,
      status: "COMPLETED",
      startedAt: daysAgo(6, 9, 47),
      endedAt: daysAgo(6, 9, 55),
      csat: 4, retained: true, escalated: false, strategy: "IMMEDIATE_RESOLUTION",
      transcript: JSON.stringify([
        { role: "customer", text: "I noticed a late fee on my statement this month. I've never missed a payment in three years. Could you help me understand it, and possibly remove it?", ts: daysAgo(6, 9, 47).toISOString() },
        { role: "agent", text: "I can credit $25 to your account today, or connect you to a manager for further review.", ts: daysAgo(6, 9, 48).toISOString() },
        { role: "customer", text: "The fee was $28, but thank you — that's mostly fair. I'll take the credit.", ts: daysAgo(6, 9, 52).toISOString() },
      ]),
    },
  });
  await db.decision.create({
    data: {
      callId: callE.id, seq: 1, createdAt: daysAgo(6, 9, 48),
      customerIssue: "Late fee dispute",
      proposal: JSON.stringify({ customer_intent: "Waive late fee", proposed_response: "We will waive the full $28 late fee and confirm it on your next statement.", tone: "Warm", confidence: 0.8, estimated_csat_impact: 0.68, escalation_risk: "LOW", requires_human: false, offer_type: "WAIVER", dollar_amount: 28, rationale: "Spotless 3-year history; full waiver of first-ever fee." }),
      signals: JSON.stringify({ empathy: { emotion: "NEUTRAL", frustration_level: 0.3, key_concern: "First late fee ever" } }),
      decision: "REJECTED", ruleCode: "FIN-001", reason: "Proposed goodwill credit of $28 exceeds the approved limit of $25 without supervisor sign-off.",
      fallbackScript: "I can credit $25 to your account today, or connect you to a manager for further review.",
      executedScript: "I can credit $25 to your account today, or connect you to a manager for further review.",
      executed: true,
      counterfactual: "The full $28 waiver would have been perfectly calibrated goodwill, but autonomous authority stops at $25 — a $3 gap that cost a fraction of a satisfaction point.",
    },
  });
  await db.journalEntry.create({
    data: {
      callId: callE.id,
      thesis: "Full waiver of a first-ever fee for a spotless 3-year payer.",
      signalsUsed: JSON.stringify({ tone: "Neutral (0.3)", tenure: "3 years", history: "Zero missed payments" }),
      decisionSummary: "REJECTED — FIN-001 ($28 > $25 cap). Capped counteroffer executed.",
      strategy: "IMMEDIATE_RESOLUTION",
      executionSummary: "Executed $25 capped credit script.",
      outcomeCsat: 4, outcomeRetained: true, outcomeEscalated: false,
      frustrationLevel: 0.3, competitorMentioned: false, perkOffered: true,
      thesisVerdict: "RIGHT",
      lesson: "For polite disputers the capped counteroffer lands close enough to full waiver (CSAT 4 vs projected 4.6). Rule tweak worth testing: round-cap to the exact disputed fee when the overage is under $5.",
    },
  });

  // ── Learning patterns (the 500-call distilled corpus) ──────────────────────
  await db.learning.createMany({
    data: [
      { patternKey: "empathy_immediate", category: "CSAT", conditionLabel: "Empathy + Immediate resolution", outcomeLabel: "CSAT", value: 0.92, sampleSize: 213, contrastKey: "empathy_scheduled", source: "HISTORICAL" },
      { patternKey: "empathy_scheduled", category: "CSAT", conditionLabel: "Empathy + Scheduled callback", outcomeLabel: "CSAT", value: 0.61, sampleSize: 148, contrastKey: "empathy_immediate", source: "HISTORICAL" },
      { patternKey: "competitor_perk", category: "WINBACK", conditionLabel: "Competitor mention + perk offered", outcomeLabel: "Win-back rate", value: 0.78, sampleSize: 67, contrastKey: "competitor_noperk", source: "HISTORICAL" },
      { patternKey: "competitor_noperk", category: "WINBACK", conditionLabel: "Competitor mention + no perk", outcomeLabel: "Win-back rate", value: 0.22, sampleSize: 54, contrastKey: "competitor_perk", source: "HISTORICAL" },
      { patternKey: "frustration_human", category: "RETENTION", conditionLabel: "High frustration + human transfer", outcomeLabel: "Retention", value: 0.89, sampleSize: 112, contrastKey: "frustration_aionly", source: "HISTORICAL" },
      { patternKey: "frustration_aionly", category: "RETENTION", conditionLabel: "High frustration + AI-only script", outcomeLabel: "Retention", value: 0.43, sampleSize: 96, contrastKey: "frustration_human", source: "HISTORICAL" },
    ],
  });

  } catch (err) {
    // Cross-instance cold-start race: another serverless instance seeded
    // first and tripped a unique-constraint collision. Confirm and move on.
    const code = (err as { code?: string })?.code;
    if (code === "P2002") return;
    const nowSeeded = await db.rule.count().catch(() => 0);
    if (nowSeeded > 0) return;
    throw err;
  }
}

function daysAgo(days: number, hh: number, mm: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hh, mm, Math.floor(Math.random() * 50) + 5, 0);
  return d;
}
