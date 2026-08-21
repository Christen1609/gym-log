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

export const TRACKS = [
  { name: "Iron Lung", artist: "Gravel Choir", len: "3:48", at: "1:12", pct: 31 },
  { name: "Slow Burn Ritual", artist: "North Facing", len: "4:22", at: "0:41", pct: 16 },
  { name: "Chalk Dust", artist: "Meridian Set", len: "3:05", at: "2:18", pct: 74 },
];

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

export interface ReadOut {
  hist: SetRow[];
  e1rm: number;
  pct: number;
  rpeDelta: number;
  status: Status;
  rpes: number[];
  spark: (height: number) => string;
}

export function readOut(name: string): ReadOut {
  const h = EX[name].hist;
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

export function loadSummary(s: { w: number; sets: number; reps: number; rpe?: number | null }, units: Units) {
  const w = toDisplayWeight(s.w, units);
  return `${w} ${units} × ${s.sets}×${s.reps}`;
}

// Canned fallback replies for the chat, keyed by intent — used when no
// GEMINI_API_KEY is configured. See src/lib/coach.ts for the real path.
export function fallbackReply(text: string): string {
  const t = text.toLowerCase();
  if (/today|what's on|whats on|plan/.test(t))
    return "Chest, next in the rotation after Monday's legs. Bench 5×5, incline DB 3×10, cable fly 3×12, dips 3×8. Bench was 82.5 at RPE 9 last time.";
  if (/deload|stall|grind/.test(t)) return COACH["Bench Press"];
  if (/rpe/.test(t))
    return "Reps left in the tank. 10 is failure, 9 is one left, 8 is two. Log it when you want a sharper trend, skip it when you are moving fast — the trend falls back to est-1RM and volume.";
  if (/squat/.test(t)) return COACH["Back Squat"];
  if (/row|back/.test(t)) return COACH["Barbell Row"];
  if (/ohp|overhead|shoulder/.test(t)) return COACH["Overhead Press"];
  if (/bench|chest/.test(t)) return COACH["Bench Press"];
  if (/progress|how am i|read/.test(t))
    return "Two moving, one grinding, one stuck. Row +14% and squat +9.5% at flat RPE. Bench is up 6.5% but RPE climbed 8 → 9 — deload it. Overhead press has not moved in five weeks.";
  return "I only judge what is in the log. Ask me about an exercise by name, or what is on today.";
}
