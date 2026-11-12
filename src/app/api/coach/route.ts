import { NextRequest, NextResponse } from "next/server";
import { judgeChat, judgeExercise, weeklyCheckin } from "@/lib/coach";
import { hasHistory, loadCoachData, type CoachUserData } from "@/lib/coachData";
import { supabaseFromRequest, type RequestSupabase } from "@/lib/supabaseServer";
import { aiAllowed, fallbackReply, type ChatContext } from "@/lib/gymlog";
import { checkinDue, noteWrites, saveCoachLine, saveTurn } from "@/lib/coachMemory";

// With a signed-in user (auth cookies) the coach runs on THEIR data and the
// conversation persists; anonymously it falls back to the seeded demo numbers,
// so the zero-config app keeps working.

function readContext(value: unknown): ChatContext {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    todayLabel: typeof raw.todayLabel === "string" ? raw.todayLabel : undefined,
    todayISO: typeof raw.todayISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.todayISO) ? raw.todayISO : undefined,
    nextDay: typeof raw.nextDay === "string" ? raw.nextDay : undefined,
    lastSessionDay: typeof raw.lastSessionDay === "string" ? raw.lastSessionDay : undefined,
    lastSessionDate: typeof raw.lastSessionDate === "string" ? raw.lastSessionDate : undefined,
  };
}

async function userData(req: NextRequest): Promise<{ supa: RequestSupabase; data: CoachUserData } | null> {
  const supa = supabaseFromRequest(req);
  if (!supa) return null;
  const { data: auth } = await supa.client.auth.getUser();
  if (!auth.user) return null;
  return { supa, data: await loadCoachData(supa) };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // No consent, no Gemini call and no reads or writes of the lifter's data.
  const allowed = aiAllowed(body);

  const user = allowed
    ? await userData(req).catch((err) => {
        console.error("Coach data load failed", err);
        return null;
      })
    : null;

  if (body.type === "exercise" && typeof body.exercise === "string") {
    if (!allowed) return NextResponse.json({ text: null });
    const text = await judgeExercise(body.exercise, user?.data);
    return NextResponse.json({ text });
  }

  if (body.type === "chat" && typeof body.message === "string") {
    const context = readContext(body.context);
    if (!allowed) return NextResponse.json({ text: fallbackReply(body.message, context), proposals: [] });
    const result = await judgeChat(body.message, context, user?.data);

    if (user) {
      const client = user.supa.client;
      // Persistence is best-effort: a failed write must never eat the reply.
      const writes = [saveTurn(client, body.message, result.text), ...noteWrites(client, result.addNote, result.resolveNoteIds)];
      const results = await Promise.allSettled(writes);
      for (const r of results) {
        if (r.status === "rejected") console.error("Coach persistence failed", r.reason);
        else if ((r.value as { error?: unknown })?.error) console.error("Coach persistence failed", (r.value as { error?: unknown }).error);
      }
    }

    // Proposals go back unwritten; the browser applies them on confirm.
    return NextResponse.json({ text: result.text, proposals: result.proposals });
  }

  // The app asks on sign-in; the coach speaks first when a week has passed.
  if (body.type === "checkin") {
    if (!allowed) return NextResponse.json({ text: null });
    if (!user || !hasHistory(user.data)) return NextResponse.json({ text: null });

    if (!checkinDue(user.data.lastCheckinAt)) return NextResponse.json({ text: null });

    const text = await weeklyCheckin(user.data, readContext(body.context));
    if (!text) return NextResponse.json({ text: null });

    await saveCoachLine(user.supa.client, text, "checkin").catch((err) => console.error("Check-in persistence failed", err));
    return NextResponse.json({ text });
  }

  return NextResponse.json({ error: "Unsupported request" }, { status: 400 });
}
