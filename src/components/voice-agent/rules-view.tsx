"use client";

// ─── GOVERNOR RULEBOOK ────────────────────────────────────────────────────────
// The deterministic rule set. Humans flip switches here; the engine re-reads
// the rulebook from the DB on every single evaluation.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Gavel, Save, RotateCcw, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { InfoHint } from "./shared";
import type { RuleRecord } from "@/lib/agents/types";

interface RulesData {
  rules: RuleRecord[];
  effectiveCap: { base: number; effective: number; loyaltyActive: boolean };
}

const CATEGORY_STYLE: Record<string, string> = {
  FINANCIAL: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  ESCALATION: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  REGULATORY: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900",
  PRIVACY: "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
};

const NUMERIC_PARAMS: Record<string, { key: string; label: string; min: number; max: number; step: number; hint: string }[]> = {
  "FIN-001": [{ key: "cap", label: "Goodwill cap ($)", min: 0, max: 500, step: 5, hint: "Max credit an autonomous agent may issue without supervisor sign-off" }],
  "FIN-002": [
    { key: "cap", label: "Loyalty cap ($)", min: 0, max: 500, step: 5, hint: "Raised authority for tenured high-value clients" },
    { key: "min_tenure_years", label: "Min tenure (years)", min: 0, max: 30, step: 1, hint: "Tenure threshold for the loyalty override" },
  ],
  "ESC-001": [{ key: "sla_minutes", label: "Callback SLA (min)", min: 1, max: 30, step: 1, hint: "Transfers are rejected when the supervisor queue exceeds this" }],
};

export function RulesView() {
  const { toast } = useToast();
  const [data, setData] = useState<RulesData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, number>>>({});
  const [activos, setActivos] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  function load() {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((d: RulesData) => {
        setData(d);
        const dr: Record<string, Record<string, number>> = {};
        const ac: Record<string, boolean> = {};
        for (const r of d.rules) {
          dr[r.id] = {};
          for (const [k, v] of Object.entries(r.params)) {
            if (typeof v === "number") dr[r.id][k] = v;
          }
          ac[r.id] = r.active;
        }
        setDrafts(dr);
        setActivos(ac);
        setDirty({});
      })
      .catch(() => {});
  }

  useEffect(load, []);

  async function save(rule: RuleRecord) {
    setSaving(rule.id);
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          params: drafts[rule.id],
          active: activos[rule.id],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      toast({
        title: `${rule.code} updated`,
        description: "The Governor re-reads the rulebook on every evaluation — effective immediately.",
      });
      load();
    } catch (err) {
      toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  if (!data) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-lg border bg-card h-28 animate-pulse bg-zinc-50 dark:bg-zinc-900" />
        ))}
      </div>
    );
  }

  const effective = data.effectiveCap;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Gavel className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Compliance Governor — rulebook</h2>
          <p className="text-xs text-muted-foreground">
            deterministic bounds, evaluated in priority order on every proposal
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs flex-wrap">
          <span className="text-muted-foreground">Effective goodwill authority:</span>
          <Badge variant="outline" className="font-mono bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900">
            ${effective.effective} base
          </Badge>
          {effective.loyaltyActive ? (
            <Badge variant="outline" className="font-mono bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
              loyalty override ON (→ raised for tenured high-value)
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono">
              loyalty override OFF
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {data.rules.map((rule, i) => {
          const isDirty = dirty[rule.id];
          const numeric = NUMERIC_PARAMS[rule.code] ?? [];
          return (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                "rounded-lg border bg-card p-4",
                !activos[rule.id] && "opacity-75"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-sm">{rule.code}</span>
                  <Badge variant="outline" className={cn("text-[10px]", CATEGORY_STYLE[rule.category])}>
                    {rule.category}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    {activos[rule.id] ? "active" : "inactive"}
                  </Label>
                  <Switch
                    checked={activos[rule.id] ?? false}
                    onCheckedChange={(v) => {
                      setActivos((a) => ({ ...a, [rule.id]: v }));
                      setDirty((d) => ({ ...d, [rule.id]: true }));
                    }}
                  />
                </div>
              </div>
              <div className="font-semibold text-sm mb-1">{rule.name}</div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{rule.description}</p>

              {numeric.length > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {numeric.map((np) => (
                    <div key={np.key}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Label className="text-[11px] font-medium">{np.label}</Label>
                        <InfoHint>{np.hint}</InfoHint>
                      </div>
                      <Input
                        type="number"
                        min={np.min}
                        max={np.max}
                        step={np.step}
                        value={drafts[rule.id]?.[np.key] ?? ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setDrafts((d) => ({
                            ...d,
                            [rule.id]: { ...d[rule.id], [np.key]: isNaN(v) ? 0 : v },
                          }));
                          setDirty((d) => ({ ...d, [rule.id]: true }));
                        }}
                        className="h-8 font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {rule.code === "ESC-001" && (
                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground mb-3 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 px-2.5 py-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    Live supervisor queue wait is controlled from the Live Call header. Transfers are
                    rejected whenever queue &gt; SLA.
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={!isDirty || saving === rule.id}
                  onClick={() => save(rule)}
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving === rule.id ? "Saving…" : isDirty ? "Save changes" : "Saved"}
                </Button>
                {isDirty && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1"
                    onClick={() => {
                      setDirty((d) => ({ ...d, [rule.id]: false }));
                      load();
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </Button>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  priority {rule.priority}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="rounded-lg border border-dashed bg-card p-4 text-xs text-muted-foreground leading-relaxed">
        <p>
          <b className="text-foreground">Try this:</b> activate{" "}
          <span className="font-mono">FIN-002 Loyalty Credit Override</span>, then run{" "}
          <b className="text-foreground">The Furious Loyalist</b> again — the $50 waiver that was
          rejected at 10:32 (cap $25) becomes executable, replaying the 11:04 approval
          (&ldquo;Client tenure &gt; 5yrs&rdquo;). Every rule change is a human decision; the
          Governor never modifies its own bounds.
        </p>
      </div>
    </div>
  );
}
