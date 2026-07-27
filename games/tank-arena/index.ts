import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "tank-arena",
  title: "Nic's Tank Arena",
  rule: "Drag to roll, auto-fire kills the swarm",
  year: 2016,
  description: "Drag your tank, auto-fire does the rest. Survive the swarm.",
  history:
    "Homage to the 2016 top-down arena brawlers that turned auto-aim survival into an endless-scroll obsession — steer, level up, get swarmed.",
  tags: ["reflex", "endurance", "chaos"],
  palette: {
    hero: "#3fa796",
    foe: "#e14b4b",
    prize: "#f2c14e",
    deep: "#123c46",
    glow: "#7ee0c9",
  },
  intensity: 0.7,
  luck: 0.15,
  nostalgia: 0.4,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Enemy {
  x: number;
  y: number;
  r: number;
  hp: number;
  speed: number;
}
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const TIER_THRESH = [0, 6, 14, 26];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let px = 0;
  let py = 0;
  let dirX = 0;
  let dirY = -1;
  let hp = 4;
  let maxHp = 4;
  let xp = 0;
  let tier = 0;
  let score = 0;
  let over = false;
  let elapsed = 0;
  let spawnT = 0;
  let fireT = 0;
  let invuln = 0;
  let enemies: Enemy[] = [];
  let bullets: Bullet[] = [];
  let dragging = false;
  let dragX = 0;
  let dragY = 0;

  const tankR = () => 14 + tier * 3;
  const tankSpeed = () => 110 + tier * 18;
  const fireEvery = () => Math.max(0.16, 0.55 - tier * 0.12);

  const reset = () => {
    px = W / 2;
    py = H / 2;
    dirX = 0;
    dirY = -1;
    hp = 4;
    maxHp = 4;
    xp = 0;
    tier = 0;
    score = 0;
    over = false;
    elapsed = 0;
    spawnT = 0;
    fireT = 0;
    invuln = 0;
    enemies = [];
    bullets = [];
    dragging = false;
    ctx.onScore(0);
  };

  const spawnEnemy = () => {
    const side = Math.floor(rand(0, 4));
    let x = 0;
    let y = 0;
    if (side === 0) {
      x = rand(0, W);
      y = -20;
    } else if (side === 1) {
      x = W + 20;
      y = rand(0, H);
    } else if (side === 2) {
      x = rand(0, W);
      y = H + 20;
    } else {
      x = -20;
      y = rand(0, H);
    }
    const difficulty = Math.min(1, elapsed / 60);
    enemies.push({
      x,
      y,
      r: rand(10, 15),
      hp: 1 + Math.round(difficulty * rand(0, 2)),
      speed: rand(30, 46) + difficulty * 30,
    });
  };

  const nearestEnemy = (): Enemy | null => {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of enemies) {
      const d = (e.x - px) ** 2 + (e.y - py) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    dragging = true;
    dragX = e.clientX - r.left;
    dragY = e.clientY - r.top;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const r = ctx.canvas.getBoundingClientRect();
    dragX = e.clientX - r.left;
    dragY = e.clientY - r.top;
  };
  const onUp = () => {
    dragging = false;
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
      invuln = Math.max(0, invuln - dt);

      // --- steering ---
      let tx: number | null = null;
      let ty: number | null = null;
      if (auto) {
        const threat = nearestEnemy();
        if (threat) {
          const away = { x: px - threat.x, y: py - threat.y };
          const len = Math.hypot(away.x, away.y) || 1;
          tx = px + (away.x / len) * 80;
          ty = py + (away.y / len) * 80;
        } else {
          tx = W / 2;
          ty = H / 2;
        }
      } else if (dragging) {
        tx = dragX;
        ty = dragY;
      }
      if (tx !== null && ty !== null) {
        const dx = tx - px;
        const dy = ty - py;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          dirX = dx / d;
          dirY = dy / d;
          const step = tankSpeed() * dt;
          px += dirX * Math.min(step, d);
          py += dirY * Math.min(step, d);
        }
      }
      px = Math.max(tankR(), Math.min(W - tankR(), px));
      py = Math.max(tankR(), Math.min(H - tankR(), py));

      // --- spawn waves ---
      spawnT += dt;
      const spawnEvery = Math.max(0.35, 1.5 - elapsed * 0.015);
      if (spawnT >= spawnEvery) {
        spawnT = 0;
        spawnEnemy();
      }

      // --- fire ---
      fireT += dt;
      if (fireT >= fireEvery()) {
        fireT = 0;
        const target = nearestEnemy();
        let fx = dirX;
        let fy = dirY;
        if (target) {
          const dx = target.x - px;
          const dy = target.y - py;
          const d = Math.hypot(dx, dy) || 1;
          fx = dx / d;
          fy = dy / d;
        }
        bullets.push({
          x: px + fx * tankR(),
          y: py + fy * tankR(),
          vx: fx * 340,
          vy: fy * 340,
        });
      }

      // --- move enemies ---
      for (const e of enemies) {
        const dx = px - e.x;
        const dy = py - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.x += (dx / d) * e.speed * dt;
        e.y += (dy / d) * e.speed * dt;
      }

      // --- move bullets, collide ---
      bullets = bullets.filter((b) => {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) return false;
        for (const e of enemies) {
          if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 3) {
            e.hp -= 1;
            return false;
          }
        }
        return true;
      });
      enemies = enemies.filter((e) => {
        if (e.hp <= 0) {
          score += 1;
          xp += 1;
          ctx.onScore(score);
          ctx.haptic("hit");
          if (tier < TIER_THRESH.length - 1 && xp >= TIER_THRESH[tier + 1]) {
            tier += 1;
          }
          return false;
        }
        return true;
      });

      // --- player collisions ---
      if (invuln <= 0) {
        for (const e of enemies) {
          if (Math.hypot(px - e.x, py - e.y) < tankR() + e.r) {
            hp -= 1;
            invuln = 0.9;
            ctx.haptic("fail");
            e.hp = 0; // enemy dies on impact too
            if (hp <= 0) {
              over = true;
              ctx.onRunEnd(score);
            }
            break;
          }
        }
        enemies = enemies.filter((e) => e.hp > 0);
      }
    }

    // --- draw ---
    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,.03)";
    const grid = 32;
    for (let x = 0; x < W; x += grid) g.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += grid) g.fillRect(0, y, W, 1);

    for (const b of bullets) {
      g.beginPath();
      g.arc(b.x, b.y, 3, 0, Math.PI * 2);
      g.fillStyle = pal.glow;
      g.fill();
    }

    // the things closing in on you are all him
    for (const e of enemies) {
      drawNicHead(g, {
        x: e.x,
        y: e.y,
        r: e.r,
        skin: shade(pal.foe, e.hp > 1 ? 0.1 : -0.1),
        hair: shade(pal.deep, -0.4),
        eye: t.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: t.ink,
        scowl: 1,
        gape: e.hp > 1 ? 0.4 : 0,
      });
    }

    // tank body
    const tr = tankR();
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(dirY, dirX));
    g.fillStyle = invuln > 0 ? shade(pal.hero, 0.35) : shade(pal.hero, -0.1 + tier * 0.1);
    g.fillRect(-tr * 0.7, -tr * 0.55, tr * 1.4, tr * 1.1);
    g.fillStyle = shade(pal.hero, 0.2 + tier * 0.1);
    g.fillRect(0, -tr * 0.14, tr * 1.15, tr * 0.28);
    g.restore();

    // hp bar
    const bw = 60;
    g.fillStyle = "rgba(0,0,0,.35)";
    g.fillRect(W / 2 - bw / 2, 10, bw, 7);
    g.fillStyle = pal.prize;
    g.fillRect(W / 2 - bw / 2, 10, bw * Math.max(0, hp / maxHp), 7);

    if (over) endCard(g, t, W, H, "ARENA LOST");
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
