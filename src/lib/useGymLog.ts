"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COACH,
  EX,
  PROGRESS_EXERCISES,
  ROT,
  THINKING,
  Units,
  entryE1rm,
  findLatestSession,
  getTodayInfo,
  loadSummary,
  localISODate,
  parseLog,
  planForDay,
  readOut,
  resolveDay,
  unnotedGaps,
  cardioSummary,
  daysSinceTraining,
  isoDaysAgo,
  nextReminderAt,
  formatHistDate,
  readAiConsent,
  type AiConsent,
  type CardioEntry,
  round1,
  toDisplayWeight,
  type ExerciseData,
  type TodayInfo,
} from "@/lib/gymlog";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, getSupabaseClient } from "@/lib/supabase";
import {
  appendCoachMessage,
  deleteAccount as deleteAccountData,
  correctSets,
  importHistory,
  loadCardio,
  loadChatMessages,
  loadHistory,
  loadProfile,
  logCardio,
  logSets,
  removeSets,
  saveProfile,
  saveSet,
  seedIfEmpty,
  type CoachProfile,
} from "@/lib/db";
import { proposalText, type CoachProposal } from "@/lib/coachActions";
import { isNativeApp } from "@/lib/native";
import {
  cancelReminder,
  requestReminderPermission,
  scheduleReminder,
  tapHaptic,
} from "@/lib/nativeExtras";
import {
  TOKEN_KEY as NOTION_TOKEN_KEY,
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
  /** `${day}:${iso}` of the last "you didn't note…" reminder the lifter dismissed. */
  gapsDismissed: string;
}

const STORAGE_KEY = "gymlog:v1";
const CONSENT_KEY = "gymlog.aiConsent";
const REMINDERS_KEY = "gymlog.reminders";
/** Every key this app writes to localStorage; cleared when the account is deleted. */
const LOCAL_KEYS = [STORAGE_KEY, NOTION_TOKEN_KEY, CONSENT_KEY, REMINDERS_KEY];

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
  const [gapsDismissed, setGapsDismissed] = useState("");
  const [todayInfo, setTodayInfo] = useState<TodayInfo>(DEFAULT_TODAY);
  const [hydrated, setHydrated] = useState(false);
  // Guards the reminder so it opens at most once per mount, and never on top
  // of a sheet the user opened themselves.
  const remindedRef = useRef(false);

  // When Supabase is configured the app is account-backed: `authed` gates the
  // UI behind sign-in and `history` is the user's real data. Without it both
  // stay at their zero-config defaults and the seeded history is used instead.
  const [authed, setAuthed] = useState<boolean | null>(isSupabaseConfigured ? null : true);
  // Set when the lifter opened a password-reset link: the app shows the
  // set-a-new-password screen until finishRecovery succeeds.
  const [recovering, setRecovering] = useState(false);
  // Native-only: the iOS shell's daily reminder. Off until the lifter turns it on.
  const [reminders, setRemindersOn] = useState(false);
  // Computed after mount (see the hydration effect) so server and first client render match.
  const [nativeApp, setNativeApp] = useState(false);
  const [history, setHistory] = useState<Record<string, ExerciseData>>(EX);
  const [syncing, setSyncing] = useState(false);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [cardio, setCardio] = useState<CardioEntry[]>([]);

  // Progressive enhancement: seed with the fallback copy immediately (so the
  // app matches the prototype offline with zero flicker), then let the real
  // Gemini judgment replace it in the background once /api/coach resolves.
  const [coachText, setCoachText] = useState<Record<string, string>>(() => ({ ...COACH }));
  const fetchedCoach = useRef<Set<string>>(new Set());

  // Whether the lifter allowed Gemini to see their log. `null` = not answered
  // yet. The ref mirrors it for callbacks and the sign-in effect, which run
  // outside render and must not see a stale value.
  const [aiConsent, setAiConsentState] = useState<AiConsent>(null);
  const aiConsentRef = useRef<AiConsent>(null);

  const ensureCoachText = useCallback((name: string) => {
    if (aiConsentRef.current !== "granted") return;
    if (fetchedCoach.current.has(name)) return;
    fetchedCoach.current.add(name);
    fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "exercise", exercise: name, ai: aiConsentRef.current === "granted" }),
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
    if (p.gapsDismissed) setGapsDismissed(p.gapsDismissed);
    const manualToken = loadNotionToken();
    if (manualToken) setNotionConn({ token: manualToken, workspace: null, source: "token" });
    let consent: AiConsent = null;
    try {
      consent = readAiConsent(window.localStorage.getItem(CONSENT_KEY));
    } catch {
      /* storage unavailable — treat as unanswered */
    }
    aiConsentRef.current = consent;
    setAiConsentState(consent);
    try {
      setRemindersOn(window.localStorage.getItem(REMINDERS_KEY) === "on");
    } catch {
      /* storage unavailable — reminders stay off */
    }
    setNativeApp(isNativeApp());
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
        setCardio([]);
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
        void loadCardio()
          .then(setCardio)
          .catch((err) => console.error("Cardio load failed", err));

        // The coach's memory: reopen the saved conversation and profile.
        const [stored, prof] = await Promise.all([loadChatMessages(), loadProfile()]);
        if (stored.length) setMsgs(stored.map((m) => ({ id: msgIdRef.current++, who: m.who, text: m.text })));
        setProfile(prof);

        // Weekly check-in: the coach speaks first when a week has passed.
        // Fire-and-forget so sign-in never waits on Gemini.
        void (async () => {
          // Without consent the coach doesn't speak first; nothing is sent.
          if (aiConsentRef.current !== "granted") return;
          try {
            const now = new Date();
            const latest = findLatestSession(h, now);
            const res = await fetch("/api/coach", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "checkin",
                ai: true,
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
    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      // A password-reset link signs the lifter in, then asks them to set a new password.
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      void sync(Boolean(session));
    });
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
      gapsDismissed,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [hydrated, logged, units, voice, rpeAsk, theme, dayOverride, dayOverrideOn, loggedPromptOn, loggedOn, gapsDismissed]);

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
            ai: aiConsentRef.current === "granted",
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
    void tapHaptic();
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

  // Granting clears the judgment cache so exercise judgments load on next view.
  const setAiConsent = useCallback((v: "granted" | "denied") => {
    aiConsentRef.current = v;
    setAiConsentState(v);
    try {
      window.localStorage.setItem(CONSENT_KEY, v);
    } catch {
      /* storage unavailable — the choice still holds for this visit */
    }
    if (v === "granted") fetchedCoach.current.clear();
  }, []);

  // Deletes the account server-side first; if that fails nothing local is
  // touched, so the lifter can retry. Then this device forgets everything and
  // the session is dropped locally.
  const deleteAccount = useCallback(async () => {
    await deleteAccountData();
    for (const key of LOCAL_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* storage unavailable — nothing to clear */
      }
    }
    aiConsentRef.current = null;
    setAiConsentState(null);
    setNotionConn(null);
    setNotionPages(null);
    setRemindersOn(false);
    await cancelReminder();
    await getSupabaseClient().auth.signOut({ scope: "local" });
  }, []);

  // Sets the new password on the recovery session; the app then carries on as normal.
  const finishRecovery = useCallback(async (password: string) => {
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throw error;
    setRecovering(false);
  }, []);

  // Turning reminders on asks for permission first; a refusal leaves them off.
  const setReminders = useCallback(async (on: boolean) => {
    const next = on ? await requestReminderPermission() : false;
    if (!next) await cancelReminder();
    setRemindersOn(next);
    try {
      window.localStorage.setItem(REMINDERS_KEY, next ? "on" : "off");
    } catch {
      /* storage unavailable — the choice still holds for this visit */
    }
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
  // Cardio counts as training here (and only here — it never moves the rotation).
  const daysSinceLast = daysSinceTraining(resolved.daysSinceLast, cardio, todayInfo.iso || localISODate());
  const workoutUnlogged = daysSinceLast === null || daysSinceLast >= 1;

  const dayTitle = `${currentNextDay} day`;
  // The calendar date of the last training, reconstructed from how long ago it was.
  const lastTrainingISO = daysSinceLast === null || !todayInfo.iso ? null : isoDaysAgo(todayInfo.iso, daysSinceLast);

  // Keeps the one pending reminder pointed at the next due moment. Re-runs when
  // the last training date moves (a logged session) or the rotation day changes.
  useEffect(() => {
    if (!reminders || !nativeApp) return;
    const at = nextReminderAt(lastTrainingISO, new Date());
    if (at) void scheduleReminder(at, dayTitle);
  }, [reminders, nativeApp, lastTrainingISO, dayTitle]);

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
            } else if (p.type === "log_cardio") {
              await logCardio({ date: p.date, kind: p.kind, minutes: p.minutes, distanceKm: p.distanceKm, note: p.note });
              setCardio(await loadCardio());
              if (p.date === today) {
                setLogged((l) => l.concat({ name: "Cardio", summary: cardioSummary(p) }));
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
          void tapHaptic();
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
      est: (() => {
        const e = entryE1rm(last);
        return e === null ? "not noted" : `${round1(cv(e))} ${units}`;
      })(),
      open: () => openExercise(name, "today"),
    };
  });

  // What wasn't noted last time this day came round. Shown on Today until the
  // lifter dismisses it; the key ties the dismissal to that one session, so
  // the next gappy session of this day reminds again.
  const gapSource = todayInfo.iso ? unnotedGaps(currentNextDay, history, todayInfo.iso) : null;
  const gapKey = gapSource ? `${currentNextDay}:${gapSource.iso}` : "";
  const gaps =
    gapSource && gapKey !== gapsDismissed
      ? {
          day: currentNextDay,
          date: gapSource.date,
          items: gapSource.items.map((g) => ({ exercise: g.exercise, missing: g.missing.join(" and ") })),
        }
      : null;
  const dismissGaps = useCallback(() => setGapsDismissed(gapKey), [gapKey]);

  const progressCards = PROGRESS_EXERCISES.filter((name) => history[name]?.hist.length).map((name) => {
    const r = readOut(name, history);
    return {
      name,
      status: r.status,
      spark: r.spark(26),
      coach: coachText[name] ?? COACH[name],
      delta: `${r.pct >= 0 ? "+" : ""}${round1(r.pct)}%`,
      computed: `est 1RM ${r.e1rm === null ? "not noted" : `${round1(r.e1rm)} ${units}`} · RPE ${
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
    dayTitle,
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
    recentCardio: cardio.slice(0, 5).map((e, i) => ({ key: `${e.date}-${i}`, date: formatHistDate(e.date), summary: cardioSummary(e) })),
    gaps,
    dismissGaps,
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
    recovering,
    finishRecovery,
    reminders,
    setReminders,
    nativeApp,
    syncing,
    profile,
    saveCoachProfile,
    supabaseEnabled: isSupabaseConfigured,
    signOut: () => void getSupabaseClient().auth.signOut(),
    deleteAccount,
    aiConsent,
    setAiConsent,
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
