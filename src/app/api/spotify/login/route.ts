import { NextRequest, NextResponse } from "next/server";
import { SPOTIFY_STATE_COOKIE, spotifyAuthorizeUrl, spotifyConfig, supabaseFromRequest } from "@/lib/spotifyOauth";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const cfg = spotifyConfig(origin);
  if (!cfg) return NextResponse.redirect(`${origin}/?spotify=error&reason=config`);

  const supa = supabaseFromRequest(req);
  const { data } = (await supa?.client.auth.getUser()) ?? { data: { user: null } };
  if (!supa || !data.user) return NextResponse.redirect(`${origin}/?spotify=error&reason=signin`);

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(spotifyAuthorizeUrl(cfg, state));
  res.cookies.set(SPOTIFY_STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/api/spotify",
    maxAge: 600,
  });
  for (const c of supa.pending) res.cookies.set(c.name, c.value, c.options);
  return res;
}
