import { Icon } from "@/components/IconSprite";
import type { GymLogState } from "@/lib/useGymLog";

export function Island({ state }: { state: GymLogState }) {
  if (state.screen === "spotify") return null;

  return (
    <button
      className="island"
      data-playing={state.playing ? "true" : "false"}
      onClick={() => state.go("spotify")}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 99,
          background: "rgba(255,255,255,.14)",
          display: "grid",
          placeItems: "center",
          flex: "none",
        }}
      >
        <Icon name="music" size={12} strokeWidth={2.75} style={{ color: "#fff" }} />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          fontSize: 11.5,
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          letterSpacing: "-.01em",
        }}
      >
        {state.track.name}
      </span>
      <span className="eq">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          state.togglePlay();
        }}
        style={{
          width: 24,
          height: 24,
          borderRadius: 99,
          display: "grid",
          placeItems: "center",
          flex: "none",
          background: "rgba(255,255,255,.14)",
        }}
      >
        <Icon name={state.playing ? "pause" : "play"} size={12} style={{ color: "#fff" }} />
      </span>
    </button>
  );
}
