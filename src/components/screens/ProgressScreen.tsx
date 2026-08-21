import { Icon } from "@/components/IconSprite";
import { LABEL, TAGC, Status } from "@/lib/gymlog";
import type { GymLogState } from "@/lib/useGymLog";

export function ProgressScreen({ state }: { state: GymLogState }) {
  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "60px 18px 10px" }}>
        <button className="btn btn-secondary btn-icon" onClick={() => state.go("today")} style={{ width: 36, height: 36 }} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <div style={{ flex: 1, fontSize: 12.5, opacity: 0.55 }}>Last 5 sessions</div>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: "0 18px 30px" }}>
        <h1 style={{ fontSize: 34, margin: "0 0 4px", letterSpacing: "-.02em" }}>Read-out</h1>
        <p style={{ margin: "0 0 8px", fontSize: 13.5, opacity: 0.6 }}>Numbers computed in code. The coach only judges them.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 14 }}>
          {state.progressCards.map((p) => {
            const status = p.status as Status;
            return (
              <div key={p.name} className="card" style={{ padding: 16, gap: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={p.open}
                    style={{ flex: 1, justifyContent: "flex-start", fontSize: 16.5, color: "var(--color-text)", padding: 0 }}
                  >
                    {p.name}
                  </button>
                  <span className={`tag ${TAGC[status]}`}>{LABEL[status]}</span>
                </div>
                <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={{ width: "100%", height: 38, overflow: "visible" }}>
                  <polyline
                    points={p.spark}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    style={{ opacity: 0.75 }}
                  />
                </svg>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    margin: "12px 0 11px",
                    paddingTop: 11,
                    borderTop: "1px solid var(--color-divider)",
                  }}
                >
                  <span className="micro" style={{ flex: "none" }}>
                    Computed
                  </span>
                  <span className="num" style={{ fontSize: 12.5, opacity: 0.8 }}>
                    {p.computed}
                  </span>
                  <span data-status={status} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
                    <Icon name="tup" size={15} className="tri tri-up" />
                    <Icon name="tup" size={15} className="tri tri-grind" />
                    <Icon name="tdown" size={15} className="tri tri-down" />
                    <Icon name="flat" size={15} className="tri tri-flat" />
                    <span className="num" style={{ fontSize: 13, fontWeight: 700 }}>
                      {p.delta}
                    </span>
                  </span>
                </div>
                <div style={{ display: "flex", gap: 9 }}>
                  <div
                    style={{
                      width: 21,
                      height: 21,
                      borderRadius: 999,
                      background: "var(--color-accent)",
                      flex: "none",
                      display: "grid",
                      placeItems: "center",
                      marginTop: 1,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-bg)", display: "block" }} />
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{p.coach}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
