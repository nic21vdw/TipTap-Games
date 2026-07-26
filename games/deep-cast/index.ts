import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "deep-cast",
  title: "Nic's Deep Cast",
  rule: "Hold to drop the hook, tap to launch",
  year: 2013,
  description: "Drop deep, dodge the sting, launch for bonus.",
  history:
    "Homage to the 2013 one-thumb fishing craze that turned a single hold-and-release gesture into hours of dock-side scrolling.",
  tags: ["reflex", "hold", "casino"],
  palette: {
    hero: "#48cae4",
    foe: "#ff595e",
    prize: "#ffca3a",
    deep: "#03045e",
    glow: "#90e0ef",
  },
  intensity: 0.55,
  luck: 0.35,
  nostalgia: 0.6,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

type Phase = "cast" | "reel" | "launch";

interface Entity {
  depth: number;
  x: number;
  r: number;
  hazard: boolean;
  gone: boolean;
  seed: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const surfaceY = H * 0.16;
  const floorY = H * 0.92;
  const MAX_DEPTH = 100;

  const depthToY = (d: number) => surfaceY + (d / MAX_DEPTH) * (floorY - surfaceY);

  let phase: Phase = "cast";
  let depth = 0;
  let hookX = W / 2;
  let holding = false;
  let score = 0;
  let lastReported = -1;
  let caught = 0;
  let launchTimer = 0;
  let launchScore = 0;
  let over = false;
  let taps: { x: number; y: number; t: number }[] = [];
  let entities: Entity[] = [];

  const spawnField = () => {
    entities = [];
    for (let i = 0; i < 9; i++) {
      entities.push({
        depth: rand(12, MAX_DEPTH - 4),
        x: rand(W * 0.15, W * 0.85),
        r: W * 0.032,
        hazard: false,
        gone: false,
        seed: rand(0, 10),
      });
    }
    for (let i = 0; i < 5; i++) {
      entities.push({
        depth: rand(15, MAX_DEPTH - 6),
        x: rand(W * 0.15, W * 0.85),
        r: W * 0.03,
        hazard: true,
        gone: false,
        seed: rand(0, 10),
      });
    }
  };

  const reset = () => {
    phase = "cast";
    depth = 0;
    hookX = W / 2;
    holding = false;
    score = 0;
    lastReported = -1;
    caught = 0;
    launchTimer = 0;
    launchScore = 0;
    over = false;
    taps = [];
    spawnField();
    ctx.onScore(0);
  };
  reset();

  const bankScore = (v: number) => {
    score += v;
    const rounded = Math.floor(score);
    if (rounded !== lastReported) {
      lastReported = rounded;
      ctx.onScore(rounded);
    }
  };

  const doTap = (x: number, y: number) => {
    launchScore += 3;
    taps.push({ x, y, t: 0 });
    ctx.haptic("hit");
  };

  const pointerPos = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const p = pointerPos(e);
    if (phase === "cast") {
      holding = true;
    } else if (phase === "launch") {
      doTap(p.x, p.y);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (phase !== "cast" || !holding) return;
    const p = pointerPos(e);
    hookX = clamp(p.x, W * 0.08, W * 0.92);
  };
  const onUp = () => {
    if (phase === "cast" && holding) {
      holding = false;
      phase = "reel";
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  let auto = false;
  let autoTargetDepth = MAX_DEPTH * 0.6;
  let autoTapCd = 0;
  let autoTapsLeft = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (phase === "cast") {
        if (auto) {
          holding = true;
          const nearest = entities
            .filter((f) => !f.hazard && !f.gone && f.depth > depth)
            .sort((a, b) => a.depth - b.depth)[0];
          if (nearest) hookX += clamp(nearest.x - hookX, -80, 80) * dt * 2;
        }
        if (holding) {
          depth += (14 + depth * 0.18) * dt;
          bankScore(dt * (1 + (depth / MAX_DEPTH) * 5));
          if (depth >= MAX_DEPTH) {
            depth = MAX_DEPTH;
            phase = "reel";
          }
          if (auto && depth >= autoTargetDepth) {
            holding = false;
            phase = "reel";
          }
        }
        for (const e of entities) {
          if (e.gone) continue;
          if (Math.abs(e.depth - depth) < 2.5 && Math.abs(e.x - hookX) < e.r + 14) {
            e.gone = true;
            if (e.hazard) {
              ctx.haptic("fail");
              phase = "reel";
            } else {
              caught += 1;
              bankScore(6 + (depth / MAX_DEPTH) * 10);
              ctx.haptic("hit");
            }
          }
        }
      } else if (phase === "reel") {
        depth -= 62 * dt;
        if (depth <= 0) {
          depth = 0;
          phase = "launch";
          launchTimer = 1.5;
          launchScore = 0;
          if (auto) {
            autoTapCd = 0.15;
            autoTapsLeft = Math.floor(rand(2, 5));
          }
        }
      } else if (phase === "launch") {
        launchTimer -= dt;
        if (auto) {
          autoTapCd -= dt;
          if (autoTapCd <= 0 && autoTapsLeft > 0) {
            doTap(hookX + rand(-20, 20), surfaceY);
            autoTapsLeft -= 1;
            autoTapCd = 0.22;
          }
        }
        if (launchTimer <= 0) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(Math.floor(score) + launchScore);
        }
      }
    }

    for (const tp of taps) tp.t += dt;
    taps = taps.filter((tp) => tp.t < 0.6);

    // water background
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, shade(pal.glow, 0.1));
    grad.addColorStop(0.25, pal.deep);
    grad.addColorStop(1, shade(pal.deep, -0.5));
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.glow, 0.3);
    g.fillRect(0, 0, W, surfaceY);

    // depth entities
    for (const e of entities) {
      if (e.gone) continue;
      const ey = depthToY(e.depth);
      if (ey < surfaceY - 10 || ey > floorY + 10) continue;
      g.beginPath();
      g.arc(e.x, ey, e.r, 0, Math.PI * 2);
      g.fillStyle = e.hazard ? pal.foe : pal.prize;
      g.fill();
      if (!e.hazard) {
        g.beginPath();
        g.moveTo(e.x - e.r, ey);
        g.lineTo(e.x - e.r * 1.7, ey - e.r * 0.5);
        g.lineTo(e.x - e.r * 1.7, ey + e.r * 0.5);
        g.closePath();
        g.fillStyle = shade(pal.prize, -0.2);
        g.fill();
      } else {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.beginPath();
          g.moveTo(e.x + Math.cos(a) * e.r, ey + Math.sin(a) * e.r);
          g.lineTo(
            e.x + Math.cos(a) * e.r * 1.5,
            ey + Math.sin(a) * e.r * 1.5
          );
          g.strokeStyle = shade(pal.foe, -0.2);
          g.lineWidth = 2;
          g.stroke();
        }
      }
    }

    // hook + line
    const hookY = depthToY(depth);
    g.strokeStyle = pal.hero;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(hookX, surfaceY);
    g.lineTo(hookX, hookY);
    g.stroke();
    g.beginPath();
    g.arc(hookX, hookY, W * 0.018, 0, Math.PI * 2);
    g.fillStyle = pal.hero;
    g.fill();

    // depth gauge
    const gaugeH = floorY - surfaceY;
    g.fillStyle = "rgba(255,255,255,.15)";
    g.fillRect(W * 0.03, surfaceY, 5, gaugeH);
    g.fillStyle = pal.hero;
    g.fillRect(W * 0.03, surfaceY, 5, (depth / MAX_DEPTH) * gaugeH);

    // launch taps burst
    for (const tp of taps) {
      const k = 1 - tp.t / 0.6;
      g.beginPath();
      g.arc(tp.x, tp.y - tp.t * 60, 6 + (1 - k) * 18, 0, Math.PI * 2);
      g.strokeStyle = shade(pal.glow, 0.2);
      g.globalAlpha = Math.max(0, k);
      g.lineWidth = 3;
      g.stroke();
      g.globalAlpha = 1;
    }

    if (phase === "launch" && !over) {
      g.textAlign = "center";
      g.fillStyle = t.ink;
      g.font = `800 20px ${t.fontDisplay}`;
      g.fillText("TAP TO LAUNCH!", W / 2, surfaceY - 14);
      g.textAlign = "left";
    }

    if (over) endCard(g, t, W, H, `HAULED ${caught}`);
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      if (on) {
        autoTargetDepth = MAX_DEPTH * rand(0.4, 0.9);
      } else {
        reset();
      }
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
