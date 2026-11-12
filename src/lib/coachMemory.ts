// The coach's memory: the saved conversation and the notes the coach keeps on
// a lifter. The browser (reopening the chat, saving a receipt) and the coach
// route (saving a turn, a check-in, note changes) share this module, so the
// ordering rules for reading the conversation live in one place.

import type { LogClient as MemoryClient } from "@/lib/trainingLog";

export interface ConversationLine {
  who: "user" | "coach";
  text: string;
}

/** How much of the conversation the chat screen reopens with. */
export const CHAT_HISTORY_LIMIT = 30;
/** How much of the conversation goes into the coach's prompt. */
export const PROMPT_HISTORY_LIMIT = 12;
const CHECKIN_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

/** The last `limit` lines of the conversation, oldest first. Throws if the read fails. */
export async function readConversation(client: MemoryClient, limit: number): Promise<ConversationLine[]> {
  // Older rows share a timestamp per turn; "coach" < "user" here so that after
  // the reverse the question still comes before its reply.
  const { data, error } = await client
    .from("coach_messages")
    .select("who, text, created_at")
    .order("created_at", { ascending: false })
    .order("who", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as ConversationLine[]).map(({ who, text }) => ({ who, text })).reverse();
}

/**
 * Saves a question and the coach's reply. Explicit timestamps: one insert
 * would stamp both rows with the same created_at, and the reload could show
 * the reply before the question.
 */
export function saveTurn(client: MemoryClient, question: string, reply: string, now = Date.now()) {
  return client.from("coach_messages").insert([
    { who: "user", text: question, created_at: new Date(now).toISOString() },
    { who: "coach", text: reply, created_at: new Date(now + 1).toISOString() },
  ]);
}

/** Saves one line the coach said on its own: a receipt, or a check-in. */
export async function saveCoachLine(client: MemoryClient, text: string, kind?: "checkin"): Promise<void> {
  const { error } = await client.from("coach_messages").insert(kind ? { who: "coach", kind, text } : { who: "coach", text });
  if (error) throw error;
}

/** The note writes one coach reply asked for; empty when it asked for none. */
export function noteWrites(client: MemoryClient, addNote: string | null | undefined, resolveIds: string[]) {
  const writes: PromiseLike<unknown>[] = [];
  if (addNote) writes.push(client.from("coach_notes").insert({ note: addNote }));
  if (resolveIds.length)
    writes.push(client.from("coach_notes").update({ status: "resolved", updated_at: new Date().toISOString() }).in("id", resolveIds));
  return writes;
}

/** A week has passed since the last check-in (or there never was one). */
export function checkinDue(lastCheckinAt: string | null, now = Date.now()): boolean {
  const last = lastCheckinAt ? new Date(lastCheckinAt).getTime() : 0;
  return now - last > CHECKIN_EVERY_MS;
}
