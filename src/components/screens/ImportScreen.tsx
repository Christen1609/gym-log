import { useRef, useState } from "react";
import { Icon } from "@/components/IconSprite";
import { notionOauthEnabled } from "@/lib/notionImport";
import type { GymLogState } from "@/lib/useGymLog";

const STEP_LABEL = ["One-time import", "Reading…", "Step 2 of 2 · confirm", "Done"];

export function ImportScreen({ state }: { state: GymLogState }) {
  const [token, setToken] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const summary = state.importSummary;

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
              Connect Notion and pick your log. The AI reads the dates, infers your rotation and the exercises you actually do.
              You confirm before anything is saved.
            </p>

            {state.importError && (
              <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: "var(--color-accent)" }}>
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>{state.importError}</span>
              </div>
            )}

            {!state.notionConnected ? (
              <>
                {notionOauthEnabled && (
                  <>
                    <a className="btn btn-primary btn-block" href="/api/notion/login" style={{ minHeight: 48 }}>
                      Connect Notion
                    </a>
                    <p style={{ margin: "10px 0 0", fontSize: 11.5, opacity: 0.5, textAlign: "center" }}>
                      Notion asks you which pages to share. Pick your workout log.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px", opacity: 0.4 }}>
                      <span style={{ flex: 1, height: 1, background: "currentColor" }} />
                      <span style={{ fontSize: 11.5 }}>or use a token</span>
                      <span style={{ flex: 1, height: 1, background: "currentColor" }} />
                    </div>
                  </>
                )}
                <div className="field" style={{ marginBottom: 10 }}>
                  <label htmlFor="notionToken">Notion integration token</label>
                  <input
                    id="notionToken"
                    className="input"
                    name="notionToken"
                    type="password"
                    autoComplete="off"
                    placeholder="ntn_… or secret_…"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    style={{ padding: "14px 16px", fontSize: 13.5 }}
                  />
                </div>
                <button
                  className={`btn ${notionOauthEnabled ? "btn-secondary" : "btn-primary"} btn-block`}
                  onClick={() => void state.notionConnect(token)}
                  disabled={state.importBusy || !token.trim()}
                  style={{ minHeight: notionOauthEnabled ? 44 : 48 }}
                >
                  {state.importBusy ? "Connecting…" : "Connect with token"}
                </button>
                <button
                  className="btn btn-secondary btn-block"
                  onClick={() => setShowHelp((v) => !v)}
                  style={{ minHeight: 40, marginTop: 8 }}
                >
                  Where do I get a token?
                </button>
                {showHelp && (
                  <div className="card" style={{ padding: 14, marginTop: 10, gap: 6 }}>
                    <span style={{ fontSize: 13, lineHeight: 1.6 }}>
                      1. Open notion.so/my-integrations and create an internal integration for your workspace.
                      <br />
                      2. Copy its secret token and paste it above. It stays on this device.
                      <br />
                      3. On your workout log page in Notion: ··· menu → Connections → add your integration.
                    </span>
                  </div>
                )}
              </>
            ) : state.notionPages === null ? (
              <button className="btn btn-primary btn-block" onClick={state.notionListPages} disabled={state.importBusy} style={{ minHeight: 48 }}>
                {state.importBusy ? "Loading pages…" : "Show my Notion pages"}
              </button>
            ) : (
              <div className="card" style={{ padding: 8, marginBottom: 14, gap: 2 }}>
                <div className="micro" style={{ padding: "8px 8px 4px" }}>
                  {state.notionWorkspace ? `Pick your log · ${state.notionWorkspace}` : "Pick your log"}
                </div>
                {state.notionPages.length === 0 && (
                  <span style={{ fontSize: 13, opacity: 0.65, padding: "4px 8px 10px" }}>
                    Notion returned no pages. Share your log page with the integration (··· → Connections), then reload.
                  </span>
                )}
                {state.notionPages.map((p) => (
                  <button
                    key={p.id}
                    className="row"
                    onClick={() => state.importFromPage(p.id)}
                    style={{ background: "var(--color-surface)", textAlign: "left" }}
                  >
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{p.title}</span>
                    <Icon name="back" size={15} style={{ transform: "rotate(180deg)", opacity: 0.45 }} />
                  </button>
                ))}
              </div>
            )}

            {state.notionConnected && (
              <button className="btn btn-secondary btn-block" onClick={state.notionDisconnect} style={{ minHeight: 40, marginTop: 4 }}>
                Disconnect Notion
              </button>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 12px", opacity: 0.4 }}>
              <span style={{ flex: 1, height: 1, background: "currentColor" }} />
              <span style={{ fontSize: 11.5 }}>or paste it</span>
              <span style={{ flex: 1, height: 1, background: "currentColor" }} />
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="notionExport">Pasted log text</label>
              <textarea
                id="notionExport"
                ref={pasteRef}
                className="input"
                name="notionExport"
                placeholder={"31 Jul — Chest\nbench 82.5 5x5 rpe9 last set heavy\nincline db 32 3x10"}
                style={{ minHeight: 130, padding: "14px 16px", fontSize: 12.5, lineHeight: 1.6 }}
              />
            </div>
            <button
              className="btn btn-secondary btn-block"
              onClick={() => state.importFromText(pasteRef.current?.value ?? "")}
              style={{ minHeight: 44 }}
            >
              Read pasted text
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
            <h2 style={{ fontSize: 25, margin: "0 0 6px" }}>Reading your log</h2>
            <p style={{ margin: 0, fontSize: 13.5, opacity: 0.6 }}>Parsing dates, exercises, loads and RPE.</p>
          </div>
        )}

        {state.imp === 2 && summary && (
          <div>
            <h1 style={{ fontSize: 32, margin: "0 0 8px", letterSpacing: "-.02em" }}>Confirm what it found</h1>
            <p style={{ margin: "0 0 18px", fontSize: 13.5, opacity: 0.62 }}>Nothing is saved until you say so.</p>
            {summary.rotation.length > 0 && (
              <div className="card" style={{ padding: 16, marginBottom: 11 }}>
                <div className="micro">Inferred rotation</div>
                <div className="xscroll" style={{ display: "flex", gap: 7, alignItems: "center", paddingTop: 4 }}>
                  {summary.rotation.map((d) => (
                    <span key={d} className="pill" style={{ borderColor: "var(--color-accent)" }}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="card" style={{ padding: 16, marginBottom: 11, gap: 9 }}>
              <div className="micro">Found</div>
              {[
                { n: String(summary.sessions), what: summary.earliest ? `dated sessions, back to ${summary.earliest}` : "dated sessions" },
                { n: String(summary.sets), what: `sets across ${summary.exercises} exercises` },
              ].map((f) => (
                <div key={f.what} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span className="num" style={{ fontFamily: "var(--font-heading)", fontSize: 23, minWidth: 52 }}>
                    {f.n}
                  </span>
                  <span style={{ fontSize: 13.5, opacity: 0.7 }}>{f.what}</span>
                </div>
              ))}
            </div>
            {state.importFlags.length > 0 && (
              <div className="card" style={{ padding: 16, marginBottom: 16, gap: 7 }}>
                <div className="micro">Needs your eye</div>
                {state.importFlags.map((w) => (
                  <div key={w} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--color-accent)", flex: "none", marginTop: 7 }} />
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>{w}</span>
                  </div>
                ))}
              </div>
            )}
            {state.importError && (
              <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: "var(--color-accent)" }}>
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>{state.importError}</span>
              </div>
            )}
            <button className="btn btn-primary btn-block" onClick={state.importConfirm} disabled={state.importBusy} style={{ minHeight: 48 }}>
              {state.importBusy ? "Saving…" : "Save to my log"}
            </button>
            <button className="btn btn-secondary btn-block" onClick={state.importReset} style={{ minHeight: 44 }}>
              Start over
            </button>
          </div>
        )}

        {state.imp === 3 && state.importSaved && (
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
            <h2 style={{ fontSize: 27, margin: "0 0 6px" }}>
              {state.importSaved.sessions} session{state.importSaved.sessions === 1 ? "" : "s"} saved
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: 13.5, opacity: 0.62 }}>
              {state.importSaved.sets} sets added.
              {state.importSaved.skipped > 0 && ` ${state.importSaved.skipped} sessions were already in your log and were skipped.`}
            </p>
            <button className="btn btn-primary" onClick={() => state.go("today")} style={{ minHeight: 46, paddingInline: 26 }}>
              See today
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
