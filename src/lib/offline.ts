import type { CardioEntry, ExerciseData } from "./gymlog";
import type { LogSetsInput } from "./db";

/** A write that couldn't reach the server, kept until signal returns. */
export type QueueItem =
  | { id: string; kind: "set"; payload: LogSetsInput }
  | { id: string; kind: "cardio"; payload: CardioEntry };

export const QUEUE_KEY = "gymlog:queue";

export function enqueue(queue: QueueItem[], item: QueueItem): QueueItem[] {
  return [...queue, item];
}

export function dequeue(queue: QueueItem[], id: string): QueueItem[] {
  return queue.filter((i) => i.id !== id);
}

function isItem(x: unknown): x is QueueItem {
  if (!x || typeof x !== "object") return false;
  const i = x as { id?: unknown; kind?: unknown; payload?: unknown };
  return (
    typeof i.id === "string" &&
    (i.kind === "set" || i.kind === "cardio") &&
    !!i.payload &&
    typeof i.payload === "object"
  );
}

export function readQueue(raw: string | null): QueueItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch {
    return [];
  }
}

const NETWORK_RE = /failed to fetch|load failed|networkerror|network request failed/i;

/** True for a failed request (no signal) as opposed to a server-side rejection. */
export function isNetworkError(err: unknown, online: boolean): boolean {
  if (!online) return true;
  if (!err || typeof err !== "object") return false;
  const msg = (err as { message?: unknown }).message;
  // Supabase wraps fetch failures in an error whose message still names them.
  return typeof msg === "string" && NETWORK_RE.test(msg);
}

export interface HistoryCache {
  history: Record<string, ExerciseData>;
  cardio: CardioEntry[];
  savedAt: number;
}

export function cacheKey(userId: string): string {
  return `gymlog:cache:${userId}`;
}

export function readCache(raw: string | null): HistoryCache | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<HistoryCache> | null;
    if (
      c &&
      typeof c === "object" &&
      c.history &&
      typeof c.history === "object" &&
      !Array.isArray(c.history) &&
      Array.isArray(c.cardio) &&
      typeof c.savedAt === "number"
    ) {
      return { history: c.history, cardio: c.cardio, savedAt: c.savedAt };
    }
    return null;
  } catch {
    return null;
  }
}
