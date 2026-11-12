# Native features (clearing Guideline 4.2) — design

**Intent:** the iOS app must not read as "a website in a frame". The user asked for all four
native features plus the reminder-wording fix, built in this branch (feat/app-store-ready),
following my recommendations.

**Anti-goals:** changing the web app's behaviour in a normal browser; writing fake data to
Apple Health; a project that won't open in Xcode.

**Constraint that shapes everything:** development is on Windows. Web-side code is tested here;
Swift code can only be compiled on a Mac. Every native piece is written to be checkable there,
kept small, and listed as "untested on device" in the hand-off.

## Approaches considered

| Approach | Trade-off |
| --- | --- |
| **Community plugins where they fit, one small local Swift plugin for the rest (picked)** | Haptics/notifications already use official plugins. No published Capacitor 8 plugin writes HealthKit *workouts* (@capgo/capacitor-health: workouts read-only; capacitor-health: no write call), and widgets need App Group storage, so one local plugin (`GymLogNative`) covers both. |
| A plugin per feature from npm | Nothing suitable for workout writes or widget data. |
| Rewrite screens natively in Swift | Far larger; untestable from Windows. |

## The four features

1. **Workout clock + rest timer (Today screen).** "Start workout" begins a session clock;
   a rest timer with 60/90/120/180 s presets counts down from an end timestamp (survives lock),
   haptic + local notification (id 2) when rest ends on iOS; plain countdown on the web.
   The clock's start time is what gives Apple Health a real duration.
2. **Apple Health (opt-in, Settings).** Writes cardio entries as workouts (their minutes and
   distance) and a strength session as "Traditional Strength Training" from clock start to save —
   only when the clock was running. Nothing is written without a real duration. Write-only.
3. **Home-screen widget.** Shows the next rotation day and days since last training. The app
   writes those two values to App Group storage through `GymLogNative`; the widget reads them.
   Swift sources are committed; adding the Widget Extension target is a 5-minute Xcode step
   documented in docs/app-store/README.md (hand-editing a new target into project.pbxproj
   without Xcode to check it is the riskier path).
4. **Works offline in the gym (iOS app).** Service worker (registered only in the native app)
   caches the app shell; last synced history/cardio is cached per user so offline shows the
   lifter's real numbers, not seed data; sets saved offline queue in localStorage with their
   original date and sync on reconnect/launch, with an "offline — will sync" note.
   WKWebView needs App-Bound Domains for service workers: Info.plist `WKAppBoundDomains`
   + `limitsNavigationsToAppBoundDomains`.

**Reminder wording:** don't schedule until real data has synced; copy says
"A 6pm nudge when two days pass without training — or today, if nothing's logged yet."

## Decided (my calls)

- Health is opt-in and write-only; permission asked when toggled on.
- Widget data refresh: on launch, after each save.
- Offline queue covers typed set logging and cardio; coach chat and import need a connection.
- Service worker only in the native app, so the website keeps its current behaviour.
