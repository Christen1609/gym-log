// Server-only helpers for the Notion OAuth flow. Configured with:
//   NEXT_PUBLIC_NOTION_CLIENT_ID  — public integration client id (also flags the UI)
//   NOTION_CLIENT_SECRET          — its secret
//   NOTION_REDIRECT_URI           — optional; defaults to <origin>/api/notion/callback
// Without them the routes answer with a friendly redirect and the app stays on
// the manual-token path.

import "server-only";

export { supabaseFromRequest } from "@/lib/supabaseServer";

export const STATE_COOKIE = "notion_oauth_state";

export function oauthConfig(origin: string) {
  const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.NOTION_REDIRECT_URI || `${origin}/api/notion/callback`,
  };
}

export function authorizeUrl(cfg: { clientId: string; redirectUri: string }, state: string): string {
  const qs = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    owner: "user",
    redirect_uri: cfg.redirectUri,
    state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${qs}`;
}

export interface NotionTokenGrant {
  access_token: string;
  workspace_name: string | null;
  workspace_icon: string | null;
  bot_id: string | null;
}

export async function exchangeCode(
  cfg: { clientId: string; clientSecret: string; redirectUri: string },
  code: string
): Promise<NotionTokenGrant | null> {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }),
  });
  if (!res.ok) {
    console.error("Notion token exchange failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  if (typeof data?.access_token !== "string") return null;
  return {
    access_token: data.access_token,
    workspace_name: typeof data.workspace_name === "string" ? data.workspace_name : null,
    workspace_icon: typeof data.workspace_icon === "string" ? data.workspace_icon : null,
    bot_id: typeof data.bot_id === "string" ? data.bot_id : null,
  };
}

