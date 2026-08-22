"use client";

// Supabase data access. The app runs fine without Supabase (see useGymLog.ts,
// which falls back to localStorage), so every function here assumes the client
// is configured and is only called once a session exists.
//
// RLS scopes every table to auth.uid(), and user_id defaults to auth.uid(),
// so inserts never need to set it explicitly.

import { EX, ROT, localISODate, muscleFromGroup, type ExerciseData, type SetRow, type ParsedSet } from "@/lib/gymlog";
import { getSupabaseClient } from "@/lib/supabase";

interface ExerciseRow {
  id: string;
  name: string;
  muscle_group: string | null;
  is_compound: boolean;
}

/** A history entry plus the raw ISO date, kept only for sorting. */
type DatedSetRow = SetRow & { _iso: string };

/** Short month-day label ("Jul 31") — the format the UI renders. */
function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Chest · compound" — rebuilt from the columns the schema actually stores. */
function groupLabel(row: ExerciseRow): string {
  const kind = row.is_compound ? "compound" : "accessory";
  return row.muscle_group ? `${row.muscle_group} · ${kind}` : kind;
}

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

  const byExercise = new Map<string, Map<string, DatedSetRow>>();
  for (const raw of sets ?? []) {
    const row = raw as unknown as {
      exercise_id: string;
      session_id: string;
      weight: number;
      reps: number;
      rpe: number | null;
      felt_note: string | null;
      sessions: { date: string };
    };

    if (!byExercise.has(row.exercise_id)) byExercise.set(row.exercise_id, new Map());
    const sessions = byExercise.get(row.exercise_id)!;
    const existing = sessions.get(row.session_id);

    if (!existing) {
      sessions.set(row.session_id, {
        date: formatDate(row.sessions.date),
        w: Number(row.weight),
        sets: 1,
        reps: Number(row.reps),
        rpe: row.rpe === null ? null : Number(row.rpe),
        note: row.felt_note ?? "",
        _iso: row.sessions.date,
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
  for (const ex of (exercises ?? []) as unknown as ExerciseRow[]) {
    const sessions = byExercise.get(ex.id);
    const hist = sessions
      ? [...sessions.values()].sort((a, b) => a._iso.localeCompare(b._iso))
      : [];
    result[ex.name] = { group: groupLabel(ex), hist };
  }
  return result;
}

/** Writes a confirmed parse, reusing today's session if there already is one. */
export async function saveSet(parsed: ParsedSet): Promise<void> {
  const supabase = getSupabaseClient();
  const today = localISODate();

  const { data: exercise, error: exError } = await supabase
    .from("exercises")
    .select("id, muscle_group")
    .eq("name", parsed.name)
    .maybeSingle();
  if (exError) throw exError;
  if (!exercise) throw new Error(`Unknown exercise: ${parsed.name}`);

  const { data: existing, error: findError } = await supabase
    .from("sessions")
    .select("id")
    .eq("date", today)
    .maybeSingle();
  if (findError) throw findError;

  let sessionId: string;
  if (existing) {
    sessionId = existing.id as string;
  } else {
    const { data: created, error: createError } = await supabase
      .from("sessions")
      .insert({ date: today, day_label: (exercise.muscle_group as string) ?? "Session" })
      .select("id")
      .single();
    if (createError) throw createError;
    sessionId = created.id as string;
  }

  // Continue the numbering rather than restarting at 1 for this exercise.
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

  const rows = Array.from({ length: parsed.sets }, (_, i) => ({
    session_id: sessionId,
    exercise_id: exercise.id,
    set_no: startAt + i,
    weight: parsed.weight,
    reps: parsed.reps,
    rpe: parsed.rpe,
    felt_note: i === parsed.sets - 1 ? parsed.note || null : null,
  }));

  const { error: insertError } = await supabase.from("sets").insert(rows);
  if (insertError) throw insertError;
}
