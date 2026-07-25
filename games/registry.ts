import type { FullGameMeta, GameModule } from "@/games/types";
import reflexGate from "@/games/reflex-gate";
import tapRush from "@/games/tap-rush";
import wordTrap from "@/games/word-trap";
import holdLine from "@/games/hold-line";
import flashRecall from "@/games/flash-recall";
import dropDodge from "@/games/drop-dodge";
import oneLane from "@/games/one-lane";
import popChain from "@/games/pop-chain";
import cashOut from "@/games/cash-out";
import nokiaMode from "@/games/nokia-mode";
import oneGap from "@/games/one-gap";
import blackKeys from "@/games/black-keys";
import split from "@/games/split";
import dropTower from "@/games/drop-tower";
import crossTraffic from "@/games/cross-traffic";
import driftField from "@/games/drift-field";

const ALL: GameModule[] = [
  reflexGate,
  tapRush,
  wordTrap,
  holdLine,
  flashRecall,
  dropDodge,
  oneLane,
  popChain,
  cashOut,
  nokiaMode,
  oneGap,
  blackKeys,
  split,
  dropTower,
  crossTraffic,
  driftField,
];

/**
 * Fills the optional algorithm axes. Speed tracks intensity, difficulty
 * tracks intensity and inverse-luck, realism defaults to playful, and
 * anything tagged casino is the only thing that isn't kid-safe.
 */
const DEFAULT_PALETTE = {
  hero: "#0095f6",
  foe: "#ff4d6d",
  prize: "#ffb703",
  deep: "#9db8d2",
  glow: "#8ecae6",
};

export function enrich(mod: GameModule): FullGameMeta {
  const m = mod.meta;
  return {
    ...m,
    palette: m.palette ?? DEFAULT_PALETTE,
    speed: m.speed ?? m.intensity,
    difficulty: m.difficulty ?? Math.min(1, m.intensity * 0.6 + (1 - m.luck) * 0.4),
    realism: m.realism ?? 0.3,
    kidSafe: m.kidSafe ?? !m.tags.includes("casino"),
  };
}

export const MODULES: Record<string, GameModule> = Object.fromEntries(
  ALL.map((m) => [m.meta.slug, m])
);

export const CATALOG: FullGameMeta[] = ALL.map(enrich);

export function getModule(slug: string): GameModule {
  const m = MODULES[slug];
  if (!m) throw new Error(`Unknown game: ${slug}`);
  return m;
}

/** Full meta (all axes resolved) for a slug. */
export function getMeta(slug: string): FullGameMeta {
  return CATALOG.find((m) => m.slug === slug) ?? enrich(getModule(slug));
}

/** Adds a runtime-generated module to the live catalog. */
export function registerModule(mod: GameModule) {
  if (MODULES[mod.meta.slug]) return;
  MODULES[mod.meta.slug] = mod;
  CATALOG.push(enrich(mod));
}

/** Removes a player-made module. Built-ins are never removable. */
export function unregisterModule(slug: string) {
  if (!BUILT_IN.has(slug)) delete MODULES[slug];
  const i = CATALOG.findIndex((m) => m.slug === slug);
  if (i >= 0 && !BUILT_IN.has(slug)) CATALOG.splice(i, 1);
}

const BUILT_IN = new Set(ALL.map((m) => m.meta.slug));
