import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "blob-absorb",
  title: "Nic's Blob Absorb",
  rule: "Steer into small dots. Dodge the big ones.",
  year: 2015,
  description: "Grow your blob, dodge the bigger ones, beat the shrinking ring.",
  history:
    "Homage to the 2015 browser wave of grow-or-get-eaten arenas, where every dot on screen was either your next meal or your next death.",
  tags: ["reflex", "endurance", "chaos"],
  palette: {
    hero: "#4cc9f0",
    foe: "#f72585",
    prize: "#ffd166",
    deep: "#240046",
    glow: "#7209b7",
  },
  intensity: 0.6,
  luck: 0.15,
  nostalgia: 0.4,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Dot {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}
interface AiBlob {
  x: number;
  y: number;
  r: number;
  angle: number;
}

const DOT_COUNT = 14;
const AI_COUNT = 4;
const CHASE_RANGE = 150;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const cx = W / 2;
  const cy = H / 2;

  let player = { x: cx, y: cy, r: 16 };
  let vx = 0;
  let vy = 0;
  let dots: Dot[] = [];
  let ais: AiBlob[] = [];
  let score = 0;
  let over = false;
  let elapsed = 0;

  const initialSafe = Math.min(W, H) * 0.48;
  const minSafe = 54;
  const shrinkDuration = 75;
  let safeRadius = initialSafe;

  const spawnDot = (): Dot => ({
    x: rand(20, W - 20),
    y: rand(20, H - 20),
    r: rand(4, 6),
    vx: rand(-25, 25),
    vy: rand(-25, 25),
  });

  const spawnAi = (): AiBlob => {
    let x = 0,
      y = 0;
    let tries = 0;
    do {
      x = rand(20, W - 20);
      y = rand(20, H - 20);
      tries++;
    } while (Math.hypot(x - player.x, y - player.y) < 120 && tries < 10);
    return { x, y, r: rand(18, 42), angle: rand(0, Math.PI * 2) };
  };

  const reset = () => {
    player = { x: cx, y: cy, r: 16 };
    vx = 0;
    vy = 0;
    dots = Array.from({ length: DOT_COUNT }, spawnDot);
    ais = Array.from({ length: AI_COUNT }, spawnAi);
    score = 0;
    elapsed = 0;
    safeRadius = initialSafe;
    over = false;
    ctx.onScore(0);
  };

  let pointerActive = false;
  let pointerPos = { x: cx, y: cy };

  const posFromEvent = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    pointerActive = true;
    pointerPos = posFromEvent(e);
    ctx.haptic("light");
  };
  const onMove = (e: PointerEvent) => {
    if (!pointerActive) return;
    pointerPos = posFromEvent(e);
  };
  const onUp = () => {
    pointerActive = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;

  const autoTarget = (): { x: number; y: number } | null => {
    // flee the nearest bigger threat if it's close, otherwise chase nearest dot
    let threat: AiBlob | null = null;
    let threatDist = Infinity;
    for (const a of ais) {
      if (a.r <= player.r * 1.05) continue;
      const d = Math.hypot(a.x - player.x, a.y - player.y);
      if (d < threatDist) {
        threatDist = d;
        threat = a;
      }
    }
    if (threat && threatDist < CHASE_RANGE * 1.1) {
      const dx = player.x - threat.x;
      const dy = player.y - threat.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: player.x + (dx / d) * 100, y: player.y + (dy / d) * 100 };
    }
    let best: Dot | null = null;
    let bestDist = Infinity;
    for (const d of dots) {
      const dist = Math.hypot(d.x - player.x, d.y - player.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      elapsed += dt;
      const shrinkRate = (initialSafe - minSafe) / shrinkDuration;
      safeRadius = Math.max(minSafe, initialSafe - elapsed * shrinkRate);

      const target = pointerActive ? pointerPos : auto ? autoTarget() : null;
      const maxSpeed = clamp(230 - player.r * 1.4, 70, 230);
      let desiredVx = 0;
      let desiredVy = 0;
      if (target) {
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const dist = Math.hypot(dx, dy) || 1;
        desiredVx = (dx / dist) * maxSpeed;
        desiredVy = (dy / dist) * maxSpeed;
      }
      const ease = clamp(dt * 4, 0, 1);
      vx += (desiredVx - vx) * ease;
      vy += (desiredVy - vy) * ease;
      player.x = clamp(player.x + vx * dt, player.r, W - player.r);
      player.y = clamp(player.y + vy * dt, player.r, H - player.r);

      for (const d of dots) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.x < d.r || d.x > W - d.r) d.vx *= -1;
        if (d.y < d.r || d.y > H - d.r) d.vy *= -1;
        d.x = clamp(d.x, d.r, W - d.r);
        d.y = clamp(d.y, d.r, H - d.r);
      }

      for (const a of ais) {
        const distToPlayer = Math.hypot(a.x - player.x, a.y - player.y);
        let speed: number;
        if (distToPlayer < CHASE_RANGE) {
          a.angle = Math.atan2(player.y - a.y, player.x - a.x);
          speed = 62;
        } else {
          a.angle += rand(-1, 1) * dt * 1.6;
          speed = 34;
        }
        a.x += Math.cos(a.angle) * speed * dt;
        a.y += Math.sin(a.angle) * speed * dt;
        if (a.x < a.r || a.x > W - a.r) {
          a.angle = Math.PI - a.angle;
          a.x = clamp(a.x, a.r, W - a.r);
        }
        if (a.y < a.r || a.y > H - a.r) {
          a.angle = -a.angle;
          a.y = clamp(a.y, a.r, H - a.r);
        }
      }

      // player vs dots
      for (let i = dots.length - 1; i >= 0; i--) {
        const d = dots[i];
        if (Math.hypot(d.x - player.x, d.y - player.y) < player.r + d.r) {
          score += 1;
          player.r = Math.min(70, player.r + 0.8);
          ctx.onScore(score);
          ctx.haptic("hit");
          dots[i] = spawnDot();
        }
      }

      // player vs ai blobs
      for (let i = 0; i < ais.length; i++) {
        const a = ais[i];
        if (Math.hypot(a.x - player.x, a.y - player.y) < player.r + a.r) {
          if (a.r > player.r * 1.05) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          } else {
            score += 5;
            player.r = Math.min(85, player.r + 4);
            ctx.onScore(score);
            ctx.haptic("hit");
            ais[i] = spawnAi();
          }
        }
      }

      // shrinking safe zone
      if (!over && Math.hypot(player.x - cx, player.y - cy) > safeRadius + player.r * 0.3) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    g.fillStyle = pal.deep;
    g.fillRect(0, 0, W, H);

    // danger zone outside the shrinking ring
    g.save();
    g.fillStyle = "rgba(247,37,133,0.16)";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.arc(cx, cy, safeRadius, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.beginPath();
    g.arc(cx, cy, safeRadius, 0, Math.PI * 2);
    g.strokeStyle = pal.glow;
    g.lineWidth = 3;
    g.stroke();

    for (const d of dots) {
      g.beginPath();
      g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      g.fillStyle = pal.prize;
      g.fill();
    }

    for (const a of ais) {
      g.beginPath();
      g.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      g.fillStyle = a.r > player.r ? pal.foe : "rgba(247,37,133,0.55)";
      g.fill();
    }

    drawNicHead(g, {
      x: player.x,
      y: player.y,
      r: player.r,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      // he eats his way up the food chain, so the jaw stays busy
      gape: over ? 0.9 : 0.3,
      scowl: over ? 1 : 0,
    });

    if (over) endCard(g, t, W, H, "ABSORBED");
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
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
