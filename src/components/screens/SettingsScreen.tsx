import { useState } from "react";
import { Icon } from "@/components/IconSprite";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { CoachProfile } from "@/lib/db";
import type { GymLogState } from "@/lib/useGymLog";

const GOALS = ["Strength", "Muscle", "General fitness"];
const EXPERIENCE = ["New", "Intermediate", "Advanced"];
const DAYS = [2, 3, 4, 5, 6];

/**
 * What the coach knows about you. Mounted with a key that flips when the
 * stored profile arrives, so the fields start from what's saved.
 */
function CoachProfileCard({ profile, onSave }: { profile: CoachProfile | null; onSave: (p: CoachProfile) => void }) {
  const [goal, setGoal] = useState(profile?.goal ?? "");
  const [experience, setExperience] = useState(profile?.experience ?? "");
  const [days, setDays] = useState<number | null>(profile?.days_per_week ?? null);
  const [injuries, setInjuries] = useState(profile?.injuries ?? "");
  const [preferences, setPreferences] = useState(profile?.preferences ?? "");
  const [saved, setSaved] = useState(false);

  const touch = () => setSaved(false);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 11, gap: 12 }}>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>Your profile</div>
        <div style={{ fontSize: 11.5, opacity: 0.55 }}>The coach reads this with every answer.</div>
      </div>
      <div>
        <div className="micro" style={{ marginBottom: 6 }}>Goal</div>
        <div className="xscroll" style={{ display: "flex", gap: 7 }}>
          {GOALS.map((g) => (
            <button key={g} className="pill" data-active={goal === g ? "true" : "false"} onClick={() => { setGoal(goal === g ? "" : g); touch(); }}>
              {g}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="micro" style={{ marginBottom: 6 }}>Experience</div>
        <div className="xscroll" style={{ display: "flex", gap: 7 }}>
          {EXPERIENCE.map((e) => (
            <button key={e} className="pill" data-active={experience === e ? "true" : "false"} onClick={() => { setExperience(experience === e ? "" : e); touch(); }}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="micro" style={{ marginBottom: 6 }}>Days per week</div>
        <div className="xscroll" style={{ display: "flex", gap: 7 }}>
          {DAYS.map((d) => (
            <button key={d} className="pill" data-active={days === d ? "true" : "false"} onClick={() => { setDays(days === d ? null : d); touch(); }}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="coachInjuries">Injuries or limitations</label>
        <input
          id="coachInjuries"
          className="input"
          value={injuries}
          onChange={(e) => { setInjuries(e.target.value); touch(); }}
          placeholder="e.g. left shoulder — no heavy overhead"
          style={{ padding: "12px 14px", fontSize: 13.5 }}
        />
      </div>
      <div className="field">
        <label htmlFor="coachPrefs">Anything else the coach should know</label>
        <input
          id="coachPrefs"
          className="input"
          value={preferences}
          onChange={(e) => { setPreferences(e.target.value); touch(); }}
          placeholder="e.g. short sessions, hates leg press"
          style={{ padding: "12px 14px", fontSize: 13.5 }}
        />
      </div>
      <button
        className="btn btn-primary btn-block"
        style={{ minHeight: 44 }}
        disabled={saved}
        onClick={() => {
          onSave({
            goal: goal || null,
            experience: experience || null,
            days_per_week: days,
            injuries: injuries.trim() || null,
            preferences: preferences.trim() || null,
          });
          setSaved(true);
        }}
      >
        {saved ? "Saved" : "Save profile"}
      </button>
    </div>
  );
}

export function SettingsScreen({ state }: { state: GymLogState }) {
  return (
    <div className="screen" style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, padding: "60px 18px 10px" }}>
        <button className="btn btn-secondary btn-icon" onClick={() => state.go("today")} style={{ width: 36, height: 36 }} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <div style={{ flex: 1, fontSize: 12.5, opacity: 0.55 }}>One user · your data</div>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0, padding: "0 18px 30px" }}>
        <h1 style={{ fontSize: 34, margin: "0 0 22px", letterSpacing: "-.02em" }}>Settings</h1>

        <div className="micro" style={{ marginBottom: 9 }}>
          Appearance
        </div>
        <div className="card" style={{ padding: "14px 16px", marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Theme</div>
            <div style={{ fontSize: 11.5, opacity: 0.55 }}>
              {state.theme === "dark" ? "Night — black ground" : "Light — white ground"}
            </div>
          </div>
          <ThemeToggle onToggle={state.toggleTheme} />
        </div>

        <div className="micro" style={{ marginBottom: 9 }}>
          Training
        </div>
        <div className="card" style={{ padding: 16, marginBottom: 11, gap: 10 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>Units</div>
          <div className="seg2">
            <button data-active={state.units === "kg" ? "true" : "false"} onClick={() => state.setUnits("kg")}>
              Kilograms
            </button>
            <button data-active={state.units === "lb" ? "true" : "false"} onClick={() => state.setUnits("lb")}>
              Pounds
            </button>
          </div>
        </div>
        <div className="card" style={{ padding: 16, marginBottom: 11, gap: 10 }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Ask for RPE</div>
            <div style={{ fontSize: 11.5, opacity: 0.55 }}>Off keeps logging fast; trends fall back to est-1RM and volume.</div>
          </div>
          <div className="seg2">
            <button data-active={state.rpeAsk === "on" ? "true" : "false"} onClick={() => state.setRpeAsk("on")}>
              On
            </button>
            <button data-active={state.rpeAsk === "off" ? "true" : "false"} onClick={() => state.setRpeAsk("off")}>
              Off
            </button>
          </div>
        </div>
        <div className="card" style={{ padding: 16, marginBottom: 20, gap: 9 }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Next in rotation</div>
            <div style={{ fontSize: 11.5, opacity: 0.55 }}>Rotation-based, not calendar. Override if you skipped one.</div>
          </div>
          <div className="xscroll" style={{ display: "flex", gap: 7, paddingTop: 2 }}>
            {state.rotation.map((d) => (
              <button key={d.name} className="pill" data-active={d.active ? "true" : "false"} onClick={d.setNext}>
                {d.name}
              </button>
            ))}
          </div>
        </div>

        <div className="micro" style={{ marginBottom: 9 }}>
          Coach
        </div>
        {state.supabaseEnabled && state.authed && (
          <CoachProfileCard key={state.profile ? "loaded" : "empty"} profile={state.profile} onSave={state.saveCoachProfile} />
        )}
        <div className="card" style={{ padding: 16, marginBottom: 20, gap: 10 }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Voice</div>
            <div style={{ fontSize: 11.5, opacity: 0.55 }}>
              {state.voice === "direct" ? "Short, evidence-first, no hedging." : "Same calls, with the reasoning spelled out."}
            </div>
          </div>
          <div className="seg2">
            <button data-active={state.voice === "direct" ? "true" : "false"} onClick={() => state.setVoice("direct")}>
              Direct
            </button>
            <button data-active={state.voice === "detailed" ? "true" : "false"} onClick={() => state.setVoice("detailed")}>
              Detailed
            </button>
          </div>
        </div>

        <div className="micro" style={{ marginBottom: 9 }}>
          Connections
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {state.supabaseEnabled ? (
            <button className="row" onClick={state.signOut} style={{ background: "var(--color-surface)" }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Google account</span>
              <span className="tag tag-accent-2">{state.syncing ? "Syncing…" : "Sign out"}</span>
              <Icon name="chev" size={17} style={{ opacity: 0.4 }} />
            </button>
          ) : (
            <div className="row" style={{ background: "var(--color-surface)", cursor: "default" }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Google account</span>
              <span className="tag tag-accent-2">Not connected</span>
            </div>
          )}
          <button className="row" onClick={() => state.go("import")} style={{ background: "var(--color-surface)" }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Notion import</span>
            <span className="tag tag-neutral">{state.logged.length} logged this session</span>
            <Icon name="chev" size={17} style={{ opacity: 0.4 }} />
          </button>
        </div>
      </div>
    </div>
  );
}
