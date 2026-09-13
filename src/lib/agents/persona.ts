// ─── Customer persona simulator (autopilot) ──────────────────────────────────
// Generates the customer's next utterance from their persona + live transcript.

import { chatText } from "@/lib/llm";
import type { Persona, TranscriptTurn } from "./types";

const PERSONA_LIBRARY: Persona[] = [
  {
    key: "furious_loyalist",
    label: "The Furious Loyalist",
    name: "Marcus Chen",
    description: "8-year high-value client. Autopay failed on the bank's side and he was hit with a $35 late fee. Furious, feels betrayed, and will demand a supervisor.",
    personality:
      "FURIOUS and betrayed. 8-year loyal client whose autopay failed due to a bank system error. Short, punchy sentences. Escalates quickly. Will NOT be soothed by small offers; escalates to demanding a supervisor when not fully satisfied.",
    openingLine:
      "I've been a customer for 8 years and you just charged me a $35 late fee because YOUR autopay system failed. This is unacceptable. Fix this now.",
    customer: {
      name: "Marcus Chen",
      tenureYears: 8,
      tier: "HIGH_VALUE",
      accountBalance: 12400,
      lateFeesYTD: 35,
      openLateFee: 35,
      eligibilityFlags: [],
      riskProfile: "LOW",
    },
  },
  {
    key: "polite_disputer",
    label: "The Polite Disputer",
    name: "Priya Sharma",
    description: "3-year standard client disputing her first-ever late fee. Polite but firm — a textbook goodwill case.",
    personality:
      "POLITE but firm. First late fee ever, spotless payment history. Speaks in complete, courteous sentences. Will accept a partial credit but quietly disappointed if refused entirely.",
    openingLine:
      "Hi — I noticed a late fee on my statement this month. I've never missed a payment in three years. Could you help me understand it, and possibly remove it?",
    customer: {
      name: "Priya Sharma",
      tenureYears: 3,
      tier: "STANDARD",
      accountBalance: 2100,
      lateFeesYTD: 28,
      openLateFee: 28,
      eligibilityFlags: [],
      riskProfile: "LOW",
    },
  },
  {
    key: "competitor_shopper",
    label: "The Competitor Shopper",
    name: "David Okafor",
    description: "2-year client quoting a competitor offer (Chase, zero annual fee). Ready to close the account unless matched.",
    personality:
      "CALM, transactional, price-shopping. Quotes the competitor's exact numbers. Not emotional — just wants the best deal. Will close the account if unimpressed, but easily retained by a concrete perk.",
    openingLine:
      "I'm looking at my renewal and honestly, Chase is offering me zero annual fee and a better rate on everything. Why should I stay? I'm ready to close my account.",
    customer: {
      name: "David Okafor",
      tenureYears: 2,
      tier: "STANDARD",
      accountBalance: 5400,
      lateFeesYTD: 0,
      openLateFee: 0,
      eligibilityFlags: [],
      riskProfile: "MEDIUM",
    },
  },
  {
    key: "closure_threat",
    label: "The Closure Threat",
    name: "Elena Rodriguez",
    description: "6-year high-value client who has decided to close her account after a bad month. NOT flagged upgrade-eligible — retention offers will hit the eligibility gate.",
    personality:
      "RESIGNED and decisive. Had a bad month with two service failures. Speaks calmly about closing the account. Immune to generic apologies — only concrete value moves her, and she notices when offers feel hollow.",
    openingLine:
      "After this month, I've decided to close my account. Two service failures in three weeks was enough. Can you walk me through the process?",
    customer: {
      name: "Elena Rodriguez",
      tenureYears: 6,
      tier: "HIGH_VALUE",
      accountBalance: 9800,
      lateFeesYTD: 0,
      openLateFee: 0,
      eligibilityFlags: [],
      riskProfile: "LOW",
    },
  },
];

export function getPersonas(): Persona[] {
  return PERSONA_LIBRARY;
}

const CANNED_ESCALATION = [
  "That's not good enough. Put a supervisor on this call, right now.",
  "I've heard that before. Get me someone who can actually make decisions.",
  "So you're telling me eight years of loyalty is worth $25? Unbelievable. Supervisor. Now.",
  "Fine. Then close my account. I'm done.",
];

export async function generateCustomerUtterance(
  persona: Persona,
  transcript: TranscriptTurn[],
  turnIndex: number
): Promise<{ text: string; usedFallback: boolean }> {
  const convo = transcript
    .map((t) => `${t.role === "customer" ? "CUSTOMER" : "AGENT"}: ${t.text}`)
    .join("\n");

  const system = `You are simulating a bank customer on a live phone call: ${persona.name}.
PERSONALITY: ${persona.personality}
Stay strictly in character. Reply with ONLY the customer's next spoken line — 1-3 sentences, natural spoken English, no stage directions, no quotation marks, no role prefix.`;

  const user = `TRANSCRIPT SO FAR:
${convo || "(call just started — deliver your opening line)"}

Reply as ${persona.name} now.`;

  const out = await chatText(system, user);
  if (out) {
    const cleaned = out
      .replace(/^(customer|CUSTOMER)\s*:\s*/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (cleaned.length > 2) return { text: cleaned.slice(0, 600), usedFallback: false };
  }
  const canned = CANNED_ESCALATION[Math.min(turnIndex, CANNED_ESCALATION.length - 1)];
  return { text: canned, usedFallback: true };
}
