import { NextRequest, NextResponse } from "next/server";
import { judgeChat, judgeExercise } from "@/lib/coach";
import type { ChatContext } from "@/lib/gymlog";

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.type === "exercise" && typeof body.exercise === "string") {
    const text = await judgeExercise(body.exercise);
    return NextResponse.json({ text });
  }

  if (body.type === "chat" && typeof body.message === "string") {
    const text = await judgeChat(body.message, readContext(body.context));
    return NextResponse.json({ text });
  }

  return NextResponse.json({ error: "Unsupported request" }, { status: 400 });
}
