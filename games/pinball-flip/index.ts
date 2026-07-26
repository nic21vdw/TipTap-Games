import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "pinball-flip",
  title: "Nic's Pinball",
  rule: "Flip left, flip right. Keep the ball alive.",
  year: 1995,
  description: "No high score is safe from one bad bounce.",
  history:
    "Homage to the arcade cabinet flipper table — steel ball, tilt bumpers, three tries, no mercy.",
  tags: ["reflex", "luck"],
  palette: {
    hero: "#ffd700",
    foe: "#c1121f",
    prize: "#00b4d8",
    deep: "#0b0c10",
    glow: "#7209b7",
  },
  intensity: 0.6,
  luck: 0.4,
  nostalgia: 1.0,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 20,
} satisfies GameModule["meta"];

interface Bumper {
  x: number;
  y: number;
  r: number;
  hit: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const flipperY = H * 0.86;
  const flipperLen = W * 0.24;
  let leftAngle = 0.35;
  let rightAngle = 0.35;
  let ballsLeft = 3;
  let score = 0;
  let over = false;
  let bumpers: Bumper[] = [];
  let ball = { x: W / 2, y: H * 0.5, vx: 0, vy: 0, active: false };
  let plunger = 0;
  let charging = false;

  const buildBumpers = () => {
    bumpers = [];
    for (let i = 0; i < 6; i++) {
      bumpers.push({ x: rand(W * 0.2, W * 0.8), y: rand(H * 0.15, H * 0.55), r: 18, hit: 0 });
    }
  };

  const launchBall = () => {
    ball = { x: W * 0.9, y: H * 0.7, vx: -40, vy: -(300 + plunger * 500), active: true };
    plunger = 0;
  };

  const reset = () => {
    ballsLeft = 3;
    score = 0;
    over = false;
    buildBumpers();
    ball.active = false;
    ctx.onScore(0);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (!ball.active) {
      charging = true;
      return;
    }
    if (x < W / 2) leftAngle = 1.1;
    else rightAngle = 1.1;
  };
  const onUp = () => {
    if (charging) {
      charging = false;
      launchBall();
    }
    leftAngle = 0.35;
    rightAngle = 0.35;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();
  let auto = false;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();
    if (!over) {
      if (charging) plunger = clamp(plunger + dt * 0.7, 0, 1);
      if (auto && !ball.active) launchBall();
      if (auto && ball.active) {
        leftAngle = ball.x < W / 2 ? 1.1 : 0.35;
        rightAngle = ball.x >= W / 2 ? 1.1 : 0.35;
      }
      if (ball.active) {
        ball.vy += 500 * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if (ball.x < 14) {
          ball.x = 14;
          ball.vx *= -0.6;
        }
        if (ball.x > W - 14) {
          ball.x = W - 14;
          ball.vx *= -0.6;
        }
        if (ball.y < 14) {
          ball.y = 14;
          ball.vy *= -0.6;
        }
        for (const b of bumpers) {
          const dx = ball.x - b.x;
          const dy = ball.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < b.r + 8) {
            const nx = dx / (dist || 1);
            const ny = dy / (dist || 1);
            ball.vx = nx * 260;
            ball.vy = ny * 260;
            b.hit = 1;
            score += 10;
            ctx.onScore(score);
            ctx.haptic("hit");
          }
        }
        const flL = { x: W * 0.5 - flipperLen, y: flipperY };
        const flR = { x: W * 0.5 + flipperLen, y: flipperY };
        if (ball.y > flipperY - 14 && ball.y < flipperY + 14) {
          if (ball.x > flL.x - 20 && ball.x < W / 2 && leftAngle > 0.7) {
            ball.vy = -320;
            ball.vx -= 60;
          } else if (ball.x < flR.x + 20 && ball.x >= W / 2 && rightAngle > 0.7) {
            ball.vy = -320;
            ball.vx += 60;
          }
        }
        if (ball.y > H + 30) {
          ball.active = false;
          ballsLeft -= 1;
          ctx.haptic("fail");
          if (ballsLeft <= 0) {
            over = true;
            ctx.onRunEnd(score);
          }
        }
      }
      for (const b of bumpers) b.hit = Math.max(0, b.hit - dt * 3);
    }

    g.fillStyle = shade(pal.deep, -0.3);
    g.fillRect(0, 0, W, H);

    for (const b of bumpers) {
      g.fillStyle = b.hit > 0 ? pal.prize : pal.glow;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      g.fill();
    }

    g.save();
    g.translate(W * 0.5 - flipperLen * 0.3, flipperY);
    g.rotate(-leftAngle);
    g.fillStyle = pal.hero;
    g.fillRect(0, -6, flipperLen, 12);
    g.restore();

    g.save();
    g.translate(W * 0.5 + flipperLen * 0.3, flipperY);
    g.rotate(rightAngle);
    g.fillStyle = pal.hero;
    g.fillRect(-flipperLen, -6, flipperLen, 12);
    g.restore();

    if (ball.active) {
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(ball.x, ball.y, 8, 0, Math.PI * 2);
      g.fill();
    } else if (!over) {
      g.fillStyle = theme.surface;
      g.fillRect(W * 0.92, H * 0.4, 10, H * 0.4);
      g.fillStyle = pal.foe;
      g.fillRect(W * 0.92, H * 0.8 - plunger * H * 0.35, 10, plunger * H * 0.35);
    }

    g.fillStyle = theme.ink;
    g.font = "700 13px system-ui";
    g.textAlign = "left";
    g.fillText(`Balls: ${ballsLeft}`, 12, 24);

    if (over) endCard(g, theme, W, H, "TILT");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
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
