-- A set can be logged without its weight or reps when the lifter didn't note
-- them ("calf raises, 20 kg, 3 sets, don't remember the reps"). NULL means
-- "not noted": the app keeps the set in history but leaves it out of every
-- est-1RM figure. The views already yield a NULL est_1rm for such rows.

alter table gymlog.sets alter column weight drop not null;
alter table gymlog.sets alter column reps drop not null;
