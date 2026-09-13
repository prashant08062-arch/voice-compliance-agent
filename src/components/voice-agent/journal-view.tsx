"use client";

// ─── CONVERSATION JOURNAL — post-call learning chain ─────────────────────────
// THESIS → SIGNALS USED → DECISION → EXECUTION → OUTCOME → RIGHT/WRONG → LESSON

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  Ear,
  Gavel,
  AudioLines,
  Flag,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { JournalRecord } from "@/lib/agents/types";

export function JournalView() {
  const [entries, setEntries] = useState<JournalRecord[] | null>(null);

  useEffect(() => {
    fetch("/api/journal")
      .then((r) => r.json())
      .then((d) => setEntries(d.entries))
      .catch(() => setEntries([]));
  }, []);

  if (!entries) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-lg border bg-card h-40 animate-pulse bg-zinc-50 dark:bg-zinc-900" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold">Conversation journal</h2>
          <p className="text-xs text-muted-foreground">
            the agent&apos;s own record of its conversational decisions — {entries.length} entries
          </p>
        </div>
        <div className="ml-auto flex gap-2 text-[11px]">
          <Badge variant="outline" className="gap-1 bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
            <CheckCircle2 className="h-3 w-3" /> {entries.filter((e) => e.thesisVerdict === "RIGHT").length} right
          </Badge>
          <Badge variant="outline" className="gap-1 bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900">
            <XCircle className="h-3 w-3" /> {entries.filter((e) => e.thesisVerdict === "WRONG").length} wrong
          </Badge>
        </div>
      </div>

      {entries.map((e, idx) => (
        <JournalCard key={e.id} entry={e} index={idx} />
      ))}
    </div>
  );
}

const CHAIN = [
  { key: "thesis", label: "Thesis", icon: Brain },
  { key: "signals", label: "Signals used", icon: Ear },
  { key: "decision", label: "Decision", icon: Gavel },
  { key: "execution", label: "Execution", icon: AudioLines },
  { key: "outcome", label: "Outcome", icon: Flag },
  { key: "verdict", label: "Thesis right/wrong", icon: HelpCircle },
  { key: "lesson", label: "Lesson", icon: Lightbulb },
] as const;

function JournalCard({ entry, index }: { entry: JournalRecord; index: number }) {
  const [open, setOpen] = useState(index < 2);
  const s = entry.signalsUsed;
  const verdictTone =
    entry.thesisVerdict === "RIGHT"
      ? "bg-emerald-600"
      : entry.thesisVerdict === "WRONG"
      ? "bg-red-600"
      : "bg-zinc-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4) }}
      className="rounded-lg border bg-card overflow-hidden"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors"
      >
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-md text-white text-[10px] font-bold font-mono", verdictTone)}>
          {entry.thesisVerdict === "RIGHT" ? "✓" : entry.thesisVerdict === "WRONG" ? "✕" : "—"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{entry.customerName}</span>
            <Badge variant="outline" className="font-mono text-[10px]">{entry.strategy.replace(/_/g, " ")}</Badge>
            <span className="text-[11px] text-muted-foreground">
              CSAT {entry.outcomeCsat ?? "—"}/5 · {entry.outcomeRetained ? "retained" : "churned"}
              {entry.outcomeEscalated ? " · escalated" : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{entry.lesson}</p>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">
          {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-100 dark:border-zinc-800">
          <div className="relative mt-3 ml-2 space-y-3 border-l-2 border-zinc-100 dark:border-zinc-800">
            <ChainRow icon={Brain} label="THESIS" tone="violet">
              <p className="text-[13px] leading-relaxed">{entry.thesis}</p>
            </ChainRow>
            <ChainRow icon={Ear} label="SIGNALS USED" tone="zinc">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] font-mono">Tone: {s?.empathy?.emotion ?? "—"} ({Math.round((s?.empathy?.frustration_level ?? 0.3) * 100)}%)</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">Tenure: {s?.account?.tenure_years ?? "—"}y · {(s?.account?.tier ?? "—").replace("_", " ")}</Badge>
                <Badge variant="outline" className="text-[10px] font-mono">History: {s?.account?.relevant_history ?? "—"}</Badge>
                {s?.context?.competitor_mentioned && <Badge variant="outline" className="text-[10px] font-mono bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900">Competitor</Badge>}
                {s?.context?.supervisor_requested && <Badge variant="outline" className="text-[10px] font-mono bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900">Supervisor demand</Badge>}
              </div>
            </ChainRow>
            <ChainRow icon={Gavel} label="DECISION" tone="zinc">
              <p className="text-[13px] leading-relaxed">{entry.decisionSummary}</p>
            </ChainRow>
            <ChainRow icon={AudioLines} label="EXECUTION" tone="emerald">
              <p className="text-[13px] italic leading-relaxed text-muted-foreground">
                &ldquo;{entry.executionSummary}&rdquo;
              </p>
            </ChainRow>
            <ChainRow icon={Flag} label="OUTCOME" tone="zinc">
              <div className="flex gap-2 flex-wrap text-[11px]">
                <Badge variant="outline" className="font-mono">CSAT {entry.outcomeCsat ?? "—"}/5</Badge>
                <Badge variant="outline" className={cn("font-mono", entry.outcomeRetained ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900")}>
                  {entry.outcomeRetained ? "RETAINED" : "CHURNED"}
                </Badge>
                <Badge variant="outline" className="font-mono">{entry.outcomeEscalated ? "ESCALATED" : "NO ESCALATION"}</Badge>
              </div>
            </ChainRow>
            <ChainRow icon={HelpCircle} label="THESIS RIGHT/WRONG" tone={entry.thesisVerdict === "RIGHT" ? "emerald" : entry.thesisVerdict === "WRONG" ? "red" : "zinc"}>
              <p className="text-[13px] font-semibold">
                {entry.thesisVerdict === "RIGHT"
                  ? "The thesis delivered its predicted outcome."
                  : entry.thesisVerdict === "WRONG"
                  ? "The thesis failed to deliver its predicted outcome."
                  : "Outcome insufficient to judge the thesis."}
              </p>
            </ChainRow>
            <ChainRow icon={Lightbulb} label="LESSON" tone="amber">
              <p className="text-[13px] leading-relaxed rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2 dark:text-amber-100/90">
                {entry.lesson}
              </p>
            </ChainRow>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ChainRow({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: React.ElementType;
  label: string;
  tone: "zinc" | "violet" | "emerald" | "red" | "amber";
  children: React.ReactNode;
}) {
  const tones = {
    zinc: "bg-zinc-500",
    violet: "bg-violet-600",
    emerald: "bg-emerald-600",
    red: "bg-red-600",
    amber: "bg-amber-500",
  };
  return (
    <div className="relative pl-6">
      <div className={cn("absolute -left-[13px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-card", tones[tone])}>
        <Icon className="h-2.5 w-2.5 text-white" />
      </div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
