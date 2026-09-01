// Server-only import parser: freeform workout text (from a Notion page or a
// paste) → structured sessions. Gemini does the reading when GEMINI_API_KEY is
// set — same zero-config rule as coach.ts: without a key it falls back to the
// deterministic line parser, which only recognises exercises in ALIAS.

import "server-only";
import { ALIAS, localISODate, parseDateLabel, parseLog } from "@/lib/gymlog";

export interface ImportSet {
  exercise: string;
  weight: number;
  reps: number;
  count: number;
  rpe: number | null;
  note: string | null;
}

export interface ImportSession {
  date: string; // YYYY-MM-DD
  day_label: string;
  sets: ImportSet[];
}

export interface ImportExercise {
  name: string;
  muscle_group: string | null;
  is_compound: boolean;
}

export interface ImportResult {
  sessions: ImportSession[];
  exercises: ImportExercise[];
  flags: string[];
}

const MAX_INPUT_CHARS = 60_000;

const PARSE_PROMPT = (text: string, today: string) => `You are reading a lifter's freeform workout log so it can be imported into a tracker.

Today's date is ${today}. Dates in the log may lack a year — anchor each to its most recent occurrence on or before today. Output dates as YYYY-MM-DD.

Rules:
- Extract every dated training session. A session has a date, a day label (the muscle group or day name written next to the date; infer from the exercises if absent), and its sets.
- One entry per exercise per session: weight in kg (convert if the log says lb: multiply by 0.4536), reps, count = number of sets at that weight/reps ("5x5" = count 5, reps 5), rpe if written (RPE 9, @9), note for any freeform comment on that line.
- Skip lines with no parsable load (no weight or reps) but record what you skipped in flags.
- Normalise exercise names to Title Case ("bench" → "Bench Press" only if clearly that exercise; otherwise keep the name as written).
- List every distinct exercise once in "exercises" with muscle_group (Chest, Back, Legs, Arms, Shoulders, Core or null) and is_compound.
- "flags" is 0–4 short sentences a human should eyeball: skipped lines, missing RPE coverage, ambiguous dates. No fluff.
- Invent nothing. If the text contains no workout data, return empty arrays.

The log:
"""
${text}
"""`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    sessions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          day_label: { type: "STRING" },
          sets: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                exercise: { type: "STRING" },
                weight: { type: "NUMBER" },
                reps: { type: "INTEGER" },
                count: { type: "INTEGER" },
                rpe: { type: "NUMBER", nullable: true },
                note: { type: "STRING", nullable: true },
              },
              required: ["exercise", "weight", "reps", "count"],
            },
          },
        },
        required: ["date", "day_label", "sets"],
      },
    },
    exercises: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          muscle_group: { type: "STRING", nullable: true },
          is_compound: { type: "BOOLEAN" },
        },
        required: ["name", "is_compound"],
      },
    },
    flags: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["sessions", "exercises", "flags"],
};

async function parseWithGemini(text: string, today: string): Promise<ImportResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PARSE_PROMPT(text, today) }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
    if (!res.ok) {
      console.error("Gemini parse failed", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof raw !== "string") return null;
    return sanitize(JSON.parse(raw));
  } catch (err) {
    console.error("Gemini parse errored", err);
    return null;
  }
}

/** Drops anything malformed rather than failing the whole import. */
function sanitize(raw: unknown): ImportResult {
  const out: ImportResult = { sessions: [], exercises: [], flags: [] };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;

  for (const s of Array.isArray(r.sessions) ? r.sessions : []) {
    const sess = s as Record<string, unknown>;
    if (typeof sess.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sess.date)) continue;
    const sets: ImportSet[] = [];
    for (const raw of Array.isArray(sess.sets) ? sess.sets : []) {
      const set = raw as Record<string, unknown>;
      const weight = Number(set.weight);
      const reps = Number(set.reps);
      const count = Number(set.count);
      if (typeof set.exercise !== "string" || !set.exercise.trim()) continue;
      if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) continue;
      if (!Number.isInteger(reps) || reps <= 0 || reps > 200) continue;
      if (!Number.isInteger(count) || count <= 0 || count > 30) continue;
      const rpe = Number(set.rpe);
      sets.push({
        exercise: set.exercise.trim(),
        weight,
        reps,
        count,
        rpe: Number.isFinite(rpe) && rpe > 0 && rpe <= 10 ? rpe : null,
        note: typeof set.note === "string" && set.note.trim() ? set.note.trim() : null,
      });
    }
    if (!sets.length) continue;
    out.sessions.push({
      date: sess.date,
      day_label: typeof sess.day_label === "string" && sess.day_label.trim() ? sess.day_label.trim() : "Session",
      sets,
    });
  }

  for (const e of Array.isArray(r.exercises) ? r.exercises : []) {
    const ex = e as Record<string, unknown>;
    if (typeof ex.name !== "string" || !ex.name.trim()) continue;
    out.exercises.push({
      name: ex.name.trim(),
      muscle_group: typeof ex.muscle_group === "string" && ex.muscle_group.trim() ? ex.muscle_group.trim() : null,
      is_compound: Boolean(ex.is_compound),
    });
  }

  out.flags = (Array.isArray(r.flags) ? r.flags : []).filter((f): f is string => typeof f === "string").slice(0, 4);
  out.sessions.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** No-AI fallback: date lines start sessions, parseLog reads the set lines. */
function parseDeterministic(text: string, reference: Date): ImportResult {
  const out: ImportResult = { sessions: [], exercises: [], flags: [] };
  const byDate = new Map<string, ImportSession>();
  let current: ImportSession | null = null;
  let skipped = 0;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // "31 Jul — Chest", "2026-03-12 - Legs", or a bare date.
    const dateMatch = line.match(/^(.+?)(?:\s*[—–-]\s*(.+))?$/);
    const parsedDate = dateMatch ? parseDateLabel(dateMatch[1].trim(), reference) : null;
    if (parsedDate) {
      const iso = localISODate(parsedDate);
      current = byDate.get(iso) ?? { date: iso, day_label: dateMatch?.[2]?.trim() || "Session", sets: [] };
      byDate.set(iso, current);
      continue;
    }

    const set = parseLog(line);
    if (set && current) {
      current.sets.push({
        exercise: set.name,
        weight: set.weight,
        reps: set.reps,
        count: set.sets,
        rpe: set.rpe,
        note: set.note || null,
      });
    } else {
      skipped += 1;
    }
  }

  out.sessions = [...byDate.values()].filter((s) => s.sets.length).sort((a, b) => a.date.localeCompare(b.date));
  const known = new Map(ALIAS.map(([, name]) => [name, true]));
  const seen = new Set<string>();
  for (const s of out.sessions)
    for (const set of s.sets) {
      if (!seen.has(set.exercise)) {
        seen.add(set.exercise);
        out.exercises.push({ name: set.exercise, muscle_group: null, is_compound: known.has(set.exercise) });
      }
    }
  out.flags = [
    "Parsed without AI (no GEMINI_API_KEY) — only exercises the app already knows were recognised.",
    ...(skipped ? [`${skipped} lines could not be read and were skipped.`] : []),
  ];
  return out;
}

export async function parseWorkoutText(text: string, todayISO?: string): Promise<ImportResult> {
  const clipped = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
  const today = todayISO && /^\d{4}-\d{2}-\d{2}$/.test(todayISO) ? todayISO : localISODate();

  const ai = await parseWithGemini(clipped, today);
  const result = ai ?? parseDeterministic(clipped, new Date(`${today}T12:00:00`));
  if (text.length > MAX_INPUT_CHARS) {
    result.flags = [`The log was longer than ${MAX_INPUT_CHARS.toLocaleString()} characters; the tail was not read.`, ...result.flags].slice(0, 4);
  }
  return result;
}
