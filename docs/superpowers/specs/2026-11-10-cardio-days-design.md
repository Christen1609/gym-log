# Cardio days — design (short)

**Why:** the lifter can't record "I only did cardio today". The app only knows
lifting sets, so a cardio day is invisible: it doesn't count as training and
the "did you log your workout?" reminder nags about it.

**Decisions** (the lifter delegated the six questions on 2026-11-10; these are
Claude's recommended answers, taken as the lifter's):
1. Cardio does not move the Chest → Back → Arms → Legs rotation.
2. Cardio counts as "trained today": the missing-workout reminder stops.
3. Record type (run, bike, row, stairs, walk…) and minutes; distance and a
   note optional. No maths on cardio — it's a record.
4. Entered the same way as lifting: tell the coach / type in the Today box
   ("30 min treadmill"), confirm a card.
5. Allowed on any day, alone or with lifting.
6. Shows in "Logged today" and a "Recent cardio" list on the Progress screen;
   not in the progress read-out. The coach is told about it but doesn't judge it.

**Approaches considered**
- **A. Own table `gymlog.cardio` (chosen).** One row per cardio session: date,
  kind, minutes, distance_km, note. Lifting maths, rotation and history stay
  untouched; cardio joins only where decisions 2 and 6 say.
- B. Store cardio as an "exercise" in `sets` (minutes in reps). Rejected: it
  would leak into strength trends, the rotation and the unnoted-gaps reminder.
- C. Free text in `sessions.notes`. Rejected: no structure to list or count.

**Non-goals:** cardio progress charts, calories, heart rate, wearables import,
a dedicated cardio button.

**Constraints:** code computes every number; zero-config still works (cardio,
like every coach write, needs a signed-in account); RLS on the new table.

**Builder's calls:** the coach action format, where the Recent cardio list sits,
how many entries it shows.
