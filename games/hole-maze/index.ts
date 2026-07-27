import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "hole-maze",
  title: "Nic's Hole Maze",
  rule: "Drag to tilt the board. Reach the goal hole.",
  year: 2008,
  description: "Tilt, roll, don't fall in the wrong hole.",
  history:
    "Homage to the 2008 wooden-board tilt toy reborn on a touchscreen — steer a ball through pitfalls using nothing but gravity and nerve.",
  tags: ["precision", "drag", "calm"],
  palette: {
    hero: "#e07a5f",
    foe: "#3d405b",
    prize: "#81b29a",
    deep: "#1b1f3b",
    glow: "#f2cc8f",
  },
  intensity: 0.4,
  luck: 0.15,
  nostalgia: 0.8,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Hole {
  x: number;
  y: number;
  r: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const BR = Math.min(W, H) * 0.028;
  const ACC = 700;

  let ball = { x: 0, y: 0, vx: 0, vy: 0 };
  let start = { x: 0, y: 0 };
  let walls: Rect[] = [];
  let hazards: Hole[] = [];
  let goal: Hole = { x: 0, y: 0, r: BR * 2 };
  let level = 1;
  let score = 0;
  let over = false;

  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let tiltX = 0;
  let tiltY = 0;

  const genMaze = () => {
    start = { x: W * 0.5, y: H * 0.12 };
    ball = { x: start.x, y: start.y, vx: 0, vy: 0 };
    goal = { x: rand(W * 0.2, W * 0.8), y: H * 0.88, r: BR * 2.1 };
    walls = [];
    const wallCount = 2 + Math.min(level, 6);
    for (let i = 0; i < wallCount; i++) {
      const horiz = Math.random() < 0.5;
      if (horiz) {
        const wlen = rand(W * 0.25, W * 0.55);
        walls.push({
          x: rand(0, W - wlen),
          y: rand(H * 0.25, H * 0.75),
          w: wlen,
          h: 10,
        });
      } else {
        const hlen = rand(H * 0.15, H * 0.3);
        walls.push({
          x: rand(0, W - 10),
          y: rand(H * 0.2, H * 0.7),
          w: 10,
          h: hlen,
        });
      }
    }
    hazards = [];
    const hazardCount = 2 + Math.min(level, 5);
    for (let i = 0; i < hazardCount; i++) {
      const hx = rand(W * 0.15, W * 0.85);
      const hy = rand(H * 0.3, H * 0.75);
      if (Math.hypot(hx - goal.x, hy - goal.y) < BR * 6) continue;
      if (Math.hypot(hx - start.x, hy - start.y) < BR * 6) continue;
      hazards.push({ x: hx, y: hy, r: BR * 1.4 });
    }
  };

  const reset = () => {
    level = 1;
    score = 0;
    over = false;
    ctx.onScore(0);
    genMaze();
  };

  const posInCanvas = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    dragging = true;
    dragStart = posInCanvas(e);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const p = posInCanvas(e);
    tiltX = Math.max(-1, Math.min(1, (p.x - dragStart.x) / 70));
    tiltY = Math.max(-1, Math.min(1, (p.y - dragStart.y) / 70));
  };
  const onUp = () => {
    dragging = false;
    tiltX = 0;
    tiltY = 0;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;

  const circleRectPush = (b: typeof ball, rect: Rect) => {
    const cx = Math.max(rect.x, Math.min(b.x, rect.x + rect.w));
    const cy = Math.max(rect.y, Math.min(b.y, rect.y + rect.h));
    const dx = b.x - cx;
    const dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < BR && d > 0.0001) {
      const nx = dx / d;
      const ny = dy / d;
      b.x = cx + nx * BR;
      b.y = cy + ny * BR;
      const vn = b.vx * nx + b.vy * ny;
      b.vx -= 2 * vn * nx * 0.5;
      b.vy -= 2 * vn * ny * 0.5;
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      if (auto) {
        tiltX = Math.max(-1, Math.min(1, (goal.x - ball.x) / 100));
        tiltY = Math.max(-1, Math.min(1, (goal.y - ball.y) / 100));
      }
      ball.vx += tiltX * ACC * dt;
      ball.vy += tiltY * ACC * dt;
      ball.vx *= 0.985;
      ball.vy *= 0.985;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.x < BR) {
        ball.x = BR;
        ball.vx *= -0.4;
      }
      if (ball.x > W - BR) {
        ball.x = W - BR;
        ball.vx *= -0.4;
      }
      if (ball.y < BR) {
        ball.y = BR;
        ball.vy *= -0.4;
      }
      if (ball.y > H - BR) {
        ball.y = H - BR;
        ball.vy *= -0.4;
      }
      for (const w of walls) circleRectPush(ball, w);

      for (const h of hazards) {
        if (Math.hypot(ball.x - h.x, ball.y - h.y) < h.r * 0.6) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
          break;
        }
      }
      if (!over && Math.hypot(ball.x - goal.x, ball.y - goal.y) < goal.r * 0.6) {
        score += 1;
        level += 1;
        ctx.onScore(score);
        ctx.haptic("hit");
        genMaze();
      }
    }

    g.fillStyle = shade(pal.deep, -0.62);
    g.fillRect(0, 0, W, H);

    for (const w of walls) {
      g.fillStyle = shade(pal.deep, 0.3);
      roundRect(g, w.x, w.y, w.w, w.h, 4);
      g.fill();
    }

    for (const h of hazards) {
      const grd = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
      grd.addColorStop(0, "#000");
      grd.addColorStop(1, shade(pal.foe, -0.2));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      g.fill();
    }

    const ggrd = g.createRadialGradient(goal.x, goal.y, 0, goal.x, goal.y, goal.r);
    ggrd.addColorStop(0, pal.glow);
    ggrd.addColorStop(1, pal.prize);
    g.fillStyle = ggrd;
    g.beginPath();
    g.arc(goal.x, goal.y, goal.r, 0, Math.PI * 2);
    g.fill();

    drawNicHead(g, {
      x: ball.x,
      y: ball.y,
      r: BR,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      gape: over ? 0.9 : 0,
      scowl: over ? 1 : 0,
    });

    if (over) endCard(g, t, W, H, "IN THE HOLE");
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
