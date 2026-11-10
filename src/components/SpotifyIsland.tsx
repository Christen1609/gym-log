import { useEffect, useState } from "react";
import { Icon } from "@/components/IconSprite";
import { spotifyAction, spotifyOauthEnabled, type SpotifyStatus } from "@/lib/spotifyClient";
import type { GymLogState } from "@/lib/useGymLog";

export function SpotifyIsland({ state }: { state: GymLogState }) {
  const [status, setStatus] = useState<SpotifyStatus | null>(null);

  useEffect(() => {
    if (!spotifyOauthEnabled || state.screen === "spotify") return;
    let alive = true;
    const refresh = async () => {
      const next = await spotifyAction();
      if (alive) setStatus(next);
    };
    void refresh();
    const id = setInterval(refresh, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [state.screen]);

  if (!spotifyOauthEnabled || state.screen === "spotify" || !status?.connected) return null;

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatus(await spotifyAction("toggle"));
  };

  return (
    <button className="island" data-playing={status.isPlaying ? "true" : "false"} onClick={() => state.go("spotify")}>
      <span className="island-cover">
        {status.track?.image ? (
          <span style={{ display: "block", width: "100%", height: "100%", background: `center / cover url(${status.track.image})` }} />
        ) : (
          <Icon name="music" size={12} strokeWidth={2.75} style={{ color: "#fff" }} />
        )}
      </span>
      <span className="island-title">{status.track?.name ?? "Spotify"}</span>
      <span className="eq">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="island-play" onClick={toggle}>
        <Icon name={status.isPlaying ? "pause" : "play"} size={12} style={{ color: "#fff" }} />
      </span>
    </button>
  );
}
