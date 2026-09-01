// Server-side Supabase client bound to the request's auth cookies, so route
// handlers act as the signed-in user under RLS. Cookie writes (token
// refreshes) are buffered in `pending`; apply them to the response returned.

import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

export function supabaseFromRequest(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const pending: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  const client = createServerClient(url, anonKey, {
    db: { schema: "gymlog" },
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookies) => {
        for (const c of cookies) pending.push(c);
      },
    },
  });
  return { client, pending };
}

export type RequestSupabase = NonNullable<ReturnType<typeof supabaseFromRequest>>;
