// Server-only coach "judge" layer. Takes numbers the compute layer already
// produced and asks Gemini to phrase them — it may reason and judge freely,
// but it must never invent a figure that isn't already in the prompt.
// Falls back to fixed copy from the prototype when GEMINI_API_KEY isn't set,
// so the app runs with zero config. See Core app md files/SWE_S.tracker_App.md
// ("How the AI actually works") for the rule this enforces.

import "server-only";
import { COACH, fallbackReply, readOut, round1, PROGRESS_EXERCISES, type ChatContext } from "@/lib/gymlog";

const SYSTEM_PROMPT = `You are the coach voice for Gym Log, a personal workout tracker.
Voice: direct, evidence-first, no hedging, no praise, no fluff. A read is three moves:
what the number did, what that means, what to do next. One or two sentences.
Not a clone of any named coach — style only.
You will be given already-computed numbers (est 1RM, percent change, RPE trend). You may
reason and judge freely, but you must NEVER state a number that is not given to you below.
If asked something the log can't answer, say so directly: "I only judge what is in the log."`;

interface GeminiCallOptions {
  prompt: string;
}

async function callGemini({ prompt }: GeminiCallOptions): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 200 },
      }),
    });
    if (!res.ok) {
      console.error("Gemini request failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" ? text.trim() : null;
  } catch (err) {
    console.error("Gemini request errored", err);
    return null;
  }
}

export async function judgeExercise(name: string): Promise<string> {
  if (!(name in COACH)) return "I don't have history for that exercise yet.";

  const gemini = await callGemini({
    prompt: buildExercisePrompt(name),
  });
  return gemini ?? COACH[name];
}

function buildExercisePrompt(name: string): string {
  const ro = readOut(name);
  const rpeLine = ro.rpes.length
    ? `RPE ${ro.rpes[0]} → ${ro.rpes[ro.rpes.length - 1]}`
    : "RPE not logged this stretch";
  return `Exercise: ${name}
Computed numbers (do not alter, do not invent others):
- est 1RM now: ${round1(ro.e1rm)} kg
- change over the tracked window: ${ro.pct >= 0 ? "+" : ""}${round1(ro.pct)}%
- ${rpeLine}
- status: ${ro.status}

Write the coach's read of this exercise.`;
}

export async function judgeChat(message: string, context: ChatContext = {}): Promise<string> {
  const gemini = await callGemini({ prompt: buildChatPrompt(message, context) });
  return gemini ?? fallbackReply(message, context);
}

function buildChatPrompt(message: string, context: ChatContext): string {
  const numbers = PROGRESS_EXERCISES.map((name) => {
    const ro = readOut(name);
    return `${name}: est 1RM ${round1(ro.e1rm)} kg, ${ro.pct >= 0 ? "+" : ""}${round1(ro.pct)}%, status ${ro.status}`;
  }).join("\n");
  const todayFacts = [
    context.todayLabel ? `Today: ${context.todayLabel}` : null,
    context.nextDay ? `Next training day: ${context.nextDay}` : null,
    context.lastSessionDay && context.lastSessionDate
      ? `Last completed session: ${context.lastSessionDay} on ${context.lastSessionDate}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `The lifter asks: "${message}"

Current date and rotation facts:
${todayFacts || "No current date facts were provided."}

Computed numbers available to you (do not invent others):
${numbers}

Answer as the coach. If the question isn't about training data you have, say you only judge what is in the log.`;
}
