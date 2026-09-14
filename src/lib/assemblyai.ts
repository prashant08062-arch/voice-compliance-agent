// ─── AssemblyAI Speech-to-Text + Audio Intelligence — backend only ────────────
// Transcribes live customer audio (speech-to-text) and extracts sentiment so
// the Empathy listening agent can factor real acoustic evidence into its
// verdict. Talks to the AssemblyAI REST API directly — zero extra dependency.
//
// Configure with ASSEMBLYAI_API_KEY (https://dashboard.assemblyai.com/).
// Without a key the app degrades gracefully: the two bundled sample-audio
// buttons replay pre-computed transcripts, so the voice-intake flow stays
// demonstrable end-to-end (clearly labelled DEMO in the UI).

import type { AudioIntel } from "@/lib/agents/types";

const AAI_BASE = "https://api.assemblyai.com/v2";

// Remember failed auth for 5 minutes so serverless deployments with a bad key
// fail fast instead of hammering the API on every request (same pattern as llm.ts).
let authCooldownUntil = 0;

export function isAssemblyAIConfigured(): boolean {
  return Boolean(process.env.ASSEMBLYAI_API_KEY);
}

// ── Demo mode: pre-computed transcripts for the bundled sample audio ─────────
// Keys map 1:1 to public/samples/<id>.mp3. The transcripts intentionally match
// the spoken sample audio so the demo flow is byte-consistent.
const DEMO_SAMPLES: Record<string, Omit<AudioIntel, "provider">> = {
  "furious-demand": {
    transcript:
      "I have been a loyal customer of this bank for nine years, and you charged me a thirty five dollar late fee because your own app was down on my due date. That is unacceptable. I want a fifty dollar credit on my account today, or I am closing this account and taking my business to Chase.",
    sentiment: "NEGATIVE",
    sentimentConfidence: 0.94,
    durationSec: 30.6,
    words: 57,
  },
  "latefee-dispute": {
    transcript:
      "There is a late fee on my statement again, and I paid on time. I checked my confirmation. This is the second month in a row something like this has happened, and nobody explained it to me. I want this fee waived today, and I want to understand exactly why it keeps happening.",
    sentiment: "NEGATIVE",
    sentimentConfidence: 0.87,
    durationSec: 23.7,
    words: 53,
  },
};

export function getDemoSampleIds(): string[] {
  return Object.keys(DEMO_SAMPLES);
}

interface TranscribeOpts {
  audioBase64?: string; // raw audio bytes, base64-encoded (webm/ogg/mp3/wav/…)
  sampleId?: string; // bundled sample key — enables demo fallback without a key
}

interface AaiSentimentItem {
  sentiment?: string;
  confidence?: number;
}

function aggregateSentiment(items: AaiSentimentItem[]): {
  sentiment: AudioIntel["sentiment"];
  confidence: number;
} {
  const valid = items.filter(
    (i) => i.sentiment === "POSITIVE" || i.sentiment === "NEGATIVE" || i.sentiment === "NEUTRAL"
  );
  if (!valid.length) return { sentiment: "NEUTRAL", confidence: 0.5 };
  // majority vote; ties resolved by the most recent utterance's sentiment
  const count = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
  valid.forEach((i) => count[i.sentiment as keyof typeof count]++);
  const last = valid[valid.length - 1].sentiment as AudioIntel["sentiment"];
  const winner = (Object.keys(count) as Array<keyof typeof count>).reduce((a, b) =>
    count[b] > count[a] ? b : a
  );
  const sentiment =
    count[winner] === Math.max(count.POSITIVE, count.NEGATIVE, count.NEUTRAL) &&
    count[winner] === 0
      ? last
      : winner;
  const avg =
    valid.reduce((acc, i) => acc + (typeof i.confidence === "number" ? i.confidence : 0.7), 0) /
    valid.length;
  return { sentiment, confidence: Math.round(avg * 100) / 100 };
}

export async function transcribeAudio(opts: TranscribeOpts): Promise<AudioIntel> {
  const key = process.env.ASSEMBLYAI_API_KEY;

  // No key → demo mode, only for the bundled samples.
  if (!key) {
    const demo = opts.sampleId ? DEMO_SAMPLES[opts.sampleId] : undefined;
    if (!demo) {
      throw new Error(
        "ASSEMBLYAI_API_KEY is not configured. Add your free key from dashboard.assemblyai.com to enable live transcription — demo mode only supports the bundled sample audio."
      );
    }
    return { ...demo, provider: "demo" };
  }

  if (Date.now() < authCooldownUntil) {
    throw new Error(
      "AssemblyAI unavailable (cooldown after an auth failure) — retry in a few minutes."
    );
  }

  let audioBytes: Buffer;
  if (opts.audioBase64) {
    audioBytes = Buffer.from(opts.audioBase64, "base64");
  } else {
    throw new Error("No audio provided (expected audioBase64)");
  }
  if (!audioBytes.length) throw new Error("Empty audio payload");

  // 1) Upload the raw audio bytes.
  const uploadRes = await fetch(`${AAI_BASE}/upload`, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/octet-stream" },
    body: new Uint8Array(audioBytes),
  });
  if (uploadRes.status === 401 || uploadRes.status === 403) {
    authCooldownUntil = Date.now() + 5 * 60_000;
    throw new Error("AssemblyAI rejected the API key (401/403) — check ASSEMBLYAI_API_KEY.");
  }
  if (!uploadRes.ok) {
    throw new Error(`AssemblyAI upload failed (${uploadRes.status})`);
  }
  const { upload_url: uploadUrl } = (await uploadRes.json()) as { upload_url: string };

  // 2) Create the transcription job — sentiment analysis enabled.
  const createRes = await fetch(`${AAI_BASE}/transcript`, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: uploadUrl,
      sentiment_analysis: true,
      punctuate: true,
      format_text: true,
    }),
  });
  if (createRes.status === 401 || createRes.status === 403) {
    authCooldownUntil = Date.now() + 5 * 60_000;
    throw new Error("AssemblyAI rejected the API key (401/403) — check ASSEMBLYAI_API_KEY.");
  }
  if (!createRes.ok) {
    throw new Error(`AssemblyAI transcription job failed (${createRes.status})`);
  }
  const created = (await createRes.json()) as { id: string };

  // 3) Poll until the job completes (bounded to ~75s).
  const deadline = Date.now() + 75_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    let poll: Response;
    try {
      poll = await fetch(`${AAI_BASE}/transcript/${created.id}`, {
        headers: { authorization: key },
      });
    } catch {
      continue; // transient network blip — keep polling
    }
    if (!poll.ok) continue;
    const data = (await poll.json()) as {
      status: string;
      text?: string;
      audio_duration?: number;
      words?: unknown[];
      sentiment_analysis_results?: AaiSentimentItem[];
      error?: string;
    };
    if (data.status === "error") {
      throw new Error(`AssemblyAI transcription error: ${data.error ?? "unknown"}`);
    }
    if (data.status === "completed") {
      const transcript = (data.text ?? "").trim();
      if (!transcript) {
        throw new Error("AssemblyAI returned an empty transcript — the audio may be silent.");
      }
      const agg = aggregateSentiment(data.sentiment_analysis_results ?? []);
      return {
        provider: "assemblyai",
        transcript,
        sentiment: agg.sentiment,
        sentimentConfidence: agg.confidence,
        durationSec: data.audio_duration ?? undefined,
        words: data.words?.length ?? undefined,
      };
    }
  }
  throw new Error("AssemblyAI transcription timed out (~75s) — try a shorter recording.");
}
