import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "glide-up",
  title: "Nic's Updraft",
  rule: "Drag to steer the bounce onto each platform",
  year: 2009,
  description: "Bounce, drift, climb. Don't look down.",
  history:
    "Homage to the 2009 vertical bouncer craze that turned tilting and tapping into an endless climb — one of the first true touchscreen sensations.",
  tags: ["reflex", "endurance", "casino"],
  palette: {
    hero: "#5ec8f8",
    foe: "#ff5d73",
    prize: "#ffd166",
    deep: "#1b2a4a",
    glow: "#8be8cd",
  },
  intensity: 0.5,
  luck: 0.15,
  nostalgia: 0.8,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

const BALL_R = 12;
const GRAVITY = 1500;
const BOUNCE_VY = -640;
const MAX_VX = 260;
const PLATFORM_W = 64;
const PLATFORM_H = 12;
const GAP_MIN = 68;
const GAP_MAX = 108;

interface Platform {
  x: number;
  y: number;
  w: number;
  vx: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let ball = { x: W / 2, y: H - 80, vx: 0, vy: BOUNCE_VY * 0.5 };
  let platforms: Platform[] = [];
  let topGenY = 0;
  let camTop = 0;
  let score = 0;
  let over = false;
  let bounces = 0;
  let trail: { x: number; y: number }[] = [];

  let pointerActive = false;
  let pointerX = W / 2;

  const spawnPlatform = (y: number) => {
    const w = PLATFORM_W;
    const x = rand(w / 2 + 4, W - w / 2 - 4);
    const moving = Math.random() < 0.22;
    const vx = moving ? (Math.random() < 0.5 ? -1 : 1) * rand(30, 70) : 0;
    platforms.push({ x, y, w, vx });
  };

  const reset = () => {
    ball = { x: W / 2, y: H - 80, vx: 0, vy: BOUNCE_VY * 0.5 };
    platforms = [{ x: W / 2, y: H - 36, w: PLATFORM_W, vx: 0 }];
    topGenY = H - 36;
    while (topGenY > -H * 1.5) {
      topGenY -= rand(GAP_MIN, GAP_MAX);
      spawnPlatform(topGenY);
    }
    camTop = 0;
    score = 0;
    bounces = 0;
    over = false;
    trail = [];
    pointerActive = false;
    ctx.onScore(0);
  };
  reset();

  const setPointer = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    pointerX = ((e.clientX - r.left) / r.width) * W;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    pointerActive = true;
    setPointer(e);
  };
  const onMove = (e: PointerEvent) => {
    if (!pointerActive) return;
    setPointer(e);
  };
  const onUp = () => {
    pointerActive = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);
  window.addEventListener("pointerup", onUp);

  let auto = false;

  const autoSteer = () => {
    let target: Platform | null = null;
    for (const p of platforms) {
      if (p.y > ball.y - 10 && (!target || p.y < target.y)) target = p;
    }
    pointerX = target ? target.x : W / 2;
    pointerActive = true;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (auto) autoSteer();

      if (pointerActive) {
        const desiredVx = clamp((pointerX - ball.x) * 6, -MAX_VX, MAX_VX);
        ball.vx += (desiredVx - ball.vx) * Math.min(1, dt * 7);
      } else {
        ball.vx *= Math.pow(0.001, dt);
      }
      ball.vy += GRAVITY * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.x < -BALL_R) ball.x = W + BALL_R;
      if (ball.x > W + BALL_R) ball.x = -BALL_R;

      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 10) trail.shift();

      if (ball.vy > 0) {
        for (const p of platforms) {
          const withinX = Math.abs(ball.x - p.x) < p.w / 2 + BALL_R * 0.55;
          const prevBottom = ball.y + BALL_R - ball.vy * dt;
          const withinY =
            ball.y + BALL_R >= p.y && prevBottom <= p.y + PLATFORM_H;
          if (withinX && withinY) {
            ball.vy = BOUNCE_VY;
            bounces += 1;
            ctx.haptic(bounces % 5 === 0 ? "hit" : "light");
            break;
          }
        }
      }

      for (const p of platforms) {
        if (p.vx !== 0) {
          p.x += p.vx * dt;
          if (p.x < p.w / 2) {
            p.x = p.w / 2;
            p.vx *= -1;
          } else if (p.x > W - p.w / 2) {
            p.x = W - p.w / 2;
            p.vx *= -1;
          }
        }
      }

      const desiredCam = ball.y - H * 0.42;
      if (desiredCam < camTop) camTop = desiredCam;

      const climbed = Math.max(0, -camTop);
      const newScore = Math.floor(climbed / 7);
      if (newScore > score) {
        score = newScore;
        ctx.onScore(score);
      }

      while (topGenY > camTop - H) {
        topGenY -= rand(GAP_MIN, GAP_MAX);
        spawnPlatform(topGenY);
      }
      platforms = platforms.filter((p) => p.y - camTop < H + 140);

      if (ball.y - camTop > H + 60) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    // sky background
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.25));
    sky.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < 5; i++) {
      const py = ((i * 137 - camTop * 0.15) % (H + 60)) - 30;
      g.fillStyle = "rgba(255,255,255,.05)";
      g.beginPath();
      g.arc((i * 91 + 40) % W, ((py % (H + 60)) + H + 60) % (H + 60), 26, 0, Math.PI * 2);
      g.fill();
    }

    for (const p of platforms) {
      const sy = p.y - camTop;
      if (sy < -30 || sy > H + 30) continue;
      g.fillStyle = p.vx !== 0 ? pal.prize : pal.hero;
      roundRect(g, p.x - p.w / 2, sy, p.w, PLATFORM_H, 6);
      g.fill();
      g.fillStyle = "rgba(255,255,255,.25)";
      g.fillRect(p.x - p.w / 2 + 3, sy + 2, p.w - 6, 2.5);
    }

    for (let i = 0; i < trail.length; i++) {
      const pt = trail[i];
      const k = i / trail.length;
      g.globalAlpha = k * 0.35;
      g.fillStyle = pal.glow;
      g.beginPath();
      g.arc(pt.x, pt.y - camTop, BALL_R * (0.4 + k * 0.5), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    drawNicHead(g, {
      x: ball.x,
      y: ball.y - camTop,
      r: BALL_R,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      gape: over ? 0.8 : 0,
      scowl: over ? 1 : 0,
    });

    g.textAlign = "center";
    g.fillStyle = t.ink;
    g.font = `700 15px ${t.fontBody}`;
    g.fillText(`${score}`, W / 2, 30);
    g.textAlign = "left";

    if (over) endCard(g, t, W, H, "FELL");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointerup", onUp);
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      if (!on) {
        pointerActive = false;
        reset();
      }
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
