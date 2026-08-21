import { NextRequest, NextResponse } from "next/server";
import { judgeChat, judgeExercise } from "@/lib/coach";

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
    const text = await judgeChat(body.message);
    return NextResponse.json({ text });
  }

  return NextResponse.json({ error: "Unsupported request" }, { status: 400 });
}
