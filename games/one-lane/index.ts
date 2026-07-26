import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawCan, drawFoot, drawRoom, skins } from "@/games/nic-art";

const meta = {
  slug: "one-lane",
  title: "Basement Run",
  rule: "Tap to switch sides",
  year: 2012,
  description: "The endless-runner era, compressed into one basement.",
  history:
    "Homage to 2012's lane-runner boom — swipe-to-dodge commutes on a billion phones. Ours strips it to a single input, bare feet, and no mercy.",
  tags: ["endurance", "oneTap", "retro"],
  palette: {
    hero: "#e8b48c",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#1f6fd0",
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
          ctx.onRunEnd(score);
        }
      }
    }

    drawRoom(g, W, H, pal.deep, pal.glow);
    const sk = skins(pal);

    // floorboards running under you, scrolling
    g.fillStyle = t.surface;
    for (let y = -48 + scroll; y < H; y += 48) {
      g.fillRect(W * 0.14, y, W * 0.72, 3);
    }
    // the cable run taped down the middle of the floor
    g.fillStyle = shade(pal.glow, -0.2);
    for (let y = -48 + scroll; y < H; y += 48) {
      g.fillRect(W / 2 - 3, y, 6, 26);
    }
    // skirting boards
    g.fillStyle = t.surface;
    g.fillRect(W * 0.14, 0, 4, H);
    g.fillRect(W * 0.86 - 4, 0, 4, H);

    // the empties you left on the floor at 3am
    for (const o of obs) {
      const kind = o.lane === 0 ? "cola" : "energy";
      drawCan(g, laneX[o.lane], o.y, size * 0.72, size * 1.1, sk[kind], kind);
    }

    // you, barefoot, mid-stride
    const x = laneX[lane];
    const stride = Math.sin(scroll * 0.22) * size * 0.12;
    drawFoot(
      g,
      x,
      py + stride,
      size * 1.15,
      -Math.PI / 2,
      over ? pal.foe : pal.hero,
      shade(pal.hero, 0.35)
    );

    if (over) {
      endCard(g, t, W, H, "STUBBED IT");
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
