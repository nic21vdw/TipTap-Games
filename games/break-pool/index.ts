import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "break-pool",
  title: "Nic's Break Pool",
  rule: "Drag back from the cue ball, release to shoot",
  year: 2010,
  description: "Pull back, let go, pot the rack. Don't sink the cue.",
  history:
    "Homage to the 2010 touchscreen pool craze that turned bar tables into a one-thumb drag-and-release ritual on every phone.",
  tags: ["precision", "drag", "calm"],
  palette: {
    hero: "#f4f1de",
    foe: "#e63946",
    prize: "#ffb703",
    deep: "#1b4332",
    glow: "#2a9d8f",
  },
  intensity: 0.35,
  luck: 0.1,
  nostalgia: 0.8,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  cue: boolean;
  potted: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const tableL = W * 0.08;
  const tableR = W * 0.92;
  const tableT = H * 0.045;
  const tableB = H * 0.955;
  const midX = (tableL + tableR) / 2;
  const ballR = W * 0.026;
  const pocketR = W * 0.05;

  const pockets = [
    { x: tableL, y: tableT },
    { x: midX, y: tableT },
    { x: tableR, y: tableT },
    { x: tableL, y: tableB },
    { x: midX, y: tableB },
    { x: tableR, y: tableB },
  ];

  const objectColors = [
    pal.prize,
    shade(pal.foe, 0.2),
    pal.foe,
    shade(pal.glow, -0.15),
    pal.glow,
    shade(pal.prize, -0.3),
  ];

  let balls: Ball[] = [];
  let score = 0;
  let over = false;
  let aiming = false;
  let dragCur = { x: 0, y: 0 };
  let auto = false;
  let autoCd = 0;

  const rack = () => {
    balls = [];
    balls.push({
      x: tableL + (tableR - tableL) * 0.24,
      y: (tableT + tableB) / 2,
      vx: 0,
      vy: 0,
      r: ballR,
      color: pal.hero,
      cue: true,
      potted: false,
    });
    const apexX = tableL + (tableR - tableL) * 0.66;
    const apexY = (tableT + tableB) / 2;
    let idx = 0;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i <= row; i++) {
        if (idx >= objectColors.length) break;
        balls.push({
          x: apexX + row * ballR * 1.8,
          y: apexY + (i - row / 2) * ballR * 2.05,
          vx: 0,
          vy: 0,
          r: ballR,
          color: objectColors[idx],
          cue: false,
          potted: false,
        });
        idx++;
      }
    }
  };

  const reset = () => {
    rack();
    score = 0;
    over = false;
    aiming = false;
    ctx.onScore(0);
  };
  reset();

  const cueBall = () => balls.find((b) => b.cue && !b.potted);

  const anyMoving = () =>
    balls.some((b) => !b.potted && Math.hypot(b.vx, b.vy) > 4);

  const shoot = (dirx: number, diry: number, power: number) => {
    const cue = cueBall();
    if (!cue) return;
    const len = Math.hypot(dirx, diry) || 1;
    cue.vx = (dirx / len) * power;
    cue.vy = (diry / len) * power;
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
    if (anyMoving()) return;
    const p = pointerPos(e);
    dragCur = p;
    aiming = true;
  };
  const onMove = (e: PointerEvent) => {
    if (!aiming) return;
    dragCur = pointerPos(e);
  };
  const onUp = () => {
    if (!aiming) return;
    aiming = false;
    const cue = cueBall();
    if (!cue) return;
    const dx = cue.x - dragCur.x;
    const dy = cue.y - dragCur.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 6) return;
    const power = Math.min(620, dist * 5.2);
    shoot(dx, dy, power);
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  const step = (dt: number) => {
    for (const b of balls) {
      if (b.potted) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 0) {
        const dec = Math.min(speed, 230 * dt);
        const k = (speed - dec) / speed;
        b.vx *= k;
        b.vy *= k;
      }
    }

    // pockets
    for (const b of balls) {
      if (b.potted) continue;
      for (const p of pockets) {
        if (Math.hypot(b.x - p.x, b.y - p.y) < pocketR * 0.6) {
          b.potted = true;
          b.vx = 0;
          b.vy = 0;
          if (b.cue) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          } else {
            score += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
          }
          break;
        }
      }
    }

    // cushions
    for (const b of balls) {
      if (b.potted) continue;
      if (b.x - b.r < tableL) {
        b.x = tableL + b.r;
        b.vx = -b.vx * 0.82;
      }
      if (b.x + b.r > tableR) {
        b.x = tableR - b.r;
        b.vx = -b.vx * 0.82;
      }
      if (b.y - b.r < tableT) {
        b.y = tableT + b.r;
        b.vy = -b.vy * 0.82;
      }
      if (b.y + b.r > tableB) {
        b.y = tableB - b.r;
        b.vy = -b.vy * 0.82;
      }
    }

    // ball-ball collisions
    for (let i = 0; i < balls.length; i++) {
      if (balls[i].potted) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const b = balls[j];
        if (b.potted) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const minDist = a.r + b.r;
        if (dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = (minDist - dist) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          const avx = a.vx;
          const avy = a.vy;
          const bvx = b.vx;
          const bvy = b.vy;
          const aDot = avx * nx + avy * ny;
          const bDot = bvx * nx + bvy * ny;
          a.vx += (bDot - aDot) * nx;
          a.vy += (bDot - aDot) * ny;
          b.vx += (aDot - bDot) * nx;
          b.vy += (aDot - bDot) * ny;
        }
      }
    }

    // table cleared -> new rack, keep score
    if (!over && balls.filter((b) => !b.cue && !b.potted).length === 0) {
      const keepScore = score;
      rack();
      score = keepScore;
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      step(Math.min(dt, 1 / 30));
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0 && !anyMoving()) {
          const cue = cueBall();
          const target = balls
            .filter((b) => !b.cue && !b.potted)
            .sort(
              (a, b) =>
                Math.hypot(a.x - (cue?.x ?? 0), a.y - (cue?.y ?? 0)) -
                Math.hypot(b.x - (cue?.x ?? 0), b.y - (cue?.y ?? 0))
            )[0];
          if (cue && target) {
            let nearestPocket = pockets[0];
            let best = Infinity;
            for (const p of pockets) {
              const d = Math.hypot(target.x - p.x, target.y - p.y);
              if (d < best) {
                best = d;
                nearestPocket = p;
              }
            }
            const aimx = target.x + (target.x - nearestPocket.x) * 0.15 - cue.x;
            const aimy = target.y + (target.y - nearestPocket.y) * 0.15 - cue.y;
            shoot(aimx, aimy, 380 + Math.random() * 140);
          }
          autoCd = 1.3;
        }
      }
    }

    // felt background
    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);
    g.fillStyle = pal.deep;
    g.fillRect(tableL, tableT, tableR - tableL, tableB - tableT);
    g.strokeStyle = shade(pal.deep, -0.55);
    g.lineWidth = W * 0.03;
    g.strokeRect(tableL, tableT, tableR - tableL, tableB - tableT);

    for (const p of pockets) {
      g.beginPath();
      g.arc(p.x, p.y, pocketR * 0.6, 0, Math.PI * 2);
      g.fillStyle = "#0a0a0a";
      g.fill();
    }

    for (const b of balls) {
      if (b.potted) continue;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fillStyle = b.color;
      g.fill();
      g.beginPath();
      g.arc(b.x - b.r * 0.3, b.y - b.r * 0.32, b.r * 0.3, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,.5)";
      g.fill();
    }

    if (aiming) {
      const cue = cueBall();
      if (cue) {
        g.strokeStyle = pal.glow;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(cue.x, cue.y);
        const dx = cue.x - dragCur.x;
        const dy = cue.y - dragCur.y;
        g.lineTo(cue.x + dx * 2.2, cue.y + dy * 2.2);
        g.stroke();
      }
    }

    if (over) endCard(g, t, W, H, "SCRATCHED");
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
