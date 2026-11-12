// Password reset that works across browsers. The reset email is requested
// with the implicit flow, so the link carries the session in the URL hash
// instead of a PKCE code whose verifier lives only in the browser that asked.
// That matters on iOS: the reset is asked for inside the app, but the email
// link opens in Safari.

export interface RecoveryTokens {
  access_token: string;
  refresh_token: string;
}

/** The session from a password-reset link's hash, or null for any other URL. */
export function recoveryTokensFromHash(hash: string): RecoveryTokens | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.get("type") !== "recovery") return null;
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}
