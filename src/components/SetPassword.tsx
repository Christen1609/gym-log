"use client";

import { useState } from "react";

/**
 * Shown after a password-reset link signs the lifter in. Same frame as the
 * sign-in screen. On success the parent clears `recovering` and this unmounts.
 */
export function SetPassword({
  theme,
  onSave,
}: {
  theme: "light" | "dark";
  onSave: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the password.");
      setBusy(false);
    }
  };

  return (
    <div className="app-shell" data-theme={theme}>
      <div
        className="screen scroll"
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 26px 30px",
        }}
      >
        <h1 style={{ fontSize: 34, margin: "0 0 8px", letterSpacing: "-.02em" }}>Set a new password</h1>
        <p style={{ margin: "0 0 24px", fontSize: 14, opacity: 0.62, lineHeight: 1.5 }}>
          Choose a password for your Gym Log account.
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="input"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="New password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ minHeight: 48, fontSize: 14.5 }}
          />
          <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ minHeight: 50 }}>
            {busy ? "One moment…" : "Save password"}
          </button>
        </form>

        {error && (
          <p style={{ margin: "14px 0 0", fontSize: 12.5, opacity: 0.75, lineHeight: 1.5 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
