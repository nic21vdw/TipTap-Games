import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "ghost-race",
  title: "Racing Ghost Nic",
  rule: "Steer the loop, don't hit your own ghost",
  year: 2015,
  description: "Every lap you race your own last lap. Literally.",
  history:
    "Homage to the 2015 top-down racers that recorded your run and replayed it as a ghost, turning every race into a duel with yourself.",
  tags: ["precision", "drag", "memory"],
  palette: {
    hero: "#4361ee",
    foe: "#ef233c",
    prize: "#ffd60a",
    deep: "#03071e",
    glow: "#48cae4",
  },
  intensity: 0.55,
  luck: 0.05,
  nostalgia: 0.4,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

interface Pt {
  x: number;
  y: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const cx = W / 2;
  const cy = H / 2;
  const rx = W * 0.36;
  const ry = H * 0.32;

  const trackAngle = (a: number): Pt => ({
    x: cx + Math.cos(a) * rx,
    y: cy + Math.sin(a) * ry,
  });

  let angle = -Math.PI / 2;
  let offsetR = 0; // radial offset from centerline, steered by drag
  let targetOffset = 0;
  let speedA = 0.9; // radians/sec
  let lap = 0;
  let score = 0;
  let over = false;
  let ghosts: Pt[][] = [];
  let currentTrail: Pt[] = [];
  let recordCd = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartOffset = 0;

  const carPos = (): Pt => {
    const base = trackAngle(angle);
    const nx = Math.cos(angle);
    const ny = (Math.sin(angle) * rx) / ry;
    const nlen = Math.hypot(nx, ny) || 1;
    return { x: base.x + (nx / nlen) * offsetR, y: base.y + (ny / nlen) * offsetR };
  };

  const reset = () => {
    angle = -Math.PI / 2;
    offsetR = 0;
    targetOffset = 0;
    speedA = 0.9;
    lap = 0;
    score = 0;
    ghosts = [];
    currentTrail = [];
    over = false;
    ctx.onScore(0);
  };

  const posX = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return e.clientX - r.left;
  };
  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    dragging = true;
    dragStartX = posX(e);
    dragStartOffset = targetOffset;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const dx = posX(e) - dragStartX;
    targetOffset = Math.max(-40, Math.min(40, dragStartOffset + dx * 0.4));
  };
  const onUp = () => {
    dragging = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;
  let autoT = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      if (auto) {
        autoT += dt;
        targetOffset = Math.sin(autoT * 1.3) * 20;
      }
      offsetR += (targetOffset - offsetR) * Math.min(1, dt * 6);
      angle += speedA * dt;
      speedA = Math.min(1.6, speedA + dt * 0.01);

      recordCd -= dt;
      if (recordCd <= 0) {
        currentTrail.push(carPos());
        recordCd = 0.05;
      }

      if (angle > -Math.PI / 2 + Math.PI * 2) {
        angle -= Math.PI * 2;
        lap += 1;
        score = lap;
        ctx.onScore(score);
        ctx.haptic("light");
        ghosts.push(currentTrail);
        if (ghosts.length > 3) ghosts.shift();
        currentTrail = [];
      }

      const pos = carPos();
      for (const trail of ghosts) {
        for (const gp of trail) {
          if (Math.hypot(gp.x - pos.x, gp.y - pos.y) < 12) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
            break;
          }
        }
        if (over) break;
      }
    }

    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    // track ellipse ring
    g.strokeStyle = shade(pal.deep, 0.4);
    g.lineWidth = 34;
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,.15)";
    g.lineWidth = 2;
    g.setLineDash([8, 10]);
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);

    // ghosts
    for (let gi = 0; gi < ghosts.length; gi++) {
      const alpha = 0.15 + gi * 0.12;
      g.fillStyle = `rgba(239,35,60,${alpha})`;
      for (const p of ghosts[gi]) {
        g.beginPath();
        g.arc(p.x, p.y, 6, 0, Math.PI * 2);
        g.fill();
      }
    }

    const pos = carPos();
    drawNicHead(g, {
      x: pos.x,
      y: pos.y,
      r: 9,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      scowl: 0.5,
      gape: over ? 0.9 : 0,
    });

    g.fillStyle = t.ink;
    g.font = `700 14px ${t.fontBody}`;
    g.fillText(`lap ${lap}`, 14, 26);

    if (over) endCard(g, t, W, H, "GHOSTED");
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
      auto = on;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
