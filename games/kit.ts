// The scaffold every catalog game past the first sixteen is built on.
//
// A game's real content is its mechanic and its art. Everything around that —
// rAF lifecycle, pointer plumbing, the idle hint, tap-to-restart, the shared
// end card, attract mode — is identical in all hundred cards, so it lives here
// once. `defineGame` turns a blueprint into a `GameModule` that satisfies the
// same contract as the hand-rolled games in `games/*/index.ts`.

import type {
  GameContext,
  GameInstance,
  GameMeta,
  GameModule,
  GamePalette,
  GameTuning,
} from "@/games/types";
import { endCard, makeLoop } from "@/games/engine";
import type { ThemeTokens } from "@/lib/themes";

export interface Api {
  /** logical width/height in CSS px — games never touch the backing store */
  readonly W: number;
  readonly H: number;
  readonly g: CanvasRenderingContext2D;
  /** this game's own five colours */
  readonly pal: GamePalette;
  /** live theme tokens; call per frame, never cache across frames */
  readonly theme: () => ThemeTokens;
  /** variant dials — 1/1 for catalog games, turned for generated ones */
  readonly tune: GameTuning;
  /** seconds of simulated time this run */
  t: number;
  score: number;
  started: boolean;
  over: boolean;
  /** true while the card is a self-playing preview in the feed */
  auto: boolean;
  set: (n: number) => void;
  add: (n: number) => void;
  /** end the run — safe to call repeatedly, only the first call counts */
  end: () => void;
  haptic: (kind: "light" | "hit" | "fail") => void;
}

export interface Blueprint<S> {
  /** shown centred while the game waits for the first tap */
  hint?: string;
  /** headline on the end card */
  overMsg?: string;
  /** true = the run is live the moment the card lands, no tap needed */
  autoStart?: boolean;
  /** build fresh run state; called on mount and on every restart */
  init: (api: Api) => S;
  update: (s: S, dt: number, api: Api) => void;
  draw: (s: S, g: CanvasRenderingContext2D, api: Api) => void;
  down?: (s: S, x: number, y: number, api: Api) => void;
  move?: (s: S, x: number, y: number, api: Api) => void;
  up?: (s: S, x: number, y: number, api: Api) => void;
  /** attract-mode driver: play the game well enough to look alive */
  bot?: (s: S, dt: number, api: Api) => void;
}

const NO_TUNE: GameTuning = { speed: 1, density: 1 };

/** Seconds a self-playing preview shows its end card before going again. */
const AUTO_RESTART = 1.1;

export function defineGame<S>(
  meta: GameMeta,
  bp: Blueprint<S>
): GameModule {
  const mount = (ctx: GameContext): GameInstance => {
    const { g, width: W, height: H } = ctx;
    let state: S;
    let deadFor = 0;

    const api: Api = {
      W,
      H,
      g,
      pal: ctx.pal,
      theme: ctx.getTheme,
      tune: ctx.tune ?? NO_TUNE,
      t: 0,
      score: 0,
      started: false,
      over: false,
      auto: false,
      set: (n) => {
        api.score = n;
        ctx.onScore(n);
      },
      add: (n) => {
        api.score += n;
        ctx.onScore(api.score);
      },
      end: () => {
        if (api.over) return;
        api.over = true;
        deadFor = 0;
        ctx.haptic("fail");
        ctx.onRunEnd(api.score);
      },
      haptic: ctx.haptic,
    };

    const reset = () => {
      api.t = 0;
      api.score = 0;
      api.over = false;
      api.started = bp.autoStart === true || api.auto;
      deadFor = 0;
      ctx.onScore(0);
      state = bp.init(api);
    };
    reset();

    // Pointer coordinates in the same logical space the game draws in, so a
    // scaled or letterboxed canvas still hits where the player aimed.
    const at = (e: PointerEvent) => {
      const r = ctx.canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / (r.width || 1)) * W,
        y: ((e.clientY - r.top) / (r.height || 1)) * H,
      };
    };

    const onDown = (e: PointerEvent) => {
      if (api.over) {
        reset();
        return;
      }
      const p = at(e);
      api.started = true;
      bp.down?.(state, p.x, p.y, api);
    };
    const onMove = (e: PointerEvent) => {
      if (api.over) return;
      const p = at(e);
      bp.move?.(state, p.x, p.y, api);
    };
    const onUp = (e: PointerEvent) => {
      if (api.over) return;
      const p = at(e);
      bp.up?.(state, p.x, p.y, api);
    };

    ctx.canvas.addEventListener("pointerdown", onDown);
    if (bp.move) ctx.canvas.addEventListener("pointermove", onMove);
    if (bp.up) {
      ctx.canvas.addEventListener("pointerup", onUp);
      ctx.canvas.addEventListener("pointercancel", onUp);
    }

    const loop = makeLoop((dt) => {
      const t = ctx.getTheme();
      const sdt = dt * api.tune.speed;

      if (api.auto) {
        // a preview that dies stays dead for a beat, then goes again — the
        // feed should never show a frozen card
        if (api.over) {
          deadFor += dt;
          if (deadFor > AUTO_RESTART) reset();
        } else {
          api.started = true;
          bp.bot?.(state, sdt, api);
        }
      }

      if (api.started && !api.over) {
        api.t += sdt;
        bp.update(state, sdt, api);
      }

      bp.draw(state, g, api);

      g.textAlign = "center";
      if (!api.started && !api.over) {
        g.fillStyle = t.inkDim;
        g.font = `700 17px ${t.fontBody}`;
        g.fillText(bp.hint ?? "tap to start", W / 2, H * 0.3);
      }
      if (api.over && !api.auto) endCard(g, t, W, H, bp.overMsg ?? "RUN OVER");
      g.textAlign = "left";
    });
    loop.start();

    return {
      destroy: () => {
        loop.destroy();
        ctx.canvas.removeEventListener("pointerdown", onDown);
        ctx.canvas.removeEventListener("pointermove", onMove);
        ctx.canvas.removeEventListener("pointerup", onUp);
        ctx.canvas.removeEventListener("pointercancel", onUp);
      },
      pause: loop.pause,
      resume: loop.resume,
      autoplay: (on) => {
        api.auto = on;
        reset();
      },
    };
  };

  return { meta, mount };
}

// ---- drawing helpers shared across the catalog ----

/** Vertical two-stop wash — the default ground for most cards. */
export function sky(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  top: string,
  bottom: string
) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

/** Centred display text, used for counters and callouts inside a game. */
export function centred(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  colour: string,
  font: string,
  weight = 800
) {
  g.save();
  g.textAlign = "center";
  g.fillStyle = colour;
  g.font = `${weight} ${size}px ${font}`;
  g.fillText(text, x, y);
  g.restore();
}

/** A short-lived particle pool — burst on impact, fade, forget. */
export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
}

export function burst(
  out: Spark[],
  x: number,
  y: number,
  col: string,
  n = 10,
  power = 180
): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random();
    const s = power * (0.4 + Math.random() * 0.8);
    const life = 0.3 + Math.random() * 0.4;
    out.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      max: life,
      col,
    });
  }
}

export function stepSparks(list: Spark[], dt: number, gravity = 340): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function drawSparks(
  g: CanvasRenderingContext2D,
  list: Spark[],
  size = 4
): void {
  for (const p of list) {
    g.globalAlpha = Math.max(0, p.life / p.max);
    g.fillStyle = p.col;
    g.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  }
  g.globalAlpha = 1;
}
