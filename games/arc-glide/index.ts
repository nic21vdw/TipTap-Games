import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "arc-glide",
  title: "Arc Glide",
  rule: "Hold to rise, release to arc down through gaps",
  year: 2011,
  description: "Hold, glide, weave, collect. Repeat forever.",
  history:
    "Homage to the 2011 one-button flap-and-fall craze that turned a single hold gesture into a merciless test of rhythm.",
  tags: ["hold", "reflex", "calm"],
  palette: {
    hero: "#06ffa5",
    foe: "#ff5400",
    prize: "#ffd23f",
    deep: "#001524",
    glow: "#00b4d8",
  },
  intensity: 0.6,
  luck: 0.15,
  nostalgia: 0.6,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Obstacle {
  x: number;
  gapY: number;
  gapH: number;
  passed: boolean;
}
interface Orb {
  x: number;
  y: number;
  taken: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const px = W * 0.28;

  let py = H * 0.5;
  let vy = 0;
  let holding = false;
  let obstacles: Obstacle[] = [];
  let orbs: Orb[] = [];
  let score = 0;
  let over = false;
  let speed = 130;
  let spawnX = W;

  const reset = () => {
    py = H * 0.5;
    vy = 0;
    holding = false;
    speed = 130;
    obstacles = [];
    orbs = [];
    spawnX = W + 60;
    for (let i = 0; i < 4; i++) {
      const gapY = rand(H * 0.2, H * 0.7);
      obstacles.push({ x: spawnX + i * 220, gapY, gapH: H * 0.28, passed: false });
      orbs.push({ x: spawnX + i * 220 + 110, y: gapY, taken: false });
    }
    score = 0;
    over = false;
    ctx.onScore(0);
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    holding = true;
  };
  const onUp = () => {
    holding = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      speed = Math.min(320, speed + dt * 3);

      if (auto) {
        const next = obstacles.find((o) => o.x + px > px - 10);
        holding = next ? py > next.gapY : false;
      }

      vy += (holding ? -560 : 620) * dt;
      vy = Math.max(-260, Math.min(420, vy));
      py += vy * dt;

      if (py < 10) {
        py = 10;
        vy = 0;
      }
      if (py > H - 10) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }

      for (const o of obstacles) o.x -= speed * dt;
      for (const orb of orbs) orb.x -= speed * dt;

      for (const o of obstacles) {
        if (Math.abs(o.x - px) < 20) {
          if (py < o.gapY - o.gapH / 2 || py > o.gapY + o.gapH / 2) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          }
        }
        if (!o.passed && o.x + 20 < px) {
          o.passed = true;
          score += 1;
          ctx.onScore(score);
          ctx.haptic("light");
        }
      }
      for (const orb of orbs) {
        if (!orb.taken && Math.hypot(orb.x - px, orb.y - py) < 18) {
          orb.taken = true;
          score += 2;
          ctx.onScore(score);
          ctx.haptic("hit");
        }
      }

      if (obstacles.length && obstacles[0].x < -80) {
        obstacles.shift();
        orbs.shift();
        const lastX = obstacles.length ? obstacles[obstacles.length - 1].x : W;
        const gapY = rand(H * 0.2, H * 0.7);
        const gapH = Math.max(H * 0.2, H * 0.28 - score * 0.6);
        obstacles.push({ x: lastX + 220, gapY, gapH, passed: false });
        orbs.push({ x: lastX + 330, y: gapY, taken: false });
      }
    }

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, shade(pal.deep, 0.1));
    bg.addColorStop(1, shade(pal.deep, -0.4));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    for (const o of obstacles) {
      g.fillStyle = pal.foe;
      g.fillRect(o.x - 18, 0, 36, o.gapY - o.gapH / 2);
      g.fillRect(o.x - 18, o.gapY + o.gapH / 2, 36, H - (o.gapY + o.gapH / 2));
    }
    for (const orb of orbs) {
      if (orb.taken) continue;
      g.fillStyle = pal.prize;
      g.beginPath();
      g.arc(orb.x, orb.y, 8, 0, Math.PI * 2);
      g.fill();
    }

    // trail
    g.strokeStyle = pal.glow;
    g.globalAlpha = 0.5;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(px - 20, py + 4);
    g.lineTo(px - 34, py - vy * 0.02);
    g.stroke();
    g.globalAlpha = 1;

    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(px, py, 13, 0, Math.PI * 2);
    g.fill();

    if (over) endCard(g, t, W, H, "CRASHED");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
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
