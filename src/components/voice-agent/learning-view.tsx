"use client";

// ─── POST-CALL LEARNING ───────────────────────────────────────────────────────
// "After 500 calls, the system discovered…"
// Historical distilled corpus + LIVE patterns aggregated from your own calls.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, Database, Zap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { LearningPattern } from "@/lib/agents/types";

interface LearningData {
  patterns: LearningPattern[];
  corpus: { historicalCalls: number; liveCalls: number };
}

const CATEGORY_META: Record<string, { label: string; tone: string; chip: string }> = {
  CSAT: { label: "Customer Satisfaction", tone: "emerald", chip: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
  WINBACK: { label: "Win-back rate", tone: "violet", chip: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900" },
  RETENTION: { label: "Retention", tone: "amber", chip: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
};

export function LearningView() {
  const [data, setData] = useState<LearningData | null>(null);

  useEffect(() => {
    fetch("/api/learning")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-lg border bg-card h-44 animate-pulse bg-zinc-50 dark:bg-zinc-900" />
        ))}
      </div>
    );
  }

  // pair contrasts together
  const historical = data.patterns.filter((p) => p.source === "HISTORICAL");
  const live = data.patterns.filter((p) => p.source === "LIVE");
  const paired: { a?: LearningPattern; b?: LearningPattern }[] = [];
  const seen = new Set<string>();
  for (const p of historical) {
    if (seen.has(p.patternKey)) continue;
    seen.add(p.patternKey);
    if (p.contrastKey) seen.add(p.contrastKey);
    paired.push({
      a: p,
      b: historical.find((q) => q.patternKey === p.contrastKey),
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Post-call learning</h2>
          <p className="text-xs text-muted-foreground">
            the voice agent is building a record of its own conversational decisions
          </p>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1.5 font-mono text-[10px]">
            <Database className="h-3 w-3" /> {data.corpus.historicalCalls} historical calls
          </Badge>
          <Badge variant="outline" className="gap-1.5 font-mono text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
            <Zap className="h-3 w-3" /> {data.corpus.liveCalls} live calls journaled
          </Badge>
        </div>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
          Distilled from the historical corpus
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {paired.map((pair, i) =>
            pair.a ? <ContrastCard key={pair.a.id} a={pair.a} b={pair.b} index={i} /> : null
          )}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
          Live learning — distilled from your calls
        </h3>
        {live.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No live patterns yet. Complete calls in the{" "}
              <span className="font-medium text-foreground">Live Call</span> view — after each
              outcome the journal distills new patterns automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {live.map((p, i) => (
              <LiveCard key={p.id} p={p} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ContrastCard({
  a,
  b,
  index,
}: {
  a: LearningPattern;
  b?: LearningPattern;
  index: number;
}) {
  const meta = CATEGORY_META[a.category] ?? CATEGORY_META.CSAT;
  const gain = b ? Math.round((a.value - b.value) * 100) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className="rounded-lg border bg-card p-4 flex flex-col"
    >
      <Badge variant="outline" className={cn("self-start font-mono text-[10px]", meta.chip)}>
        {meta.label}
      </Badge>
      <div className="mt-3 space-y-3 flex-1">
        <PatternBar p={a} tone={a.value >= (b?.value ?? 0) ? "emerald" : "zinc"} />
        {b && (
          <>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono uppercase">
              <span className="flex-1 border-t border-dashed border-zinc-200 dark:border-zinc-700" />
              versus
              <span className="flex-1 border-t border-dashed border-zinc-200 dark:border-zinc-700" />
            </div>
            <PatternBar p={b} tone="zinc" />
          </>
        )}
      </div>
      {b && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5 text-xs">
          <ArrowRight className="h-3.5 w-3.5 text-emerald-600" />
          <span>
            <b className={gain >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}>
              {gain >= 0 ? "+" : ""}{gain}pp
            </b>{" "}
            from {b.conditionLabel.split("+").slice(-1)[0].trim().toLowerCase()}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function PatternBar({ p, tone }: { p: LearningPattern; tone: "emerald" | "zinc" }) {
  const pct = Math.round(p.value * 100);
  const bar = tone === "emerald" ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600";
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1 gap-2">
        <span className="text-xs font-medium leading-snug">{p.conditionLabel}</span>
        <span className={cn("font-mono text-lg font-bold tabular-nums shrink-0", tone === "emerald" && "text-emerald-700 dark:text-emerald-400")}>
          {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={cn("h-full rounded-full", bar)}
        />
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 font-mono">n = {p.sampleSize}</div>
    </div>
  );
}

function LiveCard({ p, index }: { p: LearningPattern; index: number }) {
  const pct = Math.round(p.value * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-4"
    >
      <Badge variant="outline" className="font-mono text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
        {p.outcomeLabel} · LIVE
      </Badge>
      <div className="flex justify-between items-baseline mt-3 mb-1 gap-2">
        <span className="text-xs font-medium leading-snug">{p.conditionLabel}</span>
        <span className="font-mono text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-white dark:bg-zinc-900 overflow-hidden border border-emerald-100 dark:border-emerald-900">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8 }}
          className="h-full rounded-full bg-emerald-500"
        />
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 font-mono">n = {p.sampleSize} journaled call(s)</div>
    </motion.div>
  );
}
