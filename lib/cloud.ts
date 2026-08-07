"use client";

// The replica layer. localStorage stays the source of truth the app reads
// from — every getBest/getSignals call is still synchronous — and this file
// mirrors those writes to Postgres in the background, then merges the
// account's copy back in when you sign in on another device.
//
// Nothing here is on a critical path. If Supabase is unconfigured, offline,
// or erroring, every function degrades to a no-op and the game plays exactly
// as it does today.

import { browserClient } from "@/lib/supabase/client";
import { cloudConfigured } from "@/lib/supabase/config";
import { adoptMemories, allMemories, onMemoriesChange, type Memory } from "@/lib/memories";
import {
  adoptJson,
  allBests,
  allSignals,
  likedSlugs,
  loadCustomSpecs,
  loadJson,
  mergeBests,
  mergeCustomSpecs,
  mergeLikes,
  mergeSignals,
  onStorageChange,
  type CustomGameSpec,
  type GameSignals,
} from "@/lib/storage";

export interface SyncState {
  /** null until sign-in; the account the replica belongs to */
  playerId: string | null;
  status: "off" | "idle" | "syncing" | "error";
  lastSyncedAt: number | null;
}

let state: SyncState = {
  playerId: null,
  status: cloudConfigured ? "idle" : "off",
  lastSyncedAt: null,
};

const watchers = new Set<(s: SyncState) => void>();

export function syncState(): SyncState {
  return state;
}

export function onSyncState(fn: (s: SyncState) => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const fn of watchers) fn(state);
}

// ---------------------------------------------------------------------------
// pull — the account's copy comes down and merges into local
// ---------------------------------------------------------------------------

interface PrefsRow {
  memories: Memory[] | null;
  likes: string[] | null;
  custom_games: CustomGameSpec[] | null;
  theme: Record<string, unknown> | null;
}

interface SignalRow {
  game_slug: string;
  dwell_ms: number;
  runs: number;
  fast_swipes: number;
  replays: number;
}

interface BestRow {
  game_slug: string;
  score: number;
}

/**
 * Pulled prefs are already on disk, but the stores were hydrated before they
 * arrived — this re-reads them so the theme and the tuner show the account's
 * settings without a reload. Imported lazily to keep the store graph acyclic.
 */
async function republish() {
  const [{ useThemeStore }, { useAlgorithmStore }] = await Promise.all([
    import("@/store/useThemeStore"),
    import("@/store/useAlgorithmStore"),
  ]);
  useThemeStore.getState().hydrate();
  useAlgorithmStore.getState().hydrate();
  const { useFeedStore } = await import("@/store/useFeedStore");
  useFeedStore.getState().retune();
}

async function pull(playerId: string) {
  const supabase = browserClient();
  if (!supabase) return;

  const [prefs, signals, scores] = await Promise.all([
    supabase
      .from("player_prefs")
      .select("memories, likes, custom_games, theme")
      .eq("player_id", playerId)
      .maybeSingle(),
    supabase
      .from("player_signals")
      .select("game_slug, dwell_ms, runs, fast_swipes, replays")
      .eq("player_id", playerId),
    supabase
      .from("scores")
      .select("game_slug, score")
      .eq("player_id", playerId)
      .order("score", { ascending: false }),
  ]);

  const row = prefs.data as PrefsRow | null;
  if (row) {
    if (row.memories?.length) adoptMemories(row.memories);
    if (row.likes?.length) mergeLikes(row.likes);
    if (row.custom_games?.length) mergeCustomSpecs(row.custom_games);
    if (row.theme && Object.keys(row.theme).length) adoptJson("theme", row.theme);
    await republish();
  }

  const signalRows = (signals.data ?? []) as SignalRow[];
  if (signalRows.length) {
    mergeSignals(
      Object.fromEntries(
        signalRows.map((s): [string, GameSignals] => [
          s.game_slug,
          {
            dwellMs: Number(s.dwell_ms) || 0,
            runs: s.runs ?? 0,
            fastSwipes: s.fast_swipes ?? 0,
            replays: s.replays ?? 0,
          },
        ])
      )
    );
  }

  // ordered desc, so the first row per slug is that game's best
  const bests: Record<string, number> = {};
  for (const s of (scores.data ?? []) as BestRow[]) {
    if (bests[s.game_slug] === undefined) bests[s.game_slug] = s.score;
  }
  if (Object.keys(bests).length) mergeBests(bests);
}

// ---------------------------------------------------------------------------
// push — local writes mirror up, debounced
// ---------------------------------------------------------------------------

const dirty = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;

async function pushNow() {
  const supabase = browserClient();
  const playerId = state.playerId;
  if (!supabase || !playerId || dirty.size === 0) return;

  const slices = new Set(dirty);
  dirty.clear();
  setState({ status: "syncing" });

  try {
    const jobs: PromiseLike<unknown>[] = [];

    if (slices.has("prefs") || slices.has("likes") || slices.has("custom")) {
      jobs.push(
        supabase.from("player_prefs").upsert(
          {
            player_id: playerId,
            memories: allMemories(),
            likes: [...likedSlugs()],
            custom_games: loadCustomSpecs(),
            theme: loadJson("theme", {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "player_id" }
        )
      );
    }

    if (slices.has("signals")) {
      const rows = Object.entries(allSignals()).map(([slug, s]) => ({
        player_id: playerId,
        game_slug: slug,
        dwell_ms: s.dwellMs,
        runs: s.runs,
        fast_swipes: s.fastSwipes,
        replays: s.replays,
        updated_at: new Date().toISOString(),
      }));
      if (rows.length)
        jobs.push(
          supabase
            .from("player_signals")
            .upsert(rows, { onConflict: "player_id,game_slug" })
        );
    }

    await Promise.all(jobs);
    setState({ status: "idle", lastSyncedAt: Date.now() });
  } catch {
    // Put the work back so the next trigger retries it.
    for (const s of slices) dirty.add(s);
    setState({ status: "error" });
  }
}

function schedulePush(slice: string) {
  if (!state.playerId) return;
  dirty.add(slice);
  if (pushTimer) clearTimeout(pushTimer);
  // Long enough that dragging a slider is one write, short enough that
  // closing the tab a second later still lands.
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushNow();
  }, 1500);
}

/** Flushes pending work immediately — used when the page is going away. */
export function flushSync() {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  void pushNow();
}

// ---------------------------------------------------------------------------
// attach / detach
// ---------------------------------------------------------------------------

let unsubscribers: Array<() => void> = [];

/**
 * Binds the replica to a signed-in account: pulls their copy down, imports a
 * guest's local bests once, then mirrors every later write.
 */
export async function attach(playerId: string) {
  if (state.playerId === playerId) return;
  setState({ playerId, status: "syncing" });

  try {
    await importGuestSaves();
    await pull(playerId);
    setState({ status: "idle", lastSyncedAt: Date.now() });
  } catch {
    setState({ status: "error" });
  }

  detachListeners();
  unsubscribers = [
    onStorageChange((slice) => schedulePush(slice)),
    onMemoriesChange(() => schedulePush("prefs")),
  ];

  if (typeof document !== "undefined") {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushSync();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushSync);
    unsubscribers.push(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushSync);
    });
  }

  // Everything local at sign-in time is worth mirroring once.
  schedulePush("prefs");
  schedulePush("signals");
}

function detachListeners() {
  for (const off of unsubscribers) off();
  unsubscribers = [];
}

export function detach() {
  detachListeners();
  dirty.clear();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  pending = null;
  setState({
    playerId: null,
    status: cloudConfigured ? "idle" : "off",
    lastSyncedAt: null,
  });
}

/**
 * One-time upload of the bests a player earned before they had an account.
 * The server records them unverified, so they hold your personal best across
 * devices without ever ranking on a public board — nobody can mint a #1 by
 * editing localStorage and then signing in.
 */
async function importGuestSaves() {
  const bests = allBests();
  if (Object.keys(bests).length === 0) return;
  await fetch("/api/runs/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bests }),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// scores — opened as a ticket, redeemed once, validated server-side
// ---------------------------------------------------------------------------

interface PendingRun {
  runId: string;
  nonce: string;
  slug: string;
}

let pending: PendingRun | null = null;

/**
 * Opens a run ticket for the game the player just took control of. The score
 * they eventually post is only accepted against this ticket, and only if it
 * is reachable in the time the server itself measures.
 */
export async function openRun(slug: string) {
  if (!state.playerId) return;
  try {
    const res = await fetch("/api/runs/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as PendingRun;
    pending = { ...data, slug };
  } catch {
    pending = null;
  }
}

/** Redeems the open ticket, then opens the next one for a replay. */
export async function recordRun(slug: string, score: number) {
  if (!state.playerId) return;
  const ticket = pending;
  pending = null;
  if (!ticket || ticket.slug !== slug) {
    // No open ticket (signed in mid-run, or the open call failed). The score
    // is already saved locally; it simply doesn't reach the shared board.
    void openRun(slug);
    return;
  }
  try {
    await fetch("/api/runs/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: ticket.runId, nonce: ticket.nonce, score }),
    });
  } catch {
    // dropped; the local best still stands
  }
  void openRun(slug);
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export interface CloudBoardRow {
  handle: string;
  avatarUrl: string | null;
  score: number;
  rank: number;
  you: boolean;
}

export interface CloudStanding {
  best: number;
  rank: number;
  total: number;
}

/** Top N for a game, or null when there is no backend / the read fails. */
export async function fetchLeaderboard(
  slug: string,
  limit = 10
): Promise<CloudBoardRow[] | null> {
  const supabase = browserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("leaderboard", {
    p_slug: slug,
    p_limit: limit,
  });
  if (error || !data) return null;
  return (
    data as Array<{
      player_id: string;
      handle: string;
      avatar_url: string | null;
      score: number;
      rank: number;
    }>
  ).map((r) => ({
    handle: r.handle,
    avatarUrl: r.avatar_url,
    score: r.score,
    rank: Number(r.rank),
    you: r.player_id === state.playerId,
  }));
}

/** The signed-in player's own best and rank for a game. */
export async function fetchStanding(slug: string): Promise<CloudStanding | null> {
  const supabase = browserClient();
  if (!supabase || !state.playerId) return null;
  const { data, error } = await supabase.rpc("my_standing", { p_slug: slug });
  const row = (data as CloudStanding[] | null)?.[0];
  if (error || !row) return null;
  return { best: row.best, rank: Number(row.rank), total: Number(row.total) };
}

// ---------------------------------------------------------------------------
// seasons — the month-long contest the giveaway is drawn from
// ---------------------------------------------------------------------------

export interface Season {
  slug: string;
  title: string;
  prize: string | null;
  startsAt: number;
  endsAt: number;
}

export interface SeasonRankRow {
  handle: string;
  avatarUrl: string | null;
  points: number;
  gamesPlayed: number;
  rank: number;
  you: boolean;
}

export interface SeasonStanding {
  points: number;
  /** 0 means no ranked run this season yet — not last place. */
  rank: number;
  gamesPlayed: number;
  total: number;
}

/** The live season, or null when there is no contest running. */
export async function fetchSeason(): Promise<Season | null> {
  const supabase = browserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("current_season", {
    p_season: null,
  });
  const row = (
    data as Array<{
      slug: string;
      title: string;
      prize: string | null;
      starts_at: string;
      ends_at: string;
    }> | null
  )?.[0];
  if (error || !row) return null;
  return {
    slug: row.slug,
    title: row.title,
    prize: row.prize,
    startsAt: Date.parse(row.starts_at),
    endsAt: Date.parse(row.ends_at),
  };
}

/** One game's board, this season only. */
export async function fetchSeasonLeaderboard(
  slug: string,
  limit = 10
): Promise<CloudBoardRow[] | null> {
  const supabase = browserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("season_leaderboard", {
    p_slug: slug,
    p_season: null,
    p_limit: limit,
  });
  if (error || !data) return null;
  return (
    data as Array<{
      player_id: string;
      handle: string;
      avatar_url: string | null;
      score: number;
      rank: number;
    }>
  ).map((r) => ({
    handle: r.handle,
    avatarUrl: r.avatar_url,
    score: r.score,
    rank: Number(r.rank),
    you: r.player_id === state.playerId,
  }));
}

/** The contest board: points across every game, not one game's scores. */
export async function fetchSeasonOverall(
  limit = 25
): Promise<SeasonRankRow[] | null> {
  const supabase = browserClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("season_overall", {
    p_season: null,
    p_limit: limit,
  });
  if (error || !data) return null;
  return (
    data as Array<{
      player_id: string;
      handle: string;
      avatar_url: string | null;
      points: number;
      games_played: number;
      rank: number;
    }>
  ).map((r) => ({
    handle: r.handle,
    avatarUrl: r.avatar_url,
    points: Number(r.points),
    gamesPlayed: Number(r.games_played),
    rank: Number(r.rank),
    you: r.player_id === state.playerId,
  }));
}

/** Where the signed-in player sits in the contest. */
export async function fetchSeasonStanding(): Promise<SeasonStanding | null> {
  const supabase = browserClient();
  if (!supabase || !state.playerId) return null;
  const { data, error } = await supabase.rpc("my_season_standing", {
    p_season: null,
  });
  const row = (
    data as Array<{
      points: number;
      rank: number;
      games_played: number;
      total: number;
    }> | null
  )?.[0];
  if (error || !row) return null;
  return {
    points: Number(row.points),
    rank: Number(row.rank),
    gamesPlayed: Number(row.games_played),
    total: Number(row.total),
  };
}
