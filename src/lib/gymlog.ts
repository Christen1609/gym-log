// Gym Log domain logic — seed data, compute layer, and the deterministic
// text parser. Ported from the Claude Design prototype (Gym Log.dc.html).
//
// The spec's rule (see Core app md files/SWE_S.tracker_App.md) holds here too:
// compute is deterministic code, never the LLM. Only the coach's *phrasing*
// (see src/lib/coach.ts) goes through Gemini, and it may never invent a
// number that isn't already produced below.

export type Units = "kg" | "lb";
export type Status = "up" | "grind" | "flat" | "down";

export interface SetRow {
  date: string;
  w: number;
  sets: number;
  reps: number;
  rpe: number | null;
  note?: string;
}

export interface ExerciseData {
  group: string;
  hist: SetRow[];
}

export const EX: Record<string, ExerciseData> = {
  "Bench Press": {
    group: "Chest · compound",
    hist: [
      { date: "Jul 3", w: 77.5, sets: 5, reps: 5, rpe: 8, note: "smooth" },
      { date: "Jul 10", w: 80, sets: 5, reps: 5, rpe: 8, note: "solid" },
      { date: "Jul 17", w: 80, sets: 5, reps: 5, rpe: 8.5, note: "last set slowed" },
      { date: "Jul 24", w: 82.5, sets: 4, reps: 4, rpe: 9, note: "grindy" },
      { date: "Jul 31", w: 82.5, sets: 5, reps: 5, rpe: 9, note: "last set heavy" },
    ],
  },
  "Incline Dumbbell Press": {
    group: "Chest · accessory",
    hist: [
      { date: "Jul 17", w: 30, sets: 3, reps: 10, rpe: 8, note: "clean" },
      { date: "Jul 24", w: 32, sets: 3, reps: 9, rpe: 8, note: "ok" },
      { date: "Jul 31", w: 32, sets: 3, reps: 10, rpe: 8, note: "easier" },
    ],
  },
  "Cable Fly": {
    group: "Chest · isolation",
    hist: [
      { date: "Jul 17", w: 15, sets: 3, reps: 12, rpe: null, note: "" },
      { date: "Jul 24", w: 17.5, sets: 3, reps: 12, rpe: null, note: "" },
      { date: "Jul 31", w: 17.5, sets: 3, reps: 12, rpe: 7, note: "good stretch" },
    ],
  },
  "Weighted Dip": {
    group: "Chest · compound",
    hist: [
      { date: "Jul 17", w: 10, sets: 3, reps: 8, rpe: 8, note: "" },
      { date: "Jul 24", w: 12.5, sets: 3, reps: 8, rpe: 8.5, note: "" },
      { date: "Jul 31", w: 15, sets: 3, reps: 8, rpe: 8.5, note: "strong" },
    ],
  },
  "Barbell Row": {
    group: "Back · compound",
    hist: [
      { date: "Jul 4", w: 70, sets: 4, reps: 8, rpe: 8, note: "" },
      { date: "Jul 11", w: 72.5, sets: 4, reps: 8, rpe: 8, note: "" },
      { date: "Jul 18", w: 75, sets: 4, reps: 8, rpe: 8, note: "" },
      { date: "Jul 25", w: 77.5, sets: 4, reps: 8, rpe: 8, note: "" },
      { date: "Aug 1", w: 80, sets: 4, reps: 8, rpe: 8, note: "" },
    ],
  },
  "Overhead Press": {
    group: "Arms · compound",
    hist: [
      { date: "Jul 6", w: 47.5, sets: 5, reps: 5, rpe: 8, note: "" },
      { date: "Jul 13", w: 47.5, sets: 5, reps: 5, rpe: 8, note: "" },
      { date: "Jul 20", w: 50, sets: 5, reps: 4, rpe: 9, note: "" },
      { date: "Jul 27", w: 47.5, sets: 5, reps: 5, rpe: 8.5, note: "" },
      { date: "Aug 3", w: 47.5, sets: 5, reps: 5, rpe: 8.5, note: "" },
    ],
  },
  "Back Squat": {
    group: "Legs · compound",
    hist: [
      { date: "Jul 8", w: 105, sets: 5, reps: 5, rpe: 8, note: "" },
      { date: "Jul 15", w: 107.5, sets: 5, reps: 5, rpe: 8, note: "" },
      { date: "Jul 22", w: 110, sets: 5, reps: 5, rpe: 8, note: "" },
      { date: "Jul 29", w: 110, sets: 5, reps: 5, rpe: 7.5, note: "" },
      { date: "Aug 5", w: 115, sets: 5, reps: 5, rpe: 8, note: "" },
    ],
  },
};

export const ALIAS: [string, string][] = [
  ["incline", "Incline Dumbbell Press"],
  ["bench", "Bench Press"],
  ["fly", "Cable Fly"],
  ["flye", "Cable Fly"],
  ["dip", "Weighted Dip"],
  ["row", "Barbell Row"],
  ["squat", "Back Squat"],
  ["ohp", "Overhead Press"],
  ["overhead", "Overhead Press"],
  ["shoulder press", "Overhead Press"],
];

export const ROT = ["Chest", "Back", "Arms", "Legs"];
export const PLAN = ["Bench Press", "Incline Dumbbell Press", "Cable Fly", "Weighted Dip"];

export const THINKING = [
  "Locking in…",
  "Cooking…",
  "Running the numbers…",
  "Reading the tape…",
  "No glazing…",
  "Mogging your last set…",
  "Weighing it up…",
  "Doing the math…",
  "Chasing the pump…",
  "Checking your ego…",
];

export const LABEL: Record<Status, string> = {
  up: "Progressing",
  grind: "Grinding",
  flat: "Stalling",
  down: "Regressing",
};
export const TAGC: Record<Status, string> = {
  up: "tag-accent-2",
  grind: "tag-accent",
  flat: "tag-neutral",
  down: "tag-accent",
};

// Fallback coach copy — used when no GEMINI_API_KEY is configured, so the
// app is fully functional out of the box. See src/lib/coach.ts.
export const COACH: Record<string, string> = {
  "Bench Press":
    "Up 6.5% in four weeks, but RPE went 8 → 9 for the same work. That is grinding, not progressing. Drop to 72.5 for a week, then come back at 82.5 and it should feel like an 8.",
  "Barbell Row":
    "Clean 14% over five sessions at a flat RPE 8. Nothing to fix. Keep adding 2.5 kg a week until the last set slows down.",
  "Overhead Press":
    "Flat for five weeks. You went to 50, missed reps, and backed off. Change the stimulus: 3×8 at 42.5 for two weeks, then retest the 5×5.",
  "Back Squat":
    "Up 9.5% and RPE actually fell at 110 before you jumped to 115. Bar speed is there. Push it — 117.5 next.",
  "Incline Dumbbell Press":
    "Same load, one more rep, same RPE. Real progress, just small. Move to 34 when you hit 3×10 at RPE 7.",
  "Cable Fly":
    "Isolation with almost no RPE logged, so the trend is coarse. Load is stable. Fine as it is.",
  "Weighted Dip":
    "Added weight went 10 → 15 in three sessions, est 1RM up 50%, RPE holding at 8.5. Fastest mover you have. Keep going.",
};

export const PROGRESS_EXERCISES = ["Bench Press", "Barbell Row", "Overhead Press", "Back Squat"];

// ── compute (deterministic, never the LLM) ──────────────────────────────

export const epley = (w: number, r: number) => w * (1 + r / 30);
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const toDisplayWeight = (w: number, units: Units) =>
  units === "lb" ? Math.round(w * 2.2046 * 2) / 2 : w;

export interface TodayInfo {
  iso: string;
  weekday: string;
  shortDate: string;
  label: string;
}

export interface LastSessionInfo {
  day: string;
  date: string;
  exercise: string;
  time: number;
}

export interface ChatContext {
  todayLabel?: string;
  /** The lifter's local date (YYYY-MM-DD) — anchors "today"/"yesterday" in coach actions. */
  todayISO?: string;
  nextDay?: string;
  lastSessionDay?: string;
  lastSessionDate?: string;
}

export function localISODate(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function getTodayInfo(date = new Date()): TodayInfo {
  const weekday = date.toLocaleDateString("en-AU", { weekday: "long" });
  const shortDate = date.toLocaleDateString("en-AU", { month: "short", day: "numeric" });
  return {
    iso: localISODate(date),
    weekday,
    shortDate,
    label: `${weekday}, ${shortDate}`,
  };
}

export function parseDateLabel(label: string, reference = new Date()): Date | null {
  const isoMatch = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const parsed = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(`${label} ${reference.getFullYear()}`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() > reference.getTime()) parsed.setFullYear(parsed.getFullYear() - 1);
  return parsed;
}

export function muscleFromGroup(group: string): string {
  return group.split(" · ")[0] || group;
}

export function nextRotationDay(afterDay: string): string {
  const idx = ROT.findIndex((day) => day.toLowerCase() === afterDay.toLowerCase());
  return ROT[(idx + 1 + ROT.length) % ROT.length] ?? ROT[0];
}

export function findLatestSession(
  data: Record<string, ExerciseData> = EX,
  reference = new Date()
): LastSessionInfo | null {
  let latest: LastSessionInfo | null = null;

  for (const [exercise, exerciseData] of Object.entries(data)) {
    for (const set of exerciseData.hist) {
      const parsed = parseDateLabel(set.date, reference);
      if (!parsed) continue;
      const time = parsed.getTime();
      if (!latest || time > latest.time) {
        latest = {
          day: muscleFromGroup(exerciseData.group),
          date: set.date,
          exercise,
          time,
        };
      }
    }
  }

  return latest;
}

/** Whole calendar days from `from` to `to`, ignoring the time of day. */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Snaps a stored muscle-group label onto the canonical rotation entry. */
export function normalizeDay(day: string): string {
  return ROT.find((d) => d.toLowerCase() === day.trim().toLowerCase()) ?? ROT[0];
}

export interface DayResolution {
  /** The rotation day that is on today. */
  day: string;
  lastSession: LastSessionInfo | null;
  /** Whole days since the last logged session; null when nothing is logged. */
  daysSinceLast: number | null;
  /** True when the last logged session is dated today. */
  loggedToday: boolean;
}

/**
 * Works out which rotation day today is with no input from the user: the
 * calendar decides whether the last logged session is already done (today
 * stays on that day) or is history (the rotation advances one).
 */
export function resolveDay(
  data: Record<string, ExerciseData> = EX,
  reference = new Date()
): DayResolution {
  const lastSession = findLatestSession(data, reference);
  if (!lastSession) {
    return { day: ROT[0], lastSession: null, daysSinceLast: null, loggedToday: false };
  }

  const daysSinceLast = daysBetween(new Date(lastSession.time), reference);
  const loggedToday = daysSinceLast <= 0;
  const day = loggedToday ? normalizeDay(lastSession.day) : nextRotationDay(lastSession.day);

  return { day, lastSession, daysSinceLast, loggedToday };
}

/**
 * The exercises that belong to a rotation day, taken from whatever history the
 * user actually has. Empty when nothing has been logged against that day yet —
 * the screen says so rather than showing another day's work.
 */
export function planForDay(day: string, data: Record<string, ExerciseData> = EX): string[] {
  const target = normalizeDay(day).toLowerCase();
  return Object.entries(data)
    .filter(([, d]) => d.hist.length > 0 && muscleFromGroup(d.group).toLowerCase() === target)
    .map(([name]) => name);
}

export interface ReadOut {
  hist: SetRow[];
  e1rm: number;
  pct: number;
  rpeDelta: number;
  status: Status;
  rpes: number[];
  spark: (height: number) => string;
}

// `data` defaults to the bundled seed so the app still computes with zero
// config. Once Supabase is connected the hook passes the user's real history
// in, and every figure on screen recomputes from it.
export function readOut(name: string, data: Record<string, ExerciseData> = EX): ReadOut {
  const h = data[name]?.hist ?? [];

  // A brand-new account, or an exercise never logged: report a flat, empty
  // trend rather than throwing. The UI renders this as "not logged".
  if (h.length === 0) {
    return { hist: [], e1rm: 0, pct: 0, rpeDelta: 0, status: "flat", rpes: [], spark: () => "" };
  }

  const e = h.map((s) => epley(s.w, s.reps));
  const first = e[0];
  const last = e[e.length - 1];
  const pct = ((last - first) / first) * 100;
  const rpes = h.map((s) => s.rpe).filter((v): v is number => v !== null && v !== undefined);
  const rpeDelta = rpes.length > 1 ? rpes[rpes.length - 1] - rpes[0] : 0;

  let status: Status = "flat";
  if (pct >= 2.5) status = rpeDelta > 0.25 ? "grind" : "up";
  else if (pct < -2.5) status = "down";

  const min = Math.min(...e);
  const max = Math.max(...e);
  const span = max - min || 1;

  return {
    hist: h,
    e1rm: last,
    pct,
    rpeDelta,
    status,
    rpes,
    spark: (hgt: number) =>
      e
        .map(
          (v, i) =>
            ((i / (e.length - 1)) * 100).toFixed(1) +
            "," +
            (hgt - 2 - ((v - min) / span) * (hgt - 4)).toFixed(1)
        )
        .join(" "),
  };
}

export interface ParsedSet {
  name: string;
  weight: number;
  sets: number;
  reps: number;
  rpe: number | null;
  note: string;
}

// The composer routes itself: a question goes to chat, a recognizable
// log goes to the parse-confirmation sheet, anything else falls back to
// chat (never an error). See "The composer routes itself" in the design doc.
export function parseLog(text: string): ParsedSet | null {
  const t = text.toLowerCase().trim();
  const isQuestion = /\?|^(what|why|how|should|am|is|are|can|when|do|does|give|tell)\b/.test(t);

  let name: string | null = null;
  for (const [alias, exercise] of ALIAS) {
    if (t.indexOf(alias) >= 0) {
      name = exercise;
      break;
    }
  }

  const setsReps = t.match(/(\d+)\s*[x×]\s*(\d+)/);
  const nums = t.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs)?/g) ?? [];
  const rpeMatch = t.match(/(?:@|rpe\s*)(\d+(?:\.\d+)?)/);

  let weight: number | null = null;
  const weightMatch = t.match(/(\d+(?:\.\d+)?)\s*kg/) ?? (nums.length ? t.match(/(\d+(?:\.\d+)?)/) : null);
  if (weightMatch) weight = parseFloat(weightMatch[1]);

  if (isQuestion || !name || weight === null || !setsReps) return null;

  const noteMatch = t.match(/,\s*(.+)$/);
  return {
    name,
    weight,
    sets: parseInt(setsReps[1], 10),
    reps: parseInt(setsReps[2], 10),
    rpe: rpeMatch ? parseFloat(rpeMatch[1]) : null,
    note: noteMatch ? noteMatch[1].trim() : "",
  };
}

// ── history collapse ─────────────────────────────────────────────────────
// Shared by the browser (db.ts) and the coach's server route, which query the
// same tables and need the identical per-exercise shape the UI computes from.

export interface HistoryExerciseRow {
  id: string;
  name: string;
  muscle_group: string | null;
  is_compound: boolean;
}

export interface HistorySetRow {
  exercise_id: string;
  session_id: string;
  weight: number;
  reps: number;
  rpe: number | null;
  felt_note: string | null;
  date: string; // the session's ISO date
}

/** Short month-day label ("Jul 31") — the format the UI renders. */
export function formatHistDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Chest · compound" — rebuilt from the columns the schema actually stores. */
export function historyGroupLabel(row: { muscle_group: string | null; is_compound: boolean }): string {
  const kind = row.is_compound ? "compound" : "accessory";
  return row.muscle_group ? `${row.muscle_group} · ${kind}` : kind;
}

/**
 * Collapses raw set rows back into the per-exercise shape the UI computes
 * from: one entry per exercise per session, carrying that session's top set
 * and its set count.
 */
export function collapseHistory(exercises: HistoryExerciseRow[], sets: HistorySetRow[]): Record<string, ExerciseData> {
  type Dated = SetRow & { _iso: string };
  const byExercise = new Map<string, Map<string, Dated>>();

  for (const row of sets) {
    if (!byExercise.has(row.exercise_id)) byExercise.set(row.exercise_id, new Map());
    const sessions = byExercise.get(row.exercise_id)!;
    const existing = sessions.get(row.session_id);

    if (!existing) {
      sessions.set(row.session_id, {
        date: formatHistDate(row.date),
        w: Number(row.weight),
        sets: 1,
        reps: Number(row.reps),
        rpe: row.rpe === null ? null : Number(row.rpe),
        note: row.felt_note ?? "",
        _iso: row.date,
      });
    } else {
      existing.sets += 1;
      // The heaviest set of a session is the one the UI reports as the load.
      if (Number(row.weight) > existing.w) {
        existing.w = Number(row.weight);
        existing.reps = Number(row.reps);
      }
      if (row.rpe !== null) existing.rpe = Number(row.rpe);
      if (row.felt_note) existing.note = row.felt_note;
    }
  }

  const result: Record<string, ExerciseData> = {};
  for (const ex of exercises) {
    const sessions = byExercise.get(ex.id);
    const hist = sessions ? [...sessions.values()].sort((a, b) => a._iso.localeCompare(b._iso)) : [];
    result[ex.name] = { group: historyGroupLabel(ex), hist };
  }
  return result;
}

export function loadSummary(s: { w: number; sets: number; reps: number; rpe?: number | null }, units: Units) {
  const w = toDisplayWeight(s.w, units);
  return `${w} ${units} × ${s.sets}×${s.reps}`;
}

// Canned fallback replies for the chat, keyed by intent — used when no
// GEMINI_API_KEY is configured. See src/lib/coach.ts for the real path.
export function fallbackReply(text: string, context: ChatContext = {}): string {
  const t = text.toLowerCase();
  if (/today|what's on|whats on|plan/.test(t)) {
    const next = context.nextDay ?? "Chest";
    const last =
      context.lastSessionDay && context.lastSessionDate
        ? ` after ${context.lastSessionDay.toLowerCase()} on ${context.lastSessionDate}`
        : "";
    const today = context.todayLabel ? ` Today is ${context.todayLabel}.` : "";
    return `${next} is next in the rotation${last}.${today} Bench 5x5, incline DB 3x10, cable fly 3x12, dips 3x8.`;
  }
  if (/deload|stall|grind/.test(t)) return COACH["Bench Press"];
  if (/rpe/.test(t))
    return "Reps left in the tank. 10 is failure, 9 is one left, 8 is two. Log it when you want a sharper trend, skip it when you are moving fast - the trend falls back to est-1RM and volume.";
  if (/squat/.test(t)) return COACH["Back Squat"];
  if (/row|back/.test(t)) return COACH["Barbell Row"];
  if (/ohp|overhead|shoulder/.test(t)) return COACH["Overhead Press"];
  if (/bench|chest/.test(t)) return COACH["Bench Press"];
  if (/progress|how am i|read/.test(t))
    return "Two moving, one grinding, one stuck. Row +14% and squat +9.5% at flat RPE. Bench is up 6.5% but RPE climbed 8 to 9 - deload it. Overhead press has not moved in five weeks.";
  return "I only judge what is in the log. Ask me about an exercise by name, or what is on today.";
}
