import { NextRequest, NextResponse } from "next/server";
import type { ZAI } from "z-ai-web-dev-sdk";

// POST /api/tts — the VOICE EXECUTOR.
// Only APPROVED scripts (or Governor fallback scripts) ever reach this route:
// the client decides what is "speakable", and only post-Governor text qualifies.
// Body: { text, voice?, speed? }

const VOICES = ["tongtong", "chuichui", "xiaochen", "jam", "kazi", "douji", "luodo"] as const;
type Voice = (typeof VOICES)[number];

interface ZAISingleton {
  chat: unknown;
  audio: {
    tts: {
      create: (opts: {
        input: string;
        voice: string;
        speed: number;
        response_format: "wav" | "mp3" | "pcm";
        stream: boolean;
      }) => Promise<Response>;
    };
  };
}

let zaiInstance: ZAISingleton | null = null;
async function getZAI(): Promise<ZAISingleton> {
  if (!zaiInstance) {
    const mod = (await import("z-ai-web-dev-sdk")) as unknown as {
      default: { create: () => Promise<ZAISingleton> };
    };
    zaiInstance = await mod.default.create();
  }
  return zaiInstance;
}

// Small in-memory cache so replaying a script doesn't regenerate audio.
const cache = new Map<string, { buf: Buffer; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body.text || "").trim();
    const voice: Voice = VOICES.includes(body.voice) ? body.voice : "jam";
    const speed = Math.max(0.5, Math.min(2.0, Number(body.speed) || 1.0));

    if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });
    if (text.length > 1024) {
      return NextResponse.json(
        { error: "Script exceeds the 1024-character TTS bound" },
        { status: 400 }
      );
    }

    const key = `${voice}:${speed}:${text}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      return new NextResponse(new Uint8Array(hit.buf), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Content-Length": hit.buf.length.toString(),
          "Cache-Control": "no-cache",
          "X-TTS-Cache": "hit",
        },
      });
    }

    const zai = await getZAI();
    const response = await zai.audio.tts.create({
      input: text,
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    if (buffer.length === 0) {
      return NextResponse.json({ error: "TTS returned empty audio" }, { status: 502 });
    }

    cache.set(key, { buf: buffer, ts: Date.now() });
    // opportunistic cache trim
    if (cache.size > 60) {
      const now = Date.now();
      for (const [k, v] of cache) if (now - v.ts > CACHE_TTL) cache.delete(k);
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[tts POST]", err);
    return NextResponse.json(
      { error: "Voice executor failed: " + (err as Error).message },
      { status: 500 }
    );
  }
}
