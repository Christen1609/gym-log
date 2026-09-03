import { useEffect, useRef } from "react";
import { Icon } from "@/components/IconSprite";
import { ThemeToggle } from "@/components/ThemeToggle";
import { proposalText } from "@/lib/coachActions";
import type { GymLogState, ProposalCard } from "@/lib/useGymLog";

/** A change the coach wants to make to the log. Nothing happens until Confirm. */
function ProposalCardView({ card, state, msgId }: { card: ProposalCard; state: GymLogState; msgId: number }) {
  const { proposal, status } = card;
  return (
    <div className="card" style={{ padding: "12px 14px", marginLeft: 35, maxWidth: "78%", gap: 9 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>
        {proposalText(proposal, state.units, state.todayISO, "propose")}
      </div>
      {status === "pending" && (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1, minHeight: 38 }} onClick={() => state.applyProposal(msgId, proposal.id)}>
            Confirm
          </button>
          <button className="btn btn-secondary" style={{ flex: 1, minHeight: 38 }} onClick={() => state.dismissProposal(msgId, proposal.id)}>
            Skip
          </button>
        </div>
      )}
      {status === "applying" && <div style={{ fontSize: 12, opacity: 0.6 }}>Saving…</div>}
      {status === "done" && <span className="tag tag-accent-2" style={{ alignSelf: "flex-start" }}>Done</span>}
      {status === "dismissed" && <span className="tag tag-neutral" style={{ alignSelf: "flex-start" }}>Skipped</span>}
      {status === "failed" && <div style={{ fontSize: 12, opacity: 0.7 }}>Couldn&apos;t save that. Check you&apos;re signed in and try again.</div>}
    </div>
  );
}

function Avatar({ pulse }: { pulse?: boolean }) {
  return (
    <div
      className={`av${pulse ? " av-pulse" : ""}`}
      style={{
        width: 26,
        height: 26,
        borderRadius: 999,
        background: "var(--color-accent)",
        flex: "none",
        display: "grid",
        placeItems: "center",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--color-bg)", display: "block" }} />
    </div>
  );
}

export function ChatScreen({ state }: { state: GymLogState }) {
  const chatRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = () => {
    const el = chatRef.current;
    if (!el) return;
    state.submitText(el.value);
    el.value = "";
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.msgs, state.typing]);

  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "60px 18px 10px",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        <button className="btn btn-secondary btn-icon" onClick={() => state.go("today")} style={{ width: 36, height: 36 }} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, lineHeight: 1.1 }}>Coach</div>
          <div style={{ fontSize: 11, opacity: 0.55 }}>Reads your numbers, never invents them</div>
        </div>
        <ThemeToggle onToggle={state.toggleTheme} />
      </div>

      <div
        className="scroll"
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}
      >
        {state.msgs.map((m) => (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="msg" data-who={m.who}>
              <Avatar />
              <div className="bub">{m.text}</div>
            </div>
            {m.proposals?.map((card) => (
              <ProposalCardView key={card.proposal.id} card={card} state={state} msgId={m.id} />
            ))}
            {(m.proposals?.filter((c) => c.status === "pending").length ?? 0) > 1 && (
              <button
                className="btn btn-primary"
                style={{ marginLeft: 35, maxWidth: "78%", minHeight: 40 }}
                onClick={() => state.applyAllProposals(m.id)}
              >
                Confirm all
              </button>
            )}
          </div>
        ))}
        {state.typing && (
          <div className="msg" data-who="coach">
            <Avatar pulse />
            <div className="thinkbub">
              <span className="jump">
                <i />
                <i />
                <i />
              </span>
              <span key={state.thinkKey} className="tw">
                {state.thinkWord}
              </span>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          flex: "none",
          padding: "10px 18px 30px",
          borderTop: "1px solid var(--color-divider)",
          display: "flex",
          gap: 9,
          alignItems: "center",
        }}
      >
        <input
          className="input"
          name="chatMessage"
          ref={chatRef}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the coach…"
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
  );
}
