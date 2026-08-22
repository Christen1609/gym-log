"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COACH,
  EX,
  PLAN,
  PROGRESS_EXERCISES,
  ROT,
  THINKING,
  Units,
  epley,
  findLatestSession,
  getTodayInfo,
  loadSummary,
  nextRotationDay,
  parseLog,
  readOut,
  round1,
  toDisplayWeight,
  type ExerciseData,
  type TodayInfo,
} from "@/lib/gymlog";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, getSupabaseClient } from "@/lib/supabase";
import { loadHistory, saveSet, seedIfEmpty } from "@/lib/db";

export type Screen = "today" | "chat" | "exercise" | "progress" | "import" | "settings";
export type Sheet = "menu" | "parse" | null;
export type Theme = "light" | "dark";
export type Voice = "direct" | "detailed";
export type OnOff = "on" | "off";

export interface ChatMessage {
  id: number;
  who: "coach" | "user";
  text: string;
}

export interface LoggedSet {
  name: string;
  summary: string;
}

interface PersistedState {
  logged: LoggedSet[];
  units: Units;
  voice: Voice;
  rpeAsk: OnOff;
  nextDay: string;
  theme: Theme;
}

const STORAGE_KEY = "gymlog:v1";

function loadPersisted(): Partial<PersistedState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Fixed defaults so the first client render matches the server-rendered
// HTML exactly. Anything persisted in localStorage is applied afterward in
// an effect (client-only, post-hydration) — see the `hydrated` guard below.
const DEFAULT_THEME: Theme = "light";
const DEFAULT_UNITS: Units = "kg";
const DEFAULT_VOICE: Voice = "direct";
const DEFAULT_RPE_ASK: OnOff = "on";
const DEFAULT_NEXT_DAY = "Chest";
const DEFAULT_TODAY: TodayInfo = { iso: "", weekday: "Today", shortDate: "", label: "Today" };

export function useGymLog() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [screen, setScreen] = useState<Screen>("today");
  const [prevScreen, setPrevScreen] = useState<Screen>("today");
  const [sheet, setSheet] = useState<Sheet>(null);

  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseLog>>(null);

  const [logged, setLogged] = useState<LoggedSet[]>([]);
  const [activeEx, setActiveEx] = useState("Bench Press");

  const [msgs, setMsgs] = useState<ChatMessage[]>([
    {
      id: 1,
      who: "coach",
      text: "Chest day. Last time you benched 82.5 for 5×5 at RPE 9 — that was already heavy. Start at 72.5 today.",
    },
  ]);
  const [typing, setTyping] = useState(false);
  const [thinkI, setThinkI] = useState(0);
  const msgIdRef = useRef(2);
  const thinkTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const thinkInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined);


  const [imp, setImp] = useState(0);
  const importTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [units, setUnits] = useState<Units>(DEFAULT_UNITS);
  const [voice, setVoice] = useState<Voice>(DEFAULT_VOICE);
  const [rpeAsk, setRpeAsk] = useState<OnOff>(DEFAULT_RPE_ASK);
  const [nextDay, setNextDay] = useState(DEFAULT_NEXT_DAY);
  const [todayInfo, setTodayInfo] = useState<TodayInfo>(DEFAULT_TODAY);
  const [hydrated, setHydrated] = useState(false);

  // When Supabase is configured the app is account-backed: `authed` gates the
  // UI behind sign-in and `history` is the user's real data. Without it both
  // stay at their zero-config defaults and the seeded history is used instead.
  const [authed, setAuthed] = useState<boolean | null>(isSupabaseConfigured ? null : true);
  const [history, setHistory] = useState<Record<string, ExerciseData>>(EX);
  const [syncing, setSyncing] = useState(false);

  // Progressive enhancement: seed with the fallback copy immediately (so the
  // app matches the prototype offline with zero flicker), then let the real
  // Gemini judgment replace it in the background once /api/coach resolves.
  const [coachText, setCoachText] = useState<Record<string, string>>(() => ({ ...COACH }));
  const fetchedCoach = useRef<Set<string>>(new Set());

  const ensureCoachText = useCallback((name: string) => {
    if (fetchedCoach.current.has(name)) return;
    fetchedCoach.current.add(name);
    fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "exercise", exercise: name }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.text) setCoachText((prev) => ({ ...prev, [name]: data.text }));
      })
      .catch(() => {});
  }, []);

  // Runs once, client-only, after the hydration-matching first render. Applies
  // anything found in localStorage, then flips `hydrated` so the persist effect
  // below (which would otherwise fire first, with default values, and clobber
  // what's in storage) is allowed to start writing.
  //
  // set-state-in-effect is disabled deliberately: this is the rule's documented
  // exception — a one-time sync from an external system. Reading storage in a
  // useState initializer instead would reintroduce the server/client mismatch
  // this effect exists to avoid.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const p = loadPersisted();
    if (p.theme) setTheme(p.theme);
    if (p.logged) setLogged(p.logged);
    if (p.units) setUnits(p.units);
    if (p.voice) setVoice(p.voice);
    if (p.rpeAsk) setRpeAsk(p.rpeAsk);
    if (p.nextDay) setNextDay(p.nextDay);
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Watches the auth session and pulls the user's history once signed in.
  // Seeding is a no-op on an account that already has data.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();

    const sync = async (signedIn: boolean) => {
      setAuthed(signedIn);
      if (!signedIn) {
        setHistory(EX);
        return;
      }
      setSyncing(true);
      try {
        await seedIfEmpty();
        setHistory(await loadHistory());
      } catch (err) {
        // Leave the seeded history in place so the app stays usable.
        console.error("Supabase sync failed", err);
      } finally {
        setSyncing(false);
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => void sync(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => void sync(Boolean(session))
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const data: PersistedState = { logged, units, voice, rpeAsk, nextDay, theme };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [hydrated, logged, units, voice, rpeAsk, nextDay, theme]);

  useEffect(() => {
    const refreshToday = () => setTodayInfo(getTodayInfo());
    refreshToday();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshToday();
    };

    window.addEventListener("focus", refreshToday);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshToday);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(
    () => () => {
      clearTimeout(thinkTimeout.current);
      clearInterval(thinkInterval.current);
      clearTimeout(importTimeout.current);
    },
    []
  );

  const go = useCallback(
    (s: Screen) => {
      setScreen((cur) => {
        setPrevScreen((p) => (cur === s ? p : cur));
        return s;
      });
      setSheet(null);
    },
    []
  );

  const back = useCallback(() => go(prevScreen), [go, prevScreen]);

  const openExercise = useCallback(
    (name: string, from: Screen) => {
      setActiveEx(name);
      ensureCoachText(name);
      setScreen("exercise");
      setPrevScreen(from);
      setSheet(null);
    },
    [ensureCoachText]
  );

  const say = useCallback((text: string) => {
    const mine: ChatMessage = { id: msgIdRef.current++, who: "user", text };
    setMsgs((m) => m.concat(mine));
    setTyping(true);
    setScreen("chat");
    setSheet(null);
    setThinkI(Math.floor(Math.random() * THINKING.length));

    clearTimeout(thinkTimeout.current);
    clearInterval(thinkInterval.current);
    thinkInterval.current = setInterval(() => setThinkI((i) => i + 1), 1050);

    thinkTimeout.current = setTimeout(async () => {
      clearInterval(thinkInterval.current);
      let replyText: string;
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "chat",
            message: text,
            context: (() => {
              const now = new Date();
              const latest = findLatestSession(history, now);
              return {
                todayLabel: getTodayInfo(now).label,
                nextDay,
                lastSessionDay: latest?.day,
                lastSessionDate: latest?.date,
              };
            })(),
          }),
        });
        const data = res.ok ? await res.json() : null;
        replyText = data?.text ?? "I only judge what is in the log. Ask me about an exercise by name, or what is on today.";
      } catch {
        replyText = "I only judge what is in the log. Ask me about an exercise by name, or what is on today.";
      }
      const reply: ChatMessage = { id: msgIdRef.current++, who: "coach", text: replyText };
      setMsgs((m) => m.concat(reply));
      setTyping(false);
    }, 2400);
  }, [history, nextDay]);

  // Takes plain text rather than an input ref — the DOM ref that owns the
  // input value belongs to whichever screen renders it (see TodayScreen /
  // ChatScreen), not to this hook. Keeps refs out of the shared state object.
  const submitText = useCallback(
    (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) return;
      const p = parseLog(trimmed);
      if (p) {
        setParsed(p);
        setRaw(trimmed);
        setSheet("parse");
      } else {
        say(trimmed);
      }
    },
    [say]
  );

  const confirmSave = useCallback(() => {
    if (!parsed) return;
    setLogged((l) =>
      l.concat([
        {
          name: parsed.name,
          summary:
            loadSummary({ w: parsed.weight, sets: parsed.sets, reps: parsed.reps }, units) +
            (parsed.rpe ? ` · RPE ${parsed.rpe}` : ""),
        },
      ])
    );
    setSheet(null);
    setParsed(null);
    setScreen("today");

    // Persist to Postgres and pull the history back so trends include this set.
    // The optimistic row above stays put if the write fails, so nothing the
    // user just entered disappears from the screen.
    if (isSupabaseConfigured && authed) {
      void (async () => {
        try {
          await saveSet(parsed);
          setHistory(await loadHistory());
        } catch (err) {
          console.error("Failed to save set", err);
        }
      })();
    }
  }, [parsed, units, authed]);

  const importNext = useCallback(() => {
    setImp((cur) => {
      if (cur === 0) {
        clearTimeout(importTimeout.current);
        importTimeout.current = setTimeout(() => setImp(2), 1600);
        return 1;
      }
      if (cur === 2) return 3;
      return cur;
    });
  }, []);
  const importReset = useCallback(() => setImp(0), []);

  // ── derived data ──────────────────────────────────────────────────────

  // Every figure below recomputes from `history` — the seed when running
  // without Supabase, the user's own rows once signed in.
  const ro = readOut(activeEx, history);
  const cv = useCallback((w: number) => toDisplayWeight(w, units), [units]);
  const todayReference = todayInfo.iso ? new Date(`${todayInfo.iso}T12:00:00`) : new Date();
  const latestSession = findLatestSession(history, todayReference);
  const inferredNextDay = latestSession ? nextRotationDay(latestSession.day) : DEFAULT_NEXT_DAY;
  const currentNextDay = nextDay || inferredNextDay;
  const lastSessionText = latestSession
    ? `last ${latestSession.day.toLowerCase()} session ${latestSession.date}`
    : "no sessions logged yet";

  const rotation = ROT.map((d) => ({ name: d, active: d === currentNextDay, setNext: () => setNextDay(d) }));

  const todayPlan = PLAN.filter((name) => history[name]?.hist.length).map((name) => {
    const hist = history[name].hist;
    const last = hist[hist.length - 1];
    return {
      name,
      last: loadSummary(last, units) + (last.rpe ? ` · RPE ${last.rpe}` : " · no RPE"),
      est: `${round1(cv(epley(last.w, last.reps)))} ${units}`,
      open: () => openExercise(name, "today"),
    };
  });

  const progressCards = PROGRESS_EXERCISES.filter((name) => history[name]?.hist.length).map((name) => {
    const r = readOut(name, history);
    return {
      name,
      status: r.status,
      spark: r.spark(26),
      coach: coachText[name] ?? COACH[name],
      delta: `${r.pct >= 0 ? "+" : ""}${round1(r.pct)}%`,
      computed: `est 1RM ${round1(r.e1rm)} ${units} · RPE ${
        r.rpes.length ? `${r.rpes[0]} → ${r.rpes[r.rpes.length - 1]}` : "not logged"
      }`,
      open: () => openExercise(name, "progress"),
    };
  });

  return {
    theme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    screen,
    prevScreen,
    sheet,
    go,
    back,
    openMenu: () => setSheet("menu"),
    closeSheet: () => setSheet(null),
    units,
    setUnits,
    voice,
    setVoice,
    rpeAsk,
    setRpeAsk,
    nextDay: currentNextDay,
    rotation,
    dayTitle: `${currentNextDay} day`,
    currentDaySub: `${todayInfo.label} - ${lastSessionText}`,
    daySub: `Next after Wednesday's legs · last ${nextDay.toLowerCase()} session Jul 31`,
    todayPlan,
    logged,
    submitText,
    msgs,
    typing,
    thinkWord: THINKING[thinkI % THINKING.length],
    thinkKey: thinkI,
    say,
    activeEx,
    exGroup: history[activeEx]?.group ?? EX[activeEx].group,
    readOutData: ro,
    authed,
    syncing,
    supabaseEnabled: isSupabaseConfigured,
    signOut: () => void getSupabaseClient().auth.signOut(),
    coachText: coachText[activeEx] ?? COACH[activeEx],
    cv,
    openExercise,
    progressCards,
    imp,
    importNext,
    importReset,
    raw,
    parsed,
    confirmSave,
  };
}

export type GymLogState = ReturnType<typeof useGymLog>;
