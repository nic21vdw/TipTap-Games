// The algorithm's visible memory. Every reason the feed serves you what it
// serves you is a row here — created by a search phrase, a like, or your
// behaviour — and every row can be muted, weighted, or deleted by the player.

import {
  DEFAULT_VECTOR,
  type AlgorithmVector,
} from "@/lib/algorithm";
import type { GameTag } from "@/games/types";

export type MemorySource = "query" | "like" | "behavior";
export type MemoryAxis =
  | "intensity"
  | "speed"
  | "difficulty"
  | "luck"
  | "nostalgia"
  | "realism"
  | "variety";

export interface Memory {
  id: string;
  label: string; // plain language, shown to the player
  source: MemorySource;
  createdAt: number;
  enabled: boolean;
  weight: number; // 0..1, how hard it pulls
  axis?: MemoryAxis;
  to?: number; // target value for that axis
  tag?: GameTag;
  mode?: "only" | "block";
  kid?: boolean;
  slug?: string; // per-game affinity (likes)
  boost?: number; // signed score bump for that slug
}

const KEY = "ttg:memories";

function safeGet(): Memory[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Memory[]) : [];
  } catch {
    return [];
  }
}

function safeSet(list: Memory[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // private mode — memories are in-session only
  }
}

let cache: Memory[] | null = null;

export function allMemories(): Memory[] {
  if (cache === null) cache = typeof window === "undefined" ? [] : safeGet();
  return cache;
}

function commit(list: Memory[]) {
  cache = list;
  safeSet(list);
}

function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Adds a memory, replacing any existing one that governs the same thing
 * (same axis, same tag, or same game) so the list stays readable.
 */
export function addMemory(m: Omit<Memory, "id" | "createdAt" | "enabled" | "weight"> & {
  weight?: number;
}): Memory {
  const list = allMemories().filter((x) => {
    if (m.axis && x.axis === m.axis) return false;
    if (m.tag && x.tag === m.tag) return false;
    if (m.slug && x.slug === m.slug) return false;
    if (m.kid !== undefined && x.kid !== undefined) return false;
    return true;
  });
  const mem: Memory = {
    ...m,
    weight: m.weight ?? 1,
    id: newId(),
    createdAt: Date.now(),
    enabled: true,
  };
  commit([mem, ...list]);
  return mem;
}

export function removeMemory(id: string) {
  commit(allMemories().filter((m) => m.id !== id));
}

export function toggleMemory(id: string) {
  commit(
    allMemories().map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m))
  );
}

export function setMemoryWeight(id: string, weight: number) {
  commit(
    allMemories().map((m) =>
      m.id === id ? { ...m, weight: Math.max(0, Math.min(1, weight)) } : m
    )
  );
}

export function clearMemories() {
  commit([]);
}

/** Folds every enabled memory into the vector the sampler uses. */
export function vectorFromMemories(memories = allMemories()): AlgorithmVector {
  const v: AlgorithmVector = {
    ...DEFAULT_VECTOR,
    onlyTags: [],
    blockTags: [],
  };
  for (const m of memories) {
    if (!m.enabled) continue;
    if (m.axis && m.to !== undefined) {
      // weight blends between the neutral default and the memory's target
      const from = DEFAULT_VECTOR[m.axis];
      v[m.axis] = from + (m.to - from) * m.weight;
    }
    if (m.tag && m.mode === "only" && !v.onlyTags.includes(m.tag))
      v.onlyTags.push(m.tag);
    if (m.tag && m.mode === "block" && !v.blockTags.includes(m.tag))
      v.blockTags.push(m.tag);
    if (m.kid) v.kidFriendly = true;
  }
  return v;
}

/** Per-game score bumps from like/behaviour memories. */
export function slugBoosts(memories = allMemories()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of memories) {
    if (!m.enabled || !m.slug || m.boost === undefined) continue;
    out[m.slug] = (out[m.slug] ?? 0) + m.boost * m.weight;
  }
  return out;
}

/**
 * "You liked Cash Out" also means "you like games that feel like Cash Out" —
 * this expands a like into tag affinities the sampler can generalise from.
 */
export function likeMemoryFor(
  slug: string,
  title: string,
  tags: GameTag[]
): Omit<Memory, "id" | "createdAt" | "enabled" | "weight"> {
  return {
    label: `Liked ${title} — more ${tags.slice(0, 2).join(" + ") || "like this"}`,
    source: "like",
    slug,
    boost: 0.5,
  };
}
