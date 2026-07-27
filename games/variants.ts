// Endless supply of fresh cards.
//
// The hand-built catalog is finite, and the feed is never allowed to repeat
// a game you've already scrolled past. So once you've exhausted the catalog,
// the feed mints NEW games instead of recycling old ones: a proven engine,
// renamed, recoloured, and repositioned in the algorithm's feature space —
// the same trick /api/generate uses, run locally and tuned to your vector.

import type { AlgorithmVector } from "@/lib/algorithm";
import { scoreGame } from "@/lib/algorithm";
import { CATALOG, MODULES, getMeta } from "@/games/registry";
import { registerSpec } from "@/games/custom";
import { titleFromSeed } from "@/lib/specs";
import { saveCustomSpec, type CustomGameSpec } from "@/lib/storage";

/** Engines that read the accent token hard enough that a recolour reads new. */
const BASES = [
  "tap-rush",
  "reflex-gate",
  "drop-dodge",
  "flash-recall",
  "cash-out",
  "one-lane",
  "hold-line",
  "word-trap",
  "pop-chain",
  "one-gap",
  "split",
  "drop-tower",
  "cross-traffic",
  "drift-field",
  "black-keys",
];

const ORIGINS = [
  "Minted by your feed the moment you'd played everything else.",
  "The algorithm built this one after watching how you scroll.",
  "A remix nobody else got served — spun from your last few swipes.",
  "Assembled on the fly from an engine you kept coming back to.",
  "Born at the end of the catalog, tuned to the vector you're running.",
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s * Math.min(l, 1 - l)) / 100 / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * 100 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Pull an axis toward what the player currently wants, but keep it surprising. */
function toward(target: number, spread: number): number {
  return clamp01(target + (Math.random() - 0.5) * spread);
}

/** Highest-scoring base for the current vector, sampled softly so the
 *  remixes don't all come off the same engine. */
function pickBase(vec: AlgorithmVector, boosts: Record<string, number>): string {
  const pool = BASES.filter((slug) => MODULES[slug]);
  if (pool.length === 0) return CATALOG[0].slug;
  const weights = pool.map(
    (slug) =>
      Math.max(0.05, scoreGame(getMeta(slug), vec, [], boosts) + 1) *
      (0.5 + Math.random())
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * Designs, saves, and registers one brand-new game. Returns its slug, or
 * null if every engine is somehow unavailable.
 */
export function mintVariant(
  vec: AlgorithmVector,
  boosts: Record<string, number> = {},
  exclude: ReadonlySet<string> = new Set()
): string | null {
  const base = pickBase(vec, boosts);
  const baseMeta = MODULES[base]?.meta;
  if (!baseMeta) return null;

  // walk the seed until the slug is genuinely unused (and unseen)
  let seed = hash(`${base}:${Math.random()}`);
  let slug = `mix-${seed.toString(36)}`;
  for (let i = 0; i < 24 && (MODULES[slug] || exclude.has(slug)); i++) {
    seed = hash(slug + i);
    slug = `mix-${seed.toString(36)}`;
  }
  if (MODULES[slug] || exclude.has(slug)) return null;

  const spec: CustomGameSpec = {
    slug,
    base,
    title: titleFromSeed(seed),
    rule: baseMeta.rule,
    description: `A ${baseMeta.title} remix the feed made for you.`,
    history: `${ORIGINS[seed % ORIGINS.length]} Runs on the ${baseMeta.title} engine, re-tuned and recoloured — same hands, different nerve.`,
    accent: hslToHex(seed % 360, 78, 56),
    tags: baseMeta.tags,
    intensity: toward(vec.intensity, 0.45),
    luck: toward(vec.luck, 0.35),
    nostalgia: toward(vec.nostalgia, 0.4),
  };

  if (!registerSpec(spec)) return null;
  saveCustomSpec(spec);
  return slug;
}
