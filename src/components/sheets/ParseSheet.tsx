import { Icon } from "@/components/IconSprite";
import { epley, round1 } from "@/lib/gymlog";
import type { GymLogState } from "@/lib/useGymLog";

export function ParseSheet({ state }: { state: GymLogState }) {
  const p = state.parsed;
  if (!p) return null;

  const fields = [
    { k: "Exercise", v: p.name },
    { k: "Weight", v: `${state.cv(p.weight)} ${state.units}` },
    { k: "Sets × reps", v: `${p.sets} × ${p.reps}` },
    { k: "RPE", v: p.rpe === null ? "not logged" : String(p.rpe) },
    { k: "est 1RM", v: `${round1(state.cv(epley(p.weight, p.reps)))} ${state.units}` },
    ...(p.note ? [{ k: "Note", v: p.note }] : []),
  ];

  return (
    <>
      <button className="scrim" onClick={state.closeSheet} aria-label="Close" />
      <div className="sheet">
        <div style={{ width: 42, height: 4, borderRadius: 99, background: "var(--color-divider)", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
          <div
            style={{
              width: 21,
              height: 21,
              borderRadius: 999,
              background: "var(--color-accent)",
              flex: "none",
              display: "grid",
              placeItems: "center",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--color-surface)", display: "block" }} />
          </div>
          <span className="micro">Parsed — check before saving</span>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, opacity: 0.5, fontStyle: "italic" }}>“{state.raw}”</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {fields.map((f) => (
            <div
              key={f.k}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 20,
                background: "var(--color-bg)",
              }}
            >
              <span className="micro" style={{ flex: "none", width: 78 }}>
                {f.k}
              </span>
              <span className="num" style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>
                {f.v}
              </span>
            </div>
          ))}
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 11.5, opacity: 0.5, textAlign: "center" }}>
          {p.rpe === null ? "No RPE — trend will use est-1RM and volume only." : "Nothing is saved until you confirm."}
        </p>
        <div style={{ display: "flex", gap: 9 }}>
          <button className="btn btn-secondary" onClick={state.closeSheet} style={{ flex: 1, minHeight: 48 }}>
            Edit
          </button>
          <button className="btn btn-primary" onClick={state.confirmSave} style={{ flex: 2, minHeight: 48 }}>
            <Icon name="check" size={17} />
            Save {p.sets} sets
          </button>
        </div>
      </div>
    </>
  );
}
