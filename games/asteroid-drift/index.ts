import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "asteroid-drift",
  title: "Asteroid Drift",
  rule: "Drag to rotate and thrust. Shoot what drifts.",
  year: 1979,
  description: "Momentum keeps going even after you let go.",
  history:
    "Homage to the vector-graphics arcade classic — no friction in space, and none in the controls either.",
  tags: ["reflex", "chaos"],
  palette: {
    hero: "#e0e1dd",
    foe: "#778da9",
    prize: "#ffb703",
    deep: "#0d1b2a",
    glow: "#415a77",
  },
  intensity: 0.6,
  luck: 0.1,
  nostalgia: 1.0,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  let ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
  let rocks: Rock[] = [];
  let shots: Shot[] = [];
  let score = 0;
  let over = false;
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let fireCd = 0;

  const wrap = (v: number, max: number) => (v < 0 ? v + max : v > max ? v - max : v);

  const spawnRock = (x?: number, y?: number, size = 3) => {
    rocks.push({
      x: x ?? rand(0, W),
      y: y ?? rand(0, H),
      vx: rand(-60, 60),
      vy: rand(-60, 60),
      r: size * 14,
    });
  };

  const reset = () => {
    ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
    rocks = [];
    shots = [];
    score = 0;
    over = false;
    for (let i = 0; i < 5; i++) spawnRock();
    ctx.onScore(0);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    dragging = true;
    dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    ship.angle = Math.atan2(y - ship.y, x - ship.x);
    const dist = Math.hypot(x - ship.x, y - ship.y);
    if (dist > 30) {
      ship.vx += Math.cos(ship.angle) * 120 * (1 / 30);
      ship.vy += Math.sin(ship.angle) * 120 * (1 / 30);
    }
  };
  const onUp = () => {
    dragging = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();
  let auto = false;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();
    if (!over) {
      fireCd -= dt;
      if ((dragging || auto) && fireCd <= 0) {
        shots.push({ x: ship.x, y: ship.y, vx: Math.cos(ship.angle) * 420, vy: Math.sin(ship.angle) * 420, t: 1.2 });
        fireCd = 0.25;
      }
      if (auto) {
        const nearest = rocks.reduce<Rock | null>((best, r) => {
          const d = Math.hypot(r.x - ship.x, r.y - ship.y);
          return !best || d < Math.hypot(best.x - ship.x, best.y - ship.y) ? r : best;
        }, null);
        if (nearest) {
          ship.angle = Math.atan2(nearest.y - ship.y, nearest.x - ship.x);
          ship.vx += Math.cos(ship.angle) * 60 * dt;
          ship.vy += Math.sin(ship.angle) * 60 * dt;
        }
      }
      ship.vx *= 0.995;
      ship.vy *= 0.995;
      ship.x = wrap(ship.x + ship.vx * dt, W);
      ship.y = wrap(ship.y + ship.vy * dt, H);

      for (const rk of rocks) {
        rk.x = wrap(rk.x + rk.vx * dt, W);
        rk.y = wrap(rk.y + rk.vy * dt, H);
        if (Math.hypot(rk.x - ship.x, rk.y - ship.y) < rk.r + 8) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
      }

      shots = shots.filter((s) => (s.t -= dt) > 0);
      for (const s of shots) {
        s.x = wrap(s.x + s.vx * dt, W);
        s.y = wrap(s.y + s.vy * dt, H);
      }

      const newRocks: Rock[] = [];
      rocks = rocks.filter((rk) => {
        const hitShot = shots.find((s) => Math.hypot(s.x - rk.x, s.y - rk.y) < rk.r);
        if (hitShot) {
          hitShot.t = 0;
          score += 5;
          ctx.onScore(score);
          ctx.haptic("hit");
          if (rk.r > 16) {
            for (let i = 0; i < 2; i++)
              newRocks.push({ x: rk.x, y: rk.y, vx: rand(-80, 80), vy: rand(-80, 80), r: rk.r * 0.6 });
          }
          return false;
        }
        return true;
      });
      rocks.push(...newRocks);
      if (rocks.length === 0) for (let i = 0; i < 5; i++) spawnRock();
    }

    g.fillStyle = shade(pal.deep, -0.35);
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = "rgba(255,255,255,.06)";
      g.beginPath();
      g.arc((i * 97) % W, (i * 61) % H, 1.5, 0, Math.PI * 2);
      g.fill();
    }

    for (const rk of rocks) {
      g.strokeStyle = pal.foe;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(rk.x, rk.y, rk.r, 0, Math.PI * 2);
      g.stroke();
    }
    for (const s of shots) {
      g.fillStyle = pal.prize;
      g.beginPath();
      g.arc(s.x, s.y, 3, 0, Math.PI * 2);
      g.fill();
    }

    g.save();
    g.translate(ship.x, ship.y);
    g.rotate(ship.angle);
    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.moveTo(14, 0);
    g.lineTo(-10, 9);
    g.lineTo(-6, 0);
    g.lineTo(-10, -9);
    g.closePath();
    g.fill();
    g.restore();

    if (over) endCard(g, theme, W, H, "COLLISION");
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
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
