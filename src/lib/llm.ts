// ─── Shared ZAI (LLM) helpers — backend only ─────────────────────────────────
import ZAI from "z-ai-web-dev-sdk";

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;
// Remember a failed ZAI.create() for 5 minutes so serverless deployments
// without SDK credentials fail fast instead of retrying on every request.
let zaiCooldownUntil = 0;

export async function getZAI() {
  if (zaiInstance) return zaiInstance;
  if (Date.now() < zaiCooldownUntil) {
    throw new Error("Z.AI SDK unavailable (cooldown after failed init)");
  }
  try {
    zaiInstance = await ZAI.create();
    return zaiInstance;
  } catch (err) {
    zaiCooldownUntil = Date.now() + 5 * 60_000;
    throw err;
  }
}

/** Robustly extract the first JSON object from an LLM completion. */
export function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  // strip markdown fences
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // direct parse
  try {
    return JSON.parse(text) as T;
  } catch {
    /* keep digging */
  }
  // find first {...} balanced-ish
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function chatJson<T>(
  systemPrompt: string,
  userPrompt: string,
  timeoutMs = 45000
): Promise<T | null> {
  try {
    const zai = await getZAI();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const completion = await zai.chat.completions.create(
      {
        messages: [
          { role: "assistant", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        thinking: { type: "disabled" },
      },
      { signal: controller.signal }
    );
    clearTimeout(timer);
    const content = completion.choices?.[0]?.message?.content ?? "";
    return extractJson<T>(content);
  } catch (err) {
    console.error("[llm] chatJson failed:", (err as Error).message);
    return null;
  }
}

export async function chatText(
  systemPrompt: string,
  userPrompt: string,
  timeoutMs = 30000
): Promise<string | null> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices?.[0]?.message?.content ?? "";
    return content.trim() || null;
  } catch (err) {
    console.error("[llm] chatText failed:", (err as Error).message);
    return null;
  }
}
