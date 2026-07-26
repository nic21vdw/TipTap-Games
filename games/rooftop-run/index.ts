import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "rooftop-run",
  title: "Nic's Rooftop Run",
  rule: "Tap to jump the gap. Timing is everything.",
  year: 2009,
  description: "Auto-runner across the skyline. One tap decides it all.",
  history:
    "Homage to the 2009 one-button endless runners that put a whole game onto a single tap — sprint, leap the gap, or fall between the buildings.",
  tags: ["reflex", "oneTap", "endurance"],
  palette: {
    hero: "#f4d35e",
    foe: "#ee6c4d",
    prize: "#90f1ef",
    deep: "#1a1a2e",
    glow: "#c9184a",
  },
  intensity: 0.6,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

interface Building {
  x: number;
  w: number;
  h: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const baseline = H * 0.78;
  const runX = W * 0.3;
  const heroR = W * 0.038;

  let buildings: Building[] = [];
  let scrollX = 0;
  let speed = 0;
  const baseSpeed = W * 0.34;

  let heroY = 0; // offset above current building top, 0 = grounded
  let vy = 0;
  let airborne = false;
  let score = 0;
  let over = false;
  let elapsed = 0;

  const GRAV = H * 4.6;
  const JUMP_V = -H * 1.9;

  const spawnBuilding = (fromX: number) => {
    const w = W * (0.32 + Math.random() * 0.22);
    const h = H * (0.14 + Math.random() * 0.16);
    const gap = W * (0.14 + Math.random() * 0.16);
    buildings.push({ x: fromX + gap, w, h });
  };

  const reset = () => {
    scrollX = 0;
    speed = baseSpeed;
    heroY = 0;
    vy = 0;
    airborne = false;
    score = 0;
    over = false;
    elapsed = 0;
    buildings = [{ x: 0, w: W * 1.2, h: H * 0.2 }];
    let x = buildings[0].x + buildings[0].w;
    for (let i = 0; i < 8; i++) {
      spawnBuilding(x);
      x = buildings[buildings.length - 1].x + buildings[buildings.length - 1].w;
    }
    ctx.onScore(0);
  };

  const currentBuilding = (): Building | undefined => {
    const rx = scrollX + runX;
    for (const b of buildings) {
      if (rx >= b.x && rx <= b.x + b.w) return b;
    }
    return undefined;
  };

  const doJump = () => {
    if (airborne || over) return;
    airborne = true;
    vy = JUMP_V;
    ctx.haptic("light");
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    doJump();
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      elapsed += dt;
      speed = baseSpeed + Math.min(W * 0.55, elapsed * W * 0.012);

      if (auto) {
        // greedy: jump a bit before the edge of the current building
        const b = currentBuilding();
        if (b && !airborne) {
          const distToEdge = b.x + b.w - (scrollX + runX);
          if (distToEdge < W * 0.16) doJump();
        }
      }

      if (airborne) {
        vy += GRAV * dt;
        heroY += vy * dt;
      }

      scrollX += speed * dt;
      score = Math.floor(scrollX / (W * 0.12));
      ctx.onScore(score);

      const b = currentBuilding();
      if (airborne && heroY >= 0) {
        // landing check: only lands if there's a building under runX now
        if (b) {
          heroY = 0;
          vy = 0;
          airborne = false;
        } else if (heroY > H) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
      } else if (!airborne && !b) {
        // walked off an edge without jumping (shouldn't normally happen, safety)
        airborne = true;
        vy = 0;
      }

      while (buildings.length && buildings[0].x + buildings[0].w < scrollX - W * 0.3)
        buildings.shift();
      while (buildings.length < 8) {
        const last = buildings[buildings.length - 1];
        spawnBuilding(last.x + last.w);
      }
    }

    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.15));
    sky.addColorStop(1, shade(pal.deep, -0.5));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // moon / glow
    g.fillStyle = pal.glow;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.arc(W * 0.82, H * 0.16, W * 0.07, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;

    // buildings
    for (const b of buildings) {
      const bx = b.x - scrollX;
      if (bx + b.w < 0 || bx > W) continue;
      g.fillStyle = shade(pal.deep, 0.05);
      g.fillRect(bx, baseline - b.h, b.w, b.h + H);
      g.fillStyle = pal.prize;
      g.globalAlpha = 0.5;
      for (let wx = bx + 6; wx < bx + b.w - 6; wx += 14) {
        for (let wy = baseline - b.h + 8; wy < baseline - 6; wy += 16) {
          if (Math.random() < 0.002) continue;
          g.fillRect(wx, wy, 5, 7);
        }
      }
      g.globalAlpha = 1;
      g.fillStyle = pal.hero;
      g.fillRect(bx, baseline - b.h, b.w, 3);
    }

    // hero
    const hx = runX;
    const hy = baseline - heroR - heroY;
    g.fillStyle = over ? pal.foe : pal.hero;
    roundRect(g, hx - heroR, hy - heroR, heroR * 2, heroR * 2, heroR * 0.4);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.6)";
    g.beginPath();
    g.arc(hx - heroR * 0.3, hy - heroR * 0.4, heroR * 0.25, 0, Math.PI * 2);
    g.fill();

    if (over) endCard(g, t, W, H, "GAME OVER");
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
