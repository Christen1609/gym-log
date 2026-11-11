# App Store readiness — plan

Spec: docs/superpowers/specs/2026-11-11-app-store-ready-design.md
Branch: feat/app-store-ready (from main 18f00ba).
Gates: `npx vitest run`, `npx tsc --noEmit`, `npx eslint src`, `npm run build`.
Global constraints: no Tailwind (plain CSS classes in globals.css + inline styles, match existing look);
Next 16 — check `node_modules/next/dist/docs/` before using a Next API you haven't seen in this repo;
the web app must keep working unchanged in a normal browser.

## Task 1: Pure helpers (gymlog.ts)

Interfaces:
- `aiAllowed(body: unknown): boolean` — true only when `body` is an object with `ai === true`.
- `nextReminderAt(lastTrainingISO: string | null, now: Date, gapDays = 2): Date | null` — local time 18:00 on
  (last training date + gapDays). If that moment is <= now, return today 18:00 if still in the future, else tomorrow 18:00.
  `null` input → tomorrow 18:00 if now is past today's 18:00, else today 18:00.
Tests (gymlog.test.ts), RED first:
- aiAllowed: `{ai:true}` → true; `{ai:"true"}`, `{}`, `null`, `"x"` → false.
- nextReminderAt: last 2026-11-10, now 2026-11-11 09:00 → 2026-11-12 18:00 local; last 2026-11-01, now 2026-11-11 09:00 → 2026-11-11 18:00;
  same but now 19:00 → 2026-11-12 18:00; null at 09:00 → same day 18:00.
Expected: green.

## Task 2: Coach consent gate (server)

- `/api/coach` route: if `!aiAllowed(body)`: exercise → `{ text: null }`; chat → `{ text: fallbackReply(message, context), proposals: [] }`
  with no Gemini call and no persistence; checkin → `{ text: null }`.
Expected: tsc clean, tests green.

## Task 3: Account deletion

- Migration `supabase/migrations/0005_delete_account.sql`: `gymlog.delete_my_account()` returns void, `language plpgsql security definer
  set search_path = ''`; raise if `auth.uid()` is null; delete the caller's rows from sets, cardio, sessions, exercises, split,
  coach_messages, coach_notes, notion_connections, profiles (sets first — sets→exercises has no cascade), then
  `delete from auth.users where id = auth.uid()`. `revoke all on function … from public, anon; grant execute … to authenticated;`
  End with `notify pgrst, 'reload schema';`.
- db.ts: `deleteAccount()` → `rpc("delete_my_account")`, throws on error.
- useGymLog: `deleteAccount()` — calls db, clears this app's localStorage key, `auth.signOut({ scope: "local" })`.
- Settings: "Account" section at the bottom: "Delete account" row → second tap shows red confirm text
  "Deletes your log, coach chat and account for good. Tap again to delete." → busy → signed out. Error shown inline.
Expected: tsc, eslint, build clean.

## Task 4: AI consent UI

- useGymLog: `aiConsent: "granted" | "denied" | null` persisted in localStorage key `gymlog.aiConsent`; `setAiConsent`.
  Every `/api/coach` body gains `ai: aiConsent === "granted"`. Exercise judgment fetch and weekly check-in are skipped unless granted
  (and re-run for exercise when consent flips to granted: clear the fetched set).
- ChatScreen: while `aiConsent === null`, show a card above the composer: "The coach uses Google Gemini. To answer, it sends your
  training log, profile (including injuries you list) and this chat to Google. Not medical advice." Buttons "Allow" / "Not now".
  Link "Privacy policy" → `/privacy`.
- Settings → Coach: row "AI coach" with On/Off seg2 bound to consent, subline "Sends your log and chat to Google Gemini".
Expected: tsc, eslint, build clean.

## Task 5: Sign-in for iOS

- `src/lib/native.ts`: `isNativeApp(): boolean` — `@capacitor/core` `Capacitor.isNativePlatform()`, false on server.
- SignIn: hide "or" divider + Google button when native. Add "Forgot password?" (signin mode) → `resetPasswordForEmail(email,
  { redirectTo: window.location.origin })` with notice "Check your email for a reset link."; requires email filled.
  Footer links "Privacy" `/privacy` · "Support" `/support`.
- useGymLog: on `PASSWORD_RECOVERY` auth event set `recovering = true`; expose `recovering`, `finishRecovery(password)`
  (`auth.updateUser({ password })`, then `recovering=false`).
- page.tsx: when `state.recovering`, render `SetPassword` (new component, same styling as SignIn: one password field, min 6, Save).
Expected: tsc, eslint, build clean.

## Task 6: Privacy + support pages

- `src/app/privacy/page.tsx`, `src/app/support/page.tsx`: static server components, readable on phone, both themes via
  `prefers-color-scheme`. Privacy: what's collected (email, workout log, cardio, profile incl. injuries, coach chat, optional Notion
  token), processors (Supabase storage, Vercel hosting, Google Gemini only with consent, Notion only if connected), no ads/tracking/
  selling, delete in Settings → Delete account, not medical advice, contact via support page, dated 2026-11-11.
  Support: what the app does, how to reset password, delete account, contact = GitHub issues
  https://github.com/Christen1609/gym-log/issues.
- Settings: "About" rows linking to both.
Expected: build clean; both routes in build output.

## Task 7: Keep the database awake

- `src/app/api/health/route.ts` GET: anon Supabase select `id` from `exercises` limit 1 (RLS returns nothing — the request is
  the point); returns `{ ok: true }` (or `{ ok:false }` 503 on network error). `dynamic = "force-dynamic"`.
- `vercel.json`: `{ "crons": [{ "path": "/api/health", "schedule": "0 3 * * *" }] }`.
Expected: build clean.

## Task 8: Capacitor iOS shell

- Install `@capacitor/core @capacitor/ios @capacitor/haptics @capacitor/local-notifications` (deps) and `@capacitor/cli` (dev), 8.x.
- `capacitor.config.ts`: appId `com.christen1609.gymlog`, appName `Gym Log`, webDir `native-shell`,
  server `{ url: "https://gym-log-eight.vercel.app", errorPath: "offline.html" (if supported), allowNavigation: notion + supabase hosts }`,
  ios `{ contentInset: "never", backgroundColor: "#000000" }`.
- `native-shell/index.html` (redirect/placeholder) and `native-shell/offline.html` (black, icon text, "You're offline", Retry).
- `npx cap add ios`; then: Info.plist `ITSAppUsesNonExemptEncryption` false, portrait-only, `UIRequiresFullScreen`;
  project iPhone-only (`TARGETED_DEVICE_FAMILY = 1`); `ios/App/App/PrivacyInfo.xcprivacy` (tracking false, UserDefaults CA92.1)
  added to the target; AppIcon 1024 from `public/icon-1024.png`; splash images black with centered icon (sharp script in
  `scripts/ios-assets.mjs`).
- package.json scripts: `cap:sync`.
Expected: `npx cap sync ios` succeeds (pod/SPM steps may be skipped on Windows); build clean.

## Task 9: Native extras

- Haptics: light impact when a parsed workout is saved and when cardio/proposal applied (native only, errors swallowed).
- Reminders: Settings → Training "Reminders" On/Off (native only). On → request permission; if granted, schedule one notification
  (id 1) at `nextReminderAt(lastTrainingISO, now)` with title "Gym Log", body `"{dayTitle} is next. Log it when you're done."`;
  reschedule on app load and after each log; Off/denied → cancel id 1. Persist choice in localStorage `gymlog.reminders`.
Expected: tsc, eslint, build clean; tests green.

## Task 10: Submission pack

- `docs/app-store/README.md`: listing copy (name ≤30, subtitle ≤30, description, keywords ≤100), App Privacy answers,
  review notes (demo account placeholder, AI consent, deletion path), age rating answers, and the user-only checklist
  (Mac/Xcode 26 build, signing, Apple account, DSA, screenshots 1320×2868, demo account, Supabase plan).
Expected: file exists.

## Review Focus

- delete_my_account: security definer search_path, only caller's rows, revoked from anon.
- Consent: no path reaches Gemini without `ai: true` (exercise, chat, checkin).
- Web behaviour unchanged when not native (Google button still shown in browsers).
