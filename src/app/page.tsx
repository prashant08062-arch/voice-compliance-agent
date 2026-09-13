"use client";

import { useState } from "react";
import { PhoneCall, LayoutDashboard, BookOpen, Brain, Gavel, ShieldCheck, Github } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LiveCallView } from "@/components/voice-agent/live-call-view";
import { DashboardView } from "@/components/voice-agent/dashboard-view";
import { JournalView } from "@/components/voice-agent/journal-view";
import { LearningView } from "@/components/voice-agent/learning-view";
import { RulesView } from "@/components/voice-agent/rules-view";

export default function Home() {
  const [tab, setTab] = useState("live");

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-900 text-white">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <PhoneCall className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight truncate">
                Voice Compliance Agent
              </h1>
              <p className="text-[10px] text-zinc-400 leading-tight truncate">
                Customer Experience Committee + Compliance Governor
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="hidden md:inline-flex font-mono text-[10px] border-zinc-700 bg-zinc-800 text-zinc-300 ml-2"
          >
            AI PROPOSES · RULES VERIFY · VOICE EXECUTES
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-zinc-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              deterministic governor · counterfactual memory · post-call learning
            </span>
          </div>
        </div>
      </header>

      {/* body */}
      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-5">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mb-4 h-auto flex-wrap justify-start bg-zinc-200/60 dark:bg-zinc-900">
            <TabsTrigger value="live" className="gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 text-xs">
              <PhoneCall className="h-3.5 w-3.5" /> Live Call
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 text-xs">
              <LayoutDashboard className="h-3.5 w-3.5" /> Decision Dashboard
            </TabsTrigger>
            <TabsTrigger value="journal" className="gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 text-xs">
              <BookOpen className="h-3.5 w-3.5" /> Journal
            </TabsTrigger>
            <TabsTrigger value="learning" className="gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 text-xs">
              <Brain className="h-3.5 w-3.5" /> Post-Call Learning
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 text-xs">
              <Gavel className="h-3.5 w-3.5" /> Governor Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="mt-0">
            <LiveCallView onNavigate={setTab} />
          </TabsContent>
          <TabsContent value="dashboard" className="mt-0">
            <DashboardView />
          </TabsContent>
          <TabsContent value="journal" className="mt-0">
            <JournalView />
          </TabsContent>
          <TabsContent value="learning" className="mt-0">
            <LearningView />
          </TabsContent>
          <TabsContent value="rules" className="mt-0">
            <RulesView />
          </TabsContent>
        </Tabs>
      </main>

      {/* footer */}
      <footer className="mt-auto border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Github className="h-3 w-3" />
            Voice Compliance Agent — listening agents propose, a deterministic governor decides, TTS executes.
          </span>
          <span className="ml-auto font-mono">
            counterfactual memory: every rejected utterance is stored
          </span>
        </div>
      </footer>
    </div>
  );
}
