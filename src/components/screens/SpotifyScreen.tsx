import { Icon } from "@/components/IconSprite";
import type { GymLogState } from "@/lib/useGymLog";

export function SpotifyScreen({ state }: { state: GymLogState }) {
  const { track, playing } = state;

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "60px 18px 10px" }}>
        <button className="btn btn-secondary btn-icon" onClick={() => state.go("today")} style={{ width: 36, height: 36 }} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <div style={{ flex: 1, fontSize: 12.5, opacity: 0.55 }}>Now playing</div>
        <span className="tag tag-accent-2">{playing ? "iPhone · active" : "No active device"}</span>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: "14px 26px 30px", display: "flex", flexDirection: "column" }}>
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
          <span className="micro" style={{ opacity: 0.8, fontSize: 11 }}>
            album art
          </span>
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
          <button className="btn btn-icon" onClick={state.prevTrack} style={{ width: 52, height: 52 }} aria-label="Previous">
            <Icon name="prev" size={22} filled strokeWidth={2.2} />
          </button>
          <button
            className="btn btn-primary btn-icon"
            onClick={state.togglePlay}
            style={{ width: 68, height: 68 }}
            aria-label="Play"
          >
            <Icon name={playing ? "pause" : "play"} size={26} />
          </button>
          <button className="btn btn-icon" onClick={state.nextTrack} style={{ width: 52, height: 52 }} aria-label="Next">
            <Icon name="next" size={22} filled strokeWidth={2.2} />
          </button>
        </div>
        <div className="micro" style={{ margin: "30px 0 8px" }}>
          Playlist
        </div>
        <button className="row" onClick={state.nextTrack} style={{ background: "var(--color-surface)" }}>
          <Icon name="music" size={18} style={{ color: "var(--color-accent-2)", flex: "none" }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Heavy Chest Day</span>
          <span className="micro">32 tracks</span>
        </button>
      </div>
    </div>
  );
}
