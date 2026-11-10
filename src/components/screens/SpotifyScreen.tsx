import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/IconSprite";
import { spotifyAction, spotifyOauthEnabled, type SpotifyStatus } from "@/lib/spotifyClient";
import type { GymLogState } from "@/lib/useGymLog";

export function SpotifyScreen({ state }: { state: GymLogState }) {
  const router = useRouter();
  const [status, setStatus] = useState<SpotifyStatus>({ connected: false });
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatus(await spotifyAction());
  }, []);

  const refresh = useCallback(async (action = "status") => {
    setBusy(true);
    try {
      setStatus(await spotifyAction(action));
    } finally {
      setBusy(false);
    }
  }, []);

  // set-state-in-effect is intentional here: this screen syncs to Spotify's
  // external playback state once on mount, then polls while open.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadStatus();
    const id = setInterval(() => void loadStatus(), 15000);
    return () => clearInterval(id);
  }, [loadStatus]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const track = status.track;
  const connect = () => {
    router.push("/api/spotify/login");
  };

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "60px 18px 10px" }}>
        <button className="btn btn-secondary btn-icon" onClick={() => state.go("today")} style={{ width: 36, height: 36 }} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <div style={{ flex: 1, fontSize: 12.5, opacity: 0.55 }}>Spotify</div>
        <span className="tag tag-neutral">{status.connected ? status.displayName ?? "Connected" : "Not connected"}</span>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: "14px 26px 30px", display: "flex", flexDirection: "column" }}>
        {!spotifyOauthEnabled && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Spotify is not configured</div>
            <p style={{ margin: 0, fontSize: 13.5, opacity: 0.62 }}>
              Add the Spotify client id, secret, and redirect URI to enable the connection.
            </p>
          </div>
        )}
        {state.spotifyMessage && (
          <p style={{ margin: "0 0 14px", fontSize: 12.5, opacity: 0.72 }}>{state.spotifyMessage}</p>
        )}

        {!status.connected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 40 }}>
            <div
              className="stripe washed elev-lg"
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: 34,
                backgroundColor: "var(--color-accent-2)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Icon name="music" size={52} style={{ opacity: 0.55 }} />
            </div>
            <h1 style={{ fontSize: 30, letterSpacing: "-.02em" }}>Connect Spotify</h1>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.62, lineHeight: 1.5 }}>
              Show the current track in the island and control your active Spotify device from the app.
            </p>
            <button className="btn btn-primary btn-block" disabled={!spotifyOauthEnabled} onClick={connect} style={{ minHeight: 50 }}>
              Connect Spotify
            </button>
          </div>
        ) : (
          <>
            <div
              className="elev-lg"
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: 34,
                background: track?.image ? `center / cover url(${track.image})` : "var(--color-surface)",
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
              }}
            >
              {!track?.image && <Icon name="music" size={48} style={{ opacity: 0.45 }} />}
            </div>

            <h2 style={{ fontSize: 26, margin: "22px 0 2px", letterSpacing: "-.02em" }}>
              {track?.name ?? "No active track"}
            </h2>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.6 }}>
              {track?.artist ?? "Open Spotify on a device and start playback once."}
            </p>

            <div
              style={{
                margin: "22px 0 8px",
                height: 5,
                borderRadius: 99,
                background: "color-mix(in srgb, var(--color-text) 14%, transparent)",
                overflow: "hidden",
              }}
            >
              <div style={{ height: "100%", borderRadius: 99, background: "var(--color-accent)", width: `${track?.progress ?? 0}%` }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }} className="micro">
              <span>{track?.at ?? "0:00"}</span>
              <span>{track?.len ?? "0:00"}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginTop: 26 }}>
              <button className="btn btn-icon" onClick={() => refresh("previous")} disabled={busy} style={{ width: 52, height: 52 }} aria-label="Previous">
                <Icon name="prev" size={22} filled strokeWidth={2.2} />
              </button>
              <button
                className="btn btn-primary btn-icon"
                onClick={() => refresh("toggle")}
                disabled={busy}
                style={{ width: 68, height: 68 }}
                aria-label={status.isPlaying ? "Pause" : "Play"}
              >
                <Icon name={status.isPlaying ? "pause" : "play"} size={26} />
              </button>
              <button className="btn btn-icon" onClick={() => refresh("next")} disabled={busy} style={{ width: 52, height: 52 }} aria-label="Next">
                <Icon name="next" size={22} filled strokeWidth={2.2} />
              </button>
            </div>

            <div className="micro" style={{ margin: "30px 0 8px" }}>
              Device
            </div>
            <div className="row" style={{ background: "var(--color-surface)", cursor: "default" }}>
              <Icon name="music" size={18} style={{ color: "var(--color-accent-2)", flex: "none" }} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{status.device ?? "No active device"}</span>
              <span className="tag tag-neutral">{status.active ? "Active" : "Idle"}</span>
            </div>

            {status.error && <p style={{ margin: "14px 0 0", fontSize: 12.5, opacity: 0.7 }}>{status.error}</p>}

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button className="btn btn-secondary" onClick={() => refresh()} disabled={busy} style={{ flex: 1 }}>
                Refresh
              </button>
              <button className="btn btn-secondary" onClick={() => refresh("disconnect")} disabled={busy} style={{ flex: 1 }}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
