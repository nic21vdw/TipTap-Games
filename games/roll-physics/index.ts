import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "roll-physics",
  title: "Roll Physics",
  rule: "Drag to steer. Roll to the goal.",
  year: 2008,
  description: "A ball, a hill, a goal. Momentum does the rest.",
  history:
    "Homage to the 2008 tilt-physics rollers — one of the first tricks touchscreens learned to do well.",
  tags: ["precision", "calm"],
  palette: {
    hero: "#e76f51",
    foe: "#264653",
    prize: "#2a9d8f",
    deep: "#1d3557",
    glow: "#e9c46a",
  },
  intensity: 0.4,
  luck: 0.1,
  nostalgia: 0.8,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  let bx = 0;
  let by = 0;
  let vx = 0;
  let vy = 0;
  let steer = 0;
  let walls: Wall[] = [];
  let pit: Wall | null = null;
  let goal = { x: 0, y: 0, w: 0, h: 0 };
  let score = 0;
  let over = false;
  let level = 1;

  const buildLevel = () => {
    walls = [];
    for (let i = 0; i < 5; i++) {
      walls.push({
        x: rand(20, W - 80),
        y: rand(H * 0.2, H * 0.85),
        w: rand(40, 90),
        h: 14,
      });
    }
    pit = { x: rand(20, W - 80), y: rand(H * 0.3, H * 0.7), w: rand(50, 80), h: 40 };
    goal = { x: rand(40, W - 40), y: rand(H * 0.1, H * 0.25), w: 0, h: 0 };
  };

  const reset = () => {
    bx = W / 2;
    by = H * 0.9;
    vx = 0;
    vy = 0;
    score = 0;
    level = 1;
    over = false;
    buildLevel();
    ctx.onScore(0);
  };

  const onDown = (e: PointerEvent) => {
    if (over) reset();
  };
  const onMove = (e: PointerEvent) => {
    if (over) return;
    const r = ctx.canvas.getBoundingClientRect();
    steer = clamp((e.clientX - r.left - bx) / 80, -1, 1);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);

  reset();
  let auto = false;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();
    if (!over) {
      if (auto) steer = clamp((goal.x - bx) / 80, -1, 1);
      vx += steer * 260 * dt;
      vx *= 0.96;
      vy += 300 * dt;
      bx += vx * dt;
      by += vy * dt;

      for (const w of walls) {
        if (bx + 12 > w.x && bx - 12 < w.x + w.w && by + 12 > w.y && by - 12 < w.y + w.h && vy > 0) {
          by = w.y - 12;
          vy = -vy * 0.35;
        }
      }
      if (bx < 12) {
        bx = 12;
        vx *= -0.4;
      }
      if (bx > W - 12) {
        bx = W - 12;
        vx *= -0.4;
      }
      if (pit && bx > pit.x && bx < pit.x + pit.w && by > pit.y && by < pit.y + pit.h) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
      if (by > H + 30) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
      if (Math.hypot(bx - goal.x, by - goal.y) < 22) {
        score += 10 * level;
        level += 1;
        ctx.onScore(score);
        ctx.haptic("hit");
        bx = W / 2;
        by = H * 0.9;
        vx = 0;
        vy = 0;
        buildLevel();
      }
    }

    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);

    if (pit) {
      g.fillStyle = shade(pal.foe, -0.2);
      g.fillRect(pit.x, pit.y, pit.w, pit.h);
    }
    for (const w of walls) {
      g.fillStyle = pal.foe;
      g.fillRect(w.x, w.y, w.w, w.h);
    }
    g.fillStyle = pal.prize;
    g.beginPath();
    g.arc(goal.x, goal.y, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(pal.prize, 0.4);
    g.beginPath();
    g.arc(goal.x, goal.y, 9, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(bx, by, 12, 0, Math.PI * 2);
    g.fill();

    if (over) endCard(g, theme, W, H, "GAME OVER");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
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
