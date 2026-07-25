import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "loop-run",
  title: "Loop Runner",
  rule: "Tap to hop, hold to hop higher. Don't spike.",
  year: 2013,
  description: "One tap, one beat, one spike away from zero.",
  history:
    "Homage to the 2013 one-tap rhythm runners that turned a single finger into an entire control scheme — hold longer, jump higher, miss once and start over.",
  tags: ["reflex", "oneTap", "retro"],
  palette: {
    hero: "#ffb703",
    foe: "#e63946",
    prize: "#8ecae6",
    deep: "#023047",
    glow: "#fb8500",
  },
  intensity: 0.7,
  luck: 0.05,
  nostalgia: 0.6,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

interface Spike {
  x: number;
  w: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const groundY = H * 0.72;
  const ballR = W * 0.045;
  const ballX = W * 0.28;

  let ballY = groundY;
  let vy = 0;
  let onGround = true;
  let holdT = 0;
  let holding = false;

  let spikes: Spike[] = [];
  let scrollX = 0;
  let speed = 0;
  let baseSpeed = W * 0.32;
  let score = 0;
  let over = false;
  let pulse = 0;
  let elapsed = 0;

  const GRAV = H * 4.2;
  const JUMP_MIN = -H * 1.15;

  const spawnSpike = (fromX: number) => {
    const gap = W * (0.55 + Math.random() * 0.5);
    const w = W * (0.045 + Math.random() * 0.03);
    spikes.push({ x: fromX + gap, w });
  };

  const reset = () => {
    ballY = groundY;
    vy = 0;
    onGround = true;
    holdT = 0;
    holding = false;
    speed = baseSpeed;
    scrollX = 0;
    score = 0;
    over = false;
    elapsed = 0;
    spikes = [];
    let x = W * 0.9;
    for (let i = 0; i < 8; i++) {
      spawnSpike(x);
      x = spikes[spikes.length - 1].x;
    }
    ctx.onScore(0);
  };

  const doJump = () => {
    if (!onGround || over) return;
    onGround = false;
    vy = JUMP_MIN;
    ctx.haptic("light");
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    holding = true;
    holdT = 0;
    doJump();
  };
  const onUp = () => {
    holding = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    pulse += dt;

    if (!over) {
      elapsed += dt;
      speed = baseSpeed + Math.min(W * 0.5, elapsed * W * 0.01);

      if (auto) {
        // greedy: jump when the nearest spike is close enough
        const near = spikes.find((s) => s.x - scrollX > ballX);
        if (near && onGround) {
          const dist = near.x - scrollX - ballX;
          if (dist < W * 0.32 && dist > W * 0.1) doJump();
        }
      }

      // physics: holding extends the jump by slowing gravity while ascending
      if (!onGround) {
        if (holding && vy < 0) {
          holdT += dt;
          const extra = Math.min(1, holdT / 0.28);
          vy += GRAV * dt * (1 - extra * 0.55);
        } else {
          vy += GRAV * dt;
        }
        ballY += vy * dt;
        if (ballY >= groundY) {
          ballY = groundY;
          vy = 0;
          onGround = true;
        }
      }

      scrollX += speed * dt;
      score = Math.floor(scrollX / (W * 0.12));
      ctx.onScore(score);

      // collision: spike hit if ball overlaps spike x-range while near ground
      for (const s of spikes) {
        const sx = s.x - scrollX;
        if (sx + s.w / 2 > ballX - ballR && sx - s.w / 2 < ballX + ballR) {
          if (ballY > groundY - ballR * 1.3) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
            break;
          }
        }
      }

      // cull / spawn spikes
      while (spikes.length && spikes[0].x - scrollX < -W * 0.2) spikes.shift();
      while (spikes.length < 8) {
        const last = spikes[spikes.length - 1];
        spawnSpike(last ? last.x : scrollX + W);
      }
    }

    // background
    g.fillStyle = shade(pal.deep, -0.62);
    g.fillRect(0, 0, W, H);

    // distant parallax stripes
    g.fillStyle = shade(pal.deep, -0.35);
    for (let i = 0; i < 6; i++) {
      const x = ((i * W * 0.4 - scrollX * 0.25) % (W * 2.4)) - W * 0.4;
      g.fillRect(x, H * 0.15, W * 0.06, H * 0.5);
    }

    // ground line
    g.fillStyle = shade(pal.deep, -0.1);
    g.fillRect(0, groundY + ballR, W, H - (groundY + ballR));
    g.fillStyle = pal.glow;
    g.fillRect(0, groundY + ballR, W, 3);

    // rhythm pulse ring (visual metronome, ~2Hz)
    const beat = (pulse * 2) % 1;
    const ringR = W * 0.09 * (0.6 + beat * 0.5);
    g.strokeStyle = shade(pal.prize, 0.1);
    g.globalAlpha = 1 - beat;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(W * 0.5, H * 0.14, ringR, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;

    // spikes
    for (const s of spikes) {
      const sx = s.x - scrollX;
      if (sx < -s.w || sx > W + s.w) continue;
      g.fillStyle = over ? shade(pal.foe, 0.1) : pal.foe;
      g.beginPath();
      g.moveTo(sx - s.w / 2, groundY + ballR);
      g.lineTo(sx, groundY + ballR - H * 0.14);
      g.lineTo(sx + s.w / 2, groundY + ballR);
      g.closePath();
      g.fill();
    }

    // ball
    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(ballX, ballY - ballR, ballR, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(ballX - ballR * 0.3, ballY - ballR * 1.3, ballR * 0.28, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,.65)";
    g.fill();

    if (over) endCard(g, t, W, H, "GAME OVER");
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
