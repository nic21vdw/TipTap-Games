import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "one-lane",
  title: "One Lane",
  rule: "Tap to flip lanes",
  year: 2012,
  description: "The endless-runner era, compressed into one tap.",
  history:
    "Homage to 2012's lane-runner boom — swipe-to-dodge commutes on a billion phones. Ours strips it to a single input and no mercy.",
  tags: ["endurance", "oneTap", "retro"],
  palette: {
    hero: "#f4a261",
    foe: "#e76f51",
    prize: "#e9c46a",
    deep: "#264653",
    glow: "#2a9d8f",
  },
  intensity: 0.65,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Ob {
  lane: 0 | 1;
  y: number;
  passed: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const laneX = [W * 0.32, W * 0.68];
  const py = H * 0.78;
  const size = 34;
  let lane: 0 | 1 = 0;
  let score = 0;
  let over = false;
  let obs: Ob[] = [];
  let spawnIn = 0.9;
  let speed = 260;
  let scroll = 0;

  const reset = () => {
    lane = 0;
    score = 0;
    over = false;
    obs = [];
    spawnIn = 0.9;
    speed = 260;
    ctx.onScore(0);
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    lane = lane === 0 ? 1 : 0;
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: flip out of the lane an obstacle is closing on
      if (auto) {
        for (const o of obs) {
          const dist = py - o.y;
          if (o.lane === lane && dist > 0 && dist < size * 5) {
            const otherBlocked = obs.some(
              (x) => x.lane !== lane && Math.abs(py - x.y) < size * 3
            );
            if (!otherBlocked) lane = lane === 0 ? 1 : 0;
            break;
          }
        }
      }
      scroll = (scroll + speed * dt) % 48;
      spawnIn -= dt;
      speed = Math.min(560, speed + dt * 11);
      if (spawnIn <= 0) {
        obs.push({ lane: Math.random() < 0.5 ? 0 : 1, y: -50, passed: false });
        spawnIn = Math.max(0.42, 0.95 - score * 0.006);
      }
      for (let i = obs.length - 1; i >= 0; i--) {
        const o = obs[i];
        o.y += speed * dt;
        if (!o.passed && o.y > py + size) {
          o.passed = true;
          score += 1;
          ctx.onScore(score);
        }
        if (o.y > H + 80) obs.splice(i, 1);
        if (o.lane === lane && Math.abs(o.y - py) < size * 0.95) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score, "CRASHED");
        }
      }
    }

    const ground = g.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, shade(pal.deep, -0.15));
    ground.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);

    // dashed centre line, scrolling
    g.fillStyle = t.surface;
    for (let y = -48 + scroll; y < H; y += 48) {
      g.fillRect(W / 2 - 3, y, 6, 26);
    }
    // lane edges
    g.fillRect(W * 0.14, 0, 4, H);
    g.fillRect(W * 0.86 - 4, 0, 4, H);

    for (const o of obs) {
      g.fillStyle = pal.foe;
      g.fillRect(laneX[o.lane] - size / 2, o.y - size / 2, size, size);
    }

    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    const x = laneX[lane];
    g.moveTo(x, py - size * 0.7);
    g.lineTo(x + size * 0.55, py + size * 0.55);
    g.lineTo(x - size * 0.55, py + size * 0.55);
    g.closePath();
    g.fill();

    if (over) {
      endCard(g, t, W, H, "CRASHED");
    }
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
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
