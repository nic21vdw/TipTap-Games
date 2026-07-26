import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade, rand, clamp } from "@/games/engine";

const meta = {
  slug: "bounce-hop",
  title: "Nic's Bounce Hop",
  rule: "Tap to boost the bounce, ride the springs",
  year: 2001,
  description:
    "Auto-bounce along a scrolling platform trail. Tap the apex, catch the spring, chase distance.",
  history:
    "Homage to the 2001 pocket physics platformer that turned a bouncing ball and a handful of springs into the ultimate waiting-room timekiller.",
  tags: ["reflex", "precision", "retro"],
  palette: {
    hero: "#ff5d73",
    foe: "#2b2d42",
    prize: "#ffd23f",
    deep: "#10163a",
    glow: "#4fd6ff",
  },
  intensity: 0.55,
  luck: 0.15,
  nostalgia: 1.0,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

const GRAVITY = 900;
const RADIUS = 12;
const ANCHOR_X = 0.32; // ball's fixed screen-x fraction
const BOUNCE = -520;
const SPRING_BOUNCE = -900;
const TAP_BOOST = -250;
const MIN_VY = -1000;

type Plat = { x: number; y: number; w: number; spring: boolean };

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let ball = { worldX: 0, y: 0, vy: 0, prevY: 0 };
  let vx = 150;
  let plats: Plat[] = [];
  let score = 0;
  let bonus = 0;
  let over = false;
  let elapsed = 0;
  let auto = false;
  let particles: { x: number; y: number; life: number; c: string }[] = [];

  const anchorX = W * ANCHOR_X;

  const spawnAfter = (prev: Plat): Plat => {
    const gap = rand(70, 130);
    const w = rand(50, 90);
    const y = clamp(prev.y + rand(-120, 120), H * 0.12, H * 0.92);
    const spring = Math.random() < 0.16;
    return { x: prev.x + prev.w / 2 + gap + w / 2, y, w, spring };
  };

  const ensurePlats = () => {
    const rightEdge = ball.worldX + W * 1.3;
    while (plats.length === 0 || plats[plats.length - 1].x < rightEdge) {
      plats.push(
        plats.length === 0
          ? { x: 0, y: H * 0.7, w: 90, spring: false }
          : spawnAfter(plats[plats.length - 1])
      );
    }
    // cull far-behind platforms
    const leftEdge = ball.worldX - W;
    plats = plats.filter((p) => p.x + p.w / 2 >= leftEdge);
  };

  const reset = () => {
    ball = { worldX: 0, y: H * 0.5, vy: 0, prevY: H * 0.5 };
    vx = 150;
    plats = [];
    score = 0;
    bonus = 0;
    over = false;
    elapsed = 0;
    particles = [];
    ensurePlats();
    ctx.onScore(0);
  };

  const boost = () => {
    if (over) {
      reset();
      return;
    }
    ball.vy = Math.max(MIN_VY, ball.vy + TAP_BOOST);
    ctx.haptic("light");
  };

  const onDown = () => boost();
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    elapsed += dt;

    if (!over) {
      if (auto) {
        // attract-mode bot: tap whenever descent risks missing next platform
        if (ball.vy > -60) {
          ball.vy = Math.max(MIN_VY, ball.vy + TAP_BOOST * 0.7);
        }
      }
      vx = 150 + Math.min(90, elapsed * 1.6);
      ball.prevY = ball.y;
      ball.vy += GRAVITY * dt;
      ball.y += ball.vy * dt;
      ball.worldX += vx * dt;
      ensurePlats();

      if (ball.vy > 0) {
        for (const p of plats) {
          const screenX = anchorX; // ball always drawn at anchorX
          const px = p.x - ball.worldX + anchorX;
          if (
            px + p.w / 2 > screenX - RADIUS &&
            px - p.w / 2 < screenX + RADIUS &&
            ball.prevY + RADIUS <= p.y &&
            ball.y + RADIUS >= p.y
          ) {
            ball.y = p.y - RADIUS;
            if (p.spring) {
              ball.vy = SPRING_BOUNCE;
              bonus += 25;
              ctx.haptic("hit");
              for (let i = 0; i < 10; i++)
                particles.push({ x: px, y: p.y, life: 0.5, c: pal.prize });
            } else {
              ball.vy = BOUNCE;
              ctx.haptic("light");
            }
            break;
          }
        }
      }

      if (ball.y - RADIUS > H) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      } else {
        const dist = Math.floor(ball.worldX / 12) + bonus;
        if (dist !== score) {
          score = dist;
          ctx.onScore(score);
        }
      }
    }

    for (const pt of particles) pt.life -= dt;
    particles = particles.filter((pt) => pt.life > 0);

    // sky background
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.12));
    sky.addColorStop(1, shade(pal.deep, -0.5));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // distant glow band
    g.fillStyle = shade(pal.glow, -0.2);
    g.globalAlpha = 0.08;
    g.fillRect(0, H * 0.72, W, H * 0.28);
    g.globalAlpha = 1;

    // platforms
    for (const p of plats) {
      const px = p.x - ball.worldX + anchorX;
      if (px + p.w / 2 < 0 || px - p.w / 2 > W) continue;
      if (p.spring) {
        g.fillStyle = pal.prize;
        roundRect(g, px - p.w / 2, p.y - 6, p.w, 12, 6);
        g.fill();
        g.strokeStyle = shade(pal.prize, -0.4);
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i <= 5; i++) {
          const zx = px - p.w / 2 + (p.w * i) / 5;
          g.lineTo(zx, p.y + (i % 2 === 0 ? -4 : 4));
        }
        g.stroke();
      } else {
        g.fillStyle = shade(pal.hero, -0.55);
        roundRect(g, px - p.w / 2, p.y - 7, p.w, 14, 7);
        g.fill();
      }
    }

    // particles
    for (const pt of particles) {
      g.globalAlpha = clamp(pt.life / 0.5, 0, 1);
      g.beginPath();
      g.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      g.fillStyle = pt.c;
      g.fill();
      g.globalAlpha = 1;
    }

    // ball
    const stretch = clamp(Math.abs(ball.vy) / 900, 0, 0.5);
    g.save();
    g.translate(anchorX, ball.y);
    g.scale(1 - stretch * 0.3, 1 + stretch * 0.3);
    g.beginPath();
    g.arc(0, 0, RADIUS, 0, Math.PI * 2);
    g.fillStyle = over ? shade(pal.foe, 0.1) : pal.hero;
    g.fill();
    g.beginPath();
    g.arc(-RADIUS * 0.3, -RADIUS * 0.35, RADIUS * 0.3, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,.55)";
    g.fill();
    g.restore();

    if (over) endCard(g, t, W, H, "FELL SHORT");
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
