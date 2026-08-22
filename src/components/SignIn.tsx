"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export function SignIn({ theme }: { theme: "light" | "dark" }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = getSupabaseClient();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // Success: onAuthStateChange in useGymLog flips `authed` and unmounts this screen.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // With email confirmation on, signUp returns no session until the link is clicked.
        if (!data.session) setNotice("Account created. Check your email for a confirmation link, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      // The most common cause is the provider not being enabled on the project.
      setError(err instanceof Error ? err.message : "Sign-in failed.");
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
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 20,
            background: "var(--color-accent)",
            color: "var(--color-bg)",
            display: "grid",
            placeItems: "center",
            marginBottom: 28,
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: 19.6,
            lineHeight: 0.82,
            letterSpacing: "-.05em",
            textAlign: "center",
          }}
        >
          LOCK
          <br />
          IN
        </div>

        <h1 style={{ fontSize: 34, margin: "0 0 8px", letterSpacing: "-.02em" }}>Gym Log</h1>
        <p style={{ margin: "0 0 24px", fontSize: 14, opacity: 0.62, lineHeight: 1.5 }}>
          Sign in so your log is yours. Every row is scoped to your account.
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ minHeight: 48, fontSize: 14.5 }}
          />
          <input
            className="input"
            type="password"
            name="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={mode === "signin" ? "Password" : "Password (min 6 characters)"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ minHeight: 48, fontSize: 14.5 }}
          />
          <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ minHeight: 50 }}>
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
          <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
          <span className="micro">or</span>
          <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
        </div>

        <button
          className="btn btn-secondary btn-block"
          onClick={signInWithGoogle}
          disabled={busy}
          style={{ minHeight: 50 }}
        >
          Continue with Google
        </button>

        <button
          className="btn"
          onClick={() => {
            setMode((m) => (m === "signin" ? "signup" : "signin"));
            setError(null);
            setNotice(null);
          }}
          disabled={busy}
          style={{ marginTop: 18, fontSize: 13, opacity: 0.75, background: "none", border: "none" }}
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>

        {notice && (
          <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--color-accent-2)", lineHeight: 1.5 }}>
            {notice}
          </p>
        )}
        {error && (
          <p style={{ margin: "14px 0 0", fontSize: 12.5, opacity: 0.75, lineHeight: 1.5 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
