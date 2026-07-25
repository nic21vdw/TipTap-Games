// Player-generated games: the AI (or local fallback) designs a spec, our
// proven engines execute it. A spec picks a base mechanic, renames it,
// recolours it, and repositions it in the algorithm's feature space.
//
// One hard rule: a generated card may invent a name, a look and a story, but
// never the controls. The `rule` line — the one instruction always on screen —
// is copied from the engine that actually runs, so a card can never promise a
// mechanic the player will not get.
import type { GameModule, GamePalette } from "@/games/types";
import type { GameTag } from "@/games/types";
import { MODULES, CATALOG, registerModule } from "@/games/registry";
import type { CustomGameSpec } from "@/lib/storage";

const VALID_TAGS = new Set<string>([
  "reflex", "precision", "memory", "endurance", "luck",
  "chaos", "calm", "retro", "casino", "oneTap", "drag", "hold",
]);

/** #rrggbb -> [h 0..360, s 0..1, l 0..1] */
function toHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [210, 0.7, 0.55];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * One accent colour is all the designer gives us, so build a whole scheme
 * around it — a complement for the hazard, a warm note for the prize, and a
 * near-black of the same hue for the ground. Generated cards then actually
 * look like their own game instead of a recoloured hint of the base.
 */
export function paletteFrom(accent: string): GamePalette {
  const [h, s, l] = toHsl(accent);
  const sat = Math.max(0.55, Math.min(0.95, s || 0.8));
  return {
    hero: fromHsl(h, sat, Math.min(0.68, Math.max(0.5, l))),
    foe: fromHsl((h + 165) % 360, Math.min(0.95, sat + 0.1), 0.56),
    prize: fromHsl((h + 45) % 360, Math.min(0.95, sat + 0.15), 0.62),
    deep: fromHsl(h, Math.min(0.7, sat), 0.09),
    glow: fromHsl((h + 300) % 360, sat, 0.6),
  };
}

export function specToModule(spec: CustomGameSpec): GameModule | null {
  const base = MODULES[spec.base];
  if (!base || MODULES[spec.slug]) return null;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, Number(n) || 0));
  const tags = spec.tags.filter((t) => VALID_TAGS.has(t)) as GameTag[];
  const meta = {
    ...base.meta,
    slug: spec.slug,
    title: String(spec.title).slice(0, 24),
    // never the spec's own words: the controls come from the engine that runs
    rule: base.meta.rule,
    year: 2026,
    description: String(spec.description).slice(0, 140),
    history: String(spec.history).slice(0, 280),
    tags: tags.length ? tags : base.meta.tags,
    palette: paletteFrom(spec.accent),
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
