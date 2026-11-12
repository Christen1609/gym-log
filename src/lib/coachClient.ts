// The browser's side of the coach: asking /api/coach for a reply or a check-in,
// and carrying out a proposal the lifter confirmed. The log writes come in as
// a `LogWriter` so the whole confirm path can be tested without Supabase;
// useGymLog passes the real db.ts functions.

import { cardioSummary, type CardioEntry, type ChatContext, type ExerciseData, type Units } from "@/lib/gymlog";
import { proposalText, type CoachProposal } from "@/lib/coachActions";
import { loggedLine } from "@/lib/today";
import type * as Db from "@/lib/db";

export const COACH_FALLBACK = "I only judge what is in the log. Ask me about an exercise by name, or what is on today.";

async function postCoach(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
}

/** The coach's reply to a chat message, plus any changes it proposes. Never throws. */
export async function requestCoachReply(
  message: string,
  context: ChatContext,
  ai: boolean
): Promise<{ text: string; proposals: CoachProposal[] }> {
  try {
    const data = await postCoach({ type: "chat", ai, message, context });
    const text = typeof data?.text === "string" ? data.text : COACH_FALLBACK;
    const proposals = Array.isArray(data?.proposals) ? (data.proposals as CoachProposal[]) : [];
    return { text, proposals };
  } catch {
    return { text: COACH_FALLBACK, proposals: [] };
  }
}

/** The weekly check-in, when one is due. Null when there's nothing to say or the request failed. */
export async function requestCheckin(context: ChatContext): Promise<string | null> {
  try {
    const data = await postCoach({ type: "checkin", ai: true, context });
    return typeof data?.text === "string" ? data.text : null;
  } catch {
    return null;
  }
}

/** The coach's verdict on one exercise. Null when unavailable. */
export async function requestExerciseJudgment(exercise: string): Promise<string | null> {
  try {
    const data = await postCoach({ type: "exercise", exercise, ai: true });
    return typeof data?.text === "string" ? data.text : null;
  } catch {
    return null;
  }
}

/** The log writes a confirmed proposal can make — db.ts in the app, a fake in tests. */
export type LogWriter = Pick<typeof Db, "logSets" | "logCardio" | "correctSets" | "removeSets" | "loadHistory" | "loadCardio">;

/** What confirming a proposal changed, for the caller to put on screen. */
export interface ProposalOutcome {
  /** A day to switch to (set_next_day). */
  pickDay?: string;
  /** Fresh history after a write to the log. */
  history?: Record<string, ExerciseData>;
  /** Fresh cardio after a cardio write. */
  cardio?: CardioEntry[];
  /** A line for the "Logged today" strip, when the write was for today. */
  loggedToday?: { name: string; summary: string };
  /** The receipt the coach says in the chat. */
  receipt: string;
}

/**
 * Carries out one confirmed proposal. This is the only path from a coach
 * suggestion to the log. Throws when the write fails or when a log write is
 * attempted signed out, so the card can show it failed.
 */
export async function applyCoachProposal(
  p: CoachProposal,
  opts: { today: string; units: Units; signedIn: boolean; writer: LogWriter }
): Promise<ProposalOutcome> {
  const { today, units, signedIn, writer } = opts;
  const receipt = proposalText(p, units, today, "done");
  if (p.type === "set_next_day") return { pickDay: p.day, receipt };
  if (!signedIn) throw new Error("Not signed in");

  const out: ProposalOutcome = { receipt };
  if (p.type === "log_sets") {
    await writer.logSets({
      exercise: p.exercise,
      muscleGroup: p.muscleGroup,
      date: p.date,
      weightKg: p.weightKg,
      reps: p.reps,
      sets: p.sets,
      rpe: p.rpe,
    });
    if (p.date === today) out.loggedToday = loggedLine(p.exercise, { weight: p.weightKg, sets: p.sets, reps: p.reps, rpe: p.rpe }, units);
  } else if (p.type === "log_cardio") {
    await writer.logCardio({ date: p.date, kind: p.kind, minutes: p.minutes, distanceKm: p.distanceKm, note: p.note });
    out.cardio = await writer.loadCardio();
    if (p.date === today) out.loggedToday = { name: "Cardio", summary: cardioSummary(p) };
  } else if (p.type === "correct_sets") {
    await writer.correctSets({ exercise: p.exercise, date: p.date, weightKg: p.weightKg, reps: p.reps, rpe: p.rpe });
  } else {
    await writer.removeSets({ exercise: p.exercise, date: p.date });
  }
  out.history = await writer.loadHistory();
  return out;
}
