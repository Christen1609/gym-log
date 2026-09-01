// Server-side load of everything the coach knows about one user: their real
// history, profile, active notes, and the recent conversation. All queries run
// as the signed-in user (RLS), so a user can only ever be coached on their own
// rows.

import "server-only";
import { collapseHistory, type ExerciseData, type HistoryExerciseRow, type HistorySetRow } from "@/lib/gymlog";
import type { RequestSupabase } from "@/lib/supabaseServer";

export interface CoachProfileRow {
  goal: string | null;
  experience: string | null;
  days_per_week: number | null;
  injuries: string | null;
  preferences: string | null;
}

export interface CoachNoteRow {
  id: string;
  note: string;
  created_at: string;
}

export interface CoachUserData {
  history: Record<string, ExerciseData>;
  profile: CoachProfileRow | null;
  notes: CoachNoteRow[];
  recent: { who: string; text: string }[];
  lastCheckinAt: string | null;
}

export async function loadCoachData(supa: RequestSupabase): Promise<CoachUserData> {
  const client = supa.client;

  const [exercisesRes, setsRes, profileRes, notesRes, recentRes, checkinRes] = await Promise.all([
    client.from("exercises").select("id, name, muscle_group, is_compound"),
    client
      .from("sets")
      .select("exercise_id, session_id, set_no, weight, reps, rpe, felt_note, sessions!inner(date)")
      .order("set_no"),
    client.from("profiles").select("goal, experience, days_per_week, injuries, preferences").maybeSingle(),
    client.from("coach_notes").select("id, note, created_at").eq("status", "active").order("created_at"),
    client.from("coach_messages").select("who, text, created_at").order("created_at", { ascending: false }).limit(12),
    client
      .from("coach_messages")
      .select("created_at")
      .eq("kind", "checkin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  type JoinedRow = Omit<HistorySetRow, "date"> & { sessions: { date: string } };
  const history = collapseHistory(
    (exercisesRes.data ?? []) as unknown as HistoryExerciseRow[],
    ((setsRes.data ?? []) as unknown as JoinedRow[]).map((row) => ({ ...row, date: row.sessions.date }))
  );

  return {
    history,
    profile: (profileRes.data as CoachProfileRow | null) ?? null,
    notes: (notesRes.data ?? []) as CoachNoteRow[],
    recent: ((recentRes.data ?? []) as { who: string; text: string }[])
      .map(({ who, text }) => ({ who, text }))
      .reverse(),
    lastCheckinAt: (checkinRes.data as { created_at: string } | null)?.created_at ?? null,
  };
}

/** True when the user actually has logged training to coach on. */
export function hasHistory(data: CoachUserData): boolean {
  return Object.values(data.history).some((ex) => ex.hist.length > 0);
}
