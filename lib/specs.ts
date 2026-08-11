// The contract for a player-generated game. A spec is the only thing that
// crosses the wire (or lands in localStorage), so every field is validated
// here — once — and nothing downstream has to trust the model, an older
// build, or whatever is already saved in the browser.
import { MODULES, shippedBase } from "@/games/registry";
import { hslToHex, normalizeHex } from "@/lib/color";

export interface CustomGameSpec {
  slug: string;
  base: string; // slug of the engine it runs on
  title: string;
  rule: string;
  description: string;
  history: string;
  accent: string; // hex; recolours the base engine
  tags: string[];
  intensity: number;
  luck: number;
  nostalgia: number;
}

/**
 * Engines the generator may target. Anything outside this list is rejected —
 * these are the ones that carry a recolour and a rename well enough to read
 * as a new game.
 */
export const GENERATOR_BASES = [
  { slug: "tap-rush", feel: "frantic target tapping" },
  { slug: "reflex-gate", feel: "timing a moving bar" },
  { slug: "drop-dodge", feel: "dragging through falling hazards" },
  { slug: "flash-recall", feel: "memory sequences" },
  { slug: "cash-out", feel: "banking a rising multiplier before it busts" },
  { slug: "one-lane", feel: "lane-flip endless runner" },
  { slug: "hold-line", feel: "press-and-release precision" },
  { slug: "word-trap", feel: "read-fast reaction traps" },
  { slug: "pop-chain", feel: "clearing tile groups" },
] as const;

export const VALID_TAGS = [
  "reflex", "precision", "memory", "endurance", "luck",
  "chaos", "calm", "retro", "casino", "oneTap", "drag", "hold",
] as const;

const TAG_SET = new Set<string>(VALID_TAGS);

export const TITLE_ADJ = [
  "Neon", "Void", "Turbo", "Ghost", "Hyper", "Static", "Midnight", "Crimson",
  "Zero", "Iron", "Lucid", "Feral", "Glass", "Solar", "Panic", "Velvet",
  "Chrome", "Cobalt", "Rogue", "Quiet", "Savage", "Paper", "Wired", "Frost",
] as const;

export const TITLE_NOUN = [
  "Rush", "Drift", "Circuit", "Pulse", "Lane", "Vault", "Signal", "Cascade",
  "Reflex", "Gauntlet", "Fracture", "Ladder", "Streak", "Switch", "Tempo",
  "Margin", "Relay", "Spiral", "Break", "Chase", "Tide", "Hazard",
] as const;

/**
 * The one place a two-word game name is built. Both indices come off the
 * seed unsigned: a signed shift here reads negative for every seed with the
 * high bit set, and `WORDS[-4]` is how the literal "undefined" ended up in
 * saved titles.
 */
export function titleFromSeed(seed: number): string {
  const s = seed >>> 0;
  const adj = TITLE_ADJ[s % TITLE_ADJ.length];
  const noun = TITLE_NOUN[(s >>> 5) % TITLE_NOUN.length];
  return `Nic's ${adj} ${noun}`;
}

/** A name that leaked a JS non-value is not a name — rebuild it instead. */
const BROKEN_NAME = /\b(undefined|null|NaN)\b/i;

/** A base is usable only if it is allow-listed AND actually in the catalog. */
export function isGeneratorBase(slug: unknown): slug is string {
  return (
    typeof slug === "string" &&
    GENERATOR_BASES.some((b) => b.slug === slug) &&
    Boolean(MODULES[slug])
  );
}

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Models paraphrase. "Cash Out", "cash_out" and "games/cash-out" all mean the
 * same engine, so meet them halfway before falling back to the keywords.
 */
function coerceBase(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const hit = GENERATOR_BASES.find((b) => b.slug === value || b.slug === key);
  return hit ? shippedBase(hit.slug) : null;
}

/**
 * Bases this build contains. The App Store bundle drops the casino engine, so
 * a wish for "something with betting" has to land on one that is really there.
 */
const AVAILABLE = GENERATOR_BASES.filter((b) => shippedBase(b.slug));

/** Keyword match from the player's own words — the offline designer's brain. */
export function baseForPrompt(prompt: string): string {
  const p = prompt.toLowerCase();
  const has = (words: string[]) => words.some((w) => p.includes(w));
  const pick = (slug: string) => shippedBase(slug);
  const guess =
    (has(["casino", "bet", "gambl", "risk", "bank", "chip"]) && pick("cash-out")) ||
    (has(["dodge", "car", "fall", "avoid", "drive", "traffic"]) && pick("drop-dodge")) ||
    (has(["memory", "remember", "simon", "recall", "sequence"]) && pick("flash-recall")) ||
    (has(["run", "lane", "jump", "endless", "chase", "escape"]) && pick("one-lane")) ||
    (has(["tap", "fast", "speed", "frantic", "whack", "click"]) && pick("tap-rush")) ||
    (has(["timing", "rhythm", "beat", "bar", "time it"]) && pick("reflex-gate")) ||
    (has(["match", "puzzle", "tile", "block", "grid"]) && pick("pop-chain")) ||
    (has(["hold", "charge", "fill", "release"]) && pick("hold-line")) ||
    (has(["word", "read", "letter", "spell"]) && pick("word-trap"));
  if (guess) return guess;
  const h = hash(p || "surprise me");
  return AVAILABLE[h % AVAILABLE.length].slug;
}

const clamp01 = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
};

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Turn anything spec-shaped into a spec that is guaranteed to build. Used on
 * the way out of the API, and again on the way out of localStorage so games
 * saved by an earlier build get repaired rather than dropped.
 */
export function normalizeSpec(
  raw: Partial<CustomGameSpec> | null | undefined,
  seed = ""
): CustomGameSpec {
  const input = (raw ?? {}) as Partial<CustomGameSpec>;
  const given = text(input.title, 24).replace(/^["'`]|["'`]$/g, "");
  // A spec that was saved by an earlier build carries whatever name that
  // build produced, so a malformed one is repaired here rather than trusted.
  // Seeding off the slug keeps the repair stable across sessions.
  let title =
    given && !BROKEN_NAME.test(given)
      ? given
      : titleFromSeed(hash(text(input.slug, 64) || given || seed || "wildcard"));
  // Every game in the feed carries Nic's name — add it if it's missing.
  if (!/\bnic/i.test(title)) {
    title = `Nic's ${title}`.slice(0, 24);
  }
  const hint = `${seed} ${title}`.trim();
  const base = coerceBase(input.base) ?? baseForPrompt(hint);
  const baseMeta = MODULES[base].meta;
  const h = hash(text(input.slug, 64) || hint || base);

  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.filter((t): t is string => TAG_SET.has(t as string)))].slice(0, 4)
    : [];

  return {
    slug: text(input.slug, 64) || `custom-${h.toString(36)}`,
    base,
    title,
    // The rule line is the only instruction a player gets, and the controls
    // belong to the engine — never to the model's imagination.
    rule: baseMeta.rule,
    description: text(input.description, 140) || `A player-made drop: ${title}.`,
    history:
      text(input.history, 280) ||
      "Generated on demand from a player prompt — the feed designed this one for you, born in 2026.",
    accent: normalizeHex(input.accent) ?? hslToHex(h % 360, 85, 55),
    tags: tags.length ? tags : [...baseMeta.tags],
    intensity: clamp01(input.intensity, baseMeta.intensity),
    luck: clamp01(input.luck, baseMeta.luck),
    nostalgia: clamp01(input.nostalgia, 0.1),
  };
}
