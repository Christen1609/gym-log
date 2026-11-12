"use client";

// Supabase browser client. Optional by design: when the env vars are absent
// the app falls back to seeded data and localStorage (see useGymLog.ts), so it
// still runs with zero configuration.

import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase isn't configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }
  // Data lives in the "gymlog" schema of a shared Supabase project, not public.
  client ??= createBrowserClient(url, anonKey, { db: { schema: "gymlog" } });
  return client;
}

/**
 * Sends the password-reset email with the implicit flow, so the link works in
 * whichever browser opens it (see recovery.ts). Holds no session of its own.
 */
export async function sendPasswordReset(email: string, redirectTo: string) {
  if (!url || !anonKey) throw new Error("Supabase isn't configured.");
  const resetClient = createClient(url, anonKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await resetClient.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}
