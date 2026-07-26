// Player-generated games: the AI (or local fallback) designs a spec, our
// proven engines execute it. A spec picks a base mechanic, renames it,
// repaints it, retunes how fast and how busy it runs, and repositions it in
// the algorithm's feature space.
import type { GameModule, GamePalette, GameTag } from "@/games/types";
import { MODULES, CATALOG, registerModule } from "@/games/registry";
import type { CustomGameSpec } from "@/lib/storage";

const VALID_TAGS = new Set<string>([
  "reflex", "precision", "memory", "endurance", "luck",
  "chaos", "calm", "retro", "casino", "oneTap", "drag", "hold",
]);

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));

/**
 * Every game in the feed carries Nic's name — the hand-built catalog does it
 * by hand, and player- and AI-designed drops get it here, at the one place
 * every spec has to pass through.
 */
function nicTitle(raw: unknown): string {
  const title = String(raw ?? "").trim();
  if (!title) return "Nic's Wildcard";
  if (/\bnic/i.test(title)) return title.slice(0, 24);
  return `Nic's ${title}`.slice(0, 24);
}

export function specToModule(spec: CustomGameSpec): GameModule | null {
  const base = MODULES[spec.base];
  if (!base || MODULES[spec.slug]) return null;
  const clamp01 = (n: number) => clamp(Number(n) || 0, 0, 1);
  const kept = (spec.tags ?? []).filter((t) => VALID_TAGS.has(t)) as GameTag[];
  // A generated palette makes the variant read as its own game rather than a
  // reskin; without one we keep the engine's colours and only shift the accent.
  const palette: GamePalette = spec.palette
    ? { ...base.meta.palette, ...spec.palette }
    : (base.meta.palette ?? {
        hero: spec.accent,
        foe: "#ff4d6d",
        prize: "#ffb703",
        deep: "#9db8d2",
        glow: "#8ecae6",
      });
  const tune = {
    speed: clamp(spec.tune?.speed ?? 1, 0.6, 1.6),
    density: clamp(spec.tune?.density ?? 1, 0.5, 1.8),
  };
  const meta = {
    ...base.meta,
    slug: spec.slug,
    title: nicTitle(spec.title),
    rule: String(spec.rule).slice(0, 48),
    year: 2026,
    description: String(spec.description).slice(0, 140),
    history: String(spec.history).slice(0, 280),
    tags: kept.length ? kept : base.meta.tags,
    palette,
    intensity: clamp01(spec.intensity),
    luck: clamp01(spec.luck),
    nostalgia: clamp01(spec.nostalgia),
    // a faster variant really is a faster game, so the tuner should know
    speed: clamp01((base.meta.speed ?? base.meta.intensity) * tune.speed),
  };
  return {
    meta,
    mount: (ctx) =>
      base.mount({
        ...ctx,
        pal: palette,
        tune,
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
