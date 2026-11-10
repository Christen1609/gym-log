import "server-only";

export { supabaseFromRequest } from "@/lib/supabaseServer";

export const SPOTIFY_STATE_COOKIE = "spotify_oauth_state";

export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
  "user-read-private",
  "user-read-email",
].join(" ");

export interface SpotifyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface SpotifyTokenGrant {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

export interface SpotifyProfile {
  id: string | null;
  display_name: string | null;
}

export function spotifyConfig(origin: string): SpotifyConfig | null {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || `${origin}/api/spotify/callback`,
  };
}

export function spotifyAuthorizeUrl(cfg: SpotifyConfig, state: string): string {
  const qs = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: cfg.redirectUri,
    state,
  });
  return `https://accounts.spotify.com/authorize?${qs}`;
}

async function tokenRequest(cfg: SpotifyConfig, body: URLSearchParams): Promise<SpotifyTokenGrant | null> {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    console.error("Spotify token request failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  if (typeof data?.access_token !== "string" || typeof data?.expires_in !== "number") return null;
  return data as SpotifyTokenGrant;
}

export function expiresAt(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

export function tokenIsExpiring(expiresAtISO: string): boolean {
  return new Date(expiresAtISO).getTime() - Date.now() < 60_000;
}

export function exchangeSpotifyCode(cfg: SpotifyConfig, code: string): Promise<SpotifyTokenGrant | null> {
  return tokenRequest(
    cfg,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    })
  );
}

export function refreshSpotifyToken(cfg: SpotifyConfig, refreshToken: string): Promise<SpotifyTokenGrant | null> {
  return tokenRequest(
    cfg,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
}

export async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { id: null, display_name: null };
  const data = await res.json();
  return {
    id: typeof data?.id === "string" ? data.id : null,
    display_name: typeof data?.display_name === "string" ? data.display_name : null,
  };
}
