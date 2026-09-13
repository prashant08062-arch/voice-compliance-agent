"use client";

// ─── Pipeline Sidebar: the live agent deliberation view ───────────────────────
// Listening Agents → Response Thesis → Compliance Governor → Voice Executor

import { motion, AnimatePresence } from "framer-motion";
import {
  Ear,
  Scale,
  Gavel,
  Volume2,
  Brain,
  UserRound,
  BookOpen,
  Wallet,
  ShieldAlert,
  Radar,
  Loader2,
  AudioLines,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmotionBadge,
  RiskBadge,
  DecisionStamp,
  MeterBar,
  SectionLabel,
  KV,
} from "./shared";
import type { ListeningSignals, Proposal, Verdict } from "@/lib/agents/types";

const AGENTS = [
  { key: "empathy", label: "Empathy", icon: Ear },
  { key: "knowledge", label: "Knowledge", icon: BookOpen },
  { key: "account", label: "Account", icon: Wallet },
  { key: "legal", label: "Legal / Policy", icon: Scale },
  { key: "context", label: "Context", icon: Radar },
] as const;

const VOICE_OPTIONS = [
  { value: "jam", label: "Jam — British English" },
  { value: "kazi", label: "Kazi — Clear Standard" },
  { value: "xiaochen", label: "Xiaochen — Composed" },
  { value: "tongtong", label: "Tongtong — Warm" },
];

export interface PipelineData {
  listening: ListeningSignals;
  thesis: Proposal;
  governor: Verdict;
  executedScript: string;
  latencyMs: number;
  usedFallbackAI: boolean;
  decisionId: string;
}

export function PipelineSidebar({
  processing,
  stage,
  data,
  revealed,
  audioUrl,
  audioLoading,
  speaking,
  voice,
  onVoiceChange,
  onReplay,
  onSpeak,
}: {
  processing: boolean;
  stage: number; // number of completed reveals
  data: PipelineData | null;
  revealed: boolean[]; // [listening, thesis, governor, executor]
  audioUrl: string | null;
  audioLoading: boolean;
  speaking: boolean;
  voice: string;
  onVoiceChange: (v: string) => void;
  onReplay: () => void;
  onSpeak: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* flow header */}
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-1">
        <Ear className="h-3 w-3" />
        <span>committee</span>
        <span className="text-zinc-300 dark:text-zinc-600">→</span>
        <Brain className="h-3 w-3" />
        <span>thesis</span>
        <span className="text-zinc-300 dark:text-zinc-600">→</span>
        <Gavel className="h-3 w-3" />
        <span>governor</span>
        <span className="text-zinc-300 dark:text-zinc-600">→</span>
        <Volume2 className="h-3 w-3" />
        <span>voice</span>
        {processing && (
          <Loader2 className="h-3 w-3 animate-spin ml-auto text-emerald-600" />
        )}
      </div>

      <ListeningCard revealed={revealed[0]} processing={processing} data={data?.listening ?? null} />
      <ThesisCard revealed={revealed[1]} processing={processing} data={data?.thesis ?? null} />
      <GovernorCard revealed={revealed[2]} processing={processing} data={data?.governor ?? null} />
      <ExecutorCard
        revealed={revealed[3]}
        processing={processing}
        script={data?.executedScript ?? null}
        approved={data?.governor.decision === "APPROVED"}
        audioUrl={audioUrl}
        audioLoading={audioLoading}
        speaking={speaking}
        voice={voice}
        onVoiceChange={onVoiceChange}
        onReplay={onReplay}
        onSpeak={onSpeak}
        latency={data?.latencyMs}
        heuristic={data?.usedFallbackAI}
      />
    </div>
  );
}

function StageShell({
  title,
  icon: Icon,
  accent,
  revealed,
  processing,
  delay = 0,
  children,
}: {
  title: string;
  icon: React.ElementType;
  accent: string;
  revealed: boolean;
  processing: boolean;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: revealed ? 1 : 0.6 }}
      className={cn(
        "rounded-lg border bg-card p-3",
        revealed ? "border-zinc-200 dark:border-zinc-800" : "border-dashed border-zinc-300 dark:border-zinc-700"
      )}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", accent)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        {!revealed && processing && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
        )}
      </div>
      <AnimatePresence mode="wait">
        {revealed ? (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay }}
          >
            {children}
          </motion.div>
        ) : (
          <motion.div key="skeleton" className="space-y-2">
            <div className="h-3 w-3/4 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ListeningCard({
  revealed,
  processing,
  data,
}: {
  revealed: boolean;
  processing: boolean;
  data: ListeningSignals | null;
}) {
  return (
    <StageShell
      title="Listening Agents"
      icon={Ear}
      accent="bg-zinc-700"
      revealed={revealed}
      processing={processing}
    >
      {data && (
        <div className="space-y-1.5">
          <AgentRow
            icon={Ear}
            name="Empathy"
            badge={<EmotionBadge emotion={data.empathy.emotion} level={data.empathy.frustration_level} />}
            text={`"…${data.empathy.key_concern}"`}
          />
          <AgentRow
            icon={BookOpen}
            name="Knowledge"
            badge={
              <Badge variant="outline" className="font-mono text-[10px]">
                {data.knowledge.issue_type.replace(/_/g, " ")}
              </Badge>
            }
            text={data.knowledge.recommended_action}
          />
          <AgentRow
            icon={Wallet}
            name="Account"
            badge={
              <Badge variant="outline" className="font-mono text-[10px]">
                {data.account.tenure_years}y · {data.account.tier.replace("_", " ")}
              </Badge>
            }
            text={data.account.relevant_history}
          />
          <AgentRow
            icon={Scale}
            name="Legal / Policy"
            text={data.legal.constraints.slice(0, 2).join(" · ")}
          />
          <AgentRow
            icon={Radar}
            name="Context"
            badge={
              <span className="flex gap-1">
                {data.context.competitor_mentioned && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900">
                    COMPETITOR
                  </Badge>
                )}
                {data.context.supervisor_requested && (
                  <Badge variant="outline" className="text-[10px] bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900">
                    WANTS SUPERVISOR
                  </Badge>
                )}
                {data.context.cancellation_intent && (
                  <Badge variant="outline" className="text-[10px] bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                    CLOSURE INTENT
                  </Badge>
                )}
              </span>
            }
            text={data.context.notes}
          />
        </div>
      )}
    </StageShell>
  );
}

function AgentRow({
  icon: Icon,
  name,
  badge,
  text,
}: {
  icon: React.ElementType;
  name: string;
  badge?: React.ReactNode;
  text?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-1.5">
      <Icon className="h-3 w-3 mt-0.5 text-zinc-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold">{name}</span>
          {badge}
        </div>
        {text && (
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 mt-0.5">{text}</p>
        )}
      </div>
    </div>
  );
}

function ThesisCard({
  revealed,
  processing,
  data,
}: {
  revealed: boolean;
  processing: boolean;
  data: Proposal | null;
}) {
  return (
    <StageShell
      title="Response Thesis — AI Proposes"
      icon={Brain}
      accent="bg-violet-600"
      revealed={revealed}
      processing={processing}
    >
      {data && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{data.customer_intent}</span>
            <RiskBadge risk={data.escalation_risk} />
          </div>
          <blockquote className="rounded-md border-l-2 border-violet-400 bg-violet-50/60 dark:bg-violet-950/30 px-2.5 py-1.5 text-[12px] leading-relaxed dark:text-violet-100">
            &ldquo;{data.proposed_response}&rdquo;
          </blockquote>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <MeterBar label="Confidence" value={data.confidence} />
            <MeterBar label="Est. CSAT impact" value={data.estimated_csat_impact} tone="emerald" />
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <Badge variant="outline" className="font-mono">Tone: {data.tone}</Badge>
            <Badge variant="outline" className="font-mono">{data.offer_type}</Badge>
            {data.dollar_amount > 0 && (
              <Badge variant="outline" className="font-mono bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900">
                ${data.dollar_amount}
              </Badge>
            )}
            {data.requires_human && (
              <Badge variant="outline" className="font-mono bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900">
                REQUIRES HUMAN
              </Badge>
            )}
          </div>
          {data.rationale && (
            <p className="text-[11px] text-muted-foreground leading-snug border-t border-zinc-100 dark:border-zinc-800 pt-1.5">
              <span className="font-semibold text-foreground/70">Committee rationale:</span>{" "}
              {data.rationale}
            </p>
          )}
        </div>
      )}
    </StageShell>
  );
}

function GovernorCard({
  revealed,
  processing,
  data,
}: {
  revealed: boolean;
  processing: boolean;
  data: Verdict | null;
}) {
  return (
    <StageShell
      title="Compliance Governor — Rules Verify"
      icon={Gavel}
      accent="bg-zinc-900"
      revealed={revealed}
      processing={processing}
    >
      {data && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <DecisionStamp decision={data.decision} />
            {data.ruleCode && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {data.ruleCode}
                {data.ruleName ? ` · ${data.ruleName}` : ""}
              </Badge>
            )}
          </div>
          <p className="text-[12px] leading-relaxed">{data.reason}</p>
          {data.decision === "REJECTED" && data.fallbackScript && (
            <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/40 p-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1">
                <ShieldAlert className="h-3 w-3" /> Fallback script (compliant alternative)
              </div>
              <p className="text-[12px] leading-relaxed dark:text-amber-100/90">
                &ldquo;{data.fallbackScript}&rdquo;
              </p>
            </div>
          )}
        </div>
      )}
    </StageShell>
  );
}

function ExecutorCard({
  revealed,
  processing,
  script,
  approved,
  audioUrl,
  audioLoading,
  speaking,
  voice,
  onVoiceChange,
  onReplay,
  onSpeak,
  latency,
  heuristic,
}: {
  revealed: boolean;
  processing: boolean;
  script: string | null;
  approved: boolean;
  audioUrl: string | null;
  audioLoading: boolean;
  speaking: boolean;
  voice: string;
  onVoiceChange: (v: string) => void;
  onReplay: () => void;
  onSpeak: () => void;
  latency?: number;
  heuristic?: boolean;
}) {
  return (
    <StageShell
      title="Voice Executor — Voice Executes"
      icon={AudioLines}
      accent="bg-emerald-600"
      revealed={revealed}
      processing={processing}
    >
      {script && (
        <div className="space-y-2.5">
          <div
            className={cn(
              "rounded-md p-2.5 text-[12px] leading-relaxed border",
              approved
                ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60"
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
              {approved ? "Speaking approved proposal" : "Speaking Governor fallback"}
            </span>
            &ldquo;{script}&rdquo;
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={speaking ? "secondary" : "default"}
              className="h-8 gap-1.5"
              onClick={audioUrl ? onReplay : onSpeak}
              disabled={audioLoading}
            >
              {audioLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Volume2 className={cn("h-3.5 w-3.5", speaking && "animate-pulse")} />
              )}
              {audioLoading ? "Synthesizing…" : speaking ? "Speaking…" : audioUrl ? "Replay" : "Speak"}
            </Button>
            <Select value={voice} onValueChange={onVoiceChange}>
              <SelectTrigger className="h-8 w-[170px] text-[11px]">
                <SelectValue placeholder="Voice" />
              </SelectTrigger>
              <SelectContent>
                {VOICE_OPTIONS.map((v) => (
                  <SelectItem key={v.value} value={v.value} className="text-xs">
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {audioUrl && (
            <audio src={audioUrl} controls className="w-full h-8" preload="auto" />
          )}

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {typeof latency === "number" && <span className="font-mono">pipeline {latency}ms</span>}
            {heuristic && (
              <Badge variant="outline" className="text-[9px] font-mono bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900">
                HEURISTIC MODE
              </Badge>
            )}
          </div>
        </div>
      )}
    </StageShell>
  );
}

export { UserRound };
