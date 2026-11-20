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
  restRemaining,
  sessionMinutes,
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
import { recoveryTokensFromHash } from "@/lib/recovery";
import {
  appendCoachMessage,
  deleteAccount as deleteAccountData,
  clientIdExists,
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
  setInput,
  seedIfEmpty,
  type CoachProfile,
} from "@/lib/db";
import { proposalText, type CoachProposal } from "@/lib/coachActions";
import { isNativeApp } from "@/lib/native";
import {
  LAST_USER_KEY,
  QUEUE_KEY,
  cacheKey,
  dequeue,
  enqueue,
  isNetworkError,
  itemsForUser,
  offlineFallback,
  readCache,
  readQueue,
  type QueueItem,
} from "@/lib/offline";
import {
  cancelReminder,
  cancelRestDone,
  requestReminderPermission,
  scheduleReminder,
  scheduleRestDone,
  tapHaptic,
} from "@/lib/nativeExtras";
import { requestHealth, saveWorkoutToHealth, setWidgetData } from "@/lib/nativeBridge";
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
const WORKOUT_KEY = "gymlog.workout";
const HEALTH_KEY = "gymlog.health";
/** Every key this app writes to localStorage; cleared when the account is deleted. */
const LOCAL_KEYS = [STORAGE_KEY, NOTION_TOKEN_KEY, CONSENT_KEY, REMINDERS_KEY, WORKOUT_KEY, HEALTH_KEY, QUEUE_KEY, LAST_USER_KEY];

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function loadQueue(): QueueItem[] {
  try {
    return readQueue(window.localStorage.getItem(QUEUE_KEY));
  } catch {
    return [];
  }
}

function storeQueue(queue: QueueItem[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage unavailable: the write stays only in memory */
  }
}

/** Removes every per-user offline history copy kept on this device. */
function clearHistoryCaches(): void {
  try {
    const prefix = cacheKey("");
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable */
  }
}

function newQueueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newQueueId();
}

/** Keeps a write for later. Native app only, and only with a known user; returns the new queue length or null. */
function queueWrite(userId: string | null, item: Pick<QueueItem, "kind" | "payload">): number | null {
  if (!userId || !isNativeApp()) return null;
  const next = enqueue(loadQueue(), { id: newQueueId(), userId, clientId: newClientId(), ...item } as QueueItem);
  storeQueue(next);
  return next.length;
}

/** How many queued writes belong to this user (others' stay hidden until they sign in). */
function pendingFor(userId: string | null): number {
  return userId ? itemsForUser(loadQueue(), userId).length : 0;
}

function readLastUser(): string | null {
  try {
    return window.localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

let flushing = false;

/**
 * Replays queued writes in order. Each is removed on success; the first network
 * failure stops the run (signal is still gone); any other error drops the item
 * so one bad write cannot block the rest. Returns how many were written.
 */
async function replayQueue(userId: string): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let written = 0;
  try {
    // Only this user's writes; anyone else's stay queued for their next sign-in.
    for (const item of itemsForUser(loadQueue(), userId)) {
      try {
        // A replay whose first attempt already landed (response lost) is done.
        if (!(await clientIdExists(item.kind, userId, item.clientId))) {
          if (item.kind === "set") await logSets(item.payload, item.clientId);
          else await logCardio(item.payload, item.clientId);
          written++;
        }
      } catch (err) {
        if (isNetworkError(err, isOnline())) break;
        console.error("Dropping a queued write the server rejected", err);
      }
      storeQueue(dequeue(loadQueue(), item.id));
    }
  } finally {
    flushing = false;
  }
  return written;
}

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
  // Native-only: write workouts and cardio to Apple Health. Off until turned on.
  const [health, setHealthOn] = useState(false);
  // Computed after mount (see the hydration effect) so server and first client render match.
  const [nativeApp, setNativeApp] = useState(false);
  const [history, setHistory] = useState<Record<string, ExerciseData>>(EX);
  const [syncing, setSyncing] = useState(false);
  // True once a signed-in sync has pulled the account's real history. The
  // reminder waits for it so it never judges the seed data.
  const [syncedOnce, setSyncedOnce] = useState(false);
  // The running workout clock: when it started, and the day it belongs to.
  const [workout, setWorkout] = useState<{ startedAt: number; day: string } | null>(null);
  // Rest ends at an absolute timestamp, so it keeps counting through a locked
  // screen (not persisted). `nowMs` is the display clock, ticked below only
  // while a workout or a rest is active.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [cardio, setCardio] = useState<CardioEntry[]>([]);
  // Writes saved on this device that have not reached the server yet.
  const [pendingCount, setPendingCount] = useState(0);
  // Native only: running from the cached copy because the token expired with no signal.
  const [offlineMode, setOfflineMode] = useState(false);
  const offlineRef = useRef(false);
  // The signed-in (or offline-fallback) user, for tagging queued writes.
  const userIdRef = useRef<string | null>(null);

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
    try {
      setHealthOn(window.localStorage.getItem(HEALTH_KEY) === "on");
    } catch {
      /* storage unavailable — health stays off */
    }
    // The workout clock only resumes on the day it started.
    try {
      const w = JSON.parse(window.localStorage.getItem(WORKOUT_KEY) ?? "null") as {
        startedAt?: unknown;
        day?: unknown;
      } | null;
      if (w && typeof w.startedAt === "number" && typeof w.day === "string" && w.day === localISODate()) {
        setWorkout({ startedAt: w.startedAt, day: w.day });
        setNowMs(Date.now());
      }
    } catch {
      /* storage unavailable or unreadable — no clock to resume */
    }
    setNativeApp(isNativeApp());
    try {
      const last = JSON.parse(readLastUser() ?? "null") as { id?: unknown } | null;
      setPendingCount(pendingFor(last && typeof last.id === "string" ? last.id : null));
    } catch {
      /* unreadable last user: the count fills in after sign-in */
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Watches the auth session and pulls the user's history once signed in.
  // Seeding is a no-op on an account that already has data.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseClient();

    const setOffline = (on: boolean) => {
      offlineRef.current = on;
      setOfflineMode(on);
    };

    // Expired token, no signal, native app: stay signed in on the cached copy.
    const enterOffline = (id: string) => {
      userIdRef.current = id;
      setOffline(true);
      setAuthed(true);
      setSyncing(false);
      try {
        const cached = readCache(window.localStorage.getItem(cacheKey(id)));
        if (cached) {
          setHistory(cached.history);
          setCardio(cached.cardio);
          setSyncedOnce(true);
        }
      } catch {
        /* unreadable cache: stay on seed data */
      }
      setPendingCount(pendingFor(userIdRef.current));
    };

    const fallbackFor = (hasSession: boolean): string | null =>
      offlineFallback({ hasSession, online: isOnline(), native: isNativeApp(), lastUserRaw: readLastUser() });

    const sync = async (signedIn: boolean) => {
      setOffline(false);
      setAuthed(signedIn);
      if (!signedIn) {
        userIdRef.current = null;
        setHistory(EX);
        setCardio([]);
        setSyncedOnce(false);
        return;
      }
      setSyncing(true);
      let userId: string | null = null;
      try {
        userId = (await supabase.auth.getSession()).data.session?.user.id ?? null;
      } catch {
        /* no session readable: no cache either */
      }
      userIdRef.current = userId;
      // An OAuth Notion connection lives on the account; it wins over any
      // manually pasted token on this device.
      void fetchOauthConnection().then((conn) => {
        if (conn) setNotionConn(conn);
      });
      try {
        await seedIfEmpty();
        if (userId) await replayQueue(userId);
        setPendingCount(pendingFor(userIdRef.current));
        const h = await loadHistory();
        setHistory(h);
        let freshCardio: CardioEntry[] | null = null;
        try {
          freshCardio = await loadCardio();
          setCardio(freshCardio);
        } catch (err) {
          console.error("Cardio load failed", err);
        }
        // Keep the last good copy for offline launches.
        if (userId && isNativeApp()) {
          try {
            const prev = readCache(window.localStorage.getItem(cacheKey(userId)));
            window.localStorage.setItem(
              cacheKey(userId),
              JSON.stringify({ history: h, cardio: freshCardio ?? prev?.cardio ?? [], savedAt: Date.now() })
            );
          } catch {
            /* storage full or unavailable: an offline launch just starts from seed data */
          }
        }

        if (userId && isNativeApp()) {
          try {
            window.localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: userId }));
          } catch {
            /* storage unavailable: an expired-token offline launch will show sign-in */
          }
        }

        // The coach's memory: reopen the saved conversation and profile.
        const [stored, prof] = await Promise.all([loadChatMessages(), loadProfile()]);
        if (stored.length) setMsgs(stored.map((m) => ({ id: msgIdRef.current++, who: m.who, text: m.text })));
        setProfile(prof);
        setSyncedOnce(true);

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
        // Leave the seeded history in place so the app stays usable, unless
        // there is no signal and this device kept the last synced copy.
        console.error("Supabase sync failed", err);
        if (userId && isNativeApp() && isNetworkError(err, isOnline())) {
          try {
            const cached = readCache(window.localStorage.getItem(cacheKey(userId)));
            if (cached) {
              setHistory(cached.history);
              setCardio(cached.cardio);
              setSyncedOnce(true);
            }
          } catch {
            /* unreadable cache: stay on seed data */
          }
        }
      } finally {
        setSyncing(false);
      }
    };

    // A reset link opened in this browser: take its session, drop the tokens
    // from the address bar, then ask for the new password.
    const recovery = recoveryTokensFromHash(window.location.hash);
    if (recovery) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      supabase.auth
        .setSession(recovery)
        .then(({ error }: { error: unknown }) => {
          if (!error) setRecovering(true);
        })
        .catch(() => {});
    }

    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        const id = fallbackFor(Boolean(data.session));
        if (id) enterOffline(id);
        else void sync(Boolean(data.session));
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      // A password-reset link signs the lifter in, then asks them to set a new password.
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      // A deliberate sign-out never falls back to the cached user.
      const id = event === "SIGNED_OUT" ? null : fallbackFor(Boolean(session));
      if (id) enterOffline(id);
      else void sync(Boolean(session));
    });
    // Signal is back: send what was saved offline, then refresh history.
    const onOnline = () => {
      void (async () => {
        if (offlineRef.current) {
          // Back online after running on the cache: a real session means a normal
          // sync (which also flushes the queue); none means sign in again.
          try {
            const { data } = await supabase.auth.getSession();
            await sync(Boolean(data.session));
          } catch (err) {
            console.error("Re-check after reconnect failed", err);
          }
          return;
        }
        if (loadQueue().length === 0) return;
        try {
          const { data } = await supabase.auth.getSession();
          if (!data.session) return;
          if ((await replayQueue(data.session.user.id)) > 0) {
            setHistory(await loadHistory());
            void loadCardio().then(setCardio).catch(() => {});
          }
        } catch (err) {
          console.error("Sync after reconnect failed", err);
        }
        setPendingCount(pendingFor(userIdRef.current));
      })();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      sub.subscription.unsubscribe();
    };
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

  // The workout clock is kept across reloads; the day check happens on load.
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (workout) window.localStorage.setItem(WORKOUT_KEY, JSON.stringify(workout));
      else window.localStorage.removeItem(WORKOUT_KEY);
    } catch {
      /* storage unavailable — the clock just won't survive a reload */
    }
  }, [hydrated, workout]);

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
      const date = localISODate();
      void (async () => {
        try {
          await saveSet(parsed, date);
          setHistory(await loadHistory());
        } catch (err) {
          console.error("Failed to save set", err);
          // No signal: keep it, with the day it was logged, and send it later.
          if (isNetworkError(err, isOnline())) {
            const n = queueWrite(userIdRef.current, { kind: "set", payload: setInput(parsed, date) });
            if (n !== null) setPendingCount(pendingFor(userIdRef.current));
          }
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
    setHealthOn(false);
    await cancelReminder();
    void setWidgetData("", null);
    clearHistoryCaches();
    await getSupabaseClient().auth.signOut({ scope: "local" });
    // Start clean: the deleted account's sets, chat and profile are still in
    // memory, and the persist effect may already have written some back.
    for (const key of LOCAL_KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    }
    window.location.reload();
  }, []);

  // Plain sign-out: forget this device's copy of the account (history cache,
  // last user, workout clock, widget) but keep queued writes. They belong to
  // that user and replay on their next sign-in.
  const signOut = useCallback(async () => {
    clearHistoryCaches();
    try {
      window.localStorage.removeItem(LAST_USER_KEY);
      window.localStorage.removeItem(WORKOUT_KEY);
    } catch {
      /* storage unavailable */
    }
    setWorkout(null);
    void setWidgetData("", null);
    await getSupabaseClient().auth.signOut();
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

  // Turning Health on asks for write permission first; a refusal leaves it off.
  const setHealth = useCallback(async (on: boolean) => {
    const next = on ? await requestHealth() : false;
    setHealthOn(next);
    try {
      window.localStorage.setItem(HEALTH_KEY, next ? "on" : "off");
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

  // Offline shell: native app only. The website never registers a worker.
  useEffect(() => {
    if (!nativeApp || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("Service worker failed", err));
  }, [nativeApp]);

  // Keeps the one pending reminder pointed at the next due moment. Re-runs when
  // the last training date moves (a logged session) or the rotation day changes.
  // Waits while a sync is running and until the first real sync has finished,
  // so it never schedules from the seed data.
  useEffect(() => {
    if (!reminders || !nativeApp || syncing || !syncedOnce) return;
    const at = nextReminderAt(lastTrainingISO, new Date());
    if (at) void scheduleReminder(at, dayTitle);
  }, [reminders, nativeApp, syncing, syncedOnce, lastTrainingISO, dayTitle]);

  // Home-screen widget: the rotation day and the last training date (the widget
  // works out "days since" itself). Written after the first real sync, and again
  // whenever either value moves (i.e. after a save).
  useEffect(() => {
    if (!nativeApp || !syncedOnce) return;
    void setWidgetData(dayTitle, lastTrainingISO);
  }, [nativeApp, syncedOnce, dayTitle, lastTrainingISO]);

  // ── workout clock + rest timer ────────────────────────────────────────
  const startWorkout = useCallback(() => {
    const t = Date.now();
    setWorkout({ startedAt: t, day: localISODate(new Date(t)) });
    setNowMs(t);
  }, []);

  const cancelRest = useCallback(() => {
    setRestEndsAt(null);
    void cancelRestDone();
  }, []);

  // Finishing the workout also ends any rest still running. A strength session
  // goes to Health only when the clock was running and something was logged.
  const endWorkout = useCallback(() => {
    // Strength only: cardio rows in `logged` go to Health as their own workouts.
    if (health && nativeApp && workout && logged.some((row) => row.name !== "Cardio")) {
      const end = Date.now();
      if (sessionMinutes(workout.startedAt, end) !== null) {
        void saveWorkoutToHealth({ kind: "strength", start: workout.startedAt, end });
      }
    }
    setWorkout(null);
    cancelRest();
  }, [cancelRest, health, nativeApp, workout, logged]);

  const startRest = useCallback((seconds: number) => {
    const t = Date.now();
    const end = t + seconds * 1000;
    setNowMs(t);
    setRestEndsAt(end);
    void scheduleRestDone(new Date(end));
  }, []);

  useEffect(() => {
    if (!workout && restEndsAt === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNowMs(t);
      if (restEndsAt !== null && restRemaining(restEndsAt, t) === 0) {
        setRestEndsAt(null);
        void tapHaptic();
      }
      // A workout that crosses midnight belongs to the day it started; it ends there.
      if (workout && localISODate(new Date(t)) !== workout.day) setWorkout(null);
    }, 1000);
    return () => clearInterval(id);
  }, [workout, restEndsAt]);

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
              const entry = { date: p.date, kind: p.kind, minutes: p.minutes, distanceKm: p.distanceKm, note: p.note };
              try {
                await logCardio(entry);
                setCardio(await loadCardio());
              } catch (err) {
                if (!isNetworkError(err, isOnline())) throw err;
                const n = queueWrite(userIdRef.current, { kind: "cardio", payload: entry });
                if (n === null) throw err;
                setPendingCount(pendingFor(userIdRef.current));
              }
              // Health gets the entry as a workout that ended now and ran for its minutes.
              if (health && nativeApp && p.minutes !== null && p.date === today) {
                const end = Date.now();
                void saveWorkoutToHealth({
                  kind: "cardio",
                  start: end - p.minutes * 60_000,
                  end,
                  distanceKm: p.distanceKm ?? undefined,
                  cardioKind: p.kind.toLowerCase(),
                });
              }
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
    [msgs, authed, units, todayInfo.iso, pickDay, setProposalStatus, health, nativeApp]
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
    pendingCount,
    offlineMode,
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
    health,
    setHealth,
    nativeApp,
    syncing,
    workoutStartedAt: workout?.startedAt ?? null,
    startWorkout,
    endWorkout,
    restEndsAt,
    startRest,
    cancelRest,
    nowMs,
    profile,
    saveCoachProfile,
    supabaseEnabled: isSupabaseConfigured,
    signOut: () => void signOut(),
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
