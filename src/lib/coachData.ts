// Server-side load of everything the coach knows about one user: their real
// history, profile, active notes, and the recent conversation. All queries run
// as the signed-in user (RLS), so a user can only ever be coached on their own
// rows.

import "server-only";
import { toCardioEntry, type CardioEntry, type ExerciseData } from "@/lib/gymlog";
import { fetchHistory } from "@/lib/trainingLog";
import { PROMPT_HISTORY_LIMIT, readConversation, type ConversationLine } from "@/lib/coachMemory";
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
  /** Recent cardio, newest first. */
  cardio: CardioEntry[];
}

export async function loadCoachData(supa: RequestSupabase): Promise<CoachUserData> {
  const client = supa.client;

  const [history, profileRes, notesRes, recentRes, checkinRes, cardioRes] = await Promise.all([
    // A failed history read coaches on an empty log rather than failing the request.
    fetchHistory(client).catch((err): Record<string, ExerciseData> => {
      console.error("Coach history load failed", err);
      return {};
    }),
    client.from("profiles").select("goal, experience, days_per_week, injuries, preferences").maybeSingle(),
    client.from("coach_notes").select("id, note, created_at").eq("status", "active").order("created_at"),
    // A failed read coaches without the recent conversation rather than failing the request.
    readConversation(client, PROMPT_HISTORY_LIMIT).catch((err): ConversationLine[] => {
      console.error("Coach conversation load failed", err);
      return [];
    }),
    client
      .from("coach_messages")
      .select("created_at")
      .eq("kind", "checkin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.from("cardio").select("date, kind, minutes, distance_km, note").order("date", { ascending: false }).limit(14),
  ]);

  return {
    history,
    profile: (profileRes.data as CoachProfileRow | null) ?? null,
    notes: (notesRes.data ?? []) as CoachNoteRow[],
    recent: recentRes,
    lastCheckinAt: (checkinRes.data as { created_at: string } | null)?.created_at ?? null,
    // A missing cardio table (migration not applied) must not break coaching.
    cardio: cardioRes.error ? [] : ((cardioRes.data ?? []) as Parameters<typeof toCardioEntry>[0][]).map(toCardioEntry),
  };
}

/** True when the user actually has logged training to coach on. */
export function hasHistory(data: CoachUserData): boolean {
  return Object.values(data.history).some((ex) => ex.hist.length > 0);
}
