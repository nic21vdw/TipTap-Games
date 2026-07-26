// The contract for a player-generated game. A spec is the only thing that
// crosses the wire (or lands in localStorage), so every field is validated
// here — once — and nothing downstream has to trust the model, an older
// build, or whatever is already saved in the browser.
import { MODULES } from "@/games/registry";
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
  if (isGeneratorBase(value)) return value;
  if (typeof value !== "string") return null;
  const key = value.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const hit = GENERATOR_BASES.find((b) => b.slug === key);
  return hit && MODULES[hit.slug] ? hit.slug : null;
}

/** Keyword match from the player's own words — the offline designer's brain. */
export function baseForPrompt(prompt: string): string {
  const p = prompt.toLowerCase();
  const has = (words: string[]) => words.some((w) => p.includes(w));
  if (has(["casino", "bet", "gambl", "risk", "bank", "chip"])) return "cash-out";
  if (has(["dodge", "car", "fall", "avoid", "drive", "traffic"])) return "drop-dodge";
  if (has(["memory", "remember", "simon", "recall", "sequence"])) return "flash-recall";
  if (has(["run", "lane", "jump", "endless", "chase", "escape"])) return "one-lane";
  if (has(["tap", "fast", "speed", "frantic", "whack", "click"])) return "tap-rush";
  if (has(["timing", "rhythm", "beat", "bar", "time it"])) return "reflex-gate";
  if (has(["match", "puzzle", "tile", "block", "grid"])) return "pop-chain";
  if (has(["hold", "charge", "fill", "release"])) return "hold-line";
  if (has(["word", "read", "letter", "spell"])) return "word-trap";
  const h = hash(p || "surprise me");
  return GENERATOR_BASES[h % GENERATOR_BASES.length].slug;
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
  const title = text(input.title, 24).replace(/^["'`]|["'`]$/g, "") || "Wildcard";
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
