# Gym Log: App Store submission

Bundle id `com.christen1609.gymlog` · iPhone only · portrait · shell loads https://gym-log-eight.vercel.app

Character counts were measured with node (`.length`) and are ASCII, so they match App Store Connect's count.

## 1. Listing copy

**App name** (7 / 30)

```
Gym Log
```

**Subtitle** (24 / 30)

```
Log lifts by typing them
```

**Promotional text** (150 / 170)

```
Log a set by typing it: bench 85 5x5 @9. See estimated 1RM and trends for every lift. Ask the optional AI coach about your training, if you choose to.
```

**Description** (1454 / 4000)

```
Gym Log is a workout logger for people who lift. Type a set the way you would write it down, like "bench 85 5x5 @9", and it becomes Bench Press, 85 kg, 5 sets of 5 reps at RPE 9. Nothing is saved until you confirm it, so a typo never ends up in your history.

Track your training
- Log strength sets and cardio sessions.
- See estimated one-rep max (Epley formula) and trends for each exercise.
- See a progress status for each lift: progressing, grinding, stalling or regressing. These come from your own logged numbers.
- Turn on a training reminder in Settings. It is a local notification, sent two days after your last logged session.

AI coach (optional)
Ask the coach about your training. It is off until you allow it. Only after you allow it does Gym Log send your training log, your profile and your chat to Google Gemini to write an answer. You can turn this off again in Settings. Without it, the coach shows the app's built-in text.

Notion import (optional)
If you use Notion, you can connect your account to import workouts. This needs a Notion account.

Your account and data
Create an account with email and password. If you forget your password, reset it by email. You can delete your account and all of your data in Settings, under Account, with Delete account.

Not medical advice
Gym Log and its coach do not give medical advice. If you have an injury or a health condition, talk to a doctor or qualified professional before you train.
```

**Keywords** (95 / 100)

```
workout,lifting,strength,gym,weights,reps,1RM,training,log,sets,barbell,cardio,tracker,progress
```

**Category:** Health & Fitness

**Support URL:** https://gym-log-eight.vercel.app/support

**Privacy Policy URL:** https://gym-log-eight.vercel.app/privacy

## 2. App Privacy (nutrition label)

Answer "Yes, we collect data" and declare the following. Every type is linked to the user, used for App Functionality only, and not used for tracking. Tracking: **No**.

| Data type | Used for | Notes |
| --- | --- | --- |
| Contact Info → Email Address | App Functionality | Sign-in and password reset |
| Health & Fitness → Fitness | App Functionality | Workout log, cardio sessions |
| Health & Fitness → Health | App Functionality | Injuries or limitations the user types into the profile |
| User Content → Other User Content | App Functionality | Coach chat |

If App Store Connect asks about Identifiers, also declare **User ID** (the Supabase account id) for App Functionality. It is not in the list above, but it is stored with the account.

Processors (service providers that handle the data):

- **Supabase**: database, authentication and account storage.
- **Vercel**: hosts the app and its server code.
- **Google Gemini**: receives the training log, profile and chat only after the user allows the AI coach. Until then nothing is sent.
- **Notion**: contacted only if the user connects Notion for import.

## 3. Age rating guidance

Check every answer against the current questionnaire in App Store Connect before submitting.

| Question | Likely answer |
| --- | --- |
| Violence, sexual content, profanity, horror, mature themes, gambling, alcohol/tobacco/drugs | None |
| Medical / Treatment Information | Infrequent / mild (the coach discusses training and injuries) |
| Health or wellness topics | Yes |
| Unrestricted web access | No (the app only loads its own site) |
| User-generated content | No (coach chat is private to the user) |
| AI-generated content / chatbot | Yes, if the questionnaire asks (the AI coach) |

Expected result: **4+** or **9+**, depending on how the medical and AI answers are scored. Confirm the result the questionnaire shows.

## 4. Export compliance

Gym Log uses only HTTPS through the system networking stack, which makes it exempt from encryption export rules. `ITSAppUsesNonExemptEncryption` is already set to `false` in `ios/App/App/Info.plist`, so App Store Connect should not ask for export documentation. If it does, answer that the app uses only exempt encryption (HTTPS).

## 5. App Review notes (paste-ready)

```
Demo account
Email: DEMO_EMAIL
Password: DEMO_PASSWORD

Gym Log is a workout logger. The iOS app is a Capacitor shell that loads https://gym-log-eight.vercel.app. Sign in with the demo account above; it has sample workout history.

- Sign-in: email and password, the app's own account system. Google sign-in is hidden in the iOS app on purpose. "Forgot password" sends a reset email.
- Account deletion: Settings → Account → Delete account (confirm with a second tap). It deletes the account and all of its data.
- AI coach: off by default. Before any data goes to Google Gemini, the coach asks the user to allow it (prompt in Coach, toggle in Settings). Without consent the app shows built-in text and the server never calls Gemini.
- Reminders: local notifications, turned on or off in Settings.
- Notion import is optional and needs a Notion account. The app works without it.
- Not medical advice: the disclaimer appears on the consent card and in the privacy policy at https://gym-log-eight.vercel.app/privacy.
```

## 6. Owner-only checklist

- [ ] Enrol in the Apple Developer Program (paid annual membership) with the Apple ID that will own the app.
- [ ] Answer the DSA trader declaration in App Store Connect. Likely answer: non-trader (the app is free and has no revenue).
- [ ] Create the app record in App Store Connect with bundle id `com.christen1609.gymlog`.
- [ ] Build with Xcode 26 on a Mac or a cloud Mac. In a fresh clone run `npm ci && npx cap sync ios` first (the Swift package points into node_modules, and the copied config is gitignored). Then open `ios/App/App.xcodeproj`, set the signing team, then Product → Archive and upload. No Mac? Use Codemagic or GitHub Actions macOS runners.
- [ ] Create the demo account on the live site and put its credentials into the App Review notes above.
- [ ] Take 6.9" screenshots at 1320×2868 (iPhone 17 Pro Max simulator, or Chrome DevTools at 440×956 with 3x device pixel ratio).
- [ ] Confirm the Vercel cron for `/api/health` is enabled, or upgrade Supabase so the project does not pause.
- [ ] Confirm `GEMINI_API_KEY` is set in Vercel production.
- [ ] Confirm the Supabase Auth URL configuration includes the site URL (https://gym-log-eight.vercel.app) so password reset links work.
- [ ] Run `npm run cap:sync` after any Capacitor config change.

## Building without a Mac (GitHub Actions)

You do not need a Mac. GitHub's free macOS machines (the workflow in `.github/workflows/ios.yml`) do the Mac work.

**What runs on every push** to `main` or `feat/app-store-ready` (when iOS, app code or package files change): the workflow installs the dependencies, syncs Capacitor, adds the home-screen widget to the Xcode project, and compiles the iOS app for the simulator. It signs nothing and uploads nothing; it only tells you (green tick or red cross on GitHub) whether the iOS app still builds. If it fails, open the run and download the `xcodebuild-log` file.

**One-time setup to get builds onto your iPhone via TestFlight**

1. Enroll in the Apple Developer Program (developer.apple.com/programs, paid, yearly).
2. In App Store Connect go to Users and Access, then Integrations, then App Store Connect API. Create a key with the **App Manager** role. Download the `.p8` file straight away; Apple only lets you download it once.
3. Write down the **Key ID** (shown next to the key) and the **Issuer ID** (shown at the top of that page).
4. Find your **Team ID** at developer.apple.com under Account, then Membership details.
5. Register the app identifiers. Automatic signing in the workflow will usually create and fix these for you, but doing it by hand avoids surprises. At developer.apple.com, Certificates, Identifiers & Profiles: add an App ID with bundle id `com.christen1609.gymlog` and enable **HealthKit** and **App Groups**; create the App Group `group.com.christen1609.gymlog` and tick it on the App ID. The widget uses `com.christen1609.gymlog.widget` and needs the same App Group; automatic signing normally registers it.
6. In App Store Connect create the app record (My Apps, plus button) with that bundle id, if you have not already.
7. On GitHub open the repo, Settings, Secrets and variables, Actions, and add four repository secrets:
   - `APPLE_TEAM_ID`: the Team ID.
   - `ASC_KEY_ID`: the Key ID.
   - `ASC_ISSUER_ID`: the Issuer ID.
   - `ASC_KEY_P8`: the `.p8` file as base64. In Git Bash run `base64 -w0 AuthKey_XXXX.p8` and paste the single long line it prints.

**Each time you want a build on your phone**

1. On GitHub open the Actions tab, pick the **iOS** workflow, click **Run workflow**, choose the branch, tick **upload**, and run it.
2. It compiles, signs, and uploads to App Store Connect (roughly 15 to 30 minutes). The build number is the run number, so each run is unique.
3. After Apple finishes processing (a few minutes to an hour; you get an email), install the **TestFlight** app on your iPhone, sign in with your Apple ID, and install the build. Add yourself under TestFlight, Internal Testing, in App Store Connect if it does not appear.

**Screenshots:** you can take them on your iPhone from the TestFlight build. The required 6.9" size comes from a Pro Max model; other iPhones give a different size. If you do not have a Pro Max, a later workflow can capture simulator screenshots at the right size on a GitHub Mac.
