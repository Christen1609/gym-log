import { NextRequest, NextResponse } from "next/server";
import { STATE_COOKIE, exchangeCode, oauthConfig, supabaseFromRequest } from "@/lib/notionOauth";

// Lands here from Notion's consent page. Swaps the code for an access token
// and stores it against the signed-in user (RLS keeps rows per-user). The app
// reads back its own row client-side and imports through /api/notion as usual.

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (query: string) => {
    const res = NextResponse.redirect(`${origin}/?${query}`);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/notion" });
    return res;
  };

  const cfg = oauthConfig(origin);
  if (!cfg) return back("notion=error&reason=config");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("notion=error&reason=denied");

  const code = params.get("code");
  const state = params.get("state");
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) return back("notion=error&reason=state");

  const grant = await exchangeCode(cfg, code);
  if (!grant) return back("notion=error&reason=exchange");

  const supa = supabaseFromRequest(req);
  const { data } = (await supa?.client.auth.getUser()) ?? { data: { user: null } };
  if (!supa || !data.user) return back("notion=error&reason=signin");

  const { error } = await supa.client.from("notion_connections").upsert(
    {
      user_id: data.user.id,
      access_token: grant.access_token,
      workspace_name: grant.workspace_name,
      workspace_icon: grant.workspace_icon,
      bot_id: grant.bot_id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    console.error("Saving Notion connection failed", error);
    return back("notion=error&reason=save");
  }

  const res = back("notion=connected");
  for (const c of supa.pending) res.cookies.set(c.name, c.value, c.options);
  return res;
}
