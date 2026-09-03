"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COACH,
  EX,
  PROGRESS_EXERCISES,
  ROT,
  THINKING,
  Units,
  epley,
  findLatestSession,
  getTodayInfo,
  loadSummary,
  localISODate,
  parseLog,
  planForDay,
  readOut,
  resolveDay,
  round1,
  toDisplayWeight,
  type ExerciseData,
  type TodayInfo,
} from "@/lib/gymlog";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, getSupabaseClient } from "@/lib/supabase";
import {
  appendCoachMessage,
  correctSets,
  importHistory,
  loadChatMessages,
  loadHistory,
  loadProfile,
  logSets,
  removeSets,
  saveProfile,
  saveSet,
  seedIfEmpty,
  type CoachProfile,
} from "@/lib/db";
import { proposalText, type CoachProposal } from "@/lib/coachActions";
import {
  deleteOauthConnection,
  fetchNotionPages,
  fetchOauthConnection,
  importNotionPage,
  loadNotionToken,
  parsePastedLog,
  saveNotionToken,
  summarize,
  type NotionConnection,
  type NotionPageRef,
  type ParsedImport,
} from "@/lib/notionImport";

const OAUTH_ERRORS: Record<string, string> = {
  config: "Notion OAuth isn't configured yet — use a token below.",
  signin: "Sign in first, then connect Notion.",
  denied: "Notion access was declined.",
  state: "The Notion connection attempt expired — try again.",
  exchange: "Notion didn't accept the connection. Try again.",
  save: "Connected to Notion but couldn't save the connection. Try again.",
};

export type Screen = "today" | "chat" | "exercise" | "progress" | "import" | "settings";
export type Sheet = "menu" | "parse" | "reminder" | null;
export type Theme = "light" | "dark";
export type Voice = "direct" | "detailed";
export type OnOff = "on" | "off";

export type ProposalStatus = "pending" | "applying" | "done" | "dismissed" | "failed";

/** A change the coach proposed with this message; written only on Confirm. */
export interface ProposalCard {
  proposal: CoachProposal;
  status: ProposalStatus;
}

export interface ChatMessage {
  id: number;
  who: "coach" | "user";
  text: string;
  proposals?: ProposalCard[];
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
  theme: Theme;
  /** A day the user picked by hand, and the date they picked it on. The
   *  override expires when the calendar rolls over, so the app goes back to
   *  working the day out for itself the next morning. */
  dayOverride: string | null;
  dayOverrideOn: string;
  /** ISO date the "log your last workout?" prompt was last answered. */
  loggedPromptOn: string;
  /** ISO date `logged` belongs to — cleared when a new day starts. */
  loggedOn: string;
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


  // Import flow: 0 connect/pick a source, 1 reading, 2 confirm, 3 done.
  const [imp, setImp] = useState(0);
  const [notionConn, setNotionConn] = useState<NotionConnection | null>(null);
  const [notionPages, setNotionPages] = useState<NotionPageRef[] | null>(null);
  // Set when the OAuth callback bounced us back — triggers one auto page-list.
  const oauthReturnRef = useRef(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importParsed, setImportParsed] = useState<ParsedImport | null>(null);
  const [importSaved, setImportSaved] = useState<{ sessions: number; sets: number; skipped: number } | null>(null);

  const [units, setUnits] = useState<Units>(DEFAULT_UNITS);
  const [voice, setVoice] = useState<Voice>(DEFAULT_VOICE);
  const [rpeAsk, setRpeAsk] = useState<OnOff>(DEFAULT_RPE_ASK);
  // The day is worked out from the log, not stored. These two only record a
  // manual override and the date it was made on — see `currentDay` below.
  const [dayOverride, setDayOverride] = useState<string | null>(null);
  const [dayOverrideOn, setDayOverrideOn] = useState("");
  const [loggedOn, setLoggedOn] = useState("");
  const [loggedPromptOn, setLoggedPromptOn] = useState("");
  const [todayInfo, setTodayInfo] = useState<TodayInfo>(DEFAULT_TODAY);
  const [hydrated, setHydrated] = useState(false);
  // Guards the reminder so it opens at most once per mount, and never on top
  // of a sheet the user opened themselves.
  const remindedRef = useRef(false);

  // When Supabase is configured the app is account-backed: `authed` gates the
  // UI behind sign-in and `history` is the user's real data. Without it both
  // stay at their zero-config defaults and the seeded history is used instead.
  const [authed, setAuthed] = useState<boolean | null>(isSupabaseConfigured ? null : true);
  const [history, setHistory] = useState<Record<string, ExerciseData>>(EX);
  const [syncing, setSyncing] = useState(false);
  const [profile, setProfile] = useState<CoachProfile | null>(null);

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
    if (p.dayOverride) setDayOverride(p.dayOverride);
    if (p.dayOverrideOn) setDayOverrideOn(p.dayOverrideOn);
    if (p.loggedOn) setLoggedOn(p.loggedOn);
    if (p.loggedPromptOn) setLoggedPromptOn(p.loggedPromptOn);
    const manualToken = loadNotionToken();
    if (manualToken) setNotionConn({ token: manualToken, workspace: null, source: "token" });
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
      // An OAuth Notion connection lives on the account; it wins over any
      // manually pasted token on this device.
      void fetchOauthConnection().then((conn) => {
        if (conn) setNotionConn(conn);
      });
      try {
        await seedIfEmpty();
        const h = await loadHistory();
        setHistory(h);

        // The coach's memory: reopen the saved conversation and profile.
        const [stored, prof] = await Promise.all([loadChatMessages(), loadProfile()]);
        if (stored.length) setMsgs(stored.map((m) => ({ id: msgIdRef.current++, who: m.who, text: m.text })));
        setProfile(prof);

        // Weekly check-in: the coach speaks first when a week has passed.
        // Fire-and-forget so sign-in never waits on Gemini.
        void (async () => {
          try {
            const now = new Date();
            const latest = findLatestSession(h, now);
            const res = await fetch("/api/coach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "checkin",
                context: {
                  todayLabel: getTodayInfo(now).label,
                  lastSessionDay: latest?.day,
                  lastSessionDate: latest?.date,
                },
              }),
            });
            const data = res.ok ? await res.json() : null;
            if (data?.text) {
              setMsgs((m) => m.concat({ id: msgIdRef.current++, who: "coach", text: data.text as string }));
            }
          } catch {
            /* a missed check-in is not an error the user should see */
          }
        })();
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
    const data: PersistedState = {
      logged,
      units,
      voice,
      rpeAsk,
      theme,
      dayOverride,
      dayOverrideOn,
      loggedPromptOn,
      loggedOn,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [hydrated, logged, units, voice, rpeAsk, theme, dayOverride, dayOverrideOn, loggedPromptOn, loggedOn]);

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
      let proposals: ProposalCard[] | undefined;
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
                todayISO: localISODate(now),
                nextDay: resolveDay(history, now).day,
                lastSessionDay: latest?.day,
                lastSessionDate: latest?.date,
              };
            })(),
          }),
        });
        const data = res.ok ? await res.json() : null;
        replyText = data?.text ?? "I only judge what is in the log. Ask me about an exercise by name, or what is on today.";
        if (Array.isArray(data?.proposals) && data.proposals.length) {
          proposals = (data.proposals as CoachProposal[]).map((proposal) => ({ proposal, status: "pending" }));
        }
      } catch {
        replyText = "I only judge what is in the log. Ask me about an exercise by name, or what is on today.";
      }
      const reply: ChatMessage = { id: msgIdRef.current++, who: "coach", text: replyText, proposals };
      setMsgs((m) => m.concat(reply));
      setTyping(false);
    }, 2400);
  }, [history]);

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
    setLoggedOn(todayInfo.iso || localISODate());
    setLoggedPromptOn(todayInfo.iso || localISODate());

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
  }, [parsed, units, authed, todayInfo.iso]);

  const listPagesWith = useCallback(async (token: string): Promise<boolean> => {
    setImportBusy(true);
    setImportError(null);
    try {
      setNotionPages(await fetchNotionPages(token));
      return true;
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Couldn't reach Notion.");
      return false;
    } finally {
      setImportBusy(false);
    }
  }, []);

  // Manual path: a pasted internal-integration token, kept on this device.
  const notionConnect = useCallback(
    async (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) return;
      if (await listPagesWith(trimmed)) {
        setNotionConn({ token: trimmed, workspace: null, source: "token" });
        saveNotionToken(trimmed);
      }
    },
    [listPagesWith]
  );

  // Re-lists pages with the connection already at hand (e.g. after reopening
  // the screen, when the page list from the original connect is gone).
  const notionListPages = useCallback(() => {
    if (notionConn) void listPagesWith(notionConn.token);
  }, [notionConn, listPagesWith]);

  // Landed back from Notion's consent page: fetch the fresh connection row
  // and list pages without another tap. Reading window.location is the same
  // documented one-time external sync as the hydration effect above.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("notion");
    if (!status) return;
    window.history.replaceState(null, "", window.location.pathname);
    setScreen("import");
    if (status === "connected") oauthReturnRef.current = true;
    else setImportError(OAUTH_ERRORS[params.get("reason") ?? ""] ?? "Notion connection failed.");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (oauthReturnRef.current && notionConn?.source === "oauth") {
      oauthReturnRef.current = false;
      void listPagesWith(notionConn.token);
    }
  }, [notionConn, listPagesWith]);

  const notionDisconnect = useCallback(() => {
    if (notionConn?.source === "oauth") void deleteOauthConnection();
    setNotionConn(null);
    saveNotionToken("");
    setNotionPages(null);
    setImportError(null);
  }, [notionConn]);

  const runImport = useCallback((job: Promise<ParsedImport>) => {
    setImp(1);
    setImportError(null);
    void job
      .then((parsed) => {
        if (!parsed.sessions.length) {
          setImportError("No dated sessions were found in that log.");
          setImp(0);
          return;
        }
        setImportParsed(parsed);
        setImp(2);
      })
      .catch((err) => {
        setImportError(err instanceof Error ? err.message : "Couldn't read that log.");
        setImp(0);
      });
  }, []);

  const importFromPage = useCallback(
    (pageId: string) => {
      if (notionConn) runImport(importNotionPage(notionConn.token, pageId));
    },
    [notionConn, runImport]
  );

  const importFromText = useCallback(
    (text: string) => {
      if (text.trim()) runImport(parsePastedLog(text));
    },
    [runImport]
  );

  const importConfirm = useCallback(() => {
    if (!importParsed || importBusy) return;
    if (!isSupabaseConfigured || !authed) {
      setImportError("Sign in first — the import saves to your account.");
      return;
    }
    setImportBusy(true);
    setImportError(null);
    void (async () => {
      try {
        const saved = await importHistory(importParsed.sessions, importParsed.exercises);
        setImportSaved(saved);
        setHistory(await loadHistory());
        setImp(3);
      } catch (err) {
        console.error("Import save failed", err);
        setImportError("Couldn't save the import. Try again.");
      } finally {
        setImportBusy(false);
      }
    })();
  }, [importParsed, importBusy, authed]);

  const saveCoachProfile = useCallback((p: CoachProfile) => {
    setProfile(p);
    void saveProfile(p).catch((err) => console.error("Profile save failed", err));
  }, []);

  const importReset = useCallback(() => {
    setImp(0);
    setImportParsed(null);
    setImportSaved(null);
    setImportError(null);
  }, []);

  // Answering the prompt is remembered against today's date, so it asks once
  // a day and not on every reopen of the app.
  const answerLoggedPrompt = useCallback(() => {
    setLoggedPromptOn(todayInfo.iso || localISODate());
    setSheet(null);
  }, [todayInfo.iso]);

  // "Yes, it's logged" — nothing to record, just stop asking today.
  const confirmLoggedPrompt = answerLoggedPrompt;

  // "Not yet" — close and leave the composer ready on Today.
  const dismissLoggedPrompt = useCallback(() => {
    answerLoggedPrompt();
    setScreen("today");
  }, [answerLoggedPrompt]);

  // A new calendar day: yesterday's "Logged today" strip is not today's.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated || !todayInfo.iso) return;
    if (loggedOn && loggedOn !== todayInfo.iso) {
      setLogged([]);
      setLoggedOn(todayInfo.iso);
    }
  }, [hydrated, todayInfo.iso, loggedOn]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── derived data ──────────────────────────────────────────────────────

  // Every figure below recomputes from `history` — the seed when running
  // without Supabase, the user's own rows once signed in.
  const ro = readOut(activeEx, history);
  const cv = useCallback((w: number) => toDisplayWeight(w, units), [units]);
  const todayReference = todayInfo.iso ? new Date(`${todayInfo.iso}T12:00:00`) : new Date();

  // The whole point: the app reads the calendar and the log and decides for
  // itself which day is on. `dayOverride` only wins for the day it was set.
  const resolved = resolveDay(history, todayReference);
  const latestSession = resolved.lastSession;
  const overrideActive = Boolean(dayOverride) && dayOverrideOn === todayInfo.iso;
  const currentNextDay = overrideActive ? (dayOverride as string) : resolved.day;

  const lastSessionText = latestSession
    ? `last ${latestSession.day.toLowerCase()} session ${latestSession.date}`
    : "no sessions logged yet";

  // A session is "missing" once a full day has gone by without one. That is
  // what the prompt asks about, and it is derived, never stored.
  const daysSinceLast = resolved.daysSinceLast;
  const workoutUnlogged = daysSinceLast === null || daysSinceLast >= 1;

  const pickDay = useCallback(
    (d: string) => {
      setDayOverride(d);
      setDayOverrideOn(todayInfo.iso || localISODate());
    },
    [todayInfo.iso]
  );

  const rotation = ROT.map((d) => ({
    name: d,
    active: d === currentNextDay,
    setNext: () => pickDay(d),
  }));

  const setProposalStatus = useCallback((msgId: number, proposalId: string, status: ProposalStatus) => {
    setMsgs((m) =>
      m.map((msg) =>
        msg.id !== msgId || !msg.proposals
          ? msg
          : { ...msg, proposals: msg.proposals.map((c) => (c.proposal.id === proposalId ? { ...c, status } : c)) }
      )
    );
  }, []);

  // Writes run one at a time: two log_sets for the same new date would
  // otherwise race to create that session and leave two of them.
  const applyQueue = useRef<Promise<void>>(Promise.resolve());

  // The lifter tapped Confirm on a coach proposal: this is the only place a
  // coach-initiated change reaches the log. A receipt line goes into the chat
  // (and the saved conversation) so the coach knows it happened next time.
  const applyProposal = useCallback(
    (msgId: number, proposalId: string) => {
      const card = msgs.find((m) => m.id === msgId)?.proposals?.find((c) => c.proposal.id === proposalId);
      if (!card || card.status !== "pending") return;
      const p = card.proposal;
      const today = todayInfo.iso || localISODate();
      setProposalStatus(msgId, proposalId, "applying");

      applyQueue.current = applyQueue.current.then(async () => {
        try {
          if (p.type === "set_next_day") {
            pickDay(p.day);
          } else {
            if (!isSupabaseConfigured || !authed) throw new Error("Not signed in");
            if (p.type === "log_sets") {
              await logSets({
                exercise: p.exercise,
                muscleGroup: p.muscleGroup,
                date: p.date,
                weightKg: p.weightKg,
                reps: p.reps,
                sets: p.sets,
                rpe: p.rpe,
              });
              if (p.date === today) {
                setLogged((l) =>
                  l.concat({
                    name: p.exercise,
                    summary: loadSummary({ w: p.weightKg, sets: p.sets, reps: p.reps }, units) + (p.rpe ? ` · RPE ${p.rpe}` : ""),
                  })
                );
                setLoggedOn(today);
                setLoggedPromptOn(today);
              }
            } else if (p.type === "correct_sets") {
              await correctSets({ exercise: p.exercise, date: p.date, weightKg: p.weightKg, reps: p.reps, rpe: p.rpe });
            } else {
              await removeSets({ exercise: p.exercise, date: p.date });
            }
            setHistory(await loadHistory());
          }

          setProposalStatus(msgId, proposalId, "done");
          const receipt = proposalText(p, units, today, "done");
          setMsgs((m) => m.concat({ id: msgIdRef.current++, who: "coach", text: receipt }));
          if (isSupabaseConfigured && authed) {
            void appendCoachMessage(receipt).catch((err) => console.error("Receipt save failed", err));
          }
        } catch (err) {
          console.error("Coach action failed", err);
          setProposalStatus(msgId, proposalId, "failed");
        }
      });
    },
    [msgs, authed, units, todayInfo.iso, pickDay, setProposalStatus]
  );

  // "Confirm all" on a message with several cards; each still gets its own
  // receipt and its own Done/failed state.
  const applyAllProposals = useCallback(
    (msgId: number) => {
      const cards = msgs.find((m) => m.id === msgId)?.proposals ?? [];
      for (const c of cards) if (c.status === "pending") applyProposal(msgId, c.proposal.id);
    },
    [msgs, applyProposal]
  );

  const dismissProposal = useCallback(
    (msgId: number, proposalId: string) => setProposalStatus(msgId, proposalId, "dismissed"),
    [setProposalStatus]
  );

  const todayPlan = planForDay(currentNextDay, history).map((name) => {
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

  // The nudge. Opens at most once per calendar day, only on Today, and never
  // over a sheet the user opened themselves. `syncing` gates it so it judges
  // the account's real history rather than the seed it starts from.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (remindedRef.current) return;
    if (!hydrated || !todayInfo.iso || syncing) return;
    if (authed !== true) return;
    if (!workoutUnlogged) return;
    if (loggedPromptOn === todayInfo.iso) return;
    if (sheet !== null || screen !== "today") return;
    remindedRef.current = true;
    setSheet("reminder");
  }, [hydrated, todayInfo.iso, syncing, authed, workoutUnlogged, loggedPromptOn, sheet, screen]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    dayIsAuto: !overrideActive,
    clearDayOverride: () => {
      setDayOverride(null);
      setDayOverrideOn("");
    },
    lastSessionDay: latestSession?.day ?? null,
    lastSessionDate: latestSession?.date ?? null,
    daysSinceLast,
    workoutUnlogged,
    confirmLoggedPrompt,
    dismissLoggedPrompt,
    currentDaySub: `${todayInfo.label} - ${lastSessionText}`,
    daySub: latestSession
      ? `After ${latestSession.day.toLowerCase()} on ${latestSession.date}`
      : "No sessions logged yet",
    todayPlan,
    logged,
    submitText,
    msgs,
    typing,
    thinkWord: THINKING[thinkI % THINKING.length],
    thinkKey: thinkI,
    say,
    todayISO: todayInfo.iso,
    applyProposal,
    applyAllProposals,
    dismissProposal,
    activeEx,
    exGroup: history[activeEx]?.group ?? EX[activeEx].group,
    readOutData: ro,
    authed,
    syncing,
    profile,
    saveCoachProfile,
    supabaseEnabled: isSupabaseConfigured,
    signOut: () => void getSupabaseClient().auth.signOut(),
    coachText: coachText[activeEx] ?? COACH[activeEx],
    cv,
    openExercise,
    progressCards,
    imp,
    importReset,
    notionConnected: Boolean(notionConn),
    notionWorkspace: notionConn?.workspace ?? null,
    notionSource: notionConn?.source ?? null,
    notionPages,
    importBusy,
    importError,
    importSummary: importParsed ? summarize(importParsed) : null,
    importFlags: importParsed?.flags ?? [],
    importSaved,
    notionConnect,
    notionListPages,
    notionDisconnect,
    importFromPage,
    importFromText,
    importConfirm,
    raw,
    parsed,
    confirmSave,
  };
}

export type GymLogState = ReturnType<typeof useGymLog>;
