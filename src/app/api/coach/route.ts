import { NextRequest, NextResponse } from "next/server";
import { judgeChat, judgeExercise, weeklyCheckin } from "@/lib/coach";
import { hasHistory, loadCoachData, type CoachUserData } from "@/lib/coachData";
import { supabaseFromRequest, type RequestSupabase } from "@/lib/supabaseServer";
import type { ChatContext } from "@/lib/gymlog";

// With a signed-in user (auth cookies) the coach runs on THEIR data and the
// conversation persists; anonymously it falls back to the seeded demo numbers,
// so the zero-config app keeps working.

const CHECKIN_EVERY_DAYS = 7;

function readContext(value: unknown): ChatContext {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    todayLabel: typeof raw.todayLabel === "string" ? raw.todayLabel : undefined,
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

  const user = await userData(req).catch((err) => {
    console.error("Coach data load failed", err);
    return null;
  });

  if (body.type === "exercise" && typeof body.exercise === "string") {
    const text = await judgeExercise(body.exercise, user?.data);
    return NextResponse.json({ text });
  }

  if (body.type === "chat" && typeof body.message === "string") {
    const context = readContext(body.context);
    const result = await judgeChat(body.message, context, user?.data);

    if (user) {
      const client = user.supa.client;
      // Persistence is best-effort: a failed write must never eat the reply.
      const writes: PromiseLike<unknown>[] = [
        client.from("coach_messages").insert([
          { who: "user", text: body.message },
          { who: "coach", text: result.text },
        ]),
      ];
      if (result.addNote) writes.push(client.from("coach_notes").insert({ note: result.addNote }));
      if (result.resolveNoteIds.length)
        writes.push(
          client
            .from("coach_notes")
            .update({ status: "resolved", updated_at: new Date().toISOString() })
            .in("id", result.resolveNoteIds)
        );
      const results = await Promise.allSettled(writes);
      for (const r of results) {
        if (r.status === "rejected") console.error("Coach persistence failed", r.reason);
        else if ((r.value as { error?: unknown })?.error) console.error("Coach persistence failed", (r.value as { error?: unknown }).error);
      }
    }

    return NextResponse.json({ text: result.text });
  }

  // The app asks on sign-in; the coach speaks first when a week has passed.
  if (body.type === "checkin") {
    if (!user || !hasHistory(user.data)) return NextResponse.json({ text: null });

    const last = user.data.lastCheckinAt ? new Date(user.data.lastCheckinAt).getTime() : 0;
    const due = Date.now() - last > CHECKIN_EVERY_DAYS * 24 * 60 * 60 * 1000;
    if (!due) return NextResponse.json({ text: null });

    const text = await weeklyCheckin(user.data, readContext(body.context));
    if (!text) return NextResponse.json({ text: null });

    const { error } = await user.supa.client.from("coach_messages").insert({ who: "coach", kind: "checkin", text });
    if (error) console.error("Check-in persistence failed", error);
    return NextResponse.json({ text });
  }

  return NextResponse.json({ error: "Unsupported request" }, { status: 400 });
}
