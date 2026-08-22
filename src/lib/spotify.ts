"use client";

// Spotify Web API via Authorization Code + PKCE — runs entirely in the
// browser, no client secret needed. Optional by design, like Supabase: without
// NEXT_PUBLIC_SPOTIFY_CLIENT_ID the Spotify screen keeps its local mock state.
//
// Note on the redirect URI: Spotify no longer accepts `localhost` — register
// the loopback IP instead (e.g. http://127.0.0.1:3000/) and open the app at
// that address when connecting, so tokens land in the same origin's storage.

import { useCallback, useEffect, useState } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;

export const isSpotifyConfigured = Boolean(CLIENT_ID);

const TOKEN_KEY = "gymlog:spotify:v1";
const VERIFIER_KEY = "gymlog:spotify:verifier";
const SCOPES = "user-read-playback-state user-modify-playback-state";

interface StoredTokens {
  access: string;
  refresh: string;
  expiresAt: number; // epoch ms
}

function loadTokens(): StoredTokens | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

function saveTokens(data: { access_token: string; refresh_token?: string; expires_in: number }, prevRefresh?: string) {
  const tokens: StoredTokens = {
    access: data.access_token,
    // Refresh responses may omit refresh_token — keep the one we have.
    refresh: data.refresh_token ?? prevRefresh ?? "",
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function isSpotifyConnected(): boolean {
  return Boolean(loadTokens());
}

export function disconnectSpotify() {
  window.localStorage.removeItem(TOKEN_KEY);
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function redirectUri(): string {
  return `${window.location.origin}/`;
}

export async function beginSpotifyAuth() {
  if (!CLIENT_ID) throw new Error("Set NEXT_PUBLIC_SPOTIFY_CLIENT_ID in .env.local first.");
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  window.localStorage.setItem(VERIFIER_KEY, verifier);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: b64url(new Uint8Array(digest)),
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function tokenRequest(body: URLSearchParams): Promise<StoredTokens> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status}).`);
  const data = await res.json();
  saveTokens(data, loadTokens()?.refresh);
  return loadTokens()!;
}

// Called once on app load: if the URL carries an OAuth code from Spotify's
// redirect, exchange it and clean the URL. Returns true when a connection
// was just established.
export async function completeSpotifyAuthIfCallback(): Promise<boolean> {
  if (!CLIENT_ID) return false;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error");
  const verifier = window.localStorage.getItem(VERIFIER_KEY);
  if (denied) {
    url.searchParams.delete("error");
    url.searchParams.delete("state");
    window.history.replaceState({}, "", url.pathname + (url.search || ""));
    window.localStorage.removeItem(VERIFIER_KEY);
    throw new Error(`Spotify refused the connection: ${denied}.`);
  }
  if (!code || !verifier) return false;

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.pathname + (url.search || ""));
  window.localStorage.removeItem(VERIFIER_KEY);

  await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: CLIENT_ID,
      code_verifier: verifier,
    })
  );
  return true;
}

async function accessToken(): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt - 60_000) return tokens.access;
  if (!tokens.refresh || !CLIENT_ID) return null;
  try {
    const fresh = await tokenRequest(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh,
        client_id: CLIENT_ID,
      })
    );
    return fresh.access;
  } catch {
    // Refresh token revoked or expired — force a clean reconnect.
    disconnectSpotify();
    return null;
  }
}

export interface NowPlaying {
  name: string;
  artist: string;
  albumArt: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
  deviceName: string | null;
}

export async function fetchPlayerState(): Promise<NowPlaying | null> {
  const token = await accessToken();
  if (!token) throw new Error("Not connected to Spotify.");
  const res = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null; // nothing playing, no active device
  if (!res.ok) throw new Error(`Spotify player request failed (${res.status}).`);
  const data = await res.json();
  const item = data.item;
  if (!item) return null;
  return {
    name: item.name,
    artist: (item.artists ?? []).map((a: { name: string }) => a.name).join(", "),
    albumArt: item.album?.images?.[0]?.url ?? null,
    progressMs: data.progress_ms ?? 0,
    durationMs: item.duration_ms ?? 0,
    isPlaying: Boolean(data.is_playing),
    deviceName: data.device?.name ?? null,
  };
}

export type PlayerCommand = "play" | "pause" | "next" | "previous";

export async function sendPlayerCommand(cmd: PlayerCommand): Promise<void> {
  const token = await accessToken();
  if (!token) throw new Error("Not connected to Spotify.");
  const routes: Record<PlayerCommand, { method: "PUT" | "POST"; path: string }> = {
    play: { method: "PUT", path: "play" },
    pause: { method: "PUT", path: "pause" },
    next: { method: "POST", path: "next" },
    previous: { method: "POST", path: "previous" },
  };
  const { method, path } = routes[cmd];
  const res = await fetch(`https://api.spotify.com/v1/me/player/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 403) throw new Error("Playback control needs Spotify Premium.");
  if (res.status === 404) throw new Error("No active Spotify device — start playing on your phone or desktop first.");
  if (!res.ok && res.status !== 204) throw new Error(`Spotify command failed (${res.status}).`);
}

export interface SpotifyState {
  configured: boolean;
  connected: boolean;
  now: NowPlaying | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  command: (cmd: PlayerCommand) => void;
}

// Polls the player while `active` (the Spotify screen is open) and finishes
// the OAuth redirect on mount. All state is per-browser via localStorage.
export function useSpotify(active: boolean): SpotifyState {
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- one-time sync with localStorage + OAuth redirect */
  useEffect(() => {
    if (!isSpotifyConfigured) return;
    setConnected(isSpotifyConnected());
    completeSpotifyAuthIfCallback()
      .then((done) => {
        if (done) setConnected(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Spotify connection failed."));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const refresh = useCallback(async () => {
    try {
      const state = await fetchPlayerState();
      setNow(state);
      setError(null);
    } catch (err) {
      if (!isSpotifyConnected()) setConnected(false); // token refresh failed
      setError(err instanceof Error ? err.message : "Spotify request failed.");
    }
  }, []);

  useEffect(() => {
    if (!active || !connected) return;
    // First poll deferred a tick so the effect body itself never sets state.
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, connected, refresh]);

  const command = useCallback(
    (cmd: PlayerCommand) => {
      void (async () => {
        try {
          await sendPlayerCommand(cmd);
          // Give Spotify a beat to apply the change before re-reading.
          setTimeout(() => void refresh(), 400);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Spotify command failed.");
        }
      })();
    },
    [refresh]
  );

  return {
    configured: isSpotifyConfigured,
    connected,
    now,
    error,
    connect: () => void beginSpotifyAuth().catch((err) => setError(err instanceof Error ? err.message : "Spotify connection failed.")),
    disconnect: () => {
      disconnectSpotify();
      setConnected(false);
      setNow(null);
      setError(null);
    },
    command,
  };
}
