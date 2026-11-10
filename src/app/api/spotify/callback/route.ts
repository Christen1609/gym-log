import { NextRequest, NextResponse } from "next/server";
import {
  SPOTIFY_STATE_COOKIE,
  exchangeSpotifyCode,
  expiresAt,
  fetchSpotifyProfile,
  spotifyConfig,
  supabaseFromRequest,
} from "@/lib/spotifyOauth";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (query: string) => {
    const res = NextResponse.redirect(`${origin}/?${query}`);
    res.cookies.delete({ name: SPOTIFY_STATE_COOKIE, path: "/api/spotify" });
    return res;
  };

  const cfg = spotifyConfig(origin);
  if (!cfg) return back("spotify=error&reason=config");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("spotify=error&reason=denied");

  const code = params.get("code");
  const state = params.get("state");
  const expected = req.cookies.get(SPOTIFY_STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) return back("spotify=error&reason=state");

  const grant = await exchangeSpotifyCode(cfg, code);
  if (!grant?.refresh_token) return back("spotify=error&reason=exchange");

  const supa = supabaseFromRequest(req);
  const { data } = (await supa?.client.auth.getUser()) ?? { data: { user: null } };
  if (!supa || !data.user) return back("spotify=error&reason=signin");

  const profile = await fetchSpotifyProfile(grant.access_token);
  const { error } = await supa.client.from("spotify_connections").upsert(
    {
      user_id: data.user.id,
      access_token: grant.access_token,
      refresh_token: grant.refresh_token,
      expires_at: expiresAt(grant.expires_in),
      scope: grant.scope ?? null,
      token_type: grant.token_type ?? null,
      spotify_user_id: profile.id,
      display_name: profile.display_name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("Saving Spotify connection failed", error);
    return back("spotify=error&reason=save");
  }

  const res = back("spotify=connected");
  for (const c of supa.pending) res.cookies.set(c.name, c.value, c.options);
  return res;
}
