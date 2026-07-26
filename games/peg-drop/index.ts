import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade, clamp } from "@/games/engine";

const meta = {
  slug: "peg-drop",
  title: "Nic's Peg Drop",
  rule: "Drag to aim, release to drop the ball",
  year: 2007,
  description: "Eight balls. One field of pins. Chase the bonus pegs.",
  history:
    "Homage to the 2007 arcade pin-board cabinet that turned falling balls and lucky bounces into a genre of their own.",
  tags: ["luck", "casino", "chaos"],
  palette: {
    hero: "#ffb703",
    foe: "#e63946",
    prize: "#06d6a0",
    deep: "#1d3557",
    glow: "#f4a261",
  },
  intensity: 0.4,
  luck: 0.85,
  nostalgia: 0.8,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

const TOTAL_BALLS = 8;
const BALL_R = 6;
const PEG_R = 4;
const ROWS = 9;
const COLS = 8;
const BUCKET_VALUES = [100, 40, 15, 5, 15, 40, 100];
const GRAVITY = 780;

interface Peg {
  x: number;
  y: number;
  bonus: boolean;
  hitT: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mult: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const topMargin = H * 0.16;
  const fieldH = H * 0.6;
  const rowGap = fieldH / ROWS;
  const colSpacing = W / (COLS + 1);
  const bucketTop = H * 0.86;
  const bucketW = W / BUCKET_VALUES.length;
  const chuteY = H * 0.06;

  let pegs: Peg[] = [];
  let balls: Ball[] = [];
  let ballsDropped = 0;
  let score = 0;
  let over = false;
  let dragging = false;
  let aimX = W / 2;
  let flashBucket = -1;
  let flashT = 0;

  const buildPegs = () => {
    const arr: Peg[] = [];
    for (let r = 0; r < ROWS; r++) {
      const y = topMargin + r * rowGap;
      const odd = r % 2 === 1;
      const count = odd ? COLS - 1 : COLS;
      for (let c = 0; c < count; c++) {
        const x = odd
          ? colSpacing * (c + 1) + colSpacing / 2
          : colSpacing * (c + 1);
        arr.push({ x, y, bonus: Math.random() < 0.09, hitT: 0 });
      }
    }
    return arr;
  };

  const reset = () => {
    pegs = buildPegs();
    balls = [];
    ballsDropped = 0;
    score = 0;
    over = false;
    dragging = false;
    aimX = W / 2;
    flashBucket = -1;
    flashT = 0;
    ctx.onScore(0);
  };

  const spawnBall = (x: number) => {
    if (over || ballsDropped >= TOTAL_BALLS) return;
    balls.push({ x: clamp(x, BALL_R + 2, W - BALL_R - 2), y: chuteY, vx: 0, vy: 0, mult: 1 });
    ballsDropped += 1;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    aimX = clamp(e.clientX - r.left, BALL_R, W - BALL_R);
    dragging = true;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const r = ctx.canvas.getBoundingClientRect();
    aimX = clamp(e.clientX - r.left, BALL_R, W - BALL_R);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    spawnBall(aimX);
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    for (const p of pegs) if (p.hitT > 0) p.hitT = Math.max(0, p.hitT - dt * 3);
    if (flashT > 0) flashT = Math.max(0, flashT - dt * 2);

    if (!over) {
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0 && ballsDropped < TOTAL_BALLS) {
          const bonusPegs = pegs.filter((p) => p.bonus);
          const target =
            bonusPegs.length > 0 ? (bonusPegs[Math.floor(Math.random() * bonusPegs.length)] as Peg).x : rand(BALL_R, W - BALL_R);
          spawnBall(target + rand(-8, 8));
          autoCd = rand(0.5, 0.9);
        }
      }

      for (const b of balls) {
        b.vy += GRAVITY * dt;
        b.vx *= 1 - 0.15 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        if (b.x < BALL_R) {
          b.x = BALL_R;
          b.vx = -b.vx * 0.6;
        } else if (b.x > W - BALL_R) {
          b.x = W - BALL_R;
          b.vx = -b.vx * 0.6;
        }

        for (const p of pegs) {
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const minDist = BALL_R + PEG_R;
          if (dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            b.x += nx * overlap;
            b.y += ny * overlap;
            const dot = b.vx * nx + b.vy * ny;
            b.vx = (b.vx - 2 * dot * nx) * 0.72 + rand(-35, 35);
            b.vy = (b.vy - 2 * dot * ny) * 0.72;
            p.hitT = 1;
            if (p.bonus) {
              b.mult = Math.min(8, b.mult * 2);
              ctx.haptic("light");
            }
          }
        }
      }

      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        if (b.y + BALL_R >= bucketTop) {
          const idx = clamp(Math.floor(b.x / bucketW), 0, BUCKET_VALUES.length - 1);
          score += BUCKET_VALUES[idx] * b.mult;
          ctx.onScore(score);
          ctx.haptic("hit");
          flashBucket = idx;
          flashT = 1;
          balls.splice(i, 1);
        }
      }

      if (ballsDropped >= TOTAL_BALLS && balls.length === 0) {
        over = true;
        ctx.onRunEnd(score);
      }
    }

    // background
    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.deep, -0.62);
    g.fillRect(0, 0, W, topMargin);

    // pegs
    for (const p of pegs) {
      const r = PEG_R + p.hitT * 2.5;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fillStyle = p.bonus ? pal.prize : shade(pal.glow, p.hitT * 0.5 - 0.1);
      g.fill();
      if (p.bonus) {
        g.beginPath();
        g.arc(p.x, p.y, r + 2 + p.hitT * 2, 0, Math.PI * 2);
        g.strokeStyle = pal.prize;
        g.globalAlpha = 0.35 + p.hitT * 0.4;
        g.lineWidth = 1.5;
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    // buckets
    for (let i = 0; i < BUCKET_VALUES.length; i++) {
      const bx = i * bucketW;
      const flash = flashBucket === i ? flashT : 0;
      g.fillStyle = shade(t.surface, -0.1 + flash * 0.3);
      roundRect(g, bx + 2, bucketTop, bucketW - 4, H - bucketTop - 4, 6);
      g.fill();
      g.fillStyle = t.ink;
      g.font = `700 ${Math.round(bucketW * 0.24)}px ${t.fontBody}`;
      g.textAlign = "center";
      g.fillText(String(BUCKET_VALUES[i]), bx + bucketW / 2, bucketTop + (H - bucketTop) / 2 + 5);
    }
    g.textAlign = "left";

    // balls
    for (const b of balls) {
      g.beginPath();
      g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      g.fillStyle = b.mult > 1 ? pal.prize : pal.hero;
      g.fill();
      g.beginPath();
      g.arc(b.x - BALL_R * 0.3, b.y - BALL_R * 0.3, BALL_R * 0.35, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,.6)";
      g.fill();
    }

    // chute / aim indicator
    if (!over) {
      g.fillStyle = dragging ? pal.hero : shade(pal.hero, -0.25);
      roundRect(g, aimX - 8, chuteY - 10, 16, 8, 3);
      g.fill();
      g.strokeStyle = shade(pal.glow, 0.1);
      g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(aimX, chuteY - 2);
      g.lineTo(aimX, topMargin);
      g.stroke();
      g.globalAlpha = 1;
    }

    // balls remaining pips
    const remaining = TOTAL_BALLS - ballsDropped;
    for (let i = 0; i < remaining; i++) {
      g.beginPath();
      g.arc(10 + i * 12, 12, 4, 0, Math.PI * 2);
      g.fillStyle = pal.hero;
      g.fill();
    }

    if (over) endCard(g, t, W, H, "OUT OF BALLS");
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
