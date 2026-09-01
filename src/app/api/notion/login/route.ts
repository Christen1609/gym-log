import { NextRequest, NextResponse } from "next/server";
import { STATE_COOKIE, authorizeUrl, oauthConfig, supabaseFromRequest } from "@/lib/notionOauth";

// Starts the Notion OAuth dance. The callback needs a signed-in Supabase user
// to attach the token to, so an anonymous visitor is bounced back to the app.

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const cfg = oauthConfig(origin);
  if (!cfg) return NextResponse.redirect(`${origin}/?notion=error&reason=config`);

  const supa = supabaseFromRequest(req);
  const { data } = (await supa?.client.auth.getUser()) ?? { data: { user: null } };
  if (!data.user) return NextResponse.redirect(`${origin}/?notion=error&reason=signin`);

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(cfg, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/api/notion",
    maxAge: 600,
  });
  for (const c of supa?.pending ?? []) res.cookies.set(c.name, c.value, c.options);
  return res;
}
