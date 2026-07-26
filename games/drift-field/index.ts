import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand } from "@/games/engine";
import {
  createFx,
  drawBackdrop,
  resultCard,
  hexA,
  mix,
  halo,
  pulse,
  groundInk,
} from "@/games/fx";

const meta = {
  slug: "drift-field",
  title: "Nic's Zero-G Basement",
  rule: "Hold to aim and thrust. Guns auto-fire",
  year: 1979,
  description: "Rotate, thrust, break the crumbs apart. Momentum is the enemy.",
  history:
    "Homage to the 1979 vector cabinet that defined space shooters — inertia, wrap-around edges, rocks that split into more rocks. Ours are granola, and gravity left hours ago.",
  tags: ["retro", "reflex", "drag", "endurance"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
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
  maxScorePerSecond: 40,
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
  hit: number; // flash timer
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
  const fx = createFx();

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
  let best = 0;
  let lives = 3;
  let over = false;
  let overAge = 0;
  let invuln = 0;
  let wave = 1;
  let flameT = 0;
  let clock = 0;
  let kills = 0;

  const makeRock = (x: number, y: number, r: number): Rock => ({
    x,
    y,
    vx: rand(-60, 60) * (1 + wave * 0.08),
    vy: rand(-60, 60) * (1 + wave * 0.08),
    r,
    spin: rand(-1.4, 1.4),
    angle: rand(0, Math.PI * 2),
    shape: Array.from({ length: 9 }, () => rand(0.72, 1.25)),
    hit: 0,
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
    kills = 0;
    lives = 3;
    wave = 1;
    over = false;
    overAge = 0;
    invuln = 1.5;
    fx.clear();
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
      if (overAge > 0.3) reset();
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
    fx.shake(20);
    fx.flash(pal.foe, 0.4);
    fx.burst(shipX, shipY, {
      count: 30,
      colour: [pal.hero, pal.foe, "#ffffff"],
      speed: 320,
      life: 1,
      size: 4,
    });
    invuln = 2;
    shipX = W / 2;
    shipY = H / 2;
    vx = vy = 0;
    if (lives <= 0) {
      over = true;
      overAge = 0;
      best = Math.max(best, score);
      ctx.onRunEnd(score);
    }
  };

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);

    if (auto && !over) {
      // attract mode: swing onto the nearest rock and keep the guns hot
      let target: Rock | null = null;
      let bestD = Infinity;
      for (const r of rocks) {
        const d = (r.x - shipX) ** 2 + (r.y - shipY) ** 2;
        if (d < bestD) {
          bestD = d;
          target = r;
        }
      }
      if (target) targetAngle = Math.atan2(target.y - shipY, target.x - shipX);
      thrusting = true;
    }

    if (over) {
      overAge += dt;
    } else {
      // rotate smoothly toward the thumb — full 360, shortest arc
      let diff = targetAngle - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      angle += diff * Math.min(1, dt * 9);

      if (thrusting) {
        vx += Math.cos(angle) * 340 * dt;
        vy += Math.sin(angle) * 340 * dt;
        flameT += dt;
        // exhaust, so thrust is felt as well as seen
        if (Math.random() < 0.7) {
          fx.trail(
            shipX - Math.cos(angle) * 16,
            shipY - Math.sin(angle) * 16,
            hexA(pal.prize, 0.5),
            4,
            0.3
          );
        }
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
        r.hit = Math.max(0, r.hit - dt * 4);
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
            const worth = r.r > 30 ? 20 : r.r > 18 ? 50 : 100;
            score += worth;
            kills += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
            fx.shake(r.r > 30 ? 5 : 3);
            fx.ring(r.x, r.y, pal.foe, r.r * 0.8, 4);
            fx.burst(r.x, r.y, {
              count: Math.round(6 + r.r * 0.3),
              colour: [pal.foe, mix(pal.foe, "#ffffff", 0.5), pal.glow],
              speed: 60 + r.r * 5,
              life: 0.6,
              size: 3.2,
              kind: "square",
            });
            fx.pop(r.x, r.y - r.r, `+${worth}`, pal.prize, r.r > 30 ? 18 : 22, th.fontDisplay);
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
        fx.flash(pal.hero, 0.18);
        fx.pop(W / 2, H * 0.4, `WAVE ${wave}`, pal.hero, 28, th.fontDisplay);
        spawnWave();
      }
    }

    // ---- draw ----
    drawBackdrop(g, W, H, pal, clock, {
      kind: "stars",
      intensity: 1,
      scroll: clock * 8,
      vignette: 0.6,
    });

    fx.begin(g);
    fx.drawUnder(g);

    // rocks — vector outlines, like the cabinet, but lit
    for (const r of rocks) {
      const col = r.hit > 0 ? "#ffffff" : mix(pal.foe, pal.glow, 0.35);
      halo(g, r.x, r.y, r.r * 1.8, pal.foe, 0.12);
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
      g.fillStyle = hexA(mix(pal.deep, pal.foe, 0.3), 0.9);
      g.fill();
      g.strokeStyle = col;
      g.lineWidth = 2.6;
      g.stroke();
    }

    // shots
    for (const s of shots) {
      const a = Math.atan2(s.vy, s.vx);
      g.strokeStyle = pal.prize;
      g.lineWidth = 3;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x - Math.cos(a) * 12, s.y - Math.sin(a) * 12);
      g.stroke();
      g.lineCap = "butt";
    }

    // ship
    if (!over && (invuln <= 0 || Math.floor(invuln * 10) % 2 === 0)) {
      if (invuln > 0) {
        g.strokeStyle = hexA(pal.hero, 0.4);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(shipX, shipY, 26, 0, Math.PI * 2);
        g.stroke();
      }
      halo(g, shipX, shipY, 40, pal.hero, 0.3);
      g.save();
      g.translate(shipX, shipY);
      g.rotate(angle);
      if (thrusting) {
        const flick = 1 + Math.sin(flameT * 40) * 0.35;
        const flame = g.createLinearGradient(-10, 0, -26 * flick, 0);
        flame.addColorStop(0, hexA(pal.prize, 0.9));
        flame.addColorStop(1, hexA(pal.foe, 0));
        g.fillStyle = flame;
        g.beginPath();
        g.moveTo(-9, -6);
        g.lineTo(-24 * flick, 0);
        g.lineTo(-9, 6);
        g.closePath();
        g.fill();
      }
      g.fillStyle = hexA(pal.hero, 0.25);
      g.beginPath();
      g.moveTo(17, 0);
      g.lineTo(-11, -11);
      g.lineTo(-6, 0);
      g.lineTo(-11, 11);
      g.closePath();
      g.fill();
      g.strokeStyle = "#ffffff";
      g.lineWidth = 2.2;
      g.stroke();
      g.restore();
    }

    // ---- HUD
    for (let i = 0; i < lives; i++) {
      g.save();
      g.translate(20 + i * 20, H * 0.07);
      g.rotate(-Math.PI / 2);
      g.strokeStyle = pal.hero;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(8, 0);
      g.lineTo(-5, -5);
      g.lineTo(-3, 0);
      g.lineTo(-5, 5);
      g.closePath();
      g.stroke();
      g.restore();
    }
    g.textAlign = "right";
    g.fillStyle = hexA(ink.main, 0.45);
    g.font = `800 13px ${th.fontBody}`;
    g.fillText(`WAVE ${wave}`, W - 18, H * 0.07 + 4);

    g.textAlign = "center";
    if (!over && kills === 0) {
      g.fillStyle = hexA(ink.main, 0.35 + pulse(clock, 1.6) * 0.35);
      g.font = `700 13px ${th.fontBody}`;
      g.fillText("hold anywhere to aim and thrust · guns auto-fire", W / 2, H * 0.78);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: "lost in space",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `wave ${wave} · ${kills} rocks split`,
        age: overAge,
        accent: pal.hero,
      });
    }
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
