// Supabase client scaffold — not wired into the UI yet. The app currently
// persists to localStorage (see useGymLog.ts) so it's fully usable with
// zero config. Once NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// are set (and the schema in supabase/migrations/0001_init.sql is applied),
// swap the localStorage calls in useGymLog.ts for calls through this client.

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase isn't configured yet — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }
  client ??= createBrowserClient(url, anonKey);
  return client;
}
