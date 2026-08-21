# Gym Log — Design

Companion to `SWE_S.tracker_App.md`. That file says what to build; this says what it looks like and how it behaves.

Source of truth for the visuals is `Gym Log.dc.html` — the working prototype. Icon directions live in `App Icon.dc.html`. Where this document and those files disagree, the files win.

**Contents** — Principles · Foundations · Screens · Behavior · App icon

---

# Principles

**Rotation, not calendar.** The home screen opens on a position in a loop, never on a date grid. Missing a day changes nothing.

**One input.** A single text bar at the bottom of home does both jobs — logging and asking. The app decides which; the user never picks a mode.

**Computed and judged are visually separate.** Numbers come from code and are set in tabular figures under a `COMPUTED` label. The coach's read sits below a rule, next to an avatar, in sentence case. The user should be able to see, without reading, which part the model wrote.

**Nothing auto-commits.** Every parse goes to a confirmation sheet showing the original text in quotes above the typed fields.

---

# Foundations

## Color

Monochrome. Two themes, toggled by the user, no system preference following.

| Token | Light | Night |
| --- | --- | --- |
| `--color-bg` | `#ffffff` | `#000000` |
| `--color-surface` | `#f4f4f3` | `#141414` |
| `--color-text` | `#262626` | `#ededed` |
| `--color-accent` | `#1a1a1a` | `#f2f2f2` |
| `--color-accent-2` | `#8c8c8c` | `#8f8f8f` |
| `--color-divider` | `rgba(0,0,0,.10)` | `rgba(255,255,255,.14)` |

Accent inverts between themes, so a primary button is black-on-white in Light and white-on-black in Night. Everything else derives with `color-mix(… var(--color-text) N%, transparent)` rather than new hex values — tints, hovers, tags and dividers all scale with the theme automatically.

Headings render at 80% ink (`color-mix(in srgb, var(--color-text) 80%, transparent)`). Full-strength `--color-text` on white was too hard; this is the "lighter" weight in the type.

Theme transition: `background-color, color, border-color` at `.35s ease` on every element in the app root.

### The one exception

The Dynamic Island stays `#000` with `#fff` content in both themes. That is how iOS renders a Live Activity; theming it would be wrong.

---

## Type

Figtree throughout — 400 body, 600 headings and emphasis. The heading token is remapped (`--font-heading: Figtree`, weight 600); no display face.

| Role | Size | Notes |
| --- | --- | --- |
| Screen title (h1) | 34px | `letter-spacing: -.025em`, 80% ink |
| Home title | 40px | Only "Chest day" |
| Section heading (h2) | 25–27px | |
| Card / row title | 16.5px | 600 |
| Body, chat, inputs | 13.5–14.5px | |
| Secondary | 11.5–12.5px | 55–65% opacity |
| `.micro` label | 10px | uppercase, `.12em` tracking, 600, 50% opacity |

All numerals carry `.num` → `font-variant-numeric: tabular-nums`, so weights don't jitter between rows.

Minimum type size is 10px, and only for `.micro` labels.

---

## Shape and elevation

Radii run large: 22px on rows and message bubbles, 26–28px on cards, 34px on sheets and album art, `999px` on buttons, inputs, tags and pills. Bubbles cut one corner to 7px on the sender's side.

Shadows are used sparingly — cards are separated by fill, not elevation. `--shadow-lg` appears on sheets and the album placeholder only.

Hit targets: 44px minimum. Composer input and send button are 46px; the play control on the Spotify screen is 68px.

---

## Icons

Lucide, drawn as an inline `<symbol>` sprite at the top of the document and referenced with `<use href="#i-…">`. Stroke width `2.75`, round caps and joins.

Set in use: `sun`, `moon`, `back`, `up`, `check`, `x`, `play`, `pause`, `next`, `prev`, `chev`, `tup`, `tdown`, `flat`, `chat`, `music`, `cog`, `import`, `repeat`, `plus`, `pulse`, `menu`.

---

## Motion

| Where | What |
| --- | --- |
| Theme toggle | Knob translates 32px, `.34s cubic-bezier(.4,1.35,.5,1)`; the two glyphs cross-fade between `1` and `.42` opacity |
| Screen change | `fade .22s ease` |
| Sheets | Slide from `translateY(100%)`, `.28s cubic-bezier(.2,.9,.3,1)`, over a 55% scrim |
| Dynamic Island | Expands `min-width` 126 → 160px on mount, `.45s cubic-bezier(.2,1.2,.3,1)` |
| Island equalizer | Four bars, 4 → 13px, `.9s` staggered 0.09s; `animation-play-state: paused` when the track is paused |
| Chat thinking | See below |
| Import parse | Three dots blinking at `1.2s` |

### The thinking state

Three parts, running together while a reply is pending (2.4s):

1. **Three dots hopping in sequence.** 5px dots, `translateY(-8px)` at 22% of a `.95s` cycle, `cubic-bezier(.3,.8,.4,1)`, delays `0 / .16s / .32s`. Opacity rides from `.45` to `1` at the top of the hop.
2. **A rotating status word**, swapped every 1.05s, entering with `translateY(9px)` + fade over `.42s`. A shimmer sweeps the letters — a 230%-wide gradient in `background-clip: text`, cycling `1.7s` linear.
3. **The bubble breathes** (`scale(1.018)`, 2.4s) and the coach avatar pulses a ring (`box-shadow` 0 → 8px, 1.6s).

Status words cycle from a random start:

> Locking in… · Cooking… · Running the numbers… · Reading the tape… · No glazing… · Mogging your last set… · Weighing it up… · Doing the math… · Chasing the pump… · Checking your ego…

Gym-adjacent slang only. The coach persona is evidence-first, so nothing that mocks bodies.

---

## Device

402 × 874 iPhone frame. Status bar overlays the top 54px — every screen header starts at `padding-top: 60px`. Home indicator occupies the bottom 34px — every scroll region and fixed composer ends at `padding-bottom: 30px`.

---

# Screens

Eight screens, two sheets. Navigation is chat-first: there is no tab bar. Home is the hub, a dot menu opens everything else, and every secondary screen returns with a back button.

---

## 1. Today — home

The only screen that opens by default.

```
[ Dynamic Island — now playing ]
Gym Log                    [sun|moon]  [•••]
⇄ ROTATION   (Chest) Back  Arms  Legs
Chest day
Next after Wednesday's legs · last chest session Jul 31
LOGGED TODAY                      ← only after a save
  ✓ Bench Press        85 kg × 5×5 · RPE 9
PLANNED · LAST TIME
  Bench Press                       96.3 kg  ›
  82.5 kg × 5×5 · RPE 9
  Incline Dumbbell Press            42.7 kg  ›
  Cable Fly                         24.5 kg  ›
  Weighted Dip                      19.0 kg  ›
─────────────────────────────────────────
 What's today?   Am I stalling?   What is RPE?
 [ Log a set, or ask the coach…        ] [↑]
```

- **Rotation strip** — four pills, the next day filled. Horizontally scrollable, read-only here; editable in Settings.
- **Planned rows** — exercise name, last session's load and RPE, and the est-1RM as a tag on the right. Tapping opens the exercise detail.
- **Logged today** — appears only once a set is saved this session. Tinted fill, check mark, load summary.
- **Quick chips** — three canned questions. Tapping sends straight to the coach, skipping the input.
- **Composer** — fixed above the home indicator, always visible. See `behavior.md` for how it routes.

## 2. Coach chat

Header carries the back button, the title, the line "Reads your numbers, never invents them", and the theme toggle.

Coach messages sit left with a 26px avatar and a surface bubble; user messages sit right in an accent bubble with no avatar. The list auto-scrolls to the bottom on every new message and on the thinking state appearing.

Opens seeded with one coach message about today's session. Its own composer at the bottom.

## 3. Exercise detail

Reached from a Today row or a Progress card. Back returns to whichever it was.

```
Chest · compound
Bench Press
┌──────────────────────────────┐
│ EST 1RM · EPLEY      ↗ +6.5% │
│ 96.3 kg                      │
│ ╱╲╱ sparkline ╱              │
│ JUL 3               JUL 31   │
└──────────────────────────────┘
┌ LAST TIME ────┐ ┌ RPE TREND ──┐
│ 82.5 kg × 5×5 │ │ 8 → 9       │
│ "last set…"   │ │ harder for… │
└───────────────┘ └─────────────┘
● Up 6.5% in four weeks, but RPE went 8 → 9…
HISTORY
Date    Load            RPE   1RM
Jul 31  82.5 kg × 5×5   9     96.3
…                                   (newest first)
```

Sparkline is a 5-point polyline over est-1RM, normalized to its own min/max, `vector-effect: non-scaling-stroke`.

## 4. Progress read-out

Title "Read-out", subhead "Numbers computed in code. The coach only judges them."

One card per tracked compound — Bench Press, Barbell Row, Overhead Press, Back Squat. Each card:

1. Exercise name (tappable → detail) and a status tag: Progressing / Grinding / Stalling / Regressing.
2. Sparkline.
3. A rule, then the computed row: `COMPUTED   est 1RM 96.3 kg · RPE 8 → 9` and the delta with a trend arrow.
4. The coach's sentence with the avatar.

The rule between 3 and 4 is the point of the layout. Above it, arithmetic. Below it, judgement.

## 5. Spotify

Album placeholder (striped, washed, 34px radius), track, artist, scrubber with elapsed and length, prev / play / next at 52-68px, and the playlist row.

The device chip in the header reads `iPhone · active` while playing and `No active device` when paused — the spec's failure case, shown rather than hidden.

The island hides on this screen.

## 6. Notion import

Four steps in one screen.

0. **Intro** — "Bring your history over", a read-only textarea showing the raw Notion text, and a "Read it" button. Footnote: re-runnable without duplicating.
1. **Reading** — three blinking dots, "Reading 142 blocks", auto-advances after 1.6s.
2. **Confirm** — inferred rotation as outlined pills; a Found card (38 sessions / 412 sets / 4-day rotation); a "Needs your eye" card listing what the parse could not type confidently. Save, or start over.
3. **Done** — filled circle with a check, "38 sessions saved", back to today.

## 7. Settings

Grouped: Appearance (theme toggle with a label naming the current ground), Training (units kg/lb, ask-for-RPE on/off, next-in-rotation override), Coach (voice: direct / detailed, with a line describing each), Connections (Google signed in, Spotify device state, Notion import count).

Segmented controls are `.seg2` — a pill track whose selected option is matched by a CSS attribute pair, `.seg2[data-val="kg"] [data-opt="kg"]`.

## 8. Dynamic Island — now playing

Not a screen; a persistent element on every screen except Spotify. 160px wide, 37px tall, sitting exactly over the camera cutout at `top: 11px`. Music glyph, track title, four-bar equalizer, play/pause. Tapping the pill opens the Spotify screen; tapping the play control toggles playback without navigating.

Capped at 172px — wider than that and it covers the status bar's signal and wifi glyphs.

---

## Sheets

Both slide up from the bottom over a scrim, with a 42px grab handle.

**Menu** — Progress read-out · Coach · Music · Import my Notion · Settings. Opened by the `•••` button on Today.

**Parse confirmation** — the raw text in quotes, then one row per typed field (Exercise, Weight, Sets × reps, RPE, est 1RM, Note when present). A footnote warns when RPE is missing that the trend will fall back to est-1RM and volume. Two actions: Edit (dismiss, text stays in the input) and Save.

---

# Behavior

## State

One component owns everything.

| Key | Values | Notes |
| --- | --- | --- |
| `theme` | `light` \| `dark` | Manual only |
| `screen` | `today` \| `chat` \| `exercise` \| `progress` \| `spotify` \| `import` \| `settings` | |
| `prev` | screen | So back returns to the right place |
| `sheet` | `null` \| `menu` \| `parse` | One at a time |
| `parsed`, `raw` | object, string | The pending parse and its source text |
| `logged` | array | Sets saved this session |
| `activeEx` | exercise name | Drives the detail screen |
| `msgs`, `typing`, `thinkI` | | Chat |
| `playing`, `track` | | Spotify |
| `imp` | `0–3` | Import step |
| `units`, `voice`, `rpeAsk`, `nextDay` | | Settings |

Inputs are uncontrolled and read through refs on submit — no re-render per keystroke.

---

## The composer routes itself

On Enter or send, the text is parsed. The result decides where it goes.

**Question** if it contains `?` or starts with what / why / how / should / am / is / are / can / when / do / does / give / tell → chat.

**Log** if it is not a question **and** an exercise alias matched **and** a weight was found **and** a `sets × reps` pattern matched → parse sheet.

Anything else → chat. The fallback is the coach, never an error.

### Parse

| Field | Rule |
| --- | --- |
| exercise | First alias found in the text. Order matters — `incline` is tested before `bench` so "incline bench" resolves correctly |
| weight | `N kg` if present, else the first number |
| sets, reps | `(\d+)\s*[x×]\s*(\d+)` |
| rpe | `@N` or `rpe N`, decimals allowed; `null` when absent |
| note | Everything after the first comma |

Aliases: incline, bench, fly, flye, dip, row, squat, ohp, overhead, shoulder press.

`bench 85 5x5 @9, last set heavy` → Bench Press · 85 kg · 5×5 · RPE 9 · "last set heavy".

Nothing is written until Save. Saving appends to Logged today on the home screen.

---

## Compute — code only

```
est 1RM  =  weight × (1 + reps / 30)          Epley
delta    =  (last est1RM − first est1RM) / first × 100
rpeDelta =  last logged RPE − first logged RPE
```

Sets with no RPE are dropped from the RPE trend rather than defaulting; if none remain the UI says "not logged" and the copy notes the trend runs on est-1RM and volume alone.

Status:

| Condition | Status | Tag |
| --- | --- | --- |
| `delta ≥ 2.5` and `rpeDelta ≤ .25` | `up` | Progressing |
| `delta ≥ 2.5` and `rpeDelta > .25` | `grind` | Grinding |
| `−2.5 < delta < 2.5` | `flat` | Stalling |
| `delta ≤ −2.5` | `down` | Regressing |

Status drives the trend arrow through a CSS attribute selector — one `data-status` on a wrapper, four stacked icons, three of them `display: none`.

Unit conversion is display-only: `lb = round(kg × 2.2046 × 2) / 2`. Stored values stay metric.

---

## Judge — the model

The model receives the computed numbers and writes one or two sentences. It never produces a figure that is not already on screen.

**Every number in coach copy must match what the compute layer produces for that exercise.** In the prototype the copy is fixed strings, so this is checked by hand; in the build it is a prompt constraint and worth asserting in tests. The seeded data yields Bench +6.5%, Row +14.3%, Squat +9.5%, Overhead Press flat, Dip +50%.

### Voice

Direct, evidence-first, no hedging and no praise. A read is three moves: what the number did, what that means, what to do next.

> Up 6.5% in four weeks, but RPE went 8 → 9 for the same work. That is grinding, not progressing. Drop to 72.5 for a week, then come back at 82.5 and it should feel like an 8.

Not a clone of any named coach. Style only.

**Refusal:** asked something the log cannot answer, it says so — "I only judge what is in the log. Ask me about an exercise by name, or what is on today." It does not guess.

The Settings **detailed** voice keeps the same calls and spells out the reasoning; it does not soften them.

---

## Thinking state

Fires on send, resolves after 2.4s. A rotating status word swaps every 1.05s from a random start, so consecutive questions don't show the same sequence. Three dots hop in sequence beside it. Cleared on unmount along with every other timer.

The delay is deliberate — long enough to read two or three words. Tie it to the real request in the build; keep a floor of roughly 1.2s so the state is legible rather than a flash.

---

## Data seeded in the prototype

Seven exercises with dated history: Bench Press, Incline Dumbbell Press, Cable Fly, Weighted Dip, Barbell Row, Overhead Press, Back Squat. Bench carries a deliberate pattern — load rising while RPE climbs 8 → 9 — so the Grinding case is visible without hunting for it. Cable Fly has RPE missing on two of three sessions so the degraded trend path is visible too.

Invented but internally consistent. Every figure on screen is computed from these rows; swap in real history and it all recomputes.

---

# App icon

Type only. No mark, no illustration. Two words stacked, set heavy and tight, filling the tile. Chosen from four directions in `App Icon.dc.html`; the other three (bar, mid-hop dots, rising plates) stay in that file for reference.

## Construction

Everything scales from the tile's edge length, `S`.

| Property | Value |
| --- | --- |
| Tile | `S × S`, full bleed, no padding, no border |
| Corner radius | Leave square. iOS and Android apply their own mask |
| Font | Figtree 700 |
| Font size | `0.258 × S` |
| Line height | `0.82` |
| Letter spacing | `-0.05em` |
| Lines | `LOCK` / `IN`, uppercase, two lines, centered |
| Alignment | Text block optically centered — centre the cap-height box, not the line box |

The two lines are set to collide: at `line-height: 0.82` the descender space is removed entirely and the words stack as one block. That tightness is the whole design. If the renderer adds leading, reduce line-height until the gap between LOCK's baseline and IN's cap-line is zero.

### Sizes

| Use | Size | Font size |
| --- | --- | --- |
| Master | 1024 | 264 |
| PWA large | 512 | 132 |
| PWA standard | 192 | 50 |
| apple-touch-icon | 180 | 46 |
| Home screen (rendered) | 60 | 15.5 |
| Favicon | 32 | 8 |

Below 32px the second line closes up. For the favicon, drop `IN` and set `LOCK` on one line at `0.30 × S`.

---

## Variants

| Variant | Tile | Text |
| --- | --- | --- |
| Default / night | `#000000` | `#ffffff` |
| Light | `#ffffff` | `#111111` |
| iOS tinted | transparent | `#ffffff`, system applies the tint |

The default is the black tile. It matches the app's Night ground and holds up against any wallpaper; the white tile is the alternate for iOS 18's light appearance.

No gradient, no shadow, no outline, no secondary color. If it needs an effect to work, the type is wrong.

### Maskable

Android's maskable icon crops to a circle inscribed in the central 80%. Set the text block to no more than **58% of the tile width** and centre it, then pad out with the tile color. Ship the maskable version as a separate file — do not reuse the full-bleed one.

---

## Export

```
icon-1024.png          master, black tile
icon-512.png           manifest, purpose "any"
icon-512-maskable.png  manifest, purpose "maskable"
icon-192.png           manifest, purpose "any"
apple-touch-icon.png   180, black tile
favicon.ico            32, LOCK only
```

Manifest entries:

```json
"icons": [
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

Set `"background_color": "#000000"` and `"theme_color": "#000000"` so the splash matches the tile.

---

## Reference markup

The tile is reproducible in CSS at any size — useful for the splash screen and the settings row, and for exporting PNGs by screenshot rather than redrawing.

```html
<div style="width:512px;height:512px;background:#000;display:grid;place-items:center">
  <div style="font:700 132px/.82 Figtree,system-ui,sans-serif;
              letter-spacing:-.05em;color:#fff;text-align:center">LOCK<br>IN</div>
</div>
```

Figtree 700 must be loaded before export or the fallback metrics will change the fit.

---

## Note

"Lock in" is current slang for focusing hard — it reads as a gym instruction and as an app telling you to start. It is also the fastest-dating thing in this design. Everything else here is geometry and will hold for years; this one is a deliberate bet on a moment. Worth revisiting in a year, and it is a one-file change when the time comes.
