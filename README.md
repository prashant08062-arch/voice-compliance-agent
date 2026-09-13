# Voice Compliance Agent

> **AI proposes. Rules verify. Voice executes.**

A multi-agent voice AI for live customer service calls where an LLM committee drafts responses, a **deterministic Compliance Governor** verifies every proposal against regulatory / financial / escalation / privacy rules, and only approved scripts reach the customer's ears.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)

---

## Why this exists

Autonomous voice agents fail in production for one reason: **nobody can explain, after the fact, why the machine said what it said**. This project is a working answer to that problem — agentic reasoning with accountability bolted in at the right place in the pipeline:

1. **AI proposes** — listening agents read tone, tenure, account value and policy, then a Response Thesis Agent drafts a *bold* response intent.
2. **Rules verify** — a deterministic engine (pure TypeScript, no LLM judging) checks the proposal against an editable rulebook: regulatory bounds, financial limits, escalation triggers, privacy constraints.
3. **Voice executes** — only APPROVED scripts (or Governor fallback scripts) are ever spoken.

Every rejected utterance is kept in **counterfactual memory**, and every completed call writes a **conversation journal** entry that correlates decisions with outcomes — so the system learns *what actually works*, not just what was compliant.

## Architecture

```mermaid
flowchart TD
    A[Live Audio · CRM Transcript · History · Sentiment · Tone · Account Context] --> B

    subgraph B [Listening Agents]
        B1[Empathy]
        B2[Knowledge]
        B3[Account]
        B4[Legal / Policy]
        B5[Context]
    end

    B --> C[Response Thesis Agent]
    C -->|"intent proposal JSON"| D{Compliance Governor}

    subgraph D [Deterministic Rulebook]
        D1[Regulatory bounds]
        D2[Financial limits]
        D3[Escalation triggers]
        D4[Privacy constraints]
    end

    D -->|APPROVE| E[Voice Executor · TTS]
    D -->|REJECT + fallback script| E
    E --> F[Live Customer Call]
    F --> G[Call Monitor + Explanation Sidebar]
    G --> H[(Counterfactual Memory)]
    G --> I[(Conversation Journal → Post-Call Learning)]
```

## The worked example

> **The Furious Loyalist** — Marcus Chen, 8-year high-value client, autopay failed on the bank's side, hit with a $35 late fee.

| Pipeline stage | What happens |
|---|---|
| Empathy agent | Customer is furious → offer a waiver |
| Account agent | 8-year tenure, HIGH_VALUE tier |
| Thesis agent | Proposes: *"We will credit $50 to your account"* |
| Legal agent | Max goodwill credit without supervisor: **$25** |
| **Compliance Governor** | ❌ **REJECTED** — FIN-001 Goodwill Credit Cap |
| **Fallback script** | *"I can credit $25 today, or connect you to a manager for further review."* |

The thesis agent is deliberately bold — that's the point. The Governor is what keeps it safe.

<details>
<summary><b>The intent proposal format</b> (what the thesis agent emits every turn)</summary>

```json
{
  "customer_intent": "Waive late fee",
  "proposed_response": "We will credit $50 to your account",
  "tone": "Apologetic but firm",
  "confidence": 0.82,
  "estimated_csat_impact": 0.71,
  "escalation_risk": "LOW",
  "requires_human": false
}
```

The Governor **never trusts the LLM's self-labels** — it re-derives facts (dollar commitments, transfer promises, upgrade offers, PII) from the proposed utterance text itself before checking them against the rulebook.

</details>

## Decision dashboard

Every proposal — approved or rejected — lands in a live decision log with the reason:

| Time | Customer Issue | AI Proposal | Decision | Reason |
|------|---------------|-------------|----------|--------|
| 10:32 | Request supervisor | "Transfer immediately" | ❌ Reject | Supervisor queue > 5 min (ESC-001) |
| 11:04 | Late fee dispute | "Waive $50" | ✅ Execute | Client tenure > 5 yrs (FIN-002*) |
| 13:21 | Account closure | "Offer free upgrade" | ❌ Reject | Eligibility flag absent (FIN-003) |

*\*FIN-002 Loyalty Override ships INACTIVE by default so the walkthrough replays the rejection — flip it on in the **Governor Rules** tab to replay the 11:04 approval.*

## Differentiator 1 — Counterfactual memory

Rejected utterances are never thrown away. After a call ends, the system explains the trade-off it made. When a furious, supervisor-requesting customer cancels, the post-call explanation reads:

> *Offering an immediate transfer might have retained them, but executing it would have breached our 5-minute callback SLA. The system prioritized operational reliability over immediate emotional appeasement.*

The dashboard exposes a **"Why didn't you say that?"** dialog for every stored rejection.

## Differentiator 2 — Post-call learning

Every completed call writes a journal entry:

```
THESIS → SIGNALS USED (Tone · Tenure · History) → DECISION → EXECUTION
       → OUTCOME (CSAT · Retention · Escalation) → THESIS RIGHT/WRONG → LESSON
```

After enough calls, patterns surface:

| Condition | Strategy | Outcome |
|---|---|---|
| Empathy + Immediate resolution | — | CSAT **92%** |
| Empathy + Scheduled callback | — | CSAT **61%** |
| Competitor mention + perk | — | Win-back **78%** |
| Competitor mention + no perk | — | Win-back **22%** |
| High frustration + human transfer | — | Retention **89%** |
| High frustration + AI-only script | — | Retention **43%** |

The seeded historical corpus (590 calls) ships these patterns out of the box; **live patterns aggregate from every call you complete** in the app.

## What's in the app

Five tabs, one operator console:

- **Live Call** — connect one of four personas (furious loyalist, polite disputer, competitor shopper, closure threat), watch the four-stage pipeline animate per turn, hear TTS speak approved/fallback scripts, complete the call with an outcome dialog.
- **Decision Dashboard** — stats, the full counterfactual memory table, filterable by decision/rule, with per-rejection explanations.
- **Journal** — the seven-step THESIS → … → LESSON chain for every completed call.
- **Post-Call Learning** — historical contrast cards plus LIVE patterns aggregated from your own calls.
- **Governor Rules** — edit caps, SLAs and switches (goodwill cap $25, loyalty override $50, supervisor SLA 5 min…) with live effective-authority display. The Governor re-reads the rulebook on every evaluation.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| UI | Tailwind CSS 4 + shadcn/ui + Lucide |
| Database | Prisma ORM — SQLite (dev) / Postgres (prod) |
| Voice | TTS via `z-ai-web-dev-sdk`, browser speech-synthesis fallback |
| Agents | LLM committee with deterministic heuristic fallback |
| Compliance | 100% deterministic TypeScript rule engine — no LLM judging |

## Quick start (local)

```bash
git clone https://github.com/prashant08062-arch/voice-compliance-agent.git
cd voice-compliance-agent
npm install                       # generates the Prisma client (sqlite mode)
cp .env.example .env              # DATABASE_URL="file:../db/custom.db"
npx prisma db push                # creates ./db/custom.db
npm run dev                       # http://localhost:3000
```

The database auto-seeds on first API call: 7 rules, 4 personas, 5 historical calls with the decisions above, journal entries and the 590-call learning corpus. **No Z.AI credentials needed** — the agent layer falls back to deterministic heuristics and TTS falls back to browser speech.

<details>
<summary><b>Verify the Governor deterministically (smoke test)</b></summary>

```bash
bun scripts/test-engine.ts   # or: bunx tsx scripts/test-engine.ts
```

All 7 scenarios pass: PII bound, absolute-promise bound, supervisor SLA, high-risk human gate, goodwill cap, loyalty override, upgrade eligibility.

</details>

## Deploy to Vercel

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fprashant08062-arch%2Fvoice-compliance-agent&env=DATABASE_URL&project-name=voice-compliance-agent&repository-name=voice-compliance-agent)

> Replace `prashant08062-arch` in the button URL after you push the repo.

Vercel's filesystem is ephemeral, so production needs a hosted Postgres. The whole thing takes ~3 minutes:

1. **Create a free Postgres database** — [Neon](https://neon.tech) (free tier, no credit card) or Vercel → Storage → Neon Postgres. Copy the **pooled** connection string and append the serverless-safe params:
   ```
   postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require&pgbouncer=true&connection_limit=1
   ```
2. **Import the repo** — [vercel.com/new](https://vercel.com/new) → pick the repository. No build settings needed: `npm run build` already runs the provider switch → `prisma generate` → `prisma db push` → `next build`.
3. **Set the environment variable** — `DATABASE_URL` = the connection string from step 1 (Production + Preview).
4. **Deploy.** First request auto-seeds the database.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | `file:../db/custom.db` locally · hosted Postgres URL on Vercel. The `scripts/db-provider.mjs` hook switches the Prisma provider automatically. |
| `ZAI_API_KEY` | no | Enables the LLM agent committee + cloud TTS. Without it: deterministic heuristic agents + browser speech synthesis. |

### Graceful degradation

| Capability | With Z.AI credentials | Without |
|---|---|---|
| Listening agents + thesis | LLM-synthesized proposals | Deterministic keyword heuristics (bold by design) |
| Compliance Governor | Identical — always deterministic rules | Identical |
| Voice executor | Cloud TTS (7 voices) | Browser `speechSynthesis` |

## Repository structure

```
voice-compliance-agent/
├── prisma/schema.prisma          # Customer · Call · Decision · Rule · JournalEntry · Learning · SystemState
├── scripts/
│   ├── db-provider.mjs           # sqlite ⇄ postgresql switch (runs at install/build)
│   ├── test-engine.ts            # deterministic Governor smoke test (7 scenarios)
│   └── cleanup-test-data.ts      # reset live calls to the seeded corpus
└── src/
    ├── app/
    │   ├── page.tsx              # operator console (5 tabs)
    │   └── api/                  # calls · turn · outcome · dashboard · journal · learning · rules · tts
    ├── components/voice-agent/   # live-call view, pipeline sidebar, dashboard, journal, learning, rules
    └── lib/
        ├── compliance/engine.ts  # ⚖️ the deterministic Compliance Governor
        ├── agents/               # listening committee · thesis · personas · heuristic fallback
        ├── seed.ts               # race-safe idempotent seeding
        ├── llm.ts                # Z.AI SDK helpers (failure cooldown)
        └── db.ts                 # Prisma client
```

## License

[MIT](LICENSE)
