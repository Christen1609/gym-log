// The one Gemini adapter. Every server-side call to the model (coach replies,
// the import parser) goes through generate(): it reads the key and model from
// the environment, and returns the model's text or null. Null covers every
// way it can fail (no key, HTTP error, network error, empty reply), so callers
// only ever decide what to fall back to.

import "server-only";

export interface GenerateOptions {
  prompt: string;
  /** System instruction, if any. */
  system?: string;
  /** JSON schema the reply must follow; sets a JSON response type. */
  schema?: object;
  temperature: number;
  maxTokens: number;
  /** Thinking-token budget. Left out, the model's own default applies. */
  thinking?: number;
  /** Names the caller in error logs. */
  label: string;
}

export async function generate(o: GenerateOptions): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: o.prompt }] }],
        generationConfig: {
          temperature: o.temperature,
          maxOutputTokens: o.maxTokens,
          ...(o.thinking !== undefined ? { thinkingConfig: { thinkingBudget: o.thinking } } : {}),
          ...(o.schema ? { responseMimeType: "application/json", responseSchema: o.schema } : {}),
        },
      }),
    });
    if (!res.ok) {
      console.error(`${o.label} failed`, res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" ? text : null;
  } catch (err) {
    console.error(`${o.label} errored`, err);
    return null;
  }
}
