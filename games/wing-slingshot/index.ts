import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "wing-slingshot",
  title: "Nic's Slingshot Yard",
  rule: "Drag back, let go, knock down the yard.",
  year: 2009,
  description: "Pull back, let fly, and watch the yard tumble down.",
  history:
    "Homage to the 2009 physics-flinging phenomenon that turned toppling wooden yards into a pocket-sized obsession.",
  tags: ["precision", "drag", "chaos"],
  palette: {
    hero: "#ff9f1c",
    foe: "#8d6a4f",
    prize: "#ffe066",
    deep: "#2b2d42",
    glow: "#ef476f",
  },
  intensity: 0.55,
  luck: 0.1,
  nostalgia: 0.8,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  vx: number;
  vy: number;
  angVel: number;
  awake: boolean;
  toppled: boolean;
  counted: boolean;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  r: number;
}

const GRAVITY = 1500;

function mount(ctx: GameContext): GameInstance {
  const safeTop = ctx.safeTop;
  const { g, width: W, height: H, pal } = ctx;

  const anchor = { x: W * 0.22, y: H * 0.6 };
  const towerX = W * 0.72;
  const groundY = H * 0.82;
  const maxPull = Math.min(W, H) * 0.18;

  let blocks: Block[] = [];
  let level = 1;
  let score = 0;
  let missStreak = 0;
  let over = false;

  let dragging = false;
  let pull = { x: 0, y: 0 };
  let proj: Projectile = { x: anchor.x, y: anchor.y, vx: 0, vy: 0, active: false, r: 9 };
  let hitThisShot = false;
  let trail: { x: number; y: number }[] = [];

  const buildStack = (lvl: number): Block[] => {
    const rows = Math.min(3 + lvl, 9);
    const bw = Math.min(60, W * 0.14);
    const bh = 26;
    const arr: Block[] = [];
    for (let i = 0; i < rows; i++) {
      arr.push({
        x: towerX,
        y: groundY - bh / 2 - i * bh,
        w: bw,
        h: bh,
        angle: 0,
        vx: 0,
        vy: 0,
        angVel: 0,
        awake: false,
        toppled: false,
        counted: false,
      });
    }
    return arr;
  };

  const reset = () => {
    level = 1;
    score = 0;
    missStreak = 0;
    over = false;
    blocks = buildStack(level);
    proj = { x: anchor.x, y: anchor.y, vx: 0, vy: 0, active: false, r: 9 };
    trail = [];
    dragging = false;
    pull = { x: 0, y: 0 };
    ctx.onScore(0);
  };

  const launch = (pv: { x: number; y: number }) => {
    const K = 6.4;
    proj = {
      x: anchor.x + pv.x,
      y: anchor.y + pv.y,
      vx: -pv.x * K,
      vy: -pv.y * K,
      active: true,
      r: 9,
    };
    hitThisShot = false;
    trail = [];
    ctx.haptic("light");
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const d = Math.hypot(mx - anchor.x, my - anchor.y);
    if (!proj.active && d < 100) {
      dragging = true;
      pull = { x: 0, y: 0 };
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const r = ctx.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let dx = mx - anchor.x;
    let dy = my - anchor.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxPull) {
      dx *= maxPull / dist;
      dy *= maxPull / dist;
    }
    pull = { x: dx, y: dy };
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    if (Math.hypot(pull.x, pull.y) > 10) launch(pull);
    pull = { x: 0, y: 0 };
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  let auto = false;
  let autoCd = 0.6;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0 && !proj.active && !dragging) {
          launch({ x: -maxPull * (0.7 + Math.random() * 0.2), y: maxPull * (0.35 + Math.random() * 0.3) });
          autoCd = 1.2;
        }
      }

      if (proj.active) {
        proj.vy += GRAVITY * dt;
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
        trail.push({ x: proj.x, y: proj.y });
        if (trail.length > 10) trail.shift();

        for (const b of blocks) {
          if (b.toppled) continue;
          const dx = proj.x - b.x;
          const dy = proj.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < proj.r + Math.max(b.w, b.h) * 0.42) {
            b.awake = true;
            b.vx += proj.vx * 0.35 + (dx / (dist || 1)) * 170;
            b.vy -= 130;
            b.angVel += (dx < 0 ? -1 : 1) * rand(4, 8);
            hitThisShot = true;
            ctx.haptic("hit");
            proj.vx *= 0.3;
            proj.vy *= -0.15;
          }
        }

        if (proj.x > W + 60 || proj.x < -60 || proj.y > H + 60) {
          proj.active = false;
          if (!hitThisShot) {
            missStreak += 1;
            if (missStreak >= 3) {
              over = true;
              ctx.haptic("fail");
              ctx.onRunEnd(score);
            }
          } else {
            missStreak = 0;
          }
        }
      }

      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const supported = i === 0 ? true : !blocks[i - 1].toppled;
        if (!supported) b.awake = true;
        if (b.awake) {
          b.vy += GRAVITY * 0.55 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.angle += b.angVel * dt;
          b.vx *= 0.98;
          b.angVel *= 0.985;
          if (b.y + b.h / 2 > groundY) {
            b.y = groundY - b.h / 2;
            b.vy *= -0.12;
          }
          if (!b.toppled && Math.abs(b.angle) > 1.0) b.toppled = true;
          if (b.toppled && !b.counted) {
            b.counted = true;
            score += 1;
            ctx.onScore(score);
          }
        }
      }

      if (!over && blocks.length > 0 && blocks.every((b) => b.toppled)) {
        level += 1;
        blocks = buildStack(level);
      }
    }

    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.15));
    sky.addColorStop(1, shade(pal.deep, -0.35));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // ground
    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, groundY, W, H - groundY);

    // slingshot posts + band
    const pouch = !proj.active
      ? { x: anchor.x + pull.x, y: anchor.y + pull.y }
      : { x: anchor.x, y: anchor.y };
    g.strokeStyle = shade(pal.foe, 0.1);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(anchor.x - 12, groundY);
    g.lineTo(pouch.x, pouch.y);
    g.moveTo(anchor.x + 12, groundY);
    g.lineTo(pouch.x, pouch.y);
    g.stroke();
    if (!proj.active) {
      drawNicHead(g, {
        x: pouch.x,
        y: pouch.y,
        r: 11,
        skin: pal.hero,
        hair: shade(pal.deep, -0.4),
        eye: t.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: t.ink,
        scowl: 0.7,
      });
    }

    // blocks
    for (const b of blocks) {
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.angle);
      g.fillStyle = shade(pal.foe, b.toppled ? -0.15 : 0.05);
      roundRect(g, -b.w / 2, -b.h / 2, b.w, b.h, 5);
      g.fill();
      g.strokeStyle = pal.prize;
      g.lineWidth = 1.5;
      g.stroke();
      g.restore();
    }

    // trail + projectile
    for (let i = 0; i < trail.length; i++) {
      const p = trail[i];
      g.globalAlpha = (i / trail.length) * 0.4;
      g.beginPath();
      g.arc(p.x, p.y, 6, 0, Math.PI * 2);
      g.fillStyle = pal.glow;
      g.fill();
    }
    g.globalAlpha = 1;
    if (proj.active) {
      g.beginPath();
      g.arc(proj.x, proj.y, proj.r, 0, Math.PI * 2);
      g.fillStyle = pal.hero;
      g.fill();
    }

    // HUD: level + miss dots
    g.fillStyle = t.ink;
    g.font = `700 15px ${t.fontDisplay}`;
    g.fillText(`YARD ${level}`, 14, 24 + safeTop);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(W - 20 - i * 16, 18, 5, 0, Math.PI * 2);
      g.fillStyle = i < missStreak ? pal.foe : "rgba(255,255,255,.25)";
      g.fill();
    }

    if (over) endCard(g, t, W, H, "YARD CLEARED OUT");
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
