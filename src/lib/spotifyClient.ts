"use client";

export const spotifyOauthEnabled = Boolean(process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID);

export interface SpotifyTrack {
  name: string;
  artist: string;
  image: string | null;
  progressMs: number;
  durationMs: number;
  progress: number;
  at: string;
  len: string;
}

export interface SpotifyStatus {
  connected: boolean;
  displayName?: string | null;
  active?: boolean;
  isPlaying?: boolean;
  device?: string | null;
  deviceType?: string | null;
  track?: SpotifyTrack | null;
  error?: string;
}

export async function spotifyAction(action = "status"): Promise<SpotifyStatus> {
  const res = await fetch("/api/spotify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok && !data) return { connected: false, error: "Spotify request failed." };
  return (data ?? { connected: false }) as SpotifyStatus;
}
