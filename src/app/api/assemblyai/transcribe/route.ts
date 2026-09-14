import { NextRequest, NextResponse } from "next/server";
import { isAssemblyAIConfigured, transcribeAudio } from "@/lib/assemblyai";
import type { AudioIntel } from "@/lib/agents/types";

export const dynamic = "force-dynamic";

// GET /api/assemblyai/transcribe → { configured: boolean }
// Powers the UI status chip (LIVE vs DEMO MODE).
export async function GET() {
  return NextResponse.json({ configured: isAssemblyAIConfigured() });
}

// POST /api/assemblyai/transcribe — the VOICE INTAKE endpoint.
// Body: { audioBase64?: string, sampleId?: string }
// Returns AudioIntel: transcript + aggregated sentiment + confidence.
// The API key stays server-side; the client never sees AssemblyAI credentials.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : undefined;
    const sampleId = typeof body.sampleId === "string" ? body.sampleId : undefined;
    if (!audioBase64 && !sampleId) {
      return NextResponse.json(
        { error: "Provide audioBase64 (recorded/uploaded audio) or sampleId (bundled sample)." },
        { status: 400 }
      );
    }
    const intel: AudioIntel = await transcribeAudio({ audioBase64, sampleId });
    return NextResponse.json(intel);
  } catch (err) {
    const message = (err as Error).message || "Transcription failed";
    // 400 → actionable client-side guidance (missing key / bad request body);
    // 502 → upstream AssemblyAI problem.
    const status = /not configured|No audio|Empty audio|demo mode only|API key/.test(message)
      ? 400
      : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
