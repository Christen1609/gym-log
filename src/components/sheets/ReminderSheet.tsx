import { Icon } from "@/components/IconSprite";
import type { GymLogState } from "@/lib/useGymLog";

/**
 * The once-a-day nudge. It only ever appears when the log itself says a
 * session is missing (see `workoutUnlogged` in useGymLog), and answering it
 * either way stops it asking again until tomorrow.
 */
export function ReminderSheet({ state }: { state: GymLogState }) {
  const days = state.daysSinceLast;

  const gap =
    days === null
      ? "Nothing is in the log yet."
      : days === 1
        ? "Your last session was yesterday."
        : `It has been ${days} days since your last session.`;

  const detail =
    state.lastSessionDay && state.lastSessionDate
      ? `Last in: ${state.lastSessionDay.toLowerCase()} on ${state.lastSessionDate}. Today reads as ${state.dayTitle.toLowerCase()}.`
      : `Log a set and the rotation starts tracking itself. Today reads as ${state.dayTitle.toLowerCase()}.`;

  return (
    <>
      <button className="scrim" onClick={state.confirmLoggedPrompt} aria-label="Close" />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="reminder-title">
        <div
          style={{ width: 42, height: 4, borderRadius: 99, background: "var(--color-divider)", margin: "0 auto 16px" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
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
            <Icon name="repeat" size={12} style={{ color: "var(--color-bg)" }} />
          </div>
          <span className="micro">{gap}</span>
        </div>

        <h2
          id="reminder-title"
          style={{ fontFamily: "var(--font-heading)", fontSize: 24, margin: "0 0 8px", letterSpacing: "-.01em" }}
        >
          Have you logged your most recent workout?
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 13.5, opacity: 0.62, lineHeight: 1.45 }}>{detail}</p>

        <div style={{ display: "flex", gap: 9 }}>
          <button className="btn btn-secondary" onClick={state.confirmLoggedPrompt} style={{ flex: 1, minHeight: 48 }}>
            It&rsquo;s logged
          </button>
          <button className="btn btn-primary" onClick={state.dismissLoggedPrompt} style={{ flex: 1, minHeight: 48 }}>
            <Icon name="up" size={16} />
            Log it now
          </button>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 11.5, opacity: 0.45, textAlign: "center" }}>
          Asked once a day, only when a session looks missing.
        </p>
      </div>
    </>
  );
}
