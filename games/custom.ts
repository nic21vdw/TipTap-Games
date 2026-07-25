// Player-generated games: the AI (or local fallback) designs a spec, our
// proven engines execute it. A spec picks a base mechanic, renames it,
// recolours it, and repositions it in the algorithm's feature space.
import type { GameModule } from "@/games/types";
import type { GameTag } from "@/games/types";
import { MODULES, CATALOG, registerModule } from "@/games/registry";
import type { CustomGameSpec } from "@/lib/storage";

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
  };
  return {
    meta,
    mount: (ctx) =>
      base.mount({
        ...ctx,
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
