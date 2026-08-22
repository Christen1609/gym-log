import { Icon } from "@/components/IconSprite";
import type { GymLogState } from "@/lib/useGymLog";

const ITEMS: { icon: string; label: string; screen: Parameters<GymLogState["go"]>[0] }[] = [
  { icon: "pulse", label: "Progress read-out", screen: "progress" },
  { icon: "chat", label: "Coach", screen: "chat" },
  { icon: "import", label: "Import my Notion", screen: "import" },
  { icon: "cog", label: "Settings", screen: "settings" },
];

export function MenuSheet({ state }: { state: GymLogState }) {
  return (
    <>
      <button className="scrim" onClick={state.closeSheet} aria-label="Close" />
      <div className="sheet">
        <div style={{ width: 42, height: 4, borderRadius: 99, background: "var(--color-divider)", margin: "0 auto 12px" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {ITEMS.map((item) => (
            <button key={item.screen} className="row" onClick={() => state.go(item.screen)}>
              <Icon name={item.icon} size={20} style={{ color: "var(--color-accent)" }} />
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{item.label}</span>
              <Icon name="chev" size={17} style={{ opacity: 0.35 }} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
