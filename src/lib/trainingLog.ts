// The training log: the one place that knows how history is stored (sessions
// on an ISO date, one row per set) and how it reads back (one entry per
// exercise per session). Used by the browser (db.ts) and the coach's server
// route (coachData.ts), so it stays free of server-only and browser-only
// imports and takes whichever Supabase client the caller already has.

import type { SupabaseClient } from "@supabase/supabase-js";
import { collapseHistory, type ExerciseData, type HistoryExerciseRow, type HistorySetRow } from "@/lib/gymlog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the browser and server clients differ only in schema generics
type LogClient = Pick<SupabaseClient<any, any, any>, "from">;

/** Loads every logged set and collapses it into the per-exercise history the app computes from. */
export async function fetchHistory(client: LogClient): Promise<Record<string, ExerciseData>> {
  const [exercisesRes, setsRes] = await Promise.all([
    client.from("exercises").select("id, name, muscle_group, is_compound"),
    client
      .from("sets")
      .select("exercise_id, session_id, set_no, weight, reps, rpe, felt_note, sessions!inner(date)")
      .order("set_no"),
  ]);
  if (exercisesRes.error) throw exercisesRes.error;
  if (setsRes.error) throw setsRes.error;

  type JoinedRow = Omit<HistorySetRow, "date"> & { sessions: { date: string } };
  return collapseHistory(
    (exercisesRes.data ?? []) as unknown as HistoryExerciseRow[],
    ((setsRes.data ?? []) as unknown as JoinedRow[]).map((row) => ({ ...row, date: row.sessions.date }))
  );
}

// ── what an import hands the log ──────────────────────────────────────────
// One shape from the parser (importParse.ts) through the browser
// (notionImport.ts) to the bulk save (db.ts importHistory).

/** N identical sets of one exercise in an imported session. */
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

export interface SetEntryRows {
  sessionId: string;
  exerciseId: string;
  /** How many identical sets were done. */
  count: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  note?: string | null;
  /** set_no of the first row; continues numbering within a session. Defaults to 1. */
  startAt?: number;
}

/**
 * Expands "N sets of the same thing" into one row per set, as the schema
 * stores it. The note belongs to the session's effort, so it rides on the
 * last set only.
 */
export function expandSetRows(entry: SetEntryRows) {
  const startAt = entry.startAt ?? 1;
  return Array.from({ length: Math.max(0, entry.count) }, (_, i) => ({
    session_id: entry.sessionId,
    exercise_id: entry.exerciseId,
    set_no: startAt + i,
    weight: entry.weight,
    reps: entry.reps,
    rpe: entry.rpe,
    felt_note: i === entry.count - 1 ? entry.note || null : null,
  }));
}
