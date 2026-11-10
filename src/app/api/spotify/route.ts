import { NextRequest, NextResponse } from "next/server";
import {
  expiresAt,
  refreshSpotifyToken,
  spotifyConfig,
  supabaseFromRequest,
  tokenIsExpiring,
} from "@/lib/spotifyOauth";

interface SpotifyConnectionRow {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  display_name: string | null;
}

interface SpotifyImage {
  url?: string;
}

interface SpotifyPlaybackItem {
  name?: string;
  duration_ms?: number;
  album?: { images?: SpotifyImage[] };
  artists?: { name?: string }[];
}

interface SpotifyPlayback {
  is_playing?: boolean;
  progress_ms?: number | null;
  device?: { name?: string; type?: string; is_active?: boolean };
  item?: SpotifyPlaybackItem | null;
}

function friendlySpotifyError(status: number): string {
  if (status === 403) return "Spotify Premium or an unrestricted active device is required for playback control.";
  if (status === 404) return "No active Spotify device. Open Spotify on your phone and start playback once.";
  if (status === 429) return "Spotify is rate-limiting. Try again in a moment.";
  return "Spotify request failed. Try again.";
}

function ms(ms: number | null | undefined): string {
  if (!ms || ms < 0) return "0:00";
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function normalizePlayback(data: SpotifyPlayback | null, displayName: string | null) {
  if (!data?.item) {
    return {
      connected: true,
      displayName,
      active: Boolean(data?.device?.is_active),
      isPlaying: Boolean(data?.is_playing),
      device: data?.device?.name ?? null,
      deviceType: data?.device?.type ?? null,
      track: null,
    };
  }
  const duration = data.item.duration_ms ?? 0;
  const progress = data.progress_ms ?? 0;
  return {
    connected: true,
    displayName,
    active: true,
    isPlaying: Boolean(data.is_playing),
    device: data.device?.name ?? null,
    deviceType: data.device?.type ?? null,
    track: {
      name: data.item.name ?? "Unknown track",
      artist: data.item.artists?.map((a) => a.name).filter(Boolean).join(", ") || "Spotify",
      image: data.item.album?.images?.[0]?.url ?? null,
      progressMs: progress,
      durationMs: duration,
      progress: duration ? Math.round((progress / duration) * 100) : 0,
      at: ms(progress),
      len: ms(duration),
    },
  };
}

async function spotifyFetch<T>(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  return res as Response & { json: () => Promise<T> };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "status";
  const origin = req.nextUrl.origin;

  const supa = supabaseFromRequest(req);
  const { data } = (await supa?.client.auth.getUser()) ?? { data: { user: null } };
  if (!supa || !data.user) return NextResponse.json({ connected: false, error: "Sign in first." }, { status: 401 });

  if (action === "disconnect") {
    const { error } = await supa.client.from("spotify_connections").delete().eq("user_id", data.user.id);
    if (error) return NextResponse.json({ connected: true, error: "Couldn't disconnect Spotify." }, { status: 500 });
    return NextResponse.json({ connected: false });
  }

  const { data: row, error } = await supa.client
    .from("spotify_connections")
    .select("access_token, refresh_token, expires_at, display_name")
    .maybeSingle();
  if (error) {
    console.error("Spotify connection read failed", error);
    return NextResponse.json({ connected: false, error: "Couldn't read Spotify connection." }, { status: 500 });
  }
  if (!row) return NextResponse.json({ connected: false });

  let conn = row as SpotifyConnectionRow;
  if (tokenIsExpiring(conn.expires_at)) {
    const cfg = spotifyConfig(origin);
    if (!cfg) return NextResponse.json({ connected: true, error: "Spotify OAuth isn't configured." }, { status: 500 });
    const grant = await refreshSpotifyToken(cfg, conn.refresh_token);
    if (!grant) return NextResponse.json({ connected: true, error: "Reconnect Spotify." }, { status: 401 });
    conn = {
      ...conn,
      access_token: grant.access_token,
      refresh_token: grant.refresh_token ?? conn.refresh_token,
      expires_at: expiresAt(grant.expires_in),
    };
    await supa.client
      .from("spotify_connections")
      .update({
        access_token: conn.access_token,
        refresh_token: conn.refresh_token,
        expires_at: conn.expires_at,
        scope: grant.scope ?? null,
        token_type: grant.token_type ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", data.user.id);
  }

  const playbackRes = await spotifyFetch<SpotifyPlayback>("/me/player", conn.access_token);
  if (playbackRes.status === 204) {
    return NextResponse.json({
      connected: true,
      displayName: conn.display_name,
      active: false,
      isPlaying: false,
      device: null,
      track: null,
    });
  }
  if (!playbackRes.ok) {
    return NextResponse.json(
      { connected: true, error: friendlySpotifyError(playbackRes.status) },
      { status: playbackRes.status === 401 ? 401 : 200 }
    );
  }

  const playback = await playbackRes.json();
  if (action === "toggle") {
    const command = playback.is_playing ? "/me/player/pause" : "/me/player/play";
    const res = await spotifyFetch(command, conn.access_token, { method: "PUT" });
    if (!res.ok && res.status !== 204) {
      return NextResponse.json({ connected: true, error: friendlySpotifyError(res.status) }, { status: 200 });
    }
  } else if (action === "next" || action === "previous") {
    const res = await spotifyFetch(`/me/player/${action}`, conn.access_token, { method: "POST" });
    if (!res.ok && res.status !== 204) {
      return NextResponse.json({ connected: true, error: friendlySpotifyError(res.status) }, { status: 200 });
    }
  }

  if (action === "status") return NextResponse.json(normalizePlayback(playback, conn.display_name));

  const freshRes = await spotifyFetch<SpotifyPlayback>("/me/player", conn.access_token);
  if (freshRes.status === 204) return NextResponse.json(normalizePlayback(null, conn.display_name));
  if (!freshRes.ok) return NextResponse.json({ connected: true, error: friendlySpotifyError(freshRes.status) });
  return NextResponse.json(normalizePlayback(await freshRes.json(), conn.display_name));
}
