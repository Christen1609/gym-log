import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Keep-alive for the Supabase project. A free-tier project pauses after a
// period without traffic; the daily cron (vercel.json) hits this route so the
// database sees a request. RLS hides every row from anon, so the query returns
// nothing — the request itself is the point.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ ok: false, reason: "not configured" });
  }

  try {
    const supabase = createClient(url, anonKey, { db: { schema: "gymlog" } });
    const { error, status } = await supabase.from("exercises").select("id").limit(1);
    // A missing status means no HTTP response came back at all (network failure).
    if (error && !status) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
