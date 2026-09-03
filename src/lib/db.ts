"use client";

// Supabase data access. The app runs fine without Supabase (see useGymLog.ts,
// which falls back to localStorage), so every function here assumes the client
// is configured and is only called once a session exists.
//
// RLS scopes every table to auth.uid(), and user_id defaults to auth.uid(),
// so inserts never need to set it explicitly.

import {
  EX,
  ROT,
  collapseHistory,
  localISODate,
  muscleFromGroup,
  type ExerciseData,
  type HistoryExerciseRow,
  type HistorySetRow,
  type ParsedSet,
  type SetRow,
} from "@/lib/gymlog";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * Seeds exercises, the rotation, and the demo session history — but only into
 * an empty account. Re-running is a no-op, so it is safe on every sign-in.
 */
export async function seedIfEmpty(): Promise<void> {
  const supabase = getSupabaseClient();

  const { count, error: countError } = await supabase
    .from("exercises")
    .select("id", { count: "exact", head: true });
  if (countError) throw countError;
  if ((count ?? 0) > 0) return;

  // muscle_group / is_compound are parsed back out of the seed's
  // "Chest · compound" label so the DB holds them as real columns.
  const exerciseRows = Object.entries(EX).map(([name, data]) => {
    const [muscle, kind] = data.group.split(" · ");
    return { name, muscle_group: muscle ?? null, is_compound: kind === "compound" };
  });
  const { data: inserted, error: exError } = await supabase
    .from("exercises")
    .insert(exerciseRows)
    .select("id, name");
  if (exError) throw exError;

  const idByName = new Map<string, string>();
  for (const row of inserted ?? []) idByName.set(row.name as string, row.id as string);

  const { error: splitError } = await supabase
    .from("split")
    .insert(ROT.map((day, i) => ({ position: i, day_label: day })));
  if (splitError) throw splitError;

  // The seed carries dates as "Jul 31" with no year. Anchor each to the most
  // recent occurrence at or before today so the history reads as recent.
  const today = new Date();
  const toISO = (label: string): string => {
    const parsed = new Date(`${label} ${today.getUTCFullYear()} UTC`);
    if (parsed.getTime() > today.getTime()) {
      parsed.setUTCFullYear(parsed.getUTCFullYear() - 1);
    }
    return parsed.toISOString().slice(0, 10);
  };

  // One session per distinct date, with every set for that date attached to it.
  const byDate = new Map<string, { exercise: string; set: SetRow }[]>();
  for (const [name, data] of Object.entries(EX)) {
    for (const set of data.hist) {
      const iso = toISO(set.date);
      if (!byDate.has(iso)) byDate.set(iso, []);
      byDate.get(iso)!.push({ exercise: name, set });
    }
  }

  const dates = [...byDate.keys()].sort();
  const { data: sessions, error: sessionError } = await supabase
    .from("sessions")
    .insert(
      dates.map((date) => {
        const first = byDate.get(date)![0];
        const muscle = muscleFromGroup(EX[first.exercise].group);
        return { date, day_label: muscle };
      })
    )
    .select("id, date");
  if (sessionError) throw sessionError;

  const sessionIdByDate = new Map<string, string>();
  for (const s of sessions ?? []) sessionIdByDate.set(s.date as string, s.id as string);

  // The seed records one line per exercise per session with a set count; expand
  // it into individual set rows so the schema holds real per-set data.
  const setRows: Record<string, unknown>[] = [];
  for (const [date, entries] of byDate) {
    for (const { exercise, set } of entries) {
      for (let n = 1; n <= set.sets; n++) {
        setRows.push({
          session_id: sessionIdByDate.get(date),
          exercise_id: idByName.get(exercise),
          set_no: n,
          weight: set.w,
          reps: set.reps,
          rpe: set.rpe,
          felt_note: n === set.sets ? set.note || null : null,
        });
      }
    }
  }
  const { error: setsError } = await supabase.from("sets").insert(setRows);
  if (setsError) throw setsError;
}

/**
 * Loads all history and collapses it back into the per-exercise shape the UI
 * computes from: one entry per exercise per session, carrying that session's
 * top set and its set count.
 */
export async function loadHistory(): Promise<Record<string, ExerciseData>> {
  const supabase = getSupabaseClient();

  const { data: exercises, error: exError } = await supabase
    .from("exercises")
    .select("id, name, muscle_group, is_compound");
  if (exError) throw exError;

  const { data: sets, error: setsError } = await supabase
    .from("sets")
    .select("exercise_id, session_id, set_no, weight, reps, rpe, felt_note, sessions!inner(date)")
    .order("set_no");
  if (setsError) throw setsError;

  type JoinedRow = Omit<HistorySetRow, "date"> & { sessions: { date: string } };
  return collapseHistory(
    (exercises ?? []) as unknown as HistoryExerciseRow[],
    ((sets ?? []) as unknown as JoinedRow[]).map((row) => ({ ...row, date: row.sessions.date }))
  );
}

// ── coach personalisation ────────────────────────────────────────────────

export interface CoachProfile {
  goal: string | null;
  experience: string | null;
  days_per_week: number | null;
  injuries: string | null;
  preferences: string | null;
}

export async function loadProfile(): Promise<CoachProfile | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("goal, experience, days_per_week, injuries, preferences")
    .maybeSingle();
  if (error) throw error;
  return (data as CoachProfile | null) ?? null;
}

export async function saveProfile(profile: CoachProfile): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: auth.user.id, ...profile, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export interface StoredChatMessage {
  who: "user" | "coach";
  text: string;
}

/** The recent conversation, oldest first, so the chat reopens where it left off. */
export async function loadChatMessages(limit = 30): Promise<StoredChatMessage[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("coach_messages")
    .select("who, text, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as { who: "user" | "coach"; text: string }[]).map(({ who, text }) => ({ who, text })).reverse();
}

export interface HistoryImportSet {
  exercise: string;
  weight: number;
  reps: number;
  count: number;
  rpe: number | null;
  note: string | null;
}

export interface HistoryImportSession {
  date: string;
  day_label: string;
  sets: HistoryImportSet[];
}

export interface HistoryImportExercise {
  name: string;
  muscle_group: string | null;
  is_compound: boolean;
}

/**
 * Bulk-saves a parsed import. Re-runnable: dates that already have a session
 * are skipped whole, and exercises are matched by name before being created.
 */
export async function importHistory(
  sessions: HistoryImportSession[],
  exercises: HistoryImportExercise[]
): Promise<{ sessions: number; sets: number; skipped: number }> {
  const supabase = getSupabaseClient();

  const { data: existingEx, error: exError } = await supabase.from("exercises").select("id, name");
  if (exError) throw exError;
  const idByName = new Map<string, string>();
  for (const row of existingEx ?? []) idByName.set((row.name as string).toLowerCase(), row.id as string);

  const missing = exercises.filter((e) => !idByName.has(e.name.toLowerCase()));
  if (missing.length) {
    const { data: created, error: createError } = await supabase
      .from("exercises")
      .insert(missing.map((e) => ({ name: e.name, muscle_group: e.muscle_group, is_compound: e.is_compound })))
      .select("id, name");
    if (createError) throw createError;
    for (const row of created ?? []) idByName.set((row.name as string).toLowerCase(), row.id as string);
  }

  const { data: existingSessions, error: sessError } = await supabase.from("sessions").select("date");
  if (sessError) throw sessError;
  const takenDates = new Set((existingSessions ?? []).map((s: { date: string }) => s.date));

  const fresh = sessions.filter((s) => !takenDates.has(s.date) && s.sets.some((set) => idByName.has(set.exercise.toLowerCase())));
  const skipped = sessions.length - fresh.length;
  if (!fresh.length) return { sessions: 0, sets: 0, skipped };

  const { data: createdSessions, error: insError } = await supabase
    .from("sessions")
    .insert(fresh.map((s) => ({ date: s.date, day_label: s.day_label })))
    .select("id, date");
  if (insError) throw insError;
  const sessionIdByDate = new Map<string, string>();
  for (const row of createdSessions ?? []) sessionIdByDate.set(row.date as string, row.id as string);

  const setRows: Record<string, unknown>[] = [];
  for (const s of fresh) {
    for (const set of s.sets) {
      const exerciseId = idByName.get(set.exercise.toLowerCase());
      if (!exerciseId) continue;
      for (let n = 1; n <= set.count; n++) {
        setRows.push({
          session_id: sessionIdByDate.get(s.date),
          exercise_id: exerciseId,
          set_no: n,
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
          felt_note: n === set.count ? set.note : null,
        });
      }
    }
  }
  const { error: setsError } = await supabase.from("sets").insert(setRows);
  if (setsError) throw setsError;

  return { sessions: fresh.length, sets: setRows.length, skipped };
}

type Client = ReturnType<typeof getSupabaseClient>;

async function findExercise(supabase: Client, name: string): Promise<{ id: string; muscle_group: string | null } | null> {
  const { data, error } = await supabase
    .from("exercises")
    .select("id, muscle_group")
    .ilike("name", name.replace(/[%_]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; muscle_group: string | null } | null) ?? null;
}

async function findSession(supabase: Client, date: string): Promise<string | null> {
  const { data, error } = await supabase.from("sessions").select("id").eq("date", date).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

export interface LogSetsInput {
  exercise: string;
  /** Only used when the exercise has to be created. */
  muscleGroup?: string | null;
  date: string;
  weightKg: number;
  reps: number;
  sets: number;
  rpe: number | null;
  note?: string | null;
}

/**
 * Appends sets to the session on `date`, creating the session — and the
 * exercise, if it's new — as needed. Set numbering continues from whatever
 * is already logged for that exercise that day.
 */
export async function logSets(input: LogSetsInput): Promise<void> {
  const supabase = getSupabaseClient();

  let exercise = await findExercise(supabase, input.exercise);
  if (!exercise) {
    const { data, error } = await supabase
      .from("exercises")
      .insert({ name: input.exercise, muscle_group: input.muscleGroup ?? null, is_compound: false })
      .select("id, muscle_group")
      .single();
    if (error) throw error;
    exercise = data as { id: string; muscle_group: string | null };
  }

  let sessionId = await findSession(supabase, input.date);
  if (!sessionId) {
    const { data: created, error: createError } = await supabase
      .from("sessions")
      .insert({ date: input.date, day_label: exercise.muscle_group ?? "Session" })
      .select("id")
      .single();
    if (createError) throw createError;
    sessionId = created.id as string;
  }

  const { data: last, error: lastError } = await supabase
    .from("sets")
    .select("set_no")
    .eq("session_id", sessionId)
    .eq("exercise_id", exercise.id)
    .order("set_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;
  const startAt = ((last?.set_no as number) ?? 0) + 1;

  const rows = Array.from({ length: input.sets }, (_, i) => ({
    session_id: sessionId,
    exercise_id: exercise.id,
    set_no: startAt + i,
    weight: input.weightKg,
    reps: input.reps,
    rpe: input.rpe,
    felt_note: i === input.sets - 1 ? input.note || null : null,
  }));

  const { error: insertError } = await supabase.from("sets").insert(rows);
  if (insertError) throw insertError;
}

/** Writes a confirmed parse from the composer into today's session. */
export function saveSet(parsed: ParsedSet): Promise<void> {
  return logSets({
    exercise: parsed.name,
    date: localISODate(),
    weightKg: parsed.weight,
    reps: parsed.reps,
    sets: parsed.sets,
    rpe: parsed.rpe,
    note: parsed.note || null,
  });
}

export interface CorrectSetsInput {
  exercise: string;
  date: string;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
}

/** Rewrites every set of one exercise in one session; returns how many changed. */
export async function correctSets(input: CorrectSetsInput): Promise<number> {
  const supabase = getSupabaseClient();
  const exercise = await findExercise(supabase, input.exercise);
  if (!exercise) throw new Error(`Unknown exercise: ${input.exercise}`);
  const sessionId = await findSession(supabase, input.date);
  if (!sessionId) throw new Error(`No session on ${input.date}`);

  const patch: Record<string, number> = {};
  if (input.weightKg !== null) patch.weight = input.weightKg;
  if (input.reps !== null) patch.reps = input.reps;
  if (input.rpe !== null) patch.rpe = input.rpe;
  if (!Object.keys(patch).length) return 0;

  const { data, error } = await supabase
    .from("sets")
    .update(patch)
    .eq("session_id", sessionId)
    .eq("exercise_id", exercise.id)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** Deletes one exercise's sets from one session, and the session too if that empties it. */
export async function removeSets(input: { exercise: string; date: string }): Promise<number> {
  const supabase = getSupabaseClient();
  const exercise = await findExercise(supabase, input.exercise);
  if (!exercise) throw new Error(`Unknown exercise: ${input.exercise}`);
  const sessionId = await findSession(supabase, input.date);
  if (!sessionId) throw new Error(`No session on ${input.date}`);

  const { data, error } = await supabase
    .from("sets")
    .delete()
    .eq("session_id", sessionId)
    .eq("exercise_id", exercise.id)
    .select("id");
  if (error) throw error;

  const { count, error: countError } = await supabase
    .from("sets")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (countError) throw countError;
  if ((count ?? 0) === 0) {
    const { error: sessionError } = await supabase.from("sessions").delete().eq("id", sessionId);
    if (sessionError) throw sessionError;
  }
  return data?.length ?? 0;
}

/** A coach line the app wrote itself (e.g. the receipt for a confirmed action). */
export async function appendCoachMessage(text: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("coach_messages").insert({ who: "coach", text });
  if (error) throw error;
}
