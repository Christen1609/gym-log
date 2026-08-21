import { useRef } from "react";
import { Icon } from "@/components/IconSprite";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { GymLogState } from "@/lib/useGymLog";

export function TodayScreen({ state }: { state: GymLogState }) {
  const draftRef = useRef<HTMLInputElement>(null);

  const send = () => {
    const el = draftRef.current;
    if (!el) return;
    state.submitText(el.value);
    el.value = "";
  };

  const chips = [
    { label: "What's today?", go: () => state.say("What's today?") },
    { label: "Am I stalling?", go: () => state.say("Am I stalling on bench?") },
    { label: "What is RPE?", go: () => state.say("What is RPE again?") },
  ];

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "60px 18px 8px",
        }}
      >
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 21, lineHeight: 1 }}>Gym Log</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThemeToggle onToggle={state.toggleTheme} />
          <button
            className="btn btn-secondary btn-icon"
            onClick={state.openMenu}
            style={{ width: 36, height: 36 }}
            aria-label="Menu"
          >
            <Icon name="menu" size={20} filled strokeWidth={0} />
          </button>
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: "0 18px 8px" }}>
        <div className="xscroll" style={{ display: "flex", gap: 7, padding: "8px 0 14px" }}>
          <span className="micro" style={{ alignSelf: "center", paddingRight: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <Icon name="repeat" size={13} />
            Rotation
          </span>
          {state.rotation.map((d) => (
            <span key={d.name} className="pill" data-active={d.active ? "true" : "false"}>
              {d.name}
            </span>
          ))}
        </div>

        <h1 style={{ fontSize: 40, margin: "0 0 6px", letterSpacing: "-.02em" }}>{state.dayTitle}</h1>
        <p style={{ margin: "0 0 20px", fontSize: 13.5, opacity: 0.6 }}>{state.daySub}</p>

        {state.logged.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div className="micro" style={{ marginBottom: 8, color: "var(--color-accent-2)" }}>
              Logged today
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {state.logged.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 15px",
                    borderRadius: 22,
                    background: "color-mix(in srgb, var(--color-accent-2) 16%, transparent)",
                  }}
                >
                  <Icon name="check" size={15} strokeWidth={3} style={{ color: "var(--color-accent-2)", flex: "none" }} />
                  <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{s.name}</span>
                  <span className="num" style={{ fontSize: 13, opacity: 0.75 }}>
                    {s.summary}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="micro" style={{ marginBottom: 8 }}>
          Planned · last time
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {state.todayPlan.map((ex) => (
            <button
              key={ex.name}
              className="row"
              onClick={ex.open}
              style={{ background: "var(--color-surface)", padding: "15px 16px" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 16.5, lineHeight: 1.2, marginBottom: 4 }}>
                  {ex.name}
                </div>
                <div className="num" style={{ fontSize: 12.5, opacity: 0.62 }}>
                  {ex.last}
                </div>
              </div>
              <span className="tag tag-neutral num" style={{ flex: "none" }}>
                {ex.est}
              </span>
              <Icon name="chev" size={17} style={{ opacity: 0.4, flex: "none" }} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: "none", padding: "8px 18px 30px", borderTop: "1px solid var(--color-divider)" }}>
        <div className="xscroll" style={{ display: "flex", gap: 7, padding: "2px 0 10px" }}>
          {chips.map((c) => (
            <button key={c.label} className="pill" onClick={c.go}>
              {c.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <input
            className="input"
            name="draft"
            ref={draftRef}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Log a set, or ask the coach…"
            style={{ flex: 1, minHeight: 46, fontSize: 14.5 }}
          />
          <button
            className="btn btn-primary btn-icon"
            onClick={send}
            style={{ width: 46, height: 46, flex: "none" }}
            aria-label="Send"
          >
            <Icon name="up" size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}
