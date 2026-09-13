"use client";

// ─── Shared presentational primitives for the Voice Compliance console ───────

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EscalationRisk } from "@/lib/agents/types";

export function RiskBadge({ risk }: { risk: EscalationRisk }) {
  const map: Record<EscalationRisk, string> = {
    LOW: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
    MEDIUM: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
    HIGH: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  };
  return (
    <Badge variant="outline" className={cn("font-semibold", map[risk])}>
      {risk} RISK
    </Badge>
  );
}

export function EmotionBadge({ emotion, level }: { emotion: string; level: number }) {
  const e = emotion.toUpperCase();
  const style =
    level >= 0.85
      ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900"
      : level >= 0.6
      ? "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900"
      : level >= 0.4
      ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900"
      : "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
  const face = level >= 0.85 ? "😠" : level >= 0.6 ? "😦" : level >= 0.4 ? "😐" : "🙂";
  return (
    <Badge variant="outline" className={cn("font-semibold gap-1", style)}>
      <span aria-hidden>{face}</span>
      {e} · {Math.round(level * 100)}%
    </Badge>
  );
}

export function DecisionStamp({
  decision,
  size = "md",
}: {
  decision: "APPROVED" | "REJECTED";
  size?: "sm" | "md" | "lg";
}) {
  const approved = decision === "APPROVED";
  const sizes = {
    sm: "text-[10px] px-2 py-0.5",
    md: "text-xs px-2.5 py-1",
    lg: "text-sm px-3 py-1.5",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border-2 font-mono font-bold uppercase tracking-wider",
        sizes[size],
        approved
          ? "border-emerald-600 bg-emerald-600 text-white shadow-[0_0_12px_rgba(5,150,105,0.35)]"
          : "border-red-600 bg-red-600 text-white shadow-[0_0_12px_rgba(220,38,38,0.35)]"
      )}
    >
      {approved ? "✓" : "✕"} {decision}
    </span>
  );
}

export function MeterBar({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: number;
  tone?: "zinc" | "emerald" | "amber" | "red";
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const bar =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
      ? "bg-amber-500"
      : tone === "red"
      ? "bg-red-500"
      : "bg-zinc-400";
  return (
    <div className="w-full">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </span>
        <span className="text-[11px] font-mono font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SectionLabel({
  icon,
  children,
  right,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {children}
      </div>
      {right}
    </div>
  );
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs py-0.5">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}

export function InfoHint({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-zinc-200 dark:bg-zinc-700 text-[9px] font-bold text-zinc-600 dark:text-zinc-300 cursor-help">
            i
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
