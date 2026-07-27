import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "cube-dodge",
  title: "Nic's Cube Dodge",
  rule: "Drag left or right to weave through the tunnel",
  year: 2008,
  description: "Endless tunnel, oncoming cubes, zero brakes.",
  history:
    "Homage to the 2008 wave of minimalist tunnel-runners that turned a handful of scaling squares into a genuine adrenaline spike.",
  tags: ["reflex", "drag", "endurance"],
  palette: {
    hero: "#ff006e",
    foe: "#8338ec",
    prize: "#ffbe0b",
    deep: "#0b0c1a",
    glow: "#3a86ff",
  },
  intensity: 0.85,
  luck: 0.1,
  nostalgia: 0.8,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

interface Cube {
  lane: number;
  z: number; // 1 = far, 0 = at player
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const LANES = 5;
  const laneX = (lane: number) => (W / (LANES + 1)) * (lane + 1);

  let playerX = laneX(2);
  let lastX = playerX;
  let targetX = playerX;
  let cubes: Cube[] = [];
  let score = 0;
  let over = false;
  let speed = 0.35; // z units per second
  let spawnT = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartPX = 0;

  const reset = () => {
    playerX = laneX(2);
    targetX = playerX;
    cubes = [];
    score = 0;
    speed = 0.35;
    spawnT = 0;
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
    dragStartPX = targetX;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const dx = posX(e) - dragStartX;
    targetX = Math.max(W * 0.08, Math.min(W * 0.92, dragStartPX + dx));
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

  const loop = makeLoop((dt, tt) => {
    const t = ctx.getTheme();
    if (!over) {
      speed = Math.min(1.1, speed + dt * 0.012);
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = Math.max(0.35, 0.85 - speed * 0.4);
        cubes.push({ lane: Math.floor(rand(0, LANES)), z: 1 });
      }
      for (const c of cubes) c.z -= speed * dt;
      // collision: cube reaches player plane
      for (const c of cubes) {
        if (c.z < 0.12 && c.z > -0.05) {
          const cx = laneX(c.lane);
          if (Math.abs(cx - playerX) < W / (LANES + 1) * 0.55) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          }
        }
      }
      const before = cubes.length;
      cubes = cubes.filter((c) => c.z > -0.08);
      const passed = before - cubes.length;
      if (passed > 0 && !over) {
        score += passed;
        ctx.onScore(score);
        ctx.haptic("light");
      }
      if (auto) {
        // steer to the lane with the farthest nearest cube
        const laneDanger = new Array(LANES).fill(2);
        for (const c of cubes) laneDanger[c.lane] = Math.min(laneDanger[c.lane], c.z);
        let best = 2;
        for (let l = 0; l < LANES; l++) if (laneDanger[l] > laneDanger[best]) best = l;
        targetX = laneX(best);
      }
      playerX += (targetX - playerX) * Math.min(1, dt * 10);
    }

    g.fillStyle = shade(pal.deep, -0.62);
    g.fillRect(0, 0, W, H);

    // perspective grid
    const horizon = H * 0.15;
    g.strokeStyle = shade(pal.deep, 0.4);
    g.lineWidth = 1;
    for (let l = 0; l <= LANES; l++) {
      const bottomX = (W / (LANES + 1)) * l;
      const topX = W / 2 + (bottomX - W / 2) * 0.08;
      g.beginPath();
      g.moveTo(topX, horizon);
      g.lineTo(bottomX, H);
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const z = 1 - i / 6;
      const y = horizon + (H - horizon) * (1 - z) * (1 - z);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.globalAlpha = 0.3;
      g.stroke();
      g.globalAlpha = 1;
    }

    // cubes, far to near
    const sorted = [...cubes].sort((a, b) => b.z - a.z);
    for (const c of sorted) {
      const z = Math.max(0.02, c.z);
      const y = horizon + (H - horizon) * (1 - z) * (1 - z);
      const scale = 1 - z;
      const size = 14 + scale * 70;
      const cx = W / 2 + (laneX(c.lane) - W / 2) * (0.1 + 0.9 * (1 - z));
      g.fillStyle = shade(pal.foe, -0.1 + scale * 0.3);
      roundRect(g, cx - size / 2, y - size / 2, size, size, size * 0.15);
      g.fill();
    }

    // player — he leans the way he is sliding, and the shades stay on
    const py = H * 0.88;
    drawNicHead(g, {
      x: playerX,
      y: py,
      r: 17,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.35),
      eye: t.ink,
      pupil: shade(pal.deep, -0.6),
      dark: shade(pal.deep, -0.6),
      tooth: t.ink,
      lean: clamp((playerX - lastX) * 0.02, -0.35, 0.35),
      gape: over ? 0.9 : 0,
      scowl: over ? 1 : 0,
    });
    lastX = playerX;
    g.fillStyle = pal.glow;
    g.fillRect(playerX - 20, py + 22, 40, 4);

    if (over) endCard(g, t, W, H, "CRASHED");
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
