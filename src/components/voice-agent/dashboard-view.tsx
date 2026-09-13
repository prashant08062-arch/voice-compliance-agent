"use client";

// ─── DECISION DASHBOARD — counterfactual memory ──────────────────────────────
// "Store every rejected utterance." Time · Issue · Proposal · Decision · Reason

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Gavel, ShieldAlert, TrendingUp, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DecisionStamp, money, timeOf } from "./shared";
import type { DecisionRecord } from "@/lib/agents/types";

interface DashboardData {
  decisions: (DecisionRecord & { customerName: string; personaKey?: string; callStatus: string })[];
  stats: {
    total: number;
    approved: number;
    rejected: number;
    approvalRate: number;
    topRules: { rule: string; count: number }[];
    exposureAvoided: number;
  };
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selected, setSelected] = useState<DashboardData["decisions"][number] | null>(null);
  const [filter, setFilter] = useState<"ALL" | "APPROVED" | "REJECTED">("ALL");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return <SkeletonTable />;
  }

  const rows = data.decisions.filter((d) => filter === "ALL" || d.decision === filter);

  return (
    <div className="space-y-4">
      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Gavel}
          label="Total decisions"
          value={String(data.stats.total)}
          sub="every proposal is stored"
        />
        <StatCard
          icon={CheckCircle2}
          label="Approved"
          value={String(data.stats.approved)}
          sub={`${Math.round(data.stats.approvalRate * 100)}% approval rate`}
          tone="emerald"
        />
        <StatCard
          icon={XCircle}
          label="Rejected by rules"
          value={String(data.stats.rejected)}
          sub={data.stats.topRules[0] ? `most: ${data.stats.topRules[0].rule}` : "—"}
          tone="red"
        />
        <StatCard
          icon={TrendingUp}
          label="Over-authority $ blocked"
          value={money(data.stats.exposureAvoided)}
          sub="credits above cap, vetoed"
          tone="amber"
        />
      </div>

      {/* the table */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex-wrap">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Counterfactual memory</h2>
          <p className="text-xs text-muted-foreground hidden sm:block">
            every utterance the AI proposed — approved AND rejected — with the reason it was or wasn&apos;t said
          </p>
          <div className="ml-auto flex gap-1">
            {(["ALL", "APPROVED", "REJECTED"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                  filter === f
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 dark:border-zinc-700 text-muted-foreground hover:border-zinc-400"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium px-4 py-2.5">Time</th>
                <th className="text-left font-medium px-2 py-2.5">Customer</th>
                <th className="text-left font-medium px-2 py-2.5">Issue</th>
                <th className="text-left font-medium px-2 py-2.5">AI Proposal</th>
                <th className="text-center font-medium px-2 py-2.5">Decision</th>
                <th className="text-left font-medium px-2 py-2.5">Reason</th>
                <th className="text-right font-medium px-4 py-2.5">Why?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <motion.tr
                  key={d.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="border-b border-zinc-50 dark:border-zinc-900 hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-[11px] whitespace-nowrap">{timeOf(d.createdAt)}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap">
                    <span className="font-medium">{d.customerName}</span>
                  </td>
                  <td className="px-2 py-2.5 capitalize whitespace-nowrap">{d.customerIssue}</td>
                  <td className="px-2 py-2.5 max-w-[240px]">
                    <span className="italic text-muted-foreground line-clamp-2">&ldquo;{d.proposal.proposed_response}&rdquo;</span>
                  </td>
                  <td className="px-2 py-2.5 text-center whitespace-nowrap">
                    <DecisionStamp decision={d.decision} size="sm" />
                    {d.ruleCode && (
                      <div className="font-mono text-[9px] text-muted-foreground mt-0.5">{d.ruleCode}</div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 max-w-[280px]">
                    <span className="text-muted-foreground line-clamp-2">{d.reason}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {d.counterfactual ? (
                      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setSelected(d)}>
                        <HelpCircle className="h-3 w-3" /> Why?
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* counterfactual dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <DecisionStamp decision={selected.decision} size="sm" />
                  <span>&ldquo;Why didn&apos;t you say that?&rdquo;</span>
                </DialogTitle>
                <DialogDescription>
                  {selected.customerName} · {timeOf(selected.createdAt)} · {selected.customerIssue}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-1">
                <div className="rounded-md border-l-2 border-red-400 bg-red-50/60 dark:bg-red-950/30 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-red-700 dark:text-red-300 mb-1">
                    Utterance that was NOT spoken
                  </div>
                  <p className="text-sm italic">&ldquo;{selected.proposal.proposed_response}&rdquo;</p>
                </div>
                <div className="rounded-md border bg-card px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    Deterministic reason {selected.ruleCode ? `(${selected.ruleCode})` : ""}
                  </div>
                  <p className="text-sm leading-relaxed">{selected.reason}</p>
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/40 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    Counterfactual — what would have happened
                  </div>
                  <p className="text-sm leading-relaxed dark:text-amber-100/90">{selected.counterfactual}</p>
                </div>
                {selected.fallbackScript && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/40 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                      What was actually spoken instead
                    </div>
                    <p className="text-sm italic leading-relaxed dark:text-emerald-100/90">
                      &ldquo;{selected.fallbackScript}&rdquo;
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "zinc",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  tone?: "zinc" | "emerald" | "red" | "amber";
}) {
  const tones = {
    zinc: "text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800",
    emerald: "text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950",
    red: "text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950",
    amber: "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950",
  };
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", tones[tone])}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 h-24 animate-pulse bg-zinc-50 dark:bg-zinc-900" />
        ))}
      </div>
      <div className="rounded-lg border bg-card h-72 animate-pulse bg-zinc-50 dark:bg-zinc-900" />
    </div>
  );
}

export { Badge };
