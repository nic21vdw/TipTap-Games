import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "brick-paddle",
  title: "Nic's Brick Paddle",
  rule: "Drag the paddle. Smash every brick.",
  year: 2003,
  description: "Angle it. Break it. Never let it drop.",
  history:
    "Homage to the 2003 handheld and web era that put a bouncing ball, a paddle, and a wall of bricks on every browser toolbar — the bounce loop that never left.",
  tags: ["reflex", "precision", "drag"],
  palette: {
    hero: "#00e5ff",
    foe: "#ff3864",
    prize: "#ffd23f",
    deep: "#0b1021",
    glow: "#7cf9c0",
  },
  intensity: 0.6,
  luck: 0.1,
  nostalgia: 1.0,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

const BRICK_COLS = 8;
const BRICK_ROWS_BASE = 4;
const START_LIVES = 3;

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
  row: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const paddleW = W * 0.24;
  const paddleH = H * 0.018;
  const paddleY = H * 0.9;
  const ballR = Math.max(6, W * 0.018);

  let paddleX = W / 2;
  let bricks: Brick[] = [];
  let wave = 1;
  let ball = { x: W / 2, y: paddleY - ballR - 1, vx: 0, vy: 0 };
  let attached = true;
  let baseSpeed = H * 0.42;
  let lives = START_LIVES;
  let score = 0;
  let over = false;
  let flash = 0;

  const buildWave = () => {
    bricks = [];
    const rows = Math.min(BRICK_ROWS_BASE + Math.floor(wave / 2), 8);
    const top = H * 0.1;
    const bw = W / BRICK_COLS;
    const bh = H * 0.032;
    const gap = 3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        bricks.push({
          x: c * bw + gap / 2,
          y: top + r * (bh + gap),
          w: bw - gap,
          h: bh,
          alive: true,
          row: r,
        });
      }
    }
  };

  const attachBall = () => {
    attached = true;
    ball.x = paddleX;
    ball.y = paddleY - ballR - 1;
    ball.vx = 0;
    ball.vy = 0;
  };

  const launchBall = () => {
    attached = false;
    const speed = baseSpeed * (1 + (wave - 1) * 0.08);
    const theta = Math.random() * 0.6 - 0.3; // radians from straight up
    ball.vx = Math.sin(theta) * speed;
    ball.vy = -Math.cos(theta) * speed;
  };

  const reset = () => {
    wave = 1;
    baseSpeed = H * 0.42;
    lives = START_LIVES;
    score = 0;
    over = false;
    paddleX = W / 2;
    buildWave();
    attachBall();
    ctx.onScore(0);
  };

  const onMove = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    paddleX = clamp(e.clientX - r.left, paddleW / 2, W - paddleW / 2);
    if (attached) ball.x = paddleX;
  };
  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    onMove(e);
    if (attached) launchBall();
  };
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoLaunchCd = 0.4;

  const stepBall = (dt: number) => {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ballR < 0) {
      ball.x = ballR;
      ball.vx *= -1;
    } else if (ball.x + ballR > W) {
      ball.x = W - ballR;
      ball.vx *= -1;
    }
    if (ball.y - ballR < 0) {
      ball.y = ballR;
      ball.vy *= -1;
    }

    // paddle collision
    if (
      ball.vy > 0 &&
      ball.y + ballR >= paddleY &&
      ball.y - ballR <= paddleY + paddleH &&
      ball.x >= paddleX - paddleW / 2 &&
      ball.x <= paddleX + paddleW / 2
    ) {
      const rel = (ball.x - paddleX) / (paddleW / 2); // -1..1
      const speed = Math.hypot(ball.vx, ball.vy);
      const ang = rel * (Math.PI / 3);
      ball.vx = Math.sin(ang) * speed;
      ball.vy = -Math.abs(Math.cos(ang) * speed);
      ball.y = paddleY - ballR - 1;
      ctx.haptic("light");
    }

    // brick collisions (AABB, simple axis resolution)
    for (const b of bricks) {
      if (!b.alive) continue;
      if (
        ball.x + ballR > b.x &&
        ball.x - ballR < b.x + b.w &&
        ball.y + ballR > b.y &&
        ball.y - ballR < b.y + b.h
      ) {
        b.alive = false;
        score += 10 + b.row * 2;
        ctx.onScore(score);
        ctx.haptic("hit");
        const overlapX = Math.min(ball.x + ballR - b.x, b.x + b.w - (ball.x - ballR));
        const overlapY = Math.min(ball.y + ballR - b.y, b.y + b.h - (ball.y - ballR));
        if (overlapX < overlapY) ball.vx *= -1;
        else ball.vy *= -1;
        break;
      }
    }

    if (bricks.every((b) => !b.alive)) {
      wave += 1;
      buildWave();
      attachBall();
    }

    if (ball.y - ballR > H) {
      lives -= 1;
      flash = 0.3;
      ctx.haptic("fail");
      if (lives <= 0) {
        over = true;
        ctx.onRunEnd(score);
      } else {
        attachBall();
      }
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    flash = Math.max(0, flash - dt);

    if (!over) {
      if (auto) {
        // attract mode: paddle chases ball x, auto-launches
        paddleX = clamp(ball.x, paddleW / 2, W - paddleW / 2);
        if (attached) {
          ball.x = paddleX;
          autoLaunchCd -= dt;
          if (autoLaunchCd <= 0) {
            launchBall();
            autoLaunchCd = 0.4;
          }
        }
      }
      if (!attached) stepBall(dt);
    }

    g.fillStyle = shade(pal.deep, -0.3);
    g.fillRect(0, 0, W, H);
    if (flash > 0) {
      g.fillStyle = `rgba(255,56,100,${flash * 0.35})`;
      g.fillRect(0, 0, W, H);
    }

    // bricks
    for (const b of bricks) {
      if (!b.alive) continue;
      const col = shade(pal.prize, -0.05 * b.row + 0.06);
      g.fillStyle = col;
      roundRect(g, b.x, b.y, b.w, b.h, 3);
      g.fill();
      g.fillStyle = "rgba(255,255,255,.18)";
      g.fillRect(b.x, b.y, b.w, b.h * 0.35);
    }

    // paddle
    g.fillStyle = pal.hero;
    roundRect(g, paddleX - paddleW / 2, paddleY, paddleW, paddleH, paddleH / 2);
    g.fill();

    // ball
    drawNicHead(g, {
      x: ball.x,
      y: ball.y,
      r: ballR * 1.1,
      skin: pal.glow,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      // he is the ball, so he looks where he is heading
      gaze: Math.max(-1, Math.min(1, ball.vx * 0.004)),
      gape: 0.3,
    });
    g.beginPath();
    g.arc(ball.x - ballR * 0.3, ball.y - ballR * 0.3, ballR * 0.35, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,.7)";
    g.fill();

    // lives + wave HUD as dots
    for (let i = 0; i < START_LIVES; i++) {
      g.beginPath();
      g.arc(W * 0.08 + i * 18, H * 0.05, 5, 0, Math.PI * 2);
      g.fillStyle = i < lives ? pal.foe : "rgba(255,255,255,.15)";
      g.fill();
    }
    g.textAlign = "right";
    g.fillStyle = t.inkDim;
    g.font = `700 13px ${t.fontBody}`;
    g.fillText(`wave ${wave}`, W * 0.94, H * 0.055);
    g.textAlign = "left";

    if (over) endCard(g, t, W, H, "GAME OVER");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointermove", onMove);
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
