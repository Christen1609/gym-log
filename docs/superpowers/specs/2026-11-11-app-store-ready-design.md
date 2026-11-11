# App Store readiness — design

**Intent:** get Gym Log approved on the iOS App Store. The user asked me to find
everything App Review would reject the app for and fix it, accepting my own
recommendations. Only changes that alter what the app *is* go back to them.

**Non-goals:** new training features, payments, Android, rewriting the app as
native Swift.
**Anti-goals:** breaking the web app at gym-log-eight.vercel.app; making the
owner unable to sign in.

## Approaches considered

| Approach | Trade-off |
| --- | --- |
| **Capacitor shell loading the live Vercel site + native extras (picked)** | Keeps the Next.js server routes (coach, Notion) as they are. Risk: Guideline 4.2 ("just a website"), offset with native notifications, haptics and an offline page. |
| Capacitor with the app bundled (static export) | Next API routes can't be exported; coach and Notion would need moving to another host. Big rewrite for little review benefit. |
| Stay a PWA | No review at all, but it isn't on the App Store, which is what was asked. |

## Rejection risks → fixes

| # | Guideline | Risk | Fix |
| --- | --- | --- | --- |
| 1 | 5.1.1(v) | Account sign-up with no in-app deletion | `gymlog.delete_my_account()` (security definer) wipes every row and the auth user; Settings → Delete account with a second-tap confirm |
| 2 | 4.8 + Google policy | Google sign-in offered without Sign in with Apple; Google blocks OAuth inside WKWebView anyway | Hide Google sign-in inside the iOS app. Email/password is the app's own account system, which 4.8 exempts |
| 3 | — (follows from 2) | Google-only accounts can't sign in on iOS; no way to recover a password | "Forgot password" email reset + set-new-password screen. Lets a Google user add a password to the same account |
| 4 | 5.1.1(i), 5.1.2(i) | No privacy policy; workout log, injuries and chats go to Google Gemini without consent | `/privacy` and `/support` pages, linked from sign-in and Settings. AI coach is off until the user allows it (prompt in Coach, toggle in Settings); without consent the app uses its built-in copy and the server never calls Gemini |
| 5 | 1.4.1 | Training advice without a disclaimer | "Not medical advice" line on the consent card and in the privacy policy |
| 6 | 4.2 | Thin web wrapper | Native local-notification training reminder (Settings toggle), haptic tap on logging, bundled offline page |
| 7 | 2.1 | Free Supabase project pauses after ~7 idle days → app dead during review | `/api/health` touches the database; Vercel daily cron keeps it awake |
| 8 | 2.1 | Notion OAuth would open in Safari and never return | `allowNavigation` for Notion domains |
| 9 | 2.3.8 / build | Default Capacitor splash/icon placeholders | Generate AppIcon + splash from `public/icon-1024.png` (already opaque) |
| 10 | Export compliance | Missing-compliance hold | `ITSAppUsesNonExemptEncryption = false` (HTTPS only) |
| 11 | Privacy manifest | Upload warning | App `PrivacyInfo.xcprivacy`: no tracking, UserDefaults CA92.1 |
| 12 | 2.3 / screenshots | iPad build forces iPad screenshots and iPad review | iPhone-only, portrait-only |

## Decided (my calls)

- Bundle id `com.christen1609.gymlog` (from the public GitHub username) — user can change before first upload.
- Support contact is the public GitHub issues page; no personal email published.
- Consent is stored per device (localStorage); default is *not granted*.
- Reminder: one local notification at 18:00 two days after the last logged session; rescheduled on every open/log.

## Left to the user (can't be done from Windows / needs their accounts)

Mac or cloud-Mac build with Xcode 26, Apple Developer account, App Store Connect
listing, DSA trader status, screenshots, demo account for the reviewer, and
deciding whether new accounts should still get seeded starter history.
