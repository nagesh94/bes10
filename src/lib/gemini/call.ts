import { GEMINI_API_KEY, GEMINI_FALLBACK_MODELS, GEMINI_MODEL } from "@/lib/env";

/**
 * One structured-output call to Gemini over plain REST.
 *
 * No SDK — one endpoint, one JSON body, and no dependency to keep current.
 * `responseSchema` pins the shape of what comes back; the caller decides
 * whether the values are right.
 *
 * 429 and 503 are Gemini saying "busy". A model under load can stay busy for
 * minutes, so after one retry the next model in the list is tried instead of
 * waiting on the same one. A 404 is a retired model and is skipped at once.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type GeminiJson = { ok: true; json: unknown } | { ok: false; error: string };

export function geminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

export async function callGeminiJson(parts: GeminiPart[], responseSchema: object): Promise<GeminiJson> {
  if (!GEMINI_API_KEY) return { ok: false, error: "GEMINI_API_KEY is not set." };

  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema },
  });

  const models = [...new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS])];
  let res: Response | null = null;
  let lastError = "Could not reach Gemini.";
  outer: for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      try {
        res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
          body,
          signal: AbortSignal.timeout(45_000),
        });
      } catch (err) {
        res = null;
        lastError = `Could not reach Gemini: ${(err as Error).message}`;
        continue;
      }
      if (res.ok) break outer;
      if (res.status === 404) continue outer;
      if (res.status !== 429 && res.status !== 503) break outer;
    }
  }
  if (!res) return { ok: false, error: lastError };

  if (!res.ok) {
    // The body names the problem (bad key, quota, unknown model) and never echoes the key.
    const errText = await res.text().catch(() => "");
    const message = /"message"\s*:\s*"([^"]+)"/.exec(errText)?.[1] ?? res.statusText;
    return { ok: false, error: `Gemini answered ${res.status}: ${message}` };
  }

  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  try {
    return { ok: true, json: JSON.parse(raw) };
  } catch {
    return { ok: false, error: "Gemini returned something that is not JSON." };
  }
}
