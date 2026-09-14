"use client";

// ─── LIVE CALL VIEW ───────────────────────────────────────────────────────────
// Persona picker → call console (transcript + pipeline sidebar + decision log)
// → outcome dialog → journal summary with counterfactuals.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  PhoneOff,
  Send,
  Sparkles,
  Volume2,
  Timer,
  Users,
  Wallet,
  Gavel,
  ArrowRight,
  RotateCcw,
  BookOpen,
  ShieldAlert,
  Radio,
  Ear,
  Brain,
  AudioLines,
  Mic,
  Square,
  Play,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PipelineSidebar, type PipelineData } from "./pipeline-sidebar";
import { DecisionStamp, EmotionBadge, KV, money, timeOf } from "./shared";
import type {
  AudioIntel,
  CallRecord,
  JournalRecord,
  Persona,
  TurnResponse,
} from "@/lib/agents/types";

interface BootInfo {
  personas: Persona[];
  supervisorWaitMinutes: number;
  effectiveWaiverCap: { base: number; effective: number; loyaltyActive: boolean };
}

export function LiveCallView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { toast } = useToast();
  const [boot, setBoot] = useState<BootInfo | null>(null);
  const [call, setCall] = useState<CallRecord | null>(null);
  const [processing, setProcessing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [revealed, setRevealed] = useState([false, false, false, false]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState("jam");
  const [draft, setDraft] = useState("");
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [csat, setCsat] = useState(3);
  const [retained, setRetained] = useState(true);
  const [escalated, setEscalated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [journalResult, setJournalResult] = useState<JournalRecord | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // ── AssemblyAI voice intake ────────────────────────────────────────────
  const [aaiConfigured, setAaiConfigured] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [lastIntel, setLastIntel] = useState<AudioIntel | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // boot
  useEffect(() => {
    fetch("/api/personas")
      .then((r) => r.json())
      .then(setBoot)
      .catch(() => toast({ title: "Failed to load personas", variant: "destructive" }));
    // AssemblyAI status chip (LIVE vs demo mode)
    fetch("/api/assemblyai/transcribe")
      .then((r) => r.json())
      .then((d) => setAaiConfigured(Boolean(d.configured)))
      .catch(() => setAaiConfigured(false));
    return () => {
      revealTimers.current.forEach(clearTimeout);
      audioRef.current?.pause();
    };
  }, [toast]);

  // call timer
  useEffect(() => {
    if (!call || call.status !== "ACTIVE") return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [call]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [call?.transcript.length, processing]);

  const mmss = useMemo(() => {
    const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    return `${m}:${s}`;
  }, [elapsed]);

  // ── TTS ─────────────────────────────────────────────────────────────────────
  const speak = useCallback(
    async (text: string, voiceId = voice) => {
      try {
        audioRef.current?.pause();
        // stop any ongoing on-device speech before starting a new utterance
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        setAudioLoading(true);
        setAudioUrl(null);
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: voiceId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "TTS failed" }));
          throw new Error(err.error || "TTS failed");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setAudioLoading(false);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onplay = () => setSpeaking(true);
        audio.onended = () => setSpeaking(false);
        audio.onpause = () => setSpeaking(false);
        await audio.play().catch(() => setSpeaking(false));
      } catch (err) {
        setAudioLoading(false);
        // Cloud TTS unavailable (e.g. deployment without Z.AI credentials) —
        // degrade to on-device speech so the Voice Executor still speaks.
        if (typeof window !== "undefined" && "speechSynthesis" in window && text) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.0;
          utterance.onstart = () => setSpeaking(true);
          utterance.onend = () => setSpeaking(false);
          utterance.onerror = () => setSpeaking(false);
          window.speechSynthesis.speak(utterance);
          setAudioUrl(null);
          toast({
            title: "Voice executor: on-device speech",
            description:
              "Cloud TTS is unavailable here — speaking with the browser's built-in voice.",
          });
          return;
        }
        toast({
          title: "Voice executor unavailable",
          description: (err as Error).message,
          variant: "destructive",
        });
      }
    },
    [voice, toast]
  );

  // ── start call ──────────────────────────────────────────────────────────────
  async function startCall(personaKey: string) {
    setStarting(true);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaKey, openingAutopilot: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCall(data.call);
      setPipelineData(null);
      setJournalResult(null);
      setRevealed([false, false, false, false]);
      toast({
        title: "Live call connected",
        description: `${data.call.customer.name} is on the line. Listening agents are engaged.`,
      });
    } catch (err) {
      toast({ title: "Could not start call", description: (err as Error).message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  // ── turn pipeline ───────────────────────────────────────────────────────────
  async function sendTurn(text?: string, autopilot = false, intel?: AudioIntel) {
    if (!call || processing) return;
    const body = text?.trim()
      ? intel
        ? { text: text.trim(), audioIntel: intel }
        : { text: text.trim() }
      : autopilot
      ? { autopilot: true }
      : null;
    if (!body) return;
    setProcessing(true);
    setRevealed([false, false, false, false]);
    setPipelineData(null);
    setAudioUrl(null);
    audioRef.current?.pause();
    try {
      const res = await fetch(`/api/calls/${call.id}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: TurnResponse & { call: CallRecord; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Pipeline failed");
      setCall(data.call);
      setPipelineData({
        listening: data.stages.listening,
        thesis: data.stages.thesis,
        governor: data.stages.governor,
        executedScript: data.stages.executedScript,
        latencyMs: data.stages.latencyMs,
        usedFallbackAI: data.stages.usedFallbackAI,
        decisionId: data.stages.decisionId,
      });
      setProcessing(false);
      // progressive reveal, then the voice executes
      const stages = [300, 900, 1500, 2100];
      revealTimers.current.forEach(clearTimeout);
      revealTimers.current = stages.map((ms, i) =>
        setTimeout(() => {
          setRevealed((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
          if (i === 3) {
            setTimeout(() => speak(data.stages.executedScript), 250);
          }
        }, ms)
      );
    } catch (err) {
      setProcessing(false);
      toast({ title: "Pipeline error", description: (err as Error).message, variant: "destructive" });
    }
  }

  // ── outcome ─────────────────────────────────────────────────────────────────
  async function submitOutcome() {
    if (!call) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/calls/${call.id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csat, retained, escalated }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCall(data.call);
      setJournalResult(data.journal);
      setOutcomeOpen(false);
      toast({
        title: "Call closed — journal entry written",
        description: "Counterfactual explanations generated for every rejected utterance.",
      });
    } catch (err) {
      toast({ title: "Outcome failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function resetCall() {
    audioRef.current?.pause();
    setCall(null);
    setPipelineData(null);
    setJournalResult(null);
    setRevealed([false, false, false, false]);
    setAudioUrl(null);
    setDraft("");
    setLastIntel(null);
  }

  // ── AssemblyAI voice intake ──────────────────────────────────────────────
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = () => reject(new Error("Could not read the audio"));
      reader.readAsDataURL(blob);
    });
  }

  async function handleIntel(intel: AudioIntel) {
    setLastIntel(intel);
    toast({
      title: `Transcript ready — ${intel.provider === "assemblyai" ? "AssemblyAI" : "demo mode"}`,
      description: `Sentiment ${intel.sentiment} (${Math.round(intel.sentimentConfidence * 100)}% confidence)${
        intel.words ? ` · ${intel.words} words` : ""
      } — running the committee on it.`,
    });
    // auto-run the committee on the transcribed utterance
    setTimeout(() => sendTurn(intel.transcript, false, intel), 700);
  }

  async function runTranscribe(audioBase64?: string, sampleId?: string) {
    setTranscribing(true);
    try {
      const res = await fetch("/api/assemblyai/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, sampleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed");
      await handleIntel(data as AudioIntel);
    } catch (err) {
      toast({ title: "Voice intake failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 1200) {
          toast({
            title: "Recording too short",
            description: "Hold the mic a little longer — the customer needs to finish a sentence.",
          });
          return;
        }
        await runTranscribe(await blobToBase64(blob));
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      toast({
        title: "Microphone unavailable",
        description: "The browser blocked mic access — use a bundled sample instead.",
        variant: "destructive",
      });
    }
  }

  async function playSample(sampleId: string) {
    try {
      const res = await fetch(`/samples/${sampleId}.mp3`);
      if (!res.ok) throw new Error("Sample audio not found");
      const blob = await res.blob();
      // let the customer "speak" while the intake pipeline transcribes
      new Audio(URL.createObjectURL(blob)).play().catch(() => {});
      await runTranscribe(await blobToBase64(blob), sampleId);
    } catch (err) {
      toast({ title: "Sample failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  // ── ops console (supervisor queue) ────────────────────────────────────────
  function setQueue(minutes: number) {
    setBoot((b) => (b ? { ...b, supervisorWaitMinutes: minutes } : b));
    fetch("/api/system-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supervisorWaitMinutes: minutes }),
    }).catch(() => {});
  }

  // ═══ RENDER ════════════════════════════════════════════════════════════════
  if (!call) {
    return (
      <PersonaPicker
        boot={boot}
        starting={starting}
        onStart={startCall}
        onSetQueue={setQueue}
      />
    );
  }

  const decisions = call.decisions;
  const completed = call.status === "COMPLETED";

  return (
    <div className="space-y-4">
      {/* call header */}
      <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5">
            {!completed && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
            )}
            <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", completed ? "bg-zinc-400" : "bg-emerald-600")} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{call.customer.name}</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {call.customer.tenureYears}y · {call.customer.tier.replace("_", " ")}
              </Badge>
              {call.customer.eligibilityFlags.map((f) => (
                <Badge key={f} variant="outline" className="font-mono text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900">
                  {f}
                </Badge>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              balance {money(call.customer.accountBalance)} · open fee {money(call.customer.openLateFee)} · risk {call.customer.riskProfile}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <Timer className="h-3.5 w-3.5" /> {mmss}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Supervisor queue</span>
            <span className="font-mono font-semibold tabular-nums w-14 text-right">
              {boot?.supervisorWaitMinutes ?? 7}m
            </span>
            <Slider
              className="w-24"
              min={0}
              max={15}
              step={1}
              value={[boot?.supervisorWaitMinutes ?? 7]}
              onValueChange={([v]) => setQueue(v)}
              disabled={completed}
            />
          </div>
          {completed ? (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={resetCall}>
              <RotateCcw className="h-3.5 w-3.5" /> New call
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1.5"
              disabled={decisions.length === 0}
              onClick={() => setOutcomeOpen(true)}
            >
              <PhoneOff className="h-3.5 w-3.5" /> End call & record outcome
            </Button>
          )}
        </div>
      </div>

      {/* main console */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4">
        {/* transcript column */}
        <div className="space-y-4 min-w-0">
          <div className="rounded-lg border bg-card flex flex-col h-[430px]">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
              <Radio className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-semibold uppercase tracking-wider">Live transcript</span>
              {speaking && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                  <AudioLines className="h-3 w-3 animate-pulse" /> AGENT SPEAKING
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                AI proposes · Rules verify · Voice executes
              </span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 max-h-[340px]">
              {call.transcript.map((t, i) => (
                <Bubble key={i} turn={t} onReplay={() => speak(t.text)} replayDisabled={processing} />
              ))}
              {processing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pl-9 pt-1">
                  <Ear className="h-3.5 w-3.5 animate-pulse" />
                  <span>Listening agents deliberating · thesis forming · governor evaluating…</span>
                </div>
              )}
              {journalResult && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3 mt-2"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-emerald-700" />
                    <span className="text-xs font-semibold">Conversation journal — entry written</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">{journalResult.thesisVerdict === "RIGHT" ? "✓ Thesis RIGHT" : journalResult.thesisVerdict === "WRONG" ? "✕ Thesis WRONG" : "— Thesis INCONCLUSIVE"}:</span>{" "}
                    {journalResult.lesson}
                  </p>
                  <Button size="sm" variant="outline" className="h-7 mt-2 text-[11px]" onClick={() => onNavigate("journal")}>
                    Open journal <ArrowRight className="h-3 w-3" />
                  </Button>
                </motion.div>
              )}
            </div>
            <div className="border-t border-zinc-100 dark:border-zinc-800 p-2.5 flex gap-2">
              <Input
                placeholder="Type what the customer says next…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) {
                    sendTurn(draft);
                    setDraft("");
                  }
                }}
                disabled={processing || completed}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                className="h-9 gap-1.5"
                disabled={processing || completed || !draft.trim()}
                onClick={() => {
                  sendTurn(draft);
                  setDraft("");
                }}
              >
                <Send className="h-3.5 w-3.5" /> Send
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-9 gap-1.5 whitespace-nowrap"
                disabled={processing || completed}
                onClick={() => sendTurn(undefined, true)}
                title="Let the simulated customer speak for themselves"
              >
                <Sparkles className="h-3.5 w-3.5" /> Autopilot
              </Button>
            </div>
          </div>

          {/* AssemblyAI voice intake — speech-to-text + sentiment */}
          <VoiceIntake
            configured={aaiConfigured}
            recording={recording}
            transcribing={transcribing}
            intel={lastIntel}
            disabled={processing || completed}
            onToggleRecord={toggleRecording}
            onSample={playSample}
          />

          {/* this-call decision log (counterfactual memory) */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Gavel className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Decision log — this call
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                {decisions.filter((d) => d.decision === "REJECTED").length} rejected ·{" "}
                {decisions.filter((d) => d.decision === "APPROVED").length} approved
              </span>
            </div>
            {decisions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No proposals yet — send a customer message to run the committee.
              </p>
            ) : (
              <div className="space-y-1.5">
                {decisions.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-md border border-zinc-100 dark:border-zinc-800 p-2 text-xs grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 items-center"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">{timeOf(d.createdAt)}</span>
                    <div className="min-w-0">
                      <span className="font-medium capitalize">{d.customerIssue}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="italic text-muted-foreground line-clamp-1 inline">
                        &ldquo;{d.proposal.proposed_response}&rdquo;
                      </span>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                        {d.decision === "APPROVED" ? "✓" : "✕"} {d.reason}
                      </p>
                      {d.counterfactual && (
                        <p className="text-[10px] mt-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-1.5 py-1 text-amber-800 dark:text-amber-200 leading-snug">
                          <ShieldAlert className="h-2.5 w-2.5 inline mr-1" />
                          {d.counterfactual}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <DecisionStamp decision={d.decision} size="sm" />
                      {d.ruleCode && (
                        <span className="font-mono text-[9px] text-muted-foreground">{d.ruleCode}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* pipeline sidebar */}
        <div className="min-w-0">
          <PipelineSidebar
            processing={processing}
            stage={revealed.filter(Boolean).length}
            data={pipelineData}
            revealed={revealed}
            audioUrl={audioUrl}
            audioLoading={audioLoading}
            speaking={speaking}
            voice={voice}
            onVoiceChange={(v) => setVoice(v)}
            onReplay={() => audioRef.current && (audioRef.current.currentTime = 0, audioRef.current.play())}
            onSpeak={() => pipelineData && speak(pipelineData.executedScript)}
          />
        </div>
      </div>

      {/* outcome dialog */}
      <Dialog open={outcomeOpen} onOpenChange={setOutcomeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record call outcome</DialogTitle>
            <DialogDescription>
              Post-call learning: the outcome determines whether the thesis was right or wrong, and
              teaches the journal a lesson.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <Label className="text-xs uppercase tracking-wide">CSAT (customer rating)</Label>
              <div className="flex gap-1.5 mt-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setCsat(n)}
                    className={cn(
                      "h-10 w-10 rounded-md border text-sm font-bold transition-colors",
                      csat === n
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-zinc-200 dark:border-zinc-700 hover:border-emerald-400"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Customer retained</Label>
                <p className="text-xs text-muted-foreground">Account remains open</p>
              </div>
              <Switch checked={retained} onCheckedChange={setRetained} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Escalated to human</Label>
                <p className="text-xs text-muted-foreground">Transfer or callback consumed</p>
              </div>
              <Switch checked={escalated} onCheckedChange={setEscalated} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutcomeOpen(false)}>
              Back to call
            </Button>
            <Button onClick={submitOutcome} disabled={submitting} className="gap-1.5">
              <PhoneOff className="h-3.5 w-3.5" />
              {submitting ? "Writing journal…" : "Close call & learn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── AssemblyAI Voice Intake panel ────────────────────────────────────────────
function VoiceIntake({
  configured,
  recording,
  transcribing,
  intel,
  disabled,
  onToggleRecord,
  onSample,
}: {
  configured: boolean | null;
  recording: boolean;
  transcribing: boolean;
  intel: AudioIntel | null;
  disabled: boolean;
  onToggleRecord: () => void;
  onSample: (sampleId: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <Mic className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider">Voice Intake</span>
        <span className="text-[10px] text-muted-foreground">
          AssemblyAI speech-to-text · sentiment analysis
        </span>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold",
            configured
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
          )}
          title={
            configured
              ? "ASSEMBLYAI_API_KEY detected — recorded audio is transcribed live."
              : "No ASSEMBLYAI_API_KEY detected — bundled samples replay pre-computed transcripts."
          }
        >
          {configured === null ? "CHECKING…" : configured ? "ASSEMBLYAI · LIVE" : "DEMO MODE · NO KEY"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          size="sm"
          variant={recording ? "destructive" : "secondary"}
          className="h-8 gap-1.5"
          disabled={disabled || transcribing}
          onClick={onToggleRecord}
        >
          {recording ? (
            <>
              <Square className="h-3 w-3 animate-pulse" /> Stop &amp; transcribe
            </>
          ) : (
            <>
              <Mic className="h-3 w-3" /> Record customer audio
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={disabled || transcribing}
          onClick={() => onSample("furious-demand")}
          title="Play a bundled angry-customer recording through the intake pipeline"
        >
          <Play className="h-3 w-3" /> Sample · “$50 credit today”
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={disabled || transcribing}
          onClick={() => onSample("latefee-dispute")}
          title="Play a bundled fee-dispute recording through the intake pipeline"
        >
          <Play className="h-3 w-3" /> Sample · late-fee dispute
        </Button>
        {transcribing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> transcribing…
          </span>
        )}
        {recording && (
          <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
            </span>
            listening to the customer…
          </span>
        )}
      </div>
      {intel && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 px-2.5 py-1.5 text-[10px]">
          <span className="font-mono font-semibold">
            {intel.provider === "assemblyai" ? "ASSEMBLYAI" : "DEMO TRANSCRIPT"}
          </span>
          <SentimentChip sentiment={intel.sentiment} />
          <span className="font-mono text-muted-foreground">
            {Math.round(intel.sentimentConfidence * 100)}% conf
          </span>
          {intel.words ? (
            <span className="font-mono text-muted-foreground">{intel.words} words</span>
          ) : null}
          {intel.durationSec ? (
            <span className="font-mono text-muted-foreground">{intel.durationSec.toFixed(1)}s</span>
          ) : null}
          <span className="ml-auto text-muted-foreground italic">
            transcript loaded → running the committee
          </span>
        </div>
      )}
      {configured === false && !intel && (
        <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
          No ASSEMBLYAI_API_KEY detected — the bundled samples replay pre-computed transcripts so
          the flow stays demonstrable. Add a free key from dashboard.assemblyai.com as the
          ASSEMBLYAI_API_KEY environment variable to transcribe any recorded audio live.
        </p>
      )}
    </div>
  );
}

function SentimentChip({ sentiment }: { sentiment: string }) {
  const map: Record<string, string> = {
    NEGATIVE:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
    POSITIVE:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    NEUTRAL:
      "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  };
  return (
    <span
      className={cn("rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold", map[sentiment] ?? map.NEUTRAL)}
    >
      {sentiment}
    </span>
  );
}

// ─── Chat bubble ───────────────────────────────────────────────────────────────
function Bubble({
  turn,
  onReplay,
  replayDisabled,
}: {
  turn: { role: "customer" | "agent"; text: string; ts: string };
  onReplay: () => void;
  replayDisabled: boolean;
}) {
  const isAgent = turn.role === "agent";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex w-full", isAgent ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
          isAgent
            ? "bg-emerald-600 text-white rounded-br-sm"
            : "bg-zinc-100 dark:bg-zinc-800 rounded-bl-sm"
        )}
      >
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={cn("text-[9px] font-mono uppercase tracking-wider", isAgent ? "text-emerald-100" : "text-muted-foreground")}>
            {isAgent ? "AGENT (VOICE)" : callLabel(turn.ts)} · {timeOf(turn.ts)}
          </span>
          {isAgent && (
            <button
              onClick={onReplay}
              disabled={replayDisabled}
              className="ml-1 text-emerald-100 hover:text-white disabled:opacity-40"
              title="Replay TTS"
              aria-label="Replay voice"
            >
              <Volume2 className="h-3 w-3" />
            </button>
          )}
        </div>
        {turn.text}
      </div>
    </motion.div>
  );
}

function callLabel(_ts: string) {
  return "CUSTOMER";
}

// ─── Persona picker (start screen) ────────────────────────────────────────────
function PersonaPicker({
  boot,
  starting,
  onStart,
  onSetQueue,
}: {
  boot: BootInfo | null;
  starting: boolean;
  onStart: (key: string) => void;
  onSetQueue: (m: number) => void;
}) {
  return (
    <div className="space-y-5">
      {/* architecture flow */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Phone className="h-4 w-4 text-emerald-700" />
          <span className="text-sm font-semibold">Customer Experience Committee + Compliance Governor</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[11px]">
          <FlowChip icon={Ear} label="Live Audio / CRM" sub="AssemblyAI STT · sentiment · history" />
          <Arrow />
          <FlowChip icon={Users} label="Listening Agents" sub="empathy · knowledge · account · legal · context" highlight />
          <Arrow />
          <FlowChip icon={Brain} label="Response Thesis" sub="AI proposes intent" highlight />
          <Arrow />
          <FlowChip icon={Gavel} label="Compliance Governor" sub="regulatory · financial · SLA · privacy" highlight />
          <Arrow />
          <FlowChip icon={AudioLines} label="Voice Executor" sub="TTS playback" />
          <Arrow />
          <FlowChip icon={Radio} label="Call Monitor" sub="+ explanation sidebar" />
        </div>
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3" />
            Autonomous goodwill authority: <b className="text-foreground font-mono">${boot?.effectiveWaiverCap.effective ?? "…"}</b>
            {boot?.effectiveWaiverCap.loyaltyActive ? " (loyalty override ON)" : " (loyalty override OFF)"}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            Supervisor queue: <b className="text-foreground font-mono">{boot?.supervisorWaitMinutes ?? "…"} min</b>
            <Slider
              className="w-24 ml-1"
              min={0}
              max={15}
              step={1}
              value={[boot?.supervisorWaitMinutes ?? 7]}
              onValueChange={([v]) => onSetQueue(v)}
            />
          </span>
        </div>
      </div>

      {/* personas */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Answer the next call as…</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(boot?.personas ?? []).map((p, idx) => (
            <motion.button
              key={p.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              onClick={() => onStart(p.key)}
              disabled={starting}
              className="text-left rounded-lg border bg-card p-4 hover:border-emerald-500 hover:shadow-md transition-all group disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div>
                  <div className="font-semibold text-sm group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                    {p.label}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{p.name}</div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                  {p.customer.tenureYears}y · {p.customer.tier.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-2.5">{p.description}</p>
              <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 px-2.5 py-1.5 text-[11px] italic text-muted-foreground line-clamp-2">
                &ldquo;{p.openingLine}&rdquo;
              </div>
              <div className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <Phone className="h-3 w-3" /> Connect call
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FlowChip({
  icon: Icon,
  label,
  sub,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-1.5",
        highlight
          ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/40"
          : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40"
      )}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        <Icon className="h-3 w-3 text-emerald-700" />
        {label}
      </div>
      <div className="text-[9px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function Arrow() {
  return <span className="text-zinc-300 dark:text-zinc-600 font-mono">→</span>;
}

export { EmotionBadge, KV };
