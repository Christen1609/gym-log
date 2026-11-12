// The coach can change the log, but only by proposing. Gemini emits raw
// "actions"; the server runs them through `sanitizeActions` (names matched
// against the lifter's own exercises, numbers clamped, dates bounded) and
// hands back typed proposals; the browser shows each one as a card and only
// writes when the lifter taps Confirm. Shared by both sides, so it must stay
// free of server-only and browser-only imports.

import { ALIAS, ROT, cardioSummary, formatHistDate, loadSummary, localISODate, setDate, toDisplayWeight, type ExerciseData, type Units } from "@/lib/gymlog";

export const MUSCLE_GROUPS = ["Chest", "Back", "Arms", "Legs", "Shoulders", "Core"];
export const ACTION_TYPES = ["log_sets", "correct_sets", "remove_sets", "set_next_day", "log_cardio"] as const;

export type CoachProposal =
  | {
      id: string;
      type: "log_sets";
      exercise: string;
      newExercise: boolean;
      muscleGroup: string | null;
      date: string;
      /** null when the lifter didn't remember it — logged as "not noted". */
      weightKg: number | null;
      /** null when the lifter didn't remember it — logged as "not noted". */
      reps: number | null;
      sets: number;
      rpe: number | null;
    }
  | { id: string; type: "correct_sets"; exercise: string; date: string; weightKg: number | null; reps: number | null; rpe: number | null }
  | { id: string; type: "remove_sets"; exercise: string; date: string }
  | { id: string; type: "set_next_day"; day: string }
  | {
      id: string;
      type: "log_cardio";
      kind: string;
      date: string;
      /** null when the lifter didn't note how long. */
      minutes: number | null;
      distanceKm: number | null;
      note: string | null;
    };

/**
 * Gemini structured-output schema for a personal chat turn. Actions are plain
 * text lines ("log_sets | exercise=Bench Press | weight_kg=82.5 | …"), not
 * typed objects: with a NUMBER field in the schema gemini-2.5-flash emitted
 * "80.000000000000014…" until the token budget ran out in about a third of
 * runs, truncating the whole reply. Written as prose-like text, 12/12 runs
 * came back clean. `parseActionLine` turns a line back into fields.
 */
export const CHAT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    add_note: { type: "STRING", nullable: true },
    resolve_note_ids: { type: "ARRAY", items: { type: "STRING" } },
    actions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["reply"],
};

/** The rules the coach is given for filling "actions". Shared with the test harness. */
export const ACTIONS_PROMPT = `You can also change the log, but only by proposing: each action becomes a card the lifter
confirms or skips, so nothing is written until they tap Confirm. Fill "actions" ONLY when they
clearly ask you to record, fix, or remove training, or to change which day is next. Never
invent sets they did not mention. An exercise that is not in the log yet is fine — add its
muscle_group. Map loose names onto the log's exact names (e.g. "shoulder press" → Overhead
Press, "cable flyes" → Cable Fly, "inclined dumbbell" → Incline Dumbbell Press).
Each action is ONE plain text line: the type, then key=value pairs, separated by " | ".
- log_sets | exercise=<name> | date=<YYYY-MM-DD; "yesterday", "the 1st" etc. relative to today; default today> | weight_kg=<number in kg; convert lb; omit if not remembered> | reps=<n; omit if not remembered> | sets=<n, default 1> | rpe=<n, only if given> | muscle_group=<${MUSCLE_GROUPS.join("/")}, only for a new exercise>
- correct_sets | exercise=<name> | date=<YYYY-MM-DD of the session to fix; omit for their latest> | then only what changes: weight_kg=, reps=, rpe=
- remove_sets | exercise=<name> | date=<YYYY-MM-DD>
- set_next_day | day=<${ROT.join("/")}>
- log_cardio | kind=<Treadmill/Run/Bike/Rowing/Stairs/Walk/…; omit if unsaid> | date=<as above; default today> | minutes=<n; omit if not remembered> | distance_km=<number; convert miles; only if given> | note=<short, only if given>
  Cardio is a record only: it does not change the rotation or any lifting numbers. Use it for
  cardio alone ("only did cardio today") or alongside lifting.
Example: "log_sets | exercise=Bench Press | date=2026-09-03 | weight_kg=82.5 | reps=5 | sets=3 | rpe=8"
Rules for a whole session described in one message:
- Different weights for one exercise → one log_sets line per weight, in the order they did them.
- "Same as last time" → use that exercise's last numbers from the log above.
- A rep range ("4 to 6") → the lower number. Skip warm-up sets.
- Reps or weight they don't remember → still log it: leave that field out and it is saved as
  "not noted". Never guess a number. In the reply, say which numbers were not noted — the app
  reminds them at their next session of that day.
- A failed set (0 reps) → do not log it.
When you propose, the reply says what you are putting up for confirmation, in one plain
line — never say it is already logged. Otherwise leave actions empty.`;

const FIELD_ALIASES: Record<string, string> = {
  weight: "weight_kg",
  kg: "weight_kg",
  load: "weight_kg",
  name: "exercise",
  group: "muscle_group",
  muscle: "muscle_group",
  rep: "reps",
  set: "sets",
};

const NOT_GIVEN =
  /^(null|none|n\/a|-|omit|unknown|\?+|not noted|not given|not remembered|don['’]?t remember|do not remember|to failure|failure|amrap|bodyweight|body weight|bw)$/i;

/** "log_sets | exercise=Bench Press | weight_kg=80" → { type, exercise, weight_kg }. */
export function parseActionLine(line: string): Record<string, unknown> | null {
  const parts = line
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const out: Record<string, unknown> = { type: parts[0].toLowerCase().replace(/[\s-]+/g, "_") };
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    // Values that mean "I don't know this number" are treated as left out, so
    // the set is logged with that number not noted instead of being dropped.
    if (!value || NOT_GIVEN.test(value)) continue;
    out[FIELD_ALIASES[key] ?? key] = value;
  }
  return out;
}

// A whole session pasted in one message is ~10 lines (several exercises,
// several weights each), so the cap has to leave room for that.
const MAX_ACTIONS = 12;
const MAX_DAYS_BACK = 400;

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.trim().replace(/\s*kg$/i, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown, lo: number, hi: number): number | null => {
  const n = num(v);
  if (n === null) return null;
  const r = Math.round(n);
  return r >= lo && r <= hi ? r : null;
};

/**
 * Exact name first, then a shorthand the composer already understands
 * ("ohp"), then a name that contains or is contained by what was said
 * ("bench" → Bench Press). Substring matching only — "Hack Squat" must not
 * become Back Squat, so aliases never match on a partial word.
 */
function matchExercise(name: string, history: Record<string, ExerciseData>): string | null {
  const wanted = name.toLowerCase();
  const names = Object.keys(history);
  const exact = names.find((n) => n.toLowerCase() === wanted);
  if (exact) return exact;
  const alias = ALIAS.find(([a]) => a === wanted)?.[1];
  if (alias && names.includes(alias)) return alias;
  return names.find((n) => wanted.includes(n.toLowerCase()) || n.toLowerCase().includes(wanted)) ?? null;
}

/** "absent" when no date was given (caller picks the default); null when it was given but unusable. */
function readDate(value: unknown, todayISO: string): string | "absent" | null {
  const s = str(value);
  if (!s) return "absent";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime()) || s > todayISO) return null;
  const today = new Date(`${todayISO}T12:00:00`);
  return (today.getTime() - d.getTime()) / 86_400_000 > MAX_DAYS_BACK ? null : s;
}

/** ISO dates of the lifter's sessions for an exercise, oldest first. */
function sessionDatesFor(exercise: string, history: Record<string, ExerciseData>, todayISO: string): string[] {
  const reference = new Date(`${todayISO}T12:00:00`);
  return (history[exercise]?.hist ?? [])
    .map((s) => setDate(s, reference))
    .filter((d): d is Date => d !== null)
    .map((d) => localISODate(d));
}

/**
 * Cardio minutes as the model might write them: "30", "30 min", "1h",
 * "1.5 hours", "45-60" (low end, like rep ranges). "unreadable" when a value
 * was given but means nothing — the caller logs time as not noted.
 */
function minutesOf(value: unknown): number | "unreadable" {
  const s = str(value)?.toLowerCase();
  if (!s) return "unreadable";
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:[-–to]+\s*\d+(?:\.\d+)?\s*)?(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?$/);
  if (!m) return "unreadable";
  const n = Number(m[1]) * (m[2] && m[2].startsWith("h") ? 60 : 1);
  return Math.round(n);
}

/** Kilometres from "5", "5 km" or "3 mi"/"3 miles"; null when unreadable. */
function kmOf(value: unknown): number | null {
  const s = str(value)?.toLowerCase();
  const m = s?.match(/^(\d+(?:\.\d+)?)\s*(km|kms|k|mi|mile|miles)?$/);
  if (!m) return null;
  const km = Number(m[1]) * (m[2] && m[2].startsWith("mi") ? 1.609 : 1);
  return km > 0 && km <= 300 ? Math.round(km * 100) / 100 : null;
}

function rpeOf(value: unknown): number | null {
  const n = num(value);
  if (n === null || n < 5 || n > 10) return null;
  return Math.round(n * 2) / 2;
}

export function sanitizeActions(raw: unknown, history: Record<string, ExerciseData>, todayISO: string): CoachProposal[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachProposal[] = [];
  const seen = new Set<string>();

  for (const item of raw.slice(0, MAX_ACTIONS * 2)) {
    if (out.length >= MAX_ACTIONS) break;
    const a = typeof item === "string" ? parseActionLine(item) : item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    if (!a) continue;
    const id = `${out.length}-${Math.random().toString(36).slice(2, 8)}`;
    let proposal: CoachProposal | null = null;

    if (a.type === "log_sets") {
      const name = str(a.exercise)?.slice(0, 60);
      // Weight and reps are optional: a number the lifter didn't remember is
      // logged as "not noted" rather than dropped. One that was given but is
      // out of range still sinks the action — that's a bad number, not a gap.
      const rawWeight = num(a.weight_kg);
      const reps = a.reps === undefined ? null : int(a.reps, 1, 100);
      const sets = int(a.sets, 1, 20) ?? 1;
      const date = readDate(a.date, todayISO);
      if (!name || date === null) continue;
      if (a.weight_kg !== undefined && (rawWeight === null || rawWeight < 0 || rawWeight > 500)) continue;
      if (a.reps !== undefined && reps === null) continue;
      const weightKg = rawWeight === null ? null : Math.round(rawWeight * 4) / 4;
      const matched = matchExercise(name, history);
      const group = str(a.muscle_group);
      const muscleGroup = group ? MUSCLE_GROUPS.find((g) => g.toLowerCase() === group.toLowerCase()) ?? null : null;
      proposal = {
        id,
        type: "log_sets",
        exercise: matched ?? name,
        newExercise: !matched,
        muscleGroup: matched ? null : muscleGroup,
        date: date === "absent" ? todayISO : date,
        weightKg,
        reps,
        sets,
        rpe: rpeOf(a.rpe),
      };
    } else if (a.type === "correct_sets" || a.type === "remove_sets") {
      const name = str(a.exercise);
      const matched = name ? matchExercise(name, history) : null;
      if (!matched) continue;
      // Only sessions that exist can be fixed or removed; a date the lifter
      // never trained that exercise on is dropped rather than proposed.
      const dates = sessionDatesFor(matched, history, todayISO);
      const given = readDate(a.date, todayISO);
      const date = given === "absent" ? dates[dates.length - 1] ?? null : given && dates.includes(given) ? given : null;
      if (!date) continue;
      if (a.type === "remove_sets") {
        proposal = { id, type: "remove_sets", exercise: matched, date };
      } else {
        const weightKg = num(a.weight_kg);
        const reps = int(a.reps, 1, 100);
        const rpe = rpeOf(a.rpe);
        const w = weightKg !== null && weightKg >= 0 && weightKg <= 500 ? Math.round(weightKg * 4) / 4 : null;
        if (w === null && reps === null && rpe === null) continue;
        proposal = { id, type: "correct_sets", exercise: matched, date, weightKg: w, reps, rpe };
      }
    } else if (a.type === "log_cardio") {
      const date = readDate(a.date, todayISO);
      // A readable but impossible time (0, 1000) sinks the card; an unreadable
      // one ("a while") is logged as time not noted, per "note down anything".
      const read = a.minutes === undefined ? "unreadable" : minutesOf(a.minutes);
      if (date === null || (read !== "unreadable" && (read < 1 || read > 600))) continue;
      const minutes = read === "unreadable" ? null : read;
      const kind = str(a.kind)?.slice(0, 40) ?? "Cardio";
      proposal = {
        id,
        type: "log_cardio",
        kind: kind.charAt(0).toUpperCase() + kind.slice(1),
        date: date === "absent" ? todayISO : date,
        minutes,
        distanceKm: kmOf(a.distance_km),
        note: str(a.note)?.slice(0, 120) ?? null,
      };
    } else if (a.type === "set_next_day") {
      const day = str(a.day);
      const match = day ? ROT.find((d) => d.toLowerCase() === day.toLowerCase()) : null;
      if (!match) continue;
      proposal = { id, type: "set_next_day", day: match };
    }

    if (!proposal) continue;
    const key = JSON.stringify({ ...proposal, id: "" });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(proposal);
  }
  return out;
}

/** One line per proposal — the card before confirming, the receipt after. */
export function proposalText(p: CoachProposal, units: Units, todayISO: string, tense: "propose" | "done"): string {
  const when = (date: string) => (date === todayISO ? "today" : formatHistDate(date));
  const w = (kg: number) => `${toDisplayWeight(kg, units)} ${units}`;
  const done = tense === "done";

  switch (p.type) {
    case "log_sets":
      return `${done ? "Logged" : "Log"} ${p.exercise}${p.newExercise ? " (new exercise)" : ""}: ${loadSummary(
        { w: p.weightKg, sets: p.sets, reps: p.reps },
        units
      )}${p.rpe ? ` @ RPE ${p.rpe}` : ""}, ${when(p.date)}.`;
    case "correct_sets": {
      const parts = [
        p.weightKg !== null ? `weight → ${w(p.weightKg)}` : null,
        p.reps !== null ? `reps → ${p.reps}` : null,
        p.rpe !== null ? `RPE → ${p.rpe}` : null,
      ].filter(Boolean);
      return `${done ? "Fixed" : "Fix"} ${p.exercise} from ${when(p.date)}: ${parts.join(", ")}.`;
    }
    case "remove_sets":
      return `${done ? "Removed" : "Remove"} ${p.exercise} from ${when(p.date)}.`;
    case "set_next_day":
      return done ? `Next day set to ${p.day}.` : `Set the next training day to ${p.day}.`;
    case "log_cardio":
      return `${done ? "Logged" : "Log"} cardio: ${cardioSummary(p)}, ${when(p.date)}.`;
  }
}
