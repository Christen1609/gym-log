import { Icon } from "@/components/IconSprite";
import type { GymLogState } from "@/lib/useGymLog";

const STEP_LABEL = ["One-time import", "Reading…", "Step 2 of 2 · confirm", "Done"];

const SAMPLE = `31 Jul — Chest
bench 82.5 5x5 rpe9 last set heavy
incline db 32 3x10
cable fly 17.5 3x12

29 Jul — Legs
squat 110 5x5 rpe8
rdl 90 3x8`;

const FOUND = [
  { n: "38", what: "dated sessions, back to 12 March" },
  { n: "412", what: "sets across 19 exercises" },
  { n: "4", what: "day rotation, repeated 9 times" },
];

const FLAGS = [
  '3 sets have no weight — "bench, felt strong". They will import as notes, not numbers.',
  "RPE appears on 61% of sets. Trends for the rest fall back to est-1RM and volume.",
];

export function ImportScreen({ state }: { state: GymLogState }) {
  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "60px 18px 10px" }}>
        <button className="btn btn-secondary btn-icon" onClick={() => state.go("today")} style={{ width: 36, height: 36 }} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <div style={{ flex: 1, fontSize: 12.5, opacity: 0.55 }}>{STEP_LABEL[state.imp]}</div>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: "0 18px 30px" }}>
        {state.imp === 0 && (
          <div>
            <h1 style={{ fontSize: 34, margin: "0 0 8px", letterSpacing: "-.02em" }}>Bring your history over</h1>
            <p style={{ margin: "0 0 20px", fontSize: 14, opacity: 0.65 }}>
              Paste your Notion log. The AI reads the dates, infers your rotation and the exercises you actually do. You confirm
              before anything is saved.
            </p>
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor="notionExport">Notion export or pasted text</label>
              <textarea
                id="notionExport"
                className="input"
                name="notionExport"
                readOnly
                style={{ minHeight: 170, padding: "14px 16px", fontSize: 12.5, lineHeight: 1.6, opacity: 0.75 }}
                value={SAMPLE}
              />
            </div>
            <button className="btn btn-primary btn-block" onClick={state.importNext} style={{ minHeight: 48 }}>
              Read it
            </button>
            <p style={{ margin: "12px 0 0", fontSize: 11.5, opacity: 0.5, textAlign: "center" }}>
              Re-runnable. Sessions already imported won&apos;t duplicate.
            </p>
          </div>
        )}

        {state.imp === 1 && (
          <div style={{ paddingTop: 60, textAlign: "center" }}>
            <div className="dot3" style={{ display: "flex", gap: 8, justifyContent: "center", color: "var(--color-accent)", marginBottom: 22 }}>
              <span style={{ width: 11, height: 11 }} />
              <span style={{ width: 11, height: 11 }} />
              <span style={{ width: 11, height: 11 }} />
            </div>
            <h2 style={{ fontSize: 25, margin: "0 0 6px" }}>Reading 142 blocks</h2>
            <p style={{ margin: 0, fontSize: 13.5, opacity: 0.6 }}>Parsing dates, exercises, loads and RPE.</p>
          </div>
        )}

        {state.imp === 2 && (
          <div>
            <h1 style={{ fontSize: 32, margin: "0 0 8px", letterSpacing: "-.02em" }}>Confirm what it found</h1>
            <p style={{ margin: "0 0 18px", fontSize: 13.5, opacity: 0.62 }}>Nothing is saved until you say so.</p>
            <div className="card" style={{ padding: 16, marginBottom: 11 }}>
              <div className="micro">Inferred rotation</div>
              <div className="xscroll" style={{ display: "flex", gap: 7, alignItems: "center", paddingTop: 4 }}>
                {state.rotation.map((d) => (
                  <span key={d.name} className="pill" style={{ borderColor: "var(--color-accent)" }}>
                    {d.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: 16, marginBottom: 11, gap: 9 }}>
              <div className="micro">Found</div>
              {FOUND.map((f) => (
                <div key={f.what} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span className="num" style={{ fontFamily: "var(--font-heading)", fontSize: 23, minWidth: 52 }}>
                    {f.n}
                  </span>
                  <span style={{ fontSize: 13.5, opacity: 0.7 }}>{f.what}</span>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 16, marginBottom: 16, gap: 7 }}>
              <div className="micro">Needs your eye</div>
              {FLAGS.map((w) => (
                <div key={w} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--color-accent)", flex: "none", marginTop: 7 }} />
                  <span style={{ fontSize: 13, lineHeight: 1.5 }}>{w}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-block" onClick={state.importNext} style={{ minHeight: 48 }}>
              Save to my log
            </button>
            <button className="btn btn-secondary btn-block" onClick={state.importReset} style={{ minHeight: 44 }}>
              Start over
            </button>
          </div>
        )}

        {state.imp === 3 && (
          <div style={{ paddingTop: 50, textAlign: "center" }}>
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 999,
                background: "var(--color-accent-2)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 22px",
              }}
            >
              <Icon name="check" size={34} strokeWidth={3} style={{ color: "var(--color-bg)" }} />
            </div>
            <h2 style={{ fontSize: 27, margin: "0 0 6px" }}>38 sessions saved</h2>
            <p style={{ margin: "0 0 24px", fontSize: 13.5, opacity: 0.62 }}>412 sets, back to 12 March. Your split is live.</p>
            <button className="btn btn-primary" onClick={() => state.go("today")} style={{ minHeight: 46, paddingInline: 26 }}>
              See today
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
