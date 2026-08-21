"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export function SignIn({ theme }: { theme: "light" | "dark" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    setBusy(true);
    setError(null);
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
        className="screen"
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
        <p style={{ margin: "0 0 28px", fontSize: 14, opacity: 0.62, lineHeight: 1.5 }}>
          Sign in so your log is yours. Every row is scoped to your account.
        </p>

        <button
          className="btn btn-primary btn-block"
          onClick={signInWithGoogle}
          disabled={busy}
          style={{ minHeight: 50 }}
        >
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>

        {error && (
          <p style={{ margin: "16px 0 0", fontSize: 12.5, opacity: 0.75, lineHeight: 1.5 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
