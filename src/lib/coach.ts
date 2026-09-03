// Server-only coach "judge" layer. Takes numbers the compute layer already
// produced and asks Gemini to phrase them — it may reason and judge freely,
// but it must never invent a figure that isn't already in the prompt.
// Falls back to fixed copy from the prototype when GEMINI_API_KEY isn't set,
// so the app runs with zero config. See Core app md files/SWE_S.tracker_App.md
// ("How the AI actually works") for the rule this enforces.
//
// When the request carries a signed-in user, the numbers come from THEIR log
// (see coachData.ts), plus their profile, the coach's open notes on them, and
// the recent conversation — that's what makes the coach personal.

import "server-only";
import { COACH, EX, fallbackReply, localISODate, readOut, round1, PROGRESS_EXERCISES, parseDateLabel, type ChatContext } from "@/lib/gymlog";
import { ACTIONS_PROMPT, CHAT_RESPONSE_SCHEMA, sanitizeActions, type CoachProposal } from "@/lib/coachActions";
import type { CoachUserData } from "@/lib/coachData";

const SYSTEM_PROMPT = `You are the coach voice for Gym Log, a personal workout tracker.
Voice: direct, evidence-first, no hedging, no praise, no fluff. A read is three moves:
what the number did, what that means, what to do next. One or two sentences.
Not a clone of any named coach — style only.
You will be given already-computed numbers (est 1RM, percent change, RPE trend). You may
reason and judge freely, but you must NEVER state a number that is not given to you below.
Respect the lifter's profile: their goal shapes what you push, their injuries shape what
you avoid, their notes are things you observed before — act on them.
If asked something the log can't answer, say so directly: "I only judge what is in the log."`;

interface GeminiCallOptions {
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  /** Thinking tokens to allow. Counts against maxTokens on 2.5-era models. */
  thinking?: number;
}

async function callGemini({ prompt, json = false, maxTokens = 400, thinking = 0 }: GeminiCallOptions): Promise<string | null> {
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
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: maxTokens,
          // Coach replies are short; left unbounded, 2.5-era models spend the
          // whole token budget on hidden "thinking" and the reply truncates.
          thinkingConfig: { thinkingBudget: thinking },
          ...(json ? { responseMimeType: "application/json", responseSchema: CHAT_RESPONSE_SCHEMA } : {}),
        },
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

// ── the personal context block ───────────────────────────────────────────

/** The exercises worth telling the coach about: most recently trained first. */
function topExercises(data: CoachUserData, cap = 8): string[] {
  const reference = new Date();
  return Object.entries(data.history)
    .filter(([, ex]) => ex.hist.length > 0)
    .map(([name, ex]) => {
      const lastLabel = ex.hist[ex.hist.length - 1].date;
      return { name, time: parseDateLabel(lastLabel, reference)?.getTime() ?? 0 };
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, cap)
    .map((e) => e.name);
}

function numbersBlock(data: CoachUserData): string {
  const names = topExercises(data);
  if (!names.length) return "No sessions logged yet.";
  return names
    .map((name) => {
      const ro = readOut(name, data.history);
      const last = ro.hist[ro.hist.length - 1];
      const rpe = ro.rpes.length ? `, RPE ${ro.rpes[0]} → ${ro.rpes[ro.rpes.length - 1]}` : "";
      return `${name}: last ${last.date} ${last.w} kg ${last.sets}×${last.reps}, est 1RM ${round1(ro.e1rm)} kg, ${
        ro.pct >= 0 ? "+" : ""
      }${round1(ro.pct)}% over ${ro.hist.length} sessions${rpe}, status ${ro.status}`;
    })
    .join("\n");
}

function profileBlock(data: CoachUserData): string {
  const p = data.profile;
  if (!p) return "No profile set.";
  return [
    p.goal ? `Goal: ${p.goal}` : null,
    p.experience ? `Experience: ${p.experience}` : null,
    p.days_per_week ? `Trains ${p.days_per_week} days/week` : null,
    p.injuries ? `Injuries / limitations: ${p.injuries}` : null,
    p.preferences ? `Preferences: ${p.preferences}` : null,
  ]
    .filter(Boolean)
    .join("\n") || "No profile set.";
}

function notesBlock(data: CoachUserData): string {
  if (!data.notes.length) return "None.";
  return data.notes.map((n) => `[${n.id}] ${n.note} (noted ${n.created_at.slice(0, 10)})`).join("\n");
}

function recentBlock(data: CoachUserData): string {
  if (!data.recent.length) return "First conversation.";
  return data.recent.map((m) => `${m.who === "user" ? "Lifter" : "You"}: ${m.text}`).join("\n");
}

function personalContext(data: CoachUserData, context: ChatContext): string {
  const todayFacts = [
    context.todayLabel ? `Today: ${context.todayLabel}` : null,
    context.nextDay ? `Next training day: ${context.nextDay}` : null,
    context.lastSessionDay && context.lastSessionDate
      ? `Last completed session: ${context.lastSessionDay} on ${context.lastSessionDate}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `Lifter profile:
${profileBlock(data)}

Your open notes on this lifter (from earlier conversations):
${notesBlock(data)}

Current date and rotation facts:
${todayFacts || "No current date facts were provided."}

This lifter's computed numbers (their real log — do not invent others):
${numbersBlock(data)}

Recent conversation:
${recentBlock(data)}`;
}

// ── exercise read ────────────────────────────────────────────────────────

export async function judgeExercise(name: string, data?: CoachUserData): Promise<string> {
  const history = data && data.history[name]?.hist.length ? data.history : undefined;
  if (!history && !(name in COACH)) return "I don't have history for that exercise yet.";

  const gemini = await callGemini({ prompt: buildExercisePrompt(name, history, data) });
  return gemini ?? COACH[name] ?? "I don't have history for that exercise yet.";
}

function buildExercisePrompt(name: string, history: CoachUserData["history"] | undefined, data?: CoachUserData): string {
  const ro = readOut(name, history ?? EX);
  const rpeLine = ro.rpes.length
    ? `RPE ${ro.rpes[0]} → ${ro.rpes[ro.rpes.length - 1]}`
    : "RPE not logged this stretch";
  const profile = data ? `Lifter profile:\n${profileBlock(data)}\n\nYour open notes on this lifter:\n${notesBlock(data)}\n\n` : "";
  return `${profile}Exercise: ${name}
Computed numbers (do not alter, do not invent others):
- est 1RM now: ${round1(ro.e1rm)} kg
- change over the tracked window: ${ro.pct >= 0 ? "+" : ""}${round1(ro.pct)}%
- ${rpeLine}
- status: ${ro.status}

Write the coach's read of this exercise.`;
}

// ── chat ─────────────────────────────────────────────────────────────────

export interface CoachChatResult {
  text: string;
  addNote: string | null;
  resolveNoteIds: string[];
  /** Log changes the coach wants to make — nothing is written until the lifter confirms. */
  proposals: CoachProposal[];
}

const EMPTY: Omit<CoachChatResult, "text"> = { addNote: null, resolveNoteIds: [], proposals: [] };

function todayISOFrom(context: ChatContext): string {
  return context.todayISO && /^\d{4}-\d{2}-\d{2}$/.test(context.todayISO) ? context.todayISO : localISODate();
}

export async function judgeChat(message: string, context: ChatContext = {}, data?: CoachUserData): Promise<CoachChatResult> {
  const prompt = data ? buildPersonalChatPrompt(message, context, data) : buildSeedChatPrompt(message, context);
  const raw = await callGemini(data ? { prompt, json: true, maxTokens: 700 } : { prompt, maxTokens: 200 });

  if (raw === null) return { text: fallbackReply(message, context), ...EMPTY };
  if (!data) return { text: raw, ...EMPTY };

  try {
    const parsed = JSON.parse(raw) as { reply?: unknown; add_note?: unknown; resolve_note_ids?: unknown; actions?: unknown };
    const knownIds = new Set(data.notes.map((n) => n.id));
    return {
      text: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : fallbackReply(message, context),
      addNote: typeof parsed.add_note === "string" && parsed.add_note.trim() ? parsed.add_note.trim() : null,
      resolveNoteIds: (Array.isArray(parsed.resolve_note_ids) ? parsed.resolve_note_ids : []).filter(
        (id): id is string => typeof id === "string" && knownIds.has(id)
      ),
      proposals: sanitizeActions(parsed.actions, data.history, todayISOFrom(context)),
    };
  } catch {
    // Truncated or malformed JSON: keep the reply if it made it out intact,
    // and drop the actions rather than guess at them.
    console.error("Coach JSON parse failed", raw.slice(0, 200));
    const salvaged = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const text = salvaged ? JSON.parse(`"${salvaged[1]}"`) : fallbackReply(message, context);
    return { text, ...EMPTY };
  }
}

function buildPersonalChatPrompt(message: string, context: ChatContext, data: CoachUserData): string {
  const known = Object.keys(data.history).join(", ") || "none yet";
  return `${personalContext(data, context)}

Exercises in this lifter's log (use these exact names): ${known}
Today's date: ${todayISOFrom(context)}

The lifter now asks: "${message}"

Answer as the coach, personally — their goal, injuries, notes and numbers above are yours to use.
Also maintain your notes: if the lifter reports something worth remembering across sessions
(pain, a constraint, a schedule change, a preference), set add_note to one short sentence.
If they say an existing note no longer applies, put that note's id in resolve_note_ids.
Otherwise leave add_note null and resolve_note_ids empty. Never note trivia.

${ACTIONS_PROMPT}
Return JSON: {"reply": "...", "add_note": null, "resolve_note_ids": [], "actions": []}.`;
}

function buildSeedChatPrompt(message: string, context: ChatContext): string {
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

// ── weekly check-in ──────────────────────────────────────────────────────

export async function weeklyCheckin(data: CoachUserData, context: ChatContext = {}): Promise<string | null> {
  const prompt = `${personalContext(data, context)}

It has been at least a week since your last check-in. Open the conversation yourself with a
weekly read of this lifter's log: what moved, what stalled, and the one thing to change or
keep doing this week. Three or four sentences at most, grounded only in the numbers above.
Do not greet, do not summarise your role — go straight to the read.`;

  return callGemini({ prompt, maxTokens: 350 });
}
