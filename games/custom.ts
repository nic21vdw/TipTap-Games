// Player-generated games: the AI (or local fallback) designs a spec, our
// proven engines execute it. A spec picks a base mechanic, renames it,
// recolours it, and repositions it in the algorithm's feature space.
import type { GameModule, GameTag } from "@/games/types";
import { MODULES, CATALOG, registerModule } from "@/games/registry";
import { paletteFromAccent } from "@/lib/color";
import { normalizeSpec, type CustomGameSpec } from "@/lib/specs";

export function specToModule(spec: CustomGameSpec): GameModule | null {
  // normalizeSpec is the one place that decides what a spec means, so a
  // half-broken one from the model — or from an older build's localStorage —
  // still builds instead of silently failing to register.
  const clean = normalizeSpec(spec);
  const base = MODULES[clean.base];
  if (!base || MODULES[clean.slug]) return null;
  // The accent drives the whole five-colour palette, so a custom card reads
  // as its own game instead of a recaptioned base engine.
  const palette = paletteFromAccent(clean.accent);
  const meta = {
    ...base.meta,
    slug: clean.slug,
    title: clean.title,
    rule: clean.rule,
    year: 2026,
    description: clean.description,
    history: clean.history,
    palette,
    tags: clean.tags as GameTag[],
    intensity: clean.intensity,
    luck: clean.luck,
    nostalgia: clean.nostalgia,
  };
  return {
    meta,
    mount: (ctx) =>
      base.mount({
        ...ctx,
        pal: palette,
        getTheme: () => ({ ...ctx.getTheme(), accent: clean.accent }),
      }),
  };
}

/** Register a spec into the live catalog. Returns true if it now exists. */
export function registerSpec(spec: CustomGameSpec): boolean {
  const { slug } = normalizeSpec(spec);
  if (MODULES[slug]) return true;
  const mod = specToModule(spec);
  if (!mod) return false;
  registerModule(mod);
  return CATALOG.some((m) => m.slug === slug);
}
