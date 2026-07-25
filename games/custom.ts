// Player-generated games: the AI (or local fallback) designs a spec, our
// proven engines execute it. A spec picks a base mechanic, renames it,
// recolours it, and repositions it in the algorithm's feature space.
import type { GameModule } from "@/games/types";
import type { GameTag } from "@/games/types";
import { MODULES, CATALOG, registerModule, unregisterModule } from "@/games/registry";
import type { CustomGameSpec } from "@/lib/library";

const DEFAULT_SPEC_PALETTE = {
  hero: "#0095f6",
  foe: "#ff4d6d",
  prize: "#ffb703",
  deep: "#9db8d2",
  glow: "#8ecae6",
};

const VALID_TAGS = new Set<string>([
  "reflex", "precision", "memory", "endurance", "luck",
  "chaos", "calm", "retro", "casino", "oneTap", "drag", "hold",
]);

export function specToModule(spec: CustomGameSpec): GameModule | null {
  const base = MODULES[spec.base];
  if (!base || MODULES[spec.slug]) return null;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, Number(n) || 0));
  const meta = {
    ...base.meta,
    slug: spec.slug,
    title: String(spec.title).slice(0, 24),
    rule: String(spec.rule).slice(0, 48),
    year: 2026,
    description: String(spec.description).slice(0, 140),
    history: String(spec.history).slice(0, 280),
    tags: (spec.tags.filter((t) => VALID_TAGS.has(t)) as GameTag[]).length
      ? (spec.tags.filter((t) => VALID_TAGS.has(t)) as GameTag[])
      : base.meta.tags,
    intensity: clamp01(spec.intensity),
    luck: clamp01(spec.luck),
    nostalgia: clamp01(spec.nostalgia),
    // The colour the author picked has to actually show: it takes over the
    // hero and the glow, while the base keeps the colours that carry meaning
    // (what kills you, what you're chasing) so the game stays readable.
    palette: {
      ...(base.meta.palette ?? DEFAULT_SPEC_PALETTE),
      hero: spec.accent,
      glow: spec.accent,
    },
  };
  return {
    meta,
    mount: (ctx) =>
      base.mount({
        ...ctx,
        pal: { ...ctx.pal, hero: spec.accent, glow: spec.accent },
        getTheme: () => ({ ...ctx.getTheme(), accent: spec.accent }),
      }),
  };
}

/** Register a spec into the live catalog. Returns true if it now exists. */
export function registerSpec(spec: CustomGameSpec): boolean {
  if (MODULES[spec.slug]) return true;
  const mod = specToModule(spec);
  if (!mod) return false;
  registerModule(mod);
  return CATALOG.some((m) => m.slug === spec.slug);
}

/** Pulls a player's game back out of the catalog when they unpublish it. */
export function unregisterSpec(slug: string) {
  unregisterModule(slug);
}
