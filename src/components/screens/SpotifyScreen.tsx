import { Icon } from "@/components/IconSprite";
import type { GymLogState } from "@/lib/useGymLog";

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function SpotifyScreen({ state }: { state: GymLogState }) {
  const sp = state.spotify;
  const live = sp.configured && sp.connected;

  // Same display shape whether the data is live (Spotify API) or the local mock.
  const track = live
    ? sp.now
      ? {
          name: sp.now.name,
          artist: sp.now.artist,
          pct: sp.now.durationMs ? (sp.now.progressMs / sp.now.durationMs) * 100 : 0,
          at: fmtMs(sp.now.progressMs),
          len: fmtMs(sp.now.durationMs),
        }
      : { name: "Nothing playing", artist: "Start playback on any device", pct: 0, at: "0:00", len: "0:00" }
    : state.track;
  const playing = live ? Boolean(sp.now?.isPlaying) : state.playing;
  const deviceTag = live
    ? sp.now?.deviceName
      ? `${sp.now.deviceName} · active`
      : "No active device"
    : state.playing
      ? "iPhone · active"
      : "No active device";

  const onToggle = live ? () => sp.command(playing ? "pause" : "play") : state.togglePlay;
  const onNext = live ? () => sp.command("next") : state.nextTrack;
  const onPrev = live ? () => sp.command("previous") : state.prevTrack;

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "60px 18px 10px" }}>
        <button className="btn btn-secondary btn-icon" onClick={() => state.go("today")} style={{ width: 36, height: 36 }} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <div style={{ flex: 1, fontSize: 12.5, opacity: 0.55 }}>Now playing</div>
        <span className="tag tag-accent-2">{deviceTag}</span>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: "14px 26px 30px", display: "flex", flexDirection: "column" }}>
        {sp.configured && !sp.connected ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 999,
                background: "var(--color-accent-2)",
                display: "grid",
                placeItems: "center",
                marginBottom: 24,
              }}
            >
              <Icon name="music" size={30} style={{ color: "var(--color-bg)" }} />
            </div>
            <h2 style={{ fontSize: 26, margin: "0 0 8px", letterSpacing: "-.02em" }}>Connect Spotify</h2>
            <p style={{ margin: "0 0 24px", fontSize: 14, opacity: 0.62, lineHeight: 1.5 }}>
              See what&apos;s playing and control it from here. You&apos;ll approve access once on Spotify, then it stays
              linked in this browser.
            </p>
            <button className="btn btn-primary btn-block" onClick={sp.connect} style={{ minHeight: 50 }}>
              Connect Spotify
            </button>
            {sp.error && (
              <p style={{ margin: "14px 0 0", fontSize: 12.5, opacity: 0.75, lineHeight: 1.5 }}>{sp.error}</p>
            )}
          </div>
        ) : (
          <>
            <div
              className={live && sp.now?.albumArt ? "elev-lg" : "stripe washed elev-lg"}
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: 34,
                backgroundColor: "var(--color-accent-2)",
                backgroundImage: live && sp.now?.albumArt ? `url(${sp.now.albumArt})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
              }}
            >
              {!(live && sp.now?.albumArt) && (
                <span className="micro" style={{ opacity: 0.8, fontSize: 11 }}>
                  album art
                </span>
              )}
            </div>
            <h2 style={{ fontSize: 26, margin: "22px 0 2px", letterSpacing: "-.02em" }}>{track.name}</h2>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.6 }}>{track.artist}</p>
            <div
              style={{
                margin: "22px 0 8px",
                height: 5,
                borderRadius: 99,
                background: "color-mix(in srgb, var(--color-text) 14%, transparent)",
                overflow: "hidden",
              }}
            >
              <div style={{ height: "100%", borderRadius: 99, background: "var(--color-accent)", width: `${track.pct}%` }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }} className="micro">
              <span>{track.at}</span>
              <span>{track.len}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginTop: 26 }}>
              <button className="btn btn-icon" onClick={onPrev} style={{ width: 52, height: 52 }} aria-label="Previous">
                <Icon name="prev" size={22} filled strokeWidth={2.2} />
              </button>
              <button
                className="btn btn-primary btn-icon"
                onClick={onToggle}
                style={{ width: 68, height: 68 }}
                aria-label={playing ? "Pause" : "Play"}
              >
                <Icon name={playing ? "pause" : "play"} size={26} />
              </button>
              <button className="btn btn-icon" onClick={onNext} style={{ width: 52, height: 52 }} aria-label="Next">
                <Icon name="next" size={22} filled strokeWidth={2.2} />
              </button>
            </div>
            {live && sp.error && (
              <p style={{ margin: "18px 0 0", fontSize: 12.5, opacity: 0.75, lineHeight: 1.5, textAlign: "center" }}>
                {sp.error}
              </p>
            )}
            {!live && (
              <>
                <div className="micro" style={{ margin: "30px 0 8px" }}>
                  Playlist
                </div>
                <button className="row" onClick={state.nextTrack} style={{ background: "var(--color-surface)" }}>
                  <Icon name="music" size={18} style={{ color: "var(--color-accent-2)", flex: "none" }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Heavy Chest Day</span>
                  <span className="micro">32 tracks</span>
                </button>
              </>
            )}
            {live && (
              <button
                className="btn"
                onClick={sp.disconnect}
                style={{ marginTop: 26, fontSize: 12.5, opacity: 0.6, background: "none", border: "none" }}
              >
                Disconnect Spotify
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
