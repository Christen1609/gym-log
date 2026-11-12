# Native features — plan

Spec: docs/superpowers/specs/2026-11-12-native-features-design.md
Branch: feat/app-store-ready. Gates: `npx vitest run`, `npx tsc --noEmit`, `npx eslint src`, `npm run build`.
Constraints: no Tailwind; web behaviour unchanged when not native; pure logic test-first in src/lib/*.test.ts.

## Task 1: Reminder wording + clock/timer helpers (gymlog.ts)
- Reminder effect skips while `syncing` or before first real sync; Settings copy per spec.
- Pure helpers, tested first: `restRemaining(endsAtMs, nowMs) → seconds ≥ 0`;
  `formatClock(seconds) → "m:ss"` (and "h:mm:ss" ≥ 1h); `sessionMinutes(startMs, endMs) → number | null`
  (null when start missing, end ≤ start, or > 5 h).
Expected: green.

## Task 2: Workout clock + rest timer UI
- useGymLog: `workoutStartedAt` (localStorage `gymlog.workout`, cleared when the day changes),
  `startWorkout()`, `endWorkout()`; `restEndsAt`, `startRest(seconds)`, `cancelRest()`.
- On iOS: rest end → local notification id 2 "Rest's up" + haptic; cancel on cancelRest.
- TodayScreen card: Start workout / elapsed clock; presets 60/90/120/180; countdown; cancel.
Expected: gates clean.

## Task 3: Offline (native app)
- `public/sw.js`: navigation network-first with cached "/" fallback; `/_next/static/*` cache-first.
  Registered only when `isNativeApp()`.
- Per-user cache of last synced history + cardio (localStorage `gymlog:cache:<userId>`), used when sync fails.
- Offline queue `gymlog:queue`: failed set/cardio writes stored with original date; flushed on
  `online` event and after sign-in sync; pure queue helpers tested first.
- UI note on Today when items are queued: "Offline — N saved, will sync".
- capacitor.config.ts `ios.limitsNavigationsToAppBoundDomains: true`; Info.plist `WKAppBoundDomains`
  (gym-log-eight.vercel.app, duxqfwcxdmezwgxddaed.supabase.co, notion.so, www.notion.so, api.notion.com).
Expected: gates clean; queue tests green.

## Task 4: GymLogNative Swift plugin + TS bridge
- ios/App/App/GymLogNativePlugin.swift: `saveWorkout({ kind: "strength"|"cardio", start, end, distanceKm? })`
  (HealthKit, requests share auth for workoutType + distance on first call), `requestHealth()`,
  `setWidgetData({ nextDay, daysSince })` (App Group `group.com.christen1609.gymlog` UserDefaults +
  WidgetCenter.reloadAllTimelines). Registered via a `MainViewController` (CAPBridgeViewController subclass,
  `capacitorDidLoad` → `bridge?.registerPluginInstance`), Main.storyboard points to it.
- App.entitlements (HealthKit, App Groups), CODE_SIGN_ENTITLEMENTS; Info.plist NSHealthUpdateUsageDescription
  + NSHealthShareUsageDescription.
- src/lib/nativeBridge.ts: `registerPlugin("GymLogNative")` wrappers, no-ops on web.
- ios/GymLogWidget/ sources (widget reading App Group) — not added as a target.
Expected: tsc clean; pbxproj references consistent.

## Task 5: Wire Health + widget
- Settings Health toggle (native only, localStorage `gymlog.health`); on save: strength workout when the
  clock ran (sessionMinutes not null), cardio when logged with minutes. Widget data on sync and after saves.
Expected: gates clean.

## Task 6: Docs + review notes
- docs/app-store/README.md: widget target steps, HealthKit capability, review notes listing native features.
Expected: file updated.
