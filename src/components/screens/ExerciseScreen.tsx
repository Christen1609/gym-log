import { Icon } from "@/components/IconSprite";
import { round1, loadSummary, epley } from "@/lib/gymlog";
import type { GymLogState } from "@/lib/useGymLog";

function TrendArrows({ status, size = 18 }: { status: string; size?: number }) {
  return (
    <div data-status={status} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Icon name="tup" size={size} className="tri tri-up" />
      <Icon name="tup" size={size} className="tri tri-grind" />
      <Icon name="tdown" size={size} className="tri tri-down" />
      <Icon name="flat" size={size} className="tri tri-flat" />
    </div>
  );
}

export function ExerciseScreen({ state }: { state: GymLogState }) {
  const ro = state.readOutData;
  const h = ro.hist;
  const last = h[h.length - 1];
  const units = state.units;

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "60px 18px 10px" }}>
        <button className="btn btn-secondary btn-icon" onClick={state.back} style={{ width: 36, height: 36 }} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <div style={{ flex: 1, fontSize: 12.5, opacity: 0.55 }}>{state.exGroup}</div>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: "0 18px 30px" }}>
        <h1 style={{ fontSize: 34, margin: "0 0 18px", letterSpacing: "-.02em" }}>{state.activeEx}</h1>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div className="micro" style={{ marginBottom: 2 }}>
                est 1RM · Epley
              </div>
              <div className="num" style={{ fontFamily: "var(--font-heading)", fontSize: 38, lineHeight: 1 }}>
                {round1(state.cv(ro.e1rm))} {units}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 6 }}>
              <TrendArrows status={ro.status} />
              <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>
                {ro.pct >= 0 ? "+" : ""}
                {round1(ro.pct)}%
              </span>
            </div>
          </div>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 56, marginTop: 6, overflow: "visible" }}>
            <polyline
              points={ro.spark(30)}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between" }} className="micro">
            <span>{h[0].date}</span>
            <span>{last.date}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 9, margin: "14px 0 22px" }}>
          <div className="card" style={{ flex: 1, padding: 14, gap: 2 }}>
            <div className="micro">Last time</div>
            <div className="num" style={{ fontFamily: "var(--font-heading)", fontSize: 19 }}>
              {loadSummary(last, units)}
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.6 }}>{last.note ? `“${last.note}”` : "no note"}</div>
          </div>
          <div className="card" style={{ flex: 1, padding: 14, gap: 2 }}>
            <div className="micro">RPE trend</div>
            <div className="num" style={{ fontFamily: "var(--font-heading)", fontSize: 19 }}>
              {ro.rpes.length ? `${ro.rpes[0]} → ${ro.rpes[ro.rpes.length - 1]}` : "not logged"}
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.6 }}>
              {ro.rpes.length
                ? ro.rpeDelta > 0.25
                  ? "harder for the same work"
                  : ro.rpeDelta < -0.25
                  ? "easier for the same work"
                  : "holding steady"
                : "trend uses volume only"}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            padding: 15,
            borderRadius: 26,
            background: "color-mix(in srgb, var(--color-accent) 13%, transparent)",
            marginBottom: 22,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              background: "var(--color-accent)",
              flex: "none",
              display: "grid",
              placeItems: "center",
              marginTop: 1,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--color-bg)", display: "block" }} />
          </div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{state.coachText}</p>
        </div>

        <div className="micro" style={{ marginBottom: 6 }}>
          History
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Load</th>
              <th>RPE</th>
              <th style={{ textAlign: "right" }}>1RM</th>
            </tr>
          </thead>
          <tbody>
            {h
              .slice()
              .reverse()
              .map((r) => (
                <tr key={r.date}>
                  <td style={{ opacity: 0.65, fontSize: 13 }}>{r.date}</td>
                  <td className="num" style={{ fontSize: 13 }}>
                    {loadSummary(r, units)}
                  </td>
                  <td className="num" style={{ fontSize: 13, opacity: 0.7 }}>
                    {r.rpe === null || r.rpe === undefined ? "—" : r.rpe}
                  </td>
                  <td className="num" style={{ fontSize: 13, textAlign: "right", fontWeight: 700 }}>
                    {round1(state.cv(epley(r.w, r.reps)))}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
