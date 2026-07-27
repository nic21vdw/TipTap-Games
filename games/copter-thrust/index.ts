import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "copter-thrust",
  title: "Nic's Copter",
  rule: "Tap to flip thrust and weave the gaps",
  year: 2014,
  description: "One tap flips your thrust. Climb forever, don't clip a bar.",
  history:
    "Homage to the 2014 wave of one-tap thrust climbers that turned a single button into an endless test of nerve and thumb timing.",
  tags: ["reflex", "precision", "oneTap"],
  palette: {
    hero: "#ffb703",
    foe: "#8d0801",
    prize: "#219ebc",
    deep: "#03045e",
    glow: "#00b4d8",
  },
  intensity: 0.7,
  luck: 0.05,
  nostalgia: 0.4,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

interface Bar {
  y: number;
  gapX: number;
  gapW: number;
  passed: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const craftY = H * 0.32;
  const craftR = 12;
  const barH = 16;
  const accel = 520;
  const maxVx = 220;

  let x = 0;
  let vx = 0;
  let dir: 1 | -1 = 1;
  let bars: Bar[] = [];
  let spawnTimer = 0;
  let score = 0;
  let over = false;
  let flashT = 0;
  const stars: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 26; i++) {
    stars.push({ x: rand(0, W), y: rand(0, H), r: rand(0.6, 1.8) });
  }

  const reset = () => {
    x = W / 2;
    vx = 0;
    dir = 1;
    bars = [];
    spawnTimer = 0;
    score = 0;
    over = false;
    flashT = 0;
    ctx.onScore(0);
  };
  reset();

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    dir = dir === 1 ? -1 : 1;
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;

  const autoSteer = () => {
    let target: Bar | null = null;
    for (const b of bars) {
      if (b.y < craftY) {
        if (!target || b.y > target.y) target = b;
      }
    }
    if (!target) return;
    const centerX = target.gapX + target.gapW / 2;
    dir = x < centerX - 4 ? 1 : x > centerX + 4 ? -1 : dir;
  };

  const loop = makeLoop((dt, t) => {
    const theme = ctx.getTheme();

    if (!over) {
      if (auto) autoSteer();

      const scrollSpeed = clamp(150 + score * 5, 150, 340);

      spawnTimer += dt;
      const interval = clamp(1.0 - score * 0.014, 0.42, 1.0);
      if (spawnTimer >= interval) {
        spawnTimer = 0;
        const gapW = clamp(W * 0.46 - score * 3, W * 0.24, W * 0.46);
        const gapX = rand(16, Math.max(16, W - 16 - gapW));
        bars.push({ y: -barH, gapX, gapW, passed: false });
      }

      vx += dir * accel * dt;
      vx = clamp(vx, -maxVx, maxVx);
      vx *= Math.max(0, 1 - 2.4 * dt);
      x += vx * dt;
      if (x < craftR) {
        x = craftR;
        vx = 0;
      } else if (x > W - craftR) {
        x = W - craftR;
        vx = 0;
      }

      for (const b of bars) {
        b.y += scrollSpeed * dt;
        if (Math.abs(b.y - craftY) < barH / 2 + craftR) {
          if (x - craftR < b.gapX || x + craftR > b.gapX + b.gapW) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          }
        }
        if (!over && !b.passed && b.y > craftY) {
          b.passed = true;
          score += 1;
          ctx.onScore(score);
          ctx.haptic("hit");
          flashT = 0.25;
        }
      }
      bars = bars.filter((b) => b.y < H + barH);
      flashT = Math.max(0, flashT - dt);
    }

    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, -0.2));
    sky.addColorStop(1, shade(pal.deep, -0.68));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    g.fillStyle = "rgba(255,255,255,.4)";
    for (const s of stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(t * 2 + s.x);
      g.globalAlpha = 0.15 + twinkle * 0.25;
      g.beginPath();
      g.arc(s.x, (s.y + t * 12) % H, s.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // bars
    for (const b of bars) {
      g.fillStyle = pal.foe;
      g.fillRect(0, b.y - barH / 2, b.gapX, barH);
      g.fillRect(
        b.gapX + b.gapW,
        b.y - barH / 2,
        Math.max(0, W - (b.gapX + b.gapW)),
        barH
      );
    }

    // craft
    const thrustX = -dir * 16;
    g.fillStyle = pal.glow;
    g.beginPath();
    g.moveTo(x, craftY + craftR * 0.5);
    g.lineTo(x + thrustX, craftY + craftR * 1.3);
    g.lineTo(x, craftY + craftR * 0.2);
    g.closePath();
    g.fill();

    drawNicHead(g, {
      x: x,
      y: craftY,
      r: craftR,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: theme.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: theme.ink,
      gape: over ? 0.85 : 0,
      scowl: over ? 1 : 0,
    });
    if (flashT > 0) {
      g.strokeStyle = pal.prize;
      g.globalAlpha = flashT / 0.25;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, craftY, craftR + 4, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }

    if (over) endCard(g, theme, W, H, "CRASHED");
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
