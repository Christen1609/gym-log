import { NextRequest, NextResponse } from "next/server";
import { parseWorkoutText, type ImportResult } from "@/lib/importParse";

// Notion proxy. The browser can't call api.notion.com directly (CORS), and the
// integration token shouldn't travel further than it must — so the client sends
// it per-request and this route talks to Notion server-side. Nothing is stored.

const NOTION = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// Recursion guards: a workout log is one page of text, not a workspace crawl.
const MAX_BLOCKS = 3000;
const MAX_DEPTH = 4;

interface NotionPage {
  id: string;
  title: string;
  edited: string;
}

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/** Pulls the title out of whichever property carries type "title". */
function pageTitle(page: Record<string, unknown>): string {
  const props = page.properties as Record<string, { type?: string; title?: { plain_text?: string }[] }> | undefined;
  for (const prop of Object.values(props ?? {})) {
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      const text = prop.title.map((t) => t.plain_text ?? "").join("");
      if (text.trim()) return text.trim();
    }
  }
  return "Untitled";
}

async function listPages(token: string): Promise<NotionPage[]> {
  const res = await fetch(`${NOTION}/search`, {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 50,
    }),
  });
  if (!res.ok) throw new NotionError(res.status, await res.text());
  const data = await res.json();
  return ((data.results ?? []) as Record<string, unknown>[]).map((page) => ({
    id: String(page.id),
    title: pageTitle(page),
    edited: String(page.last_edited_time ?? ""),
  }));
}

/** Plain text of one block's rich_text array, or null when it has none. */
function blockText(block: Record<string, unknown>): string | null {
  const type = block.type as string;
  const body = block[type] as { rich_text?: { plain_text?: string }[]; cells?: { plain_text?: string }[][] } | undefined;
  if (!body) return null;
  if (type === "table_row" && Array.isArray(body.cells)) {
    return body.cells.map((cell) => cell.map((t) => t.plain_text ?? "").join("")).join(" · ");
  }
  if (Array.isArray(body.rich_text)) {
    return body.rich_text.map((t) => t.plain_text ?? "").join("");
  }
  return null;
}

async function pageText(token: string, pageId: string): Promise<string> {
  const lines: string[] = [];
  let fetched = 0;

  const walk = async (blockId: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || fetched >= MAX_BLOCKS) return;
    let cursor: string | null = null;
    do {
      const qs = new URLSearchParams({ page_size: "100" });
      if (cursor) qs.set("start_cursor", cursor);
      const res = await fetch(`${NOTION}/blocks/${blockId}/children?${qs}`, {
        headers: notionHeaders(token),
      });
      if (!res.ok) throw new NotionError(res.status, await res.text());
      const data = await res.json();

      for (const block of (data.results ?? []) as Record<string, unknown>[]) {
        fetched += 1;
        if (fetched > MAX_BLOCKS) return;
        const text = blockText(block);
        if (text && text.trim()) lines.push(text.trim());
        // Stay on this page: child pages/databases are other documents.
        const type = block.type as string;
        if (block.has_children && type !== "child_page" && type !== "child_database") {
          await walk(String(block.id), depth + 1);
        }
      }
      cursor = data.has_more ? (data.next_cursor as string) : null;
    } while (cursor);
  };

  await walk(pageId, 0);
  return lines.join("\n");
}

class NotionError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Notion API ${status}: ${body.slice(0, 200)}`);
    this.status = status;
  }
}

function friendlyNotionError(err: NotionError): string {
  if (err.status === 401) return "Notion rejected that token. Check it and try again.";
  if (err.status === 403 || err.status === 404)
    return "Notion couldn't open that page. Make sure the page is shared with your integration (page menu → Connections).";
  if (err.status === 429) return "Notion is rate-limiting. Wait a moment and retry.";
  return "Notion request failed. Try again.";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const today = typeof body.today === "string" ? body.today : undefined;

  try {
    if (body.action === "pages") {
      if (!token) return NextResponse.json({ error: "Missing Notion token" }, { status: 400 });
      return NextResponse.json({ pages: await listPages(token) });
    }

    if (body.action === "import" && typeof body.pageId === "string") {
      if (!token) return NextResponse.json({ error: "Missing Notion token" }, { status: 400 });
      const text = await pageText(token, body.pageId);
      if (!text.trim()) {
        return NextResponse.json({ error: "That page has no text to read." }, { status: 422 });
      }
      const result: ImportResult = await parseWorkoutText(text, today);
      return NextResponse.json({ result });
    }

    if (body.action === "parse" && typeof body.text === "string" && body.text.trim()) {
      const result: ImportResult = await parseWorkoutText(body.text, today);
      return NextResponse.json({ result });
    }
  } catch (err) {
    if (err instanceof NotionError) {
      console.error("Notion request failed", err.status, err.message);
      return NextResponse.json({ error: friendlyNotionError(err) }, { status: 502 });
    }
    console.error("Import failed", err);
    return NextResponse.json({ error: "Couldn't read that log. Try again." }, { status: 500 });
  }

  return NextResponse.json({ error: "Unsupported request" }, { status: 400 });
}
