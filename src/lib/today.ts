// What's on today: the rotation day (worked out from the log, or picked by
// hand for today only), how long since the last training, and whether the
// "log your last workout?" nudge is due. Plain functions over plain data so
// every rule here is testable without React; useGymLog only stores the
// inputs and renders the result.

import {
  daysSinceTraining,
  findLatestSession,
  getTodayInfo,
  isoDaysAgo,
  loadSummary,
  localISODate,
  resolveDay,
  type CardioEntry,
  type ExerciseData,
  type LastSessionInfo,
  type Units,
} from "@/lib/gymlog";

export interface TodayInputs {
  history: Record<string, ExerciseData>;
  cardio: CardioEntry[];
  /** A day picked by hand, and the ISO date it was picked on. */
  dayOverride: string | null;
  dayOverrideOn: string;
  /** Today's ISO date; "" before the client has read the clock. */
  todayISO: string;
}

export interface TodayState {
  /** The rotation day that is on: the hand-picked one if it was picked today, else the log's. */
  day: string;
  /** True when `day` came from the log, not a hand pick. */
  dayIsAuto: boolean;
  dayTitle: string;
  lastSession: LastSessionInfo | null;
  /** Whole days since any training (cardio counts); null when nothing is logged. */
  daysSinceLast: number | null;
  /** A full day has gone by without training — what the nudge asks about. */
  workoutUnlogged: boolean;
  /** ISO date of the last training, for scheduling the reminder. */
  lastTrainingISO: string | null;
}

export function resolveToday({ history, cardio, dayOverride, dayOverrideOn, todayISO }: TodayInputs, now = new Date()): TodayState {
  const reference = todayISO ? new Date(`${todayISO}T12:00:00`) : now;
  const resolved = resolveDay(history, reference);
  const overrideActive = Boolean(dayOverride) && dayOverrideOn === todayISO;
  const day = overrideActive ? (dayOverride as string) : resolved.day;
  const daysSinceLast = daysSinceTraining(resolved.daysSinceLast, cardio, todayISO || localISODate(now));
  return {
    day,
    dayIsAuto: !overrideActive,
    dayTitle: `${day} day`,
    lastSession: resolved.lastSession,
    daysSinceLast,
    workoutUnlogged: daysSinceLast === null || daysSinceLast >= 1,
    lastTrainingISO: daysSinceLast === null || !todayISO ? null : isoDaysAgo(todayISO, daysSinceLast),
  };
}

export interface NudgeInputs {
  hydrated: boolean;
  todayISO: string;
  syncing: boolean;
  authed: boolean | null;
  workoutUnlogged: boolean;
  /** ISO date the nudge was last answered. */
  loggedPromptOn: string;
  /** Whether any sheet is already open. */
  sheetOpen: boolean;
  onToday: boolean;
}

/**
 * The "log your last workout?" nudge: at most once a day, only on Today,
 * never over a sheet the lifter opened, and only once the account's real
 * history has loaded (not the seed it starts from).
 */
export function nudgeDue(n: NudgeInputs): boolean {
  return (
    n.hydrated &&
    Boolean(n.todayISO) &&
    !n.syncing &&
    n.authed === true &&
    n.workoutUnlogged &&
    n.loggedPromptOn !== n.todayISO &&
    !n.sheetOpen &&
    n.onToday
  );
}

/** One line on the "Logged today" strip. */
export function loggedLine(
  name: string,
  s: { weight: number | null; sets: number; reps: number | null; rpe: number | null },
  units: Units
): { name: string; summary: string } {
  return { name, summary: loadSummary({ w: s.weight, sets: s.sets, reps: s.reps }, units) + (s.rpe ? ` · RPE ${s.rpe}` : "") };
}

/**
 * What the coach is told about today. Chat passes the day the screen shows so
 * the coach plans that day; the weekly check-in passes none, since it runs at
 * sign-in before a hand-picked day is known.
 */
export function coachContext(history: Record<string, ExerciseData>, day: string | undefined, now = new Date()) {
  const latest = findLatestSession(history, now);
  return {
    todayLabel: getTodayInfo(now).label,
    todayISO: localISODate(now),
    nextDay: day,
    lastSessionDay: latest?.day,
    lastSessionDate: latest?.date,
  };
}
