import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, clamp, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "hazard-glide",
  title: "Nic's Hazard Glide",
  rule: "Hold to climb, release to dive the gaps",
  year: 2013,
  description: "Hold to soar, let go to dive. The hazard field doesn't slow down.",
  history:
    "Homage to the 2013 hold-to-fly runners that turned a single thumb into wings and a health bar into your only friend.",
  tags: ["reflex", "endurance", "hold"],
  palette: {
    hero: "#ffd166",
    foe: "#ef476f",
    prize: "#06d6a0",
    deep: "#073b4c",
    glow: "#118ab2",
  },
  intensity: 0.75,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Hazard {
  x: number;
  gapY: number;
  gapH: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const craftX = W * 0.28;
  const craftR = 11;
  const chunkW = 46;
  const gravity = 1350;
  const climb = 1850;
  const maxVy = 430;

  let y = 0;
  let vy = 0;
  let holding = false;
  let hazards: Hazard[] = [];
  let spawnTimer = 0;
  let distance = 0;
  let health = 3;
  let invulnT = 0;
  let over = false;
  const trail: { x: number; y: number }[] = [];

  const reset = () => {
    y = H / 2;
    vy = 0;
    holding = false;
    hazards = [];
    spawnTimer = 0;
    distance = 0;
    health = 3;
    invulnT = 0;
    over = false;
    trail.length = 0;
    ctx.onScore(0);
  };
  reset();

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

  let auto = false;
  let autoHold = false;

  const autoSteer = () => {
    let target: Hazard | null = null;
    for (const hz of hazards) {
      if (hz.x + chunkW > craftX) {
        if (!target || hz.x < target.x) target = hz;
      }
    }
    if (!target) {
      autoHold = y > H * 0.55;
      return;
    }
    autoHold = y > target.gapY + 6;
  };

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();

    if (!over) {
      if (auto) autoSteer();
      const effectiveHold = auto ? autoHold : holding;

      const scrollSpeed = clamp(170 + distance * 0.05, 170, 430);

      spawnTimer += dt;
      const interval = clamp(1.3 - distance * 0.0006, 0.55, 1.3);
      if (spawnTimer >= interval) {
        spawnTimer = 0;
        const gapH = clamp(H * 0.34 - distance * 0.002, H * 0.17, H * 0.34);
        const gapY = rand(gapH / 2 + 10, H - gapH / 2 - 10);
        hazards.push({ x: W + chunkW, gapY, gapH });
      }

      vy += (effectiveHold ? -climb : gravity) * dt;
      vy = clamp(vy, -maxVy, maxVy);
      y += vy * dt;
      if (y < craftR) {
        y = craftR;
        vy = 0;
      } else if (y > H - craftR) {
        y = H - craftR;
        vy = 0;
      }

      trail.push({ x: craftX, y });
      if (trail.length > 10) trail.shift();

      for (const hz of hazards) hz.x -= scrollSpeed * dt;
      hazards = hazards.filter((hz) => hz.x + chunkW > -4);

      invulnT = Math.max(0, invulnT - dt);
      for (const hz of hazards) {
        const overlapX = craftX + craftR > hz.x && craftX - craftR < hz.x + chunkW;
        if (!overlapX) continue;
        const inGap = y - craftR > hz.gapY - hz.gapH / 2 && y + craftR < hz.gapY + hz.gapH / 2;
        if (!inGap && invulnT <= 0) {
          health -= 1;
          invulnT = 1.0;
          ctx.haptic("hit");
          if (health <= 0) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(Math.floor(distance));
          }
        }
      }

      distance += scrollSpeed * dt * 0.05;
      ctx.onScore(Math.floor(distance));
    }

    // background
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, -0.1));
    sky.addColorStop(1, shade(pal.deep, -0.6));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // hazards
    for (const hz of hazards) {
      g.fillStyle = pal.foe;
      const topH = Math.max(0, hz.gapY - hz.gapH / 2);
      roundRect(g, hz.x, 0, chunkW, topH, 8);
      g.fill();
      const botY = hz.gapY + hz.gapH / 2;
      roundRect(g, hz.x, botY, chunkW, Math.max(0, H - botY), 8);
      g.fill();
    }

    // trail
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      g.globalAlpha = (i / trail.length) * 0.35;
      g.fillStyle = pal.glow;
      g.beginPath();
      g.arc(p.x - (trail.length - i) * 2, p.y, craftR * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // craft
    const blinking = invulnT > 0 && Math.floor(invulnT * 10) % 2 === 0;
    if (!blinking) {
      g.fillStyle = over ? pal.foe : pal.hero;
      g.beginPath();
      g.moveTo(craftX + craftR, y);
      g.lineTo(craftX - craftR, y - craftR * 0.8);
      g.lineTo(craftX - craftR * 0.4, y);
      g.lineTo(craftX - craftR, y + craftR * 0.8);
      g.closePath();
      g.fill();
    }

    // health pips
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < health ? pal.prize : "rgba(255,255,255,.15)";
      roundRect(g, 14 + i * 20, 14, 14, 14, 4);
      g.fill();
    }

    if (over) endCard(g, theme, W, H, "GROUNDED");
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
