import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "side-blaster",
  title: "Nic's Side Blaster",
  rule: "Drag to dodge, tap to fire",
  year: 1999,
  description: "Dodge the lane, blast the block, ride the scroll faster and faster.",
  history:
    "Homage to the 1999 chunky-pixel side-scrolling shooters that lit up tiny monochrome and color screens alike.",
  tags: ["reflex", "drag", "chaos"],
  palette: {
    hero: "#39ff14",
    foe: "#ff2e2e",
    prize: "#ffe066",
    deep: "#0a0a12",
    glow: "#00d9ff",
  },
  intensity: 0.9,
  luck: 0.05,
  nostalgia: 1.0,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 7,
} satisfies GameModule["meta"];

// Chunky, low-res pixel look: every draw snaps to a coarse CELL grid instead
// of smooth shapes, to evoke a feature-phone screen.
const CELL = 6;
const px = (v: number) => Math.round(v / CELL) * CELL;

// Ship silhouette drawn as filled cells on a 5x5 grid (arrow pointing right).
const SHIP_CELLS: [number, number][] = [
  [0, 2],
  [1, 1], [1, 2], [1, 3],
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
  [3, 1], [3, 2], [3, 3],
  [4, 2],
];

interface Enemy { x: number; y: number; s: number; vx: number }
interface Shot { x: number; y: number; vx: number }
interface Bit { x: number; y: number; vx: number; vy: number; life: number }

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const shipX = W * 0.22;
  const margin = 30;

  let shipY = H / 2;
  let enemies: Enemy[] = [];
  let shots: Shot[] = [];
  let bits: Bit[] = [];
  let spawnTimer = 0;
  // Auto-fire trickle: the ship fires on a fixed interval by itself; a tap
  // fires immediately on top of that and resets the interval, so tapping
  // faster than the auto rate boosts overall fire rate.
  let fireTimer = 0;
  const AUTO_FIRE_INTERVAL = 0.5;
  let scoreAcc = 0;
  let score = 0;
  let over = false;
  let elapsed = 0;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let moved = 0;

  const fire = () => {
    shots.push({ x: shipX + 16, y: shipY, vx: 480 });
  };

  const spawnEnemy = () => {
    const s = rand(16, 26);
    enemies.push({
      x: W + s,
      y: rand(margin + s, H - margin - s),
      s,
      vx: -(140 + Math.min(260, elapsed * 6)),
    });
  };

  const burst = (x: number, y: number) => {
    for (let i = 0; i < 7; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, 160);
      bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 });
    }
  };

  const reset = () => {
    shipY = H / 2;
    enemies = [];
    shots = [];
    bits = [];
    spawnTimer = 0;
    fireTimer = 0;
    scoreAcc = 0;
    score = 0;
    over = false;
    elapsed = 0;
    ctx.onScore(0);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    dragging = true;
    startX = e.clientX - r.left;
    startY = e.clientY - r.top;
    lastY = startY;
    moved = 0;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const r = ctx.canvas.getBoundingClientRect();
    const y = e.clientY - r.top;
    const dy = y - lastY;
    lastY = y;
    moved += Math.abs(dy);
    shipY = clamp(shipY + dy, margin, H - margin);
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (over) return;
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const totalMove = moved + Math.abs(x - startX);
    if (totalMove < 10) {
      fire();
      fireTimer = AUTO_FIRE_INTERVAL;
      ctx.haptic("light");
    }
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      elapsed += dt;

      if (auto) {
        const threat = enemies.find(
          (e) => e.x - shipX < 100 && e.x > shipX - 20 && Math.abs(e.y - shipY) < e.s + 22
        );
        if (threat) {
          shipY += (threat.y < shipY ? 1 : -1) * dt * 220;
        } else if (enemies.length) {
          const target = enemies.reduce((a, b) =>
            Math.abs(a.y - shipY) < Math.abs(b.y - shipY) ? a : b
          );
          shipY += clamp(target.y - shipY, -160 * dt, 160 * dt);
        }
        shipY = clamp(shipY, margin, H - margin);
      }

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnEnemy();
        spawnTimer = Math.max(0.35, 1.1 - elapsed * 0.015);
      }

      fireTimer -= dt;
      if (fireTimer <= 0) {
        fire();
        fireTimer = AUTO_FIRE_INTERVAL;
      }

      for (const e of enemies) e.x += e.vx * dt;
      for (const s of shots) s.x += s.vx * dt;
      enemies = enemies.filter((e) => e.x > -40);
      shots = shots.filter((s) => s.x < W + 20);

      for (const b of bits) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
      }
      bits = bits.filter((b) => b.life > 0);

      // projectile vs enemy
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        let hit = false;
        for (let j = enemies.length - 1; j >= 0 && !hit; j--) {
          const e = enemies[j];
          if (Math.abs(s.x - e.x) < e.s * 0.8 && Math.abs(s.y - e.y) < e.s * 0.8) {
            burst(e.x, e.y);
            enemies.splice(j, 1);
            shots.splice(i, 1);
            score += 4;
            ctx.onScore(score);
            ctx.haptic("hit");
            hit = true;
          }
        }
      }

      // ship vs enemy
      for (const e of enemies) {
        if (Math.abs(e.x - shipX) < e.s * 0.7 + 12 && Math.abs(e.y - shipY) < e.s * 0.7 + 12) {
          over = true;
          burst(shipX, shipY);
          ctx.haptic("fail");
          ctx.onRunEnd(score);
          break;
        }
      }

      if (!over) {
        scoreAcc += dt * 1.6;
        if (scoreAcc >= 1) {
          const add = Math.floor(scoreAcc);
          scoreAcc -= add;
          score += add;
          ctx.onScore(score);
        }
      }
    } else {
      for (const b of bits) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
      }
      bits = bits.filter((b) => b.life > 0);
    }

    // background: chunky scroll stripes for a sense of speed
    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);
    const scroll = (elapsed * 90) % (CELL * 8);
    g.fillStyle = shade(pal.deep, -0.35);
    for (let x = -scroll; x < W; x += CELL * 8) {
      g.fillRect(px(x), 0, CELL * 3, H);
    }

    // enemies: chunky blocks
    for (const e of enemies) {
      const s = px(e.s);
      g.fillStyle = shade(pal.foe, -0.35);
      g.fillRect(px(e.x - s / 2), px(e.y + s / 2 - CELL), s, CELL);
      // the wave coming at you is him
      drawNicHead(g, {
        x: px(e.x),
        y: px(e.y),
        r: s * 0.5,
        skin: pal.foe,
        hair: shade(pal.deep, -0.4),
        eye: t.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: t.ink,
        scowl: 1,
      });
    }

    // shots
    for (const s of shots) {
      g.fillStyle = pal.glow;
      g.fillRect(px(s.x - 8), px(s.y - CELL / 2), 16, CELL);
    }

    // particles
    for (const b of bits) {
      g.globalAlpha = clamp(b.life / 0.4, 0, 1);
      g.fillStyle = pal.prize;
      g.fillRect(px(b.x), px(b.y), CELL - 1, CELL - 1);
      g.globalAlpha = 1;
    }

    // ship
    const cellSz = CELL;
    const shipColor = over ? shade(pal.hero, -0.3) : pal.hero;
    for (const [c, r] of SHIP_CELLS) {
      g.fillStyle = shipColor;
      g.fillRect(
        px(shipX - cellSz * 2.5 + c * cellSz),
        px(shipY - cellSz * 2.5 + r * cellSz),
        cellSz - 1,
        cellSz - 1
      );
    }

    if (over) endCard(g, t, W, H, "SHOT DOWN");
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
