import type { FullGameMeta, GameTag } from "@/games/types";
import { allSignals } from "@/lib/storage";

export interface AlgorithmVector {
  intensity: number; // calm <-> frantic
  speed: number; // slow//patient <-> fast
  difficulty: number; // forgiving <-> brutal
  luck: number; // pure skill <-> pure chance
  nostalgia: number; // modern <-> retro
  realism: number; // abstract/cartoony <-> realistic/dark
  variety: number; // more of this <-> surprise me
  kidFriendly: boolean; // hard filter: excludes casino/dark games
  onlyTags: GameTag[];
  blockTags: GameTag[];
}

export const DEFAULT_VECTOR: AlgorithmVector = {
  intensity: 0.5,
  speed: 0.5,
  difficulty: 0.5,
  luck: 0.4,
  nostalgia: 0.5,
  realism: 0.5,
  variety: 0.6,
  kidFriendly: false,
  onlyTags: [],
  blockTags: [],
};

/** Example queries, shown as one-tap chips under the search bar. */
export interface Preset {
  id: string;
  name: string;
  query: string;
}

export const PRESETS: Preset[] = [
  { id: "doomscroll", name: "Doomscroll", query: "fast frantic chaos, surprise me every time" },
  { id: "zen", name: "Zen", query: "slow calm easy games, nothing stressful" },
  { id: "timemachine", name: "Time Machine", query: "old school retro classics from the nokia days" },
  { id: "highroller", name: "High Roller", query: "casino only, all luck, big risk" },
  { id: "kids", name: "Kid Mode", query: "kid friendly, no gambling, easy and cute" },
  { id: "sweat", name: "Sweat Mode", query: "brutally hard skill games, no luck at all" },
];

const W_INTENSITY = 0.85;
const W_SPEED = 0.7;
const W_DIFFICULTY = 0.7;
const W_LUCK = 0.7;
const W_NOSTALGIA = 0.8;
const W_REALISM = 0.5;
const W_IMPLICIT = 1.0;
const W_RECENCY = 0.9;

function implicitBoost(slug: string, boosts: Record<string, number>): number {
  const s = allSignals()[slug];
  const liked = boosts[slug] ?? 0;
  if (!s) return Math.max(-0.45, Math.min(0.4, liked));
  const boost =
    liked +
    Math.min(s.dwellMs / 30000, 1) * 0.15 +
    Math.min(s.replays, 5) * 0.05 +
    Math.min(s.runs, 10) * 0.02 -
    Math.min(s.fastSwipes, 5) * 0.12;
  return Math.max(-0.45, Math.min(0.4, boost));
}

function recencyPenalty(slug: string, recentSlugs: string[]): number {
  const idx = recentSlugs.indexOf(slug);
  if (idx === -1) return 0;
  return Math.max(0, 0.6 - idx * 0.1);
}

export function scoreGame(
  meta: FullGameMeta,
  vec: AlgorithmVector,
  recentSlugs: string[],
  boosts: Record<string, number> = {}
): number {
  return (
    1 -
    W_INTENSITY * Math.abs(meta.intensity - vec.intensity) -
    W_SPEED * Math.abs(meta.speed - vec.speed) -
    W_DIFFICULTY * Math.abs(meta.difficulty - vec.difficulty) -
    W_LUCK * Math.abs(meta.luck - vec.luck) -
    W_NOSTALGIA * Math.abs(meta.nostalgia - vec.nostalgia) -
    W_REALISM * Math.abs(meta.realism - vec.realism) +
    W_IMPLICIT * implicitBoost(meta.slug, boosts) -
    W_RECENCY * recencyPenalty(meta.slug, recentSlugs)
  );
}

function passesFilters(meta: FullGameMeta, vec: AlgorithmVector): boolean {
  if (vec.kidFriendly && !meta.kidSafe) return false;
  if (vec.blockTags.some((t) => meta.tags.includes(t))) return false;
  if (vec.onlyTags.length > 0 && !vec.onlyTags.some((t) => meta.tags.includes(t)))
    return false;
  return true;
}

/**
 * Weighted-random sample of the next `count` games. Sampling, not a top-N
 * sort, so the feed never repeats itself into a loop — and it always
 * returns exactly `count` slugs, so the feed can never run dry.
 */
export function sampleQueue(
  catalog: FullGameMeta[],
  vec: AlgorithmVector,
  recentSlugs: string[],
  count: number,
  boosts: Record<string, number> = {}
): string[] {
  let pool = catalog.filter((m) => passesFilters(m, vec));
  // never dead-end the feed: relax tag filters, then kid-safety last
  if (pool.length === 0)
    pool = catalog.filter((m) => !vec.kidFriendly || m.kidSafe);
  if (pool.length === 0) pool = [...catalog];

  const recent = [...recentSlugs];
  const out: string[] = [];

  for (let i = 0; i < count; i++) {
    const weights = pool.map((m) => {
      const base = scoreGame(m, vec, recent, boosts);
      const explore = vec.variety * Math.random();
      let w = Math.max(0.02, base + explore);
      if (out.length > 0 && out[out.length - 1] === m.slug) w *= 0.05;
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
