import type { GameMeta, GameTag } from "@/games/types";
import { allSignals } from "@/lib/storage";

export interface AlgorithmVector {
  intensity: number; // 0..1  "Calm <-> Frantic"
  luck: number; // 0..1  "Pure skill <-> Pure chance"
  nostalgia: number; // 0..1  "Modern <-> 2008"
  variety: number; // 0..1  "More of this <-> Surprise me"
  onlyTags: GameTag[];
  blockTags: GameTag[];
}

export const DEFAULT_VECTOR: AlgorithmVector = {
  intensity: 0.5,
  luck: 0.4,
  nostalgia: 0.4,
  variety: 0.6,
  onlyTags: [],
  blockTags: [],
};

export interface Preset {
  id: string;
  name: string;
  vector: AlgorithmVector;
}

export const PRESETS: Preset[] = [
  {
    id: "doomscroll",
    name: "Doomscroll",
    vector: { intensity: 0.9, luck: 0.5, nostalgia: 0.3, variety: 0.95, onlyTags: [], blockTags: [] },
  },
  {
    id: "zen",
    name: "Zen",
    vector: { intensity: 0.1, luck: 0.15, nostalgia: 0.4, variety: 0.3, onlyTags: [], blockTags: ["chaos"] },
  },
  {
    id: "timemachine",
    name: "Time Machine",
    vector: { intensity: 0.5, luck: 0.3, nostalgia: 1.0, variety: 0.4, onlyTags: [], blockTags: [] },
  },
  {
    id: "highroller",
    name: "High Roller",
    vector: { intensity: 0.6, luck: 0.9, nostalgia: 0.2, variety: 0.3, onlyTags: ["casino"], blockTags: [] },
  },
];

// Weights for the distance terms. implicit + recency are additive on top.
const W_INTENSITY = 0.9;
const W_LUCK = 0.7;
const W_NOSTALGIA = 0.8;
const W_IMPLICIT = 1.0;
const W_RECENCY = 0.9;

function implicitBoost(slug: string): number {
  const s = allSignals()[slug];
  if (!s) return 0;
  const boost =
    Math.min(s.dwellMs / 30000, 1) * 0.15 +
    Math.min(s.replays, 5) * 0.05 +
    Math.min(s.runs, 10) * 0.02 -
    Math.min(s.fastSwipes, 5) * 0.12;
  return Math.max(-0.45, Math.min(0.3, boost));
}

function recencyPenalty(slug: string, recentSlugs: string[]): number {
  // most recent = index 0. Seen 1 card ago hurts a lot, 6 ago barely.
  const idx = recentSlugs.indexOf(slug);
  if (idx === -1) return 0;
  return Math.max(0, 0.6 - idx * 0.1);
}

export function scoreGame(
  meta: GameMeta,
  vec: AlgorithmVector,
  recentSlugs: string[]
): number {
  return (
    1 -
    W_INTENSITY * Math.abs(meta.intensity - vec.intensity) -
    W_LUCK * Math.abs(meta.luck - vec.luck) -
    W_NOSTALGIA * Math.abs(meta.nostalgia - vec.nostalgia) +
    W_IMPLICIT * implicitBoost(meta.slug) -
    W_RECENCY * recencyPenalty(meta.slug, recentSlugs)
  );
}

function passesFilters(meta: GameMeta, vec: AlgorithmVector): boolean {
  if (vec.blockTags.some((t) => meta.tags.includes(t))) return false;
  if (vec.onlyTags.length > 0 && !vec.onlyTags.some((t) => meta.tags.includes(t)))
    return false;
  return true;
}

/**
 * Weighted-random sample of the next `count` games — sampling, not a top-N
 * sort, so the feed stays alive instead of looping the same 3 winners.
 * `variety` mixes in an exploration term per draw.
 */
export function sampleQueue(
  catalog: GameMeta[],
  vec: AlgorithmVector,
  recentSlugs: string[],
  count: number
): string[] {
  let pool = catalog.filter((m) => passesFilters(m, vec));
  if (pool.length === 0) pool = [...catalog]; // never dead-end the feed
  const recent = [...recentSlugs];
  const out: string[] = [];

  for (let i = 0; i < count; i++) {
    const weights = pool.map((m) => {
      const base = scoreGame(m, vec, recent);
      const explore = vec.variety * Math.random();
      let w = Math.max(0.02, base + explore);
      if (out.length > 0 && out[out.length - 1] === m.slug) w *= 0.05; // no back-to-back
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    let picked = pool[pool.length - 1];
    for (let j = 0; j < pool.length; j++) {
      roll -= weights[j];
      if (roll <= 0) {
        picked = pool[j];
        break;
      }
    }
    out.push(picked.slug);
    recent.unshift(picked.slug);
    if (recent.length > 8) recent.pop();
  }
  return out;
}
