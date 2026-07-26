import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "tap-tower",
  title: "Tap Tower",
  rule: "Tap floors for coins. Build when you can afford it.",
  year: 2011,
  description: "Tap tenants for coins, build another floor, watch it stack up.",
  history:
    "Homage to the 2011 pocket skyscraper craze that turned idle taps into tiny virtual real-estate empires, one cheap floor at a time.",
  tags: ["calm", "endurance", "oneTap"],
  palette: {
    hero: "#4361ee",
    foe: "#f72585",
    prize: "#ffd60a",
    deep: "#14213d",
    glow: "#4cc9f0",
  },
  intensity: 0.2,
  luck: 0.15,
  nostalgia: 0.6,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

const BASE_COST = 10;
const COST_MULT = 1.22;
const INCOME_PER_FLOOR = 0.35; // currency per second per floor
const TAP_BONUS = 2;
const SPARK_BONUS = 6;

interface Particle {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let floors = 2;
  let currency = 0;
  let totalEarned = 0;
  let particles: Particle[] = [];
  let sparkleFloor = -1;
  let sparkleTimer = rand(3, 6);
  let sparkleLife = 0;
  let buildPulse = 0;

  const cost = () => Math.round(BASE_COST * Math.pow(COST_MULT, floors - 2));

  const reset = () => {
    floors = 2;
    currency = 0;
    totalEarned = 0;
    particles = [];
    sparkleFloor = -1;
    sparkleTimer = rand(3, 6);
    ctx.onScore(0);
  };

  const bumpScore = () => {
    ctx.onScore(Math.floor(totalEarned + floors * 5));
  };

  const earn = (amount: number, x: number, y: number) => {
    currency += amount;
    totalEarned += amount;
    particles.push({ x, y, vy: -28, life: 1, text: `+${amount}` });
    bumpScore();
  };

  // layout: build button strip at top, tower rises from baseY, floor
  // height compresses as the tower grows so it always fits full-bleed.
  const baseY = H * 0.92;
  const buttonH = H * 0.12;
  const towerTop = buttonH + 10;

  const floorGeom = () => {
    const maxSpan = baseY - towerTop;
    const floorH = clamp(maxSpan / Math.max(floors, 1), 14, 46);
    return { floorH };
  };

  const floorRectAt = (index: number) => {
    const { floorH } = floorGeom();
    const y = baseY - (index + 1) * floorH;
    return { x: W * 0.14, y, w: W * 0.72, h: floorH - 3 };
  };

  const build = (x: number, y: number) => {
    const c = cost();
    if (currency < c) return;
    currency -= c;
    floors += 1;
    buildPulse = 1;
    particles.push({ x, y, vy: -24, life: 1, text: "+floor" });
    ctx.haptic("hit");
    bumpScore();
  };

  const tapFloor = (index: number, x: number, y: number) => {
    if (index === sparkleFloor) {
      earn(SPARK_BONUS, x, y);
      sparkleFloor = -1;
      sparkleTimer = rand(3, 6);
      ctx.haptic("hit");
    } else {
      earn(TAP_BONUS, x, y);
      ctx.haptic("light");
    }
  };

  reset();

  const onDown = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (y < buttonH) {
      build(x, y);
      return;
    }
    const { floorH } = floorGeom();
    const idx = Math.floor((baseY - y) / floorH);
    if (idx >= 0 && idx < floors) tapFloor(idx, x, y);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;
  let autoTimer = rand(0.3, 0.5);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    buildPulse = Math.max(0, buildPulse - dt * 2.5);
    particles = particles.filter((p) => p.life > 0);

    const income = floors * INCOME_PER_FLOOR * dt;
    currency += income;
    totalEarned += income;
    bumpScore();

    for (const p of particles) {
      p.y += p.vy * dt;
      p.life -= dt * 0.9;
    }

    if (sparkleFloor === -1) {
      sparkleTimer -= dt;
      if (sparkleTimer <= 0 && floors > 0) {
        sparkleFloor = Math.floor(Math.random() * floors);
        sparkleLife = rand(1.2, 2);
      }
    } else {
      sparkleLife -= dt;
      if (sparkleLife <= 0) {
        sparkleFloor = -1;
        sparkleTimer = rand(3, 6);
      }
    }

    if (auto) {
      autoTimer -= dt;
      if (autoTimer <= 0) {
        if (currency >= cost()) {
          const r = floorRectAt(floors);
          build(r.x + r.w / 2, Math.max(r.y, towerTop) + r.h / 2);
        } else if (sparkleFloor !== -1) {
          const r = floorRectAt(sparkleFloor);
          tapFloor(sparkleFloor, r.x + r.w / 2, r.y + r.h / 2);
        } else {
          const idx = Math.floor(Math.random() * floors);
          const r = floorRectAt(idx);
          tapFloor(idx, r.x + r.w / 2, r.y + r.h / 2);
        }
        autoTimer = rand(0.35, 0.55);
      }
    }

    // background sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.1));
    sky.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // build button
    const c = cost();
    const affordable = currency >= c;
    g.fillStyle = affordable ? shade(pal.hero, buildPulse * 0.3) : shade(pal.hero, -0.35);
    roundRect(g, W * 0.14, H * 0.03, W * 0.72, buttonH - H * 0.05, 12);
    g.fill();
    g.textAlign = "center";
    g.fillStyle = "#fff";
    g.font = `800 15px ${t.fontDisplay}`;
    g.fillText(`build floor · ${c}`, W / 2, H * 0.03 + (buttonH - H * 0.05) / 2 + 5);

    // tower
    for (let i = 0; i < floors; i++) {
      const r = floorRectAt(i);
      const isSparkle = i === sparkleFloor;
      g.fillStyle = isSparkle
        ? shade(pal.prize, Math.sin(sparkleLife * 12) * 0.15)
        : shade(pal.hero, -0.1 - (i % 2) * 0.08);
      roundRect(g, r.x, r.y, r.w, r.h, 6);
      g.fill();
      g.fillStyle = shade(pal.deep, -0.3);
      const winCount = 4;
      for (let wI = 0; wI < winCount; wI++) {
        const wx = r.x + r.w * (0.12 + (wI * 0.76) / (winCount - 1));
        g.fillRect(wx - 3, r.y + r.h * 0.3, 6, r.h * 0.4);
      }
      if (isSparkle) {
        g.fillStyle = pal.glow;
        g.font = `700 11px ${t.fontBody}`;
        g.fillText("✦ bonus", r.x + r.w / 2, r.y - 4);
      }
    }
    // base
    g.fillStyle = shade(pal.deep, -0.2);
    g.fillRect(W * 0.1, baseY, W * 0.8, H - baseY);

    // particles
    for (const p of particles) {
      g.globalAlpha = clamp(p.life, 0, 1);
      g.fillStyle = pal.prize;
      g.font = `800 13px ${t.fontDisplay}`;
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;

    g.fillStyle = t.ink;
    g.font = `700 16px ${t.fontBody}`;
    g.fillText(`${Math.floor(currency)} coins · ${floors} floors`, W / 2, baseY + (H - baseY) / 2 + 5);
    g.textAlign = "left";
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
