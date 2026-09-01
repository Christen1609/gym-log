"use client";

// Client side of the Notion import: token storage (this device only) and the
// calls to /api/notion, which proxies Notion and parses the log server-side.

import { localISODate } from "@/lib/gymlog";
import type { HistoryImportExercise, HistoryImportSession } from "@/lib/db";

export interface NotionPageRef {
  id: string;
  title: string;
  edited: string;
}

export interface ParsedImport {
  sessions: HistoryImportSession[];
  exercises: HistoryImportExercise[];
  flags: string[];
}

const TOKEN_KEY = "gymlog:notion-token";

export function loadNotionToken(): string {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveNotionToken(token: string): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — the session still works, it just won't remember */
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/notion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Request failed");
  return data as T;
}

export async function fetchNotionPages(token: string): Promise<NotionPageRef[]> {
  const { pages } = await call<{ pages: NotionPageRef[] }>({ action: "pages", token });
  return pages;
}

export async function importNotionPage(token: string, pageId: string): Promise<ParsedImport> {
  const { result } = await call<{ result: ParsedImport }>({
    action: "import",
    token,
    pageId,
    today: localISODate(),
  });
  return result;
}

export async function parsePastedLog(text: string): Promise<ParsedImport> {
  const { result } = await call<{ result: ParsedImport }>({ action: "parse", text, today: localISODate() });
  return result;
}

export interface ImportSummary {
  sessions: number;
  sets: number;
  exercises: number;
  earliest: string;
  rotation: string[];
}

export function summarize(parsed: ParsedImport): ImportSummary {
  const sets = parsed.sessions.reduce((n, s) => n + s.sets.reduce((m, set) => m + set.count, 0), 0);
  const rotation: string[] = [];
  for (const s of parsed.sessions) {
    if (s.day_label !== "Session" && !rotation.includes(s.day_label)) rotation.push(s.day_label);
    if (rotation.length >= 7) break;
  }
  const earliestISO = parsed.sessions[0]?.date;
  const earliest = earliestISO
    ? new Date(`${earliestISO}T12:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long" })
    : "";
  return { sessions: parsed.sessions.length, sets, exercises: parsed.exercises.length, earliest, rotation };
}
