// A placeholder card that plays a live "building your game" animation while
// the real one is designed in the background. When generation finishes the
// feed swaps this card's slug for the finished game, so the game literally
// pops up in place. Each pending job registers its own module so it carries
// the provisional title the moment the card lands.
import type { GameModule, GameContext, GameInstance } from "@/games/types";
import { makeLoop, roundRect } from "@/games/engine";
import { MODULES, registerHiddenModule } from "@/games/registry";

// Shared 0..1 build progress, keyed by pending slug. The card's animation and
// caption both read it; lib/generator drives it.
const progress = new Map<string, number>();
const status = new Map<string, string>();

export function setGenProgress(slug: string, p: number, label?: string) {
  progress.set(slug, Math.max(0, Math.min(1, p)));
  if (label) status.set(slug, label);
}
export function getGenProgress(slug: string): number {
  return progress.get(slug) ?? 0;
}
export function getGenStatus(slug: string): string {
  return status.get(slug) ?? "Designing your game";
}
export function clearGen(slug: string) {
  progress.delete(slug);
  status.delete(slug);
}

export interface PendingMeta {
  slug: string;
  title: string;
  accent: string;
}

/** Register a one-off placeholder module for a generation job. */
export function registerPending({ slug, title, accent }: PendingMeta): void {
  if (MODULES[slug]) return;
  progress.set(slug, 0.05);
  status.set(slug, "Reading your idea");
  const mod: GameModule = {
    meta: {
      slug,
      title,
      rule: "Designing your game — hang tight",
      year: 2026,
      description:
        "The feed is building this one from your idea. Stay on this card — it comes alive right here.",
      history:
        "You asked for this. It's being generated on demand, then dropped straight into your feed as the finished, playable game.",
      tags: ["chaos"],
      intensity: 0.5,
      luck: 0.3,
      nostalgia: 0.2,
      sessionLength: 0.3,
      scoreUnit: "pts",
      maxScorePerSecond: 999,
      palette: {
        hero: accent,
        foe: "#ff4d6d",
        prize: accent,
        deep: "#25324a",
        glow: accent,
      },
    },
    mount: (ctx) => mountBuilder(ctx, slug, accent),
  };
  // MODULES-only: a half-built placeholder must never leak into the sampler.
  registerHiddenModule(mod);
}

// A calm, on-brand assembly animation: a ring of blocks snapping into place as
// progress climbs, with the live status line under it.
function mountBuilder(
  ctx: GameContext,
  slug: string,
  accent: string
): GameInstance {
  const { g, width: W, height: H, getTheme } = ctx;
  const N = 12;
  const seeds = Array.from({ length: N }, (_, i) => ({
    a: (i / N) * Math.PI * 2,
    wobble: (i * 37) % 100 / 100,
  }));

  const loop = makeLoop((dt, t) => {
    const th = getTheme();
    const p = getGenProgress(slug);
    const label = getGenStatus(slug);
    const cx = W / 2;
    const cy = H * 0.44;
    const R = Math.min(W, H) * 0.2;

    g.clearRect(0, 0, W, H);
    g.fillStyle = th.bg;
    g.fillRect(0, 0, W, H);

    // soft glow behind the assembly
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 2.6);
    glow.addColorStop(0, hexA(accent, 0.22));
    glow.addColorStop(1, hexA(accent, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // ring of blocks; each snaps in once progress passes its slot
    for (let i = 0; i < N; i++) {
      const s = seeds[i];
      const slot = i / N;
      const placed = p > slot;
      const drift = placed ? 0 : 12 + s.wobble * 22;
      const rad = R + Math.sin(t * 2 + s.a) * (placed ? 2 : 6) + drift;
      const x = cx + Math.cos(s.a + t * 0.25) * rad;
      const y = cy + Math.sin(s.a + t * 0.25) * rad;
      const size = placed ? 13 : 8;
      g.globalAlpha = placed ? 1 : 0.28;
      g.fillStyle = placed ? accent : th.inkDim;
      roundRect(g, x - size / 2, y - size / 2, size, size, 3);
      g.fill();
    }
    g.globalAlpha = 1;

    // centre pulse
    const pulse = 1 + Math.sin(t * 3) * 0.06;
    g.fillStyle = hexA(accent, 0.9);
    g.beginPath();
    g.arc(cx, cy, R * 0.32 * pulse, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = th.bg;
    g.font = `700 ${Math.round(R * 0.34)}px ${th.fontDisplay}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(`${Math.round(p * 100)}`, cx, cy + 1);

    // progress bar
    const barW = W * 0.62;
    const barX = cx - barW / 2;
    const barY = H * 0.66;
    g.fillStyle = hexA(th.ink, 0.14);
    roundRect(g, barX, barY, barW, 8, 4);
    g.fill();
    g.fillStyle = accent;
    roundRect(g, barX, barY, Math.max(8, barW * p), 8, 4);
    g.fill();

    // status line
    g.fillStyle = th.ink;
    g.font = `700 15px ${th.fontBody}`;
    g.fillText(`${label}…`, cx, barY + 30);
  });
  loop.start();

  return {
    destroy: () => loop.destroy(),
    pause: () => loop.pause(),
    resume: () => loop.resume(),
    // The builder always animates; it ignores attract/interactive toggles.
    autoplay: () => {},
  };
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
