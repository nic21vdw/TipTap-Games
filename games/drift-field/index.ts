import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawCan, skins } from "@/games/nic-art";

const meta = {
  slug: "drift-field",
  title: "Zero-G Basement",
  rule: "Aim with your thumb, hold to thrust",
  year: 1979,
  description: "Rotate 360°, thrust, and break the crumbs apart.",
  history:
    "Homage to the 1979 vector-graphics cabinet that defined space shooters — inertia, wrap-around edges, and rocks that split into more rocks. Ours are granola, and gravity left hours ago.",
  tags: ["retro", "reflex", "drag", "endurance"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#12161f",
    glow: "#b07a3c",
  },
  intensity: 0.7,
  speed: 0.6,
  difficulty: 0.6,
  luck: 0.15,
  nostalgia: 1.0,
  realism: 0.35,
  kidSafe: true,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 12,
} satisfies GameModule["meta"];

interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  angle: number;
  shape: number[]; // per-vertex radius jitter
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let shipX = W / 2;
  let shipY = H / 2;
  let vx = 0;
  let vy = 0;
  let angle = -Math.PI / 2; // facing up
  let targetAngle = angle;
  let thrusting = false;
  let rocks: Rock[] = [];
  let shots: Shot[] = [];
  let fireCd = 0;
  let score = 0;
  let lives = 3;
  let over = false;
  let invuln = 0;
  let wave = 1;
  let flameT = 0;

  const makeRock = (x: number, y: number, r: number): Rock => ({
    x,
    y,
    vx: rand(-60, 60) * (1 + wave * 0.08),
    vy: rand(-60, 60) * (1 + wave * 0.08),
    r,
    spin: rand(-1.4, 1.4),
    angle: rand(0, Math.PI * 2),
    shape: Array.from({ length: 9 }, () => rand(0.72, 1.25)),
  });

  const spawnWave = () => {
    const n = 3 + wave;
    for (let i = 0; i < n; i++) {
      // never spawn on top of the ship
      let x = 0;
      let y = 0;
      do {
        x = rand(0, W);
        y = rand(0, H);
      } while ((x - shipX) ** 2 + (y - shipY) ** 2 < (H * 0.22) ** 2);
      rocks.push(makeRock(x, y, rand(34, 48)));
    }
  };

  const reset = () => {
    shipX = W / 2;
    shipY = H / 2;
    vx = vy = 0;
    angle = targetAngle = -Math.PI / 2;
    rocks = [];
    shots = [];
    score = 0;
    lives = 3;
    wave = 1;
    over = false;
    invuln = 1.5;
    ctx.onScore(0);
    spawnWave();
  };

  const aimAt = (clientX: number, clientY: number) => {
    const r = ctx.canvas.getBoundingClientRect();
    const dx = clientX - r.left - shipX;
    const dy = clientY - r.top - shipY;
    if (dx * dx + dy * dy > 100) targetAngle = Math.atan2(dy, dx);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    ctx.canvas.setPointerCapture(e.pointerId);
    thrusting = true;
    aimAt(e.clientX, e.clientY);
  };
  const onMove = (e: PointerEvent) => {
    if (!thrusting) return;
    aimAt(e.clientX, e.clientY);
  };
  const onUp = () => {
    thrusting = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  const wrap = (o: { x: number; y: number }) => {
    if (o.x < -30) o.x = W + 30;
    if (o.x > W + 30) o.x = -30;
    if (o.y < -30) o.y = H + 30;
    if (o.y > H + 30) o.y = -30;
  };

  const die = () => {
    lives -= 1;
    ctx.haptic("fail");
    invuln = 2;
    shipX = W / 2;
    shipY = H / 2;
    vx = vy = 0;
    if (lives <= 0) {
      over = true;
      ctx.onRunEnd(score);
    }
  };

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (auto && !over) {
      // attract mode: swing onto the nearest rock and keep the guns hot
      let best: Rock | null = null;
      let bestD = Infinity;
      for (const r of rocks) {
        const d = (r.x - shipX) ** 2 + (r.y - shipY) ** 2;
        if (d < bestD) {
          bestD = d;
          best = r;
        }
      }
      if (best) targetAngle = Math.atan2(best.y - shipY, best.x - shipX);
      thrusting = true;
    }

    if (!over) {
      // rotate smoothly toward the thumb — full 360, shortest arc
      let diff = targetAngle - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      angle += diff * Math.min(1, dt * 9);

      if (thrusting) {
        vx += Math.cos(angle) * 340 * dt;
        vy += Math.sin(angle) * 340 * dt;
        flameT += dt;
      }
      // space drag: gentle, keeps inertia readable on a phone
      const drag = Math.pow(0.55, dt);
      vx *= drag;
      vy *= drag;
      const sp = Math.hypot(vx, vy);
      const MAX = 420;
      if (sp > MAX) {
        vx = (vx / sp) * MAX;
        vy = (vy / sp) * MAX;
      }
      shipX += vx * dt;
      shipY += vy * dt;
      if (shipX < -20) shipX = W + 20;
      if (shipX > W + 20) shipX = -20;
      if (shipY < -20) shipY = H + 20;
      if (shipY > H + 20) shipY = -20;

      invuln = Math.max(0, invuln - dt);

      // auto-fire while holding
      fireCd -= dt;
      if (thrusting && fireCd <= 0) {
        shots.push({
          x: shipX + Math.cos(angle) * 18,
          y: shipY + Math.sin(angle) * 18,
          vx: Math.cos(angle) * 520 + vx * 0.3,
          vy: Math.sin(angle) * 520 + vy * 0.3,
          life: 1.1,
        });
        fireCd = 0.22;
        ctx.haptic("light");
      }

      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        wrap(s);
        if (s.life <= 0) shots.splice(i, 1);
      }

      for (const r of rocks) {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.angle += r.spin * dt;
        wrap(r);
      }

      // shots vs rocks
      outer: for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        for (let j = shots.length - 1; j >= 0; j--) {
          const s = shots[j];
          if ((s.x - r.x) ** 2 + (s.y - r.y) ** 2 < r.r * r.r) {
            shots.splice(j, 1);
            rocks.splice(i, 1);
            score += r.r > 30 ? 20 : r.r > 18 ? 50 : 100;
            ctx.onScore(score);
            ctx.haptic("hit");
            if (r.r > 18) {
              const nr = r.r * 0.55;
              rocks.push(makeRock(r.x, r.y, nr), makeRock(r.x, r.y, nr));
            }
            continue outer;
          }
        }
        // rock vs ship
        if (
          invuln <= 0 &&
          (shipX - r.x) ** 2 + (shipY - r.y) ** 2 < (r.r + 12) ** 2
        ) {
          die();
        }
      }

      if (rocks.length === 0) {
        wave += 1;
        invuln = Math.max(invuln, 1);
        spawnWave();
      }
    }

    // ---- draw ----
    const ground = g.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, shade(pal.deep, -0.15));
    ground.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);
    const sk = skins(pal);

    // dust hanging in the monitor light: deterministic, so it doesn't shimmer
    g.fillStyle = t.inkDim;
    g.globalAlpha = 0.35;
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 733) % 1000) / 1000 * W;
      const sy = ((i * 947) % 1000) / 1000 * H;
      g.fillRect(sx, sy, 2, 2);
    }
    g.globalAlpha = 1;

    // floating granola chunks — vector outlines, like the cabinet
    g.strokeStyle = pal.glow;
    g.lineWidth = 2;
    for (const r of rocks) {
      g.beginPath();
      for (let k = 0; k < r.shape.length; k++) {
        const a = r.angle + (k / r.shape.length) * Math.PI * 2;
        const rad = r.r * r.shape[k];
        const px = r.x + Math.cos(a) * rad;
        const py = r.y + Math.sin(a) * rad;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle = pal.glow + "33";
      g.fill();
      g.stroke();
    }

    // shots
    g.fillStyle = pal.prize;
    for (const s of shots) {
      g.beginPath();
      g.arc(s.x, s.y, 3, 0, Math.PI * 2);
      g.fill();
    }

    // ship
    if (!over && (invuln <= 0 || Math.floor(invuln * 10) % 2 === 0)) {
      g.save();
      g.translate(shipX, shipY);
      g.rotate(angle);
      if (thrusting) {
        g.strokeStyle = pal.foe;
        g.beginPath();
        g.moveTo(-10, -5);
        g.lineTo(-16 - Math.sin(flameT * 40) * 5, 0);
        g.lineTo(-10, 5);
        g.stroke();
      }
      // the ship is a can, nose-first, still fizzing out the back
      g.rotate(Math.PI / 2);
      drawCan(g, 0, 0, 20, 34, sk.energy, "energy");
      g.restore();
    }

    // lives, as cans still left in the fridge
    for (let i = 0; i < lives; i++) {
      drawCan(g, 20 + i * 20, H * 0.08, 11, 19, sk.energy, "energy");
    }

    g.textAlign = "center";
    g.fillStyle = t.inkDim;
    g.font = `500 13px ${t.fontBody}`;
    if (!over)
      g.fillText("hold anywhere to aim + thrust · guns auto-fire", W / 2, H * 0.93);

    if (over) {
      endCard(g, t, W, H, "LOST IN THE BASEMENT");
    }
    g.textAlign = "left";
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
      thrusting = false;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
