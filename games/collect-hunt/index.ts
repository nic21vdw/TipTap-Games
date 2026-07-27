import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade, clamp, rand } from "@/games/engine";
import { drawNicHead } from "@/games/nic";
import { drawDrink, skins } from "@/games/nic-art";

const meta = {
  slug: "collect-hunt",
  title: "Nic's Field Hunt",
  rule: "Drag to walk. Tap near creatures to catch.",
  year: 2016,
  description: "Wander the grass, snag the rare ones, log it all.",
  history:
    "Homage to the 2016 augmented-reality creature-catching wave that sent an entire generation wandering real fields staring at their phones.",
  tags: ["calm", "drag", "luck"],
  palette: {
    hero: "#95d5b2",
    foe: "#e07a5f",
    prize: "#f4a261",
    deep: "#1b4332",
    glow: "#74c69d",
  },
  intensity: 0.2,
  luck: 0.45,
  nostalgia: 0.4,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

const SESSION = 42;
const CATCH_RADIUS = 74;
const PLAYER_SPEED = 130;

type Rarity = "common" | "uncommon" | "rare";
interface Creature {
  wx: number;
  wy: number;
  rarity: Rarity;
  life: number;
  bob: number;
}
interface Particle {
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}

const RARITY_INFO: Record<Rarity, { value: number; size: number; chance: number }> = {
  common: { value: 1, size: 9, chance: 0.68 },
  uncommon: { value: 3, size: 12, chance: 0.24 },
  rare: { value: 8, size: 15, chance: 0.08 },
};

function rollRarity(): Rarity {
  const r = Math.random();
  if (r < RARITY_INFO.rare.chance) return "rare";
  if (r < RARITY_INFO.rare.chance + RARITY_INFO.uncommon.chance) return "uncommon";
  return "common";
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fridge = skins(pal);

  let player = { x: 0, y: 0 };
  let creatures: Creature[] = [];
  let particles: Particle[] = [];
  let spawnCd = 1.5;
  let score = 0;
  let caughtCounts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0 };
  let timeLeft = SESSION;
  let over = false;
  let auto = false;

  let joyOn = false;
  let joyStart = { x: 0, y: 0 };
  let joyVec = { x: 0, y: 0 };
  let downT = 0;

  const reset = () => {
    player = { x: 0, y: 0 };
    creatures = [];
    particles = [];
    spawnCd = 1;
    score = 0;
    caughtCounts = { common: 0, uncommon: 0, rare: 0 };
    timeLeft = SESSION;
    over = false;
    ctx.onScore(0);
  };
  reset();

  const worldToScreen = (wx: number, wy: number) => ({
    x: wx - player.x + W / 2,
    y: wy - player.y + H / 2,
  });

  const attemptCatch = (sx: number, sy: number) => {
    let best: Creature | null = null;
    let bestD = Infinity;
    for (const c of creatures) {
      const sp = worldToScreen(c.wx, c.wy);
      const d = Math.hypot(sp.x - sx, sp.y - sy);
      if (d < 36 && d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      const worldD = Math.hypot(best.wx - player.x, best.wy - player.y);
      if (worldD <= CATCH_RADIUS) {
        const info = RARITY_INFO[best.rarity];
        score += info.value;
        caughtCounts[best.rarity] += 1;
        ctx.onScore(score);
        ctx.haptic("hit");
        const sp = worldToScreen(best.wx, best.wy);
        particles.push({
          x: sp.x,
          y: sp.y,
          t: 0,
          text: `+${info.value}`,
          color: best.rarity === "rare" ? pal.glow : best.rarity === "uncommon" ? pal.prize : pal.hero,
        });
        creatures = creatures.filter((c) => c !== best);
        return;
      }
    }
    ctx.haptic("light");
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    joyStart = { x: e.clientX - r.left, y: e.clientY - r.top };
    joyOn = true;
    downT = performance.now();
    joyVec = { x: 0, y: 0 };
  };
  const onMove = (e: PointerEvent) => {
    if (!joyOn || over) return;
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    joyVec = { x: clamp(x - joyStart.x, -50, 50), y: clamp(y - joyStart.y, -50, 50) };
  };
  const onUp = (e: PointerEvent) => {
    if (!joyOn) return;
    joyOn = false;
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const moved = Math.hypot(x - joyStart.x, y - joyStart.y);
    const elapsed = performance.now() - downT;
    if (moved < 14 && elapsed < 320 && !over) attemptCatch(x, y);
    joyVec = { x: 0, y: 0 };
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      let vx = 0;
      let vy = 0;
      if (auto) {
        let nearest: Creature | null = null;
        let bestD = Infinity;
        for (const c of creatures) {
          const d = Math.hypot(c.wx - player.x, c.wy - player.y);
          if (d < bestD) {
            bestD = d;
            nearest = c;
          }
        }
        if (nearest) {
          const dx = nearest.wx - player.x;
          const dy = nearest.wy - player.y;
          const d = Math.hypot(dx, dy) || 1;
          vx = dx / d;
          vy = dy / d;
          if (d <= CATCH_RADIUS * 0.7) {
            const sp = worldToScreen(nearest.wx, nearest.wy);
            attemptCatch(sp.x, sp.y);
          }
        }
      } else if (joyOn) {
        const mag = Math.hypot(joyVec.x, joyVec.y);
        if (mag > 6) {
          vx = joyVec.x / mag;
          vy = joyVec.y / mag;
        }
      }
      player.x += vx * PLAYER_SPEED * dt;
      player.y += vy * PLAYER_SPEED * dt;

      spawnCd -= dt;
      if (spawnCd <= 0 && creatures.length < 6) {
        spawnCd = rand(1.1, 2.4);
        const ang = rand(0, Math.PI * 2);
        const dist = rand(90, 260);
        creatures.push({
          wx: player.x + Math.cos(ang) * dist,
          wy: player.y + Math.sin(ang) * dist,
          rarity: rollRarity(),
          life: 8,
          bob: rand(0, 10),
        });
      }
      for (const c of creatures) c.life -= dt;
      creatures = creatures.filter((c) => c.life > 0);

      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }
    for (const p of particles) p.t += dt;
    particles = particles.filter((p) => p.t < 1);

    // field background, scrolls with player
    g.fillStyle = shade(pal.deep, -0.35);
    g.fillRect(0, 0, W, H);
    const tile = 40;
    const offX = (-player.x % tile + tile) % tile;
    const offY = (-player.y % tile + tile) % tile;
    g.fillStyle = "rgba(255,255,255,.035)";
    for (let x = -tile; x < W + tile; x += tile) {
      for (let y = -tile; y < H + tile; y += tile) {
        const wx = x + offX;
        const wy = y + offY;
        if ((Math.round((wx + player.x) / tile) + Math.round((wy + player.y) / tile)) % 2 === 0) {
          g.fillRect(wx, wy, tile, tile);
        }
      }
    }

    // creatures
    for (const c of creatures) {
      const sp = worldToScreen(c.wx, c.wy);
      if (sp.x < -30 || sp.x > W + 30 || sp.y < -30 || sp.y > H + 30) continue;
      const info = RARITY_INFO[c.rarity];
      const bob = Math.sin((c.bob + performance.now() / 400)) * 3;
      const color = c.rarity === "rare" ? pal.glow : c.rarity === "uncommon" ? pal.prize : pal.hero;
      const inRange = Math.hypot(c.wx - player.x, c.wy - player.y) <= CATCH_RADIUS;
      if (inRange) {
        g.strokeStyle = "rgba(255,255,255,.3)";
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(sp.x, sp.y + bob, info.size + 6, 0, Math.PI * 2);
        g.stroke();
      }
      // the haul is the fridge: commons are the cola, anything rarer is the
      // energy can, so rarity reads off the silhouette before the colour does
      const can = c.rarity === "common" ? "cola" : "energy";
      if (c.rarity === "rare") {
        g.save();
        g.shadowColor = color;
        g.shadowBlur = info.size * 1.2;
      }
      drawDrink(g, sp.x, sp.y + bob, info.size * 1.25, fridge[can], can);
      if (c.rarity === "rare") g.restore();
    }

    // catch radius ring around player
    g.strokeStyle = "rgba(255,255,255,.12)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(W / 2, H / 2, CATCH_RADIUS, 0, Math.PI * 2);
    g.stroke();

    // player — the man himself, walking the field for cans
    drawNicHead(g, {
      x: W / 2,
      y: H / 2,
      r: 14,
      skin: pal.hero,
      hair: shade(pal.deep, -0.3),
      eye: t.ink,
      pupil: shade(pal.deep, -0.5),
      dark: shade(pal.deep, -0.55),
      tooth: t.ink,
      gaze: Math.sin(performance.now() / 900),
    });

    for (const p of particles) {
      g.globalAlpha = clamp(1 - p.t, 0, 1);
      g.fillStyle = p.color;
      g.font = `800 14px ${t.fontDisplay}`;
      g.fillText(p.text, p.x, p.y - p.t * 26);
      g.globalAlpha = 1;
    }

    g.textAlign = "left";
    g.fillStyle = t.ink;
    g.font = `800 16px ${t.fontDisplay}`;
    g.fillText(`${score} pts`, 14, 26);
    g.fillStyle = t.inkDim;
    g.font = `600 12px ${t.fontBody}`;
    g.fillText(
      `common ${caughtCounts.common} · rare ${caughtCounts.uncommon} · epic ${caughtCounts.rare}`,
      14,
      46
    );
    const barW = W - 28;
    g.fillStyle = "rgba(255,255,255,.15)";
    g.fillRect(14, H - 16, barW, 5);
    g.fillStyle = pal.glow;
    g.fillRect(14, H - 16, barW * (timeLeft / SESSION), 5);

    g.textAlign = "center";
    if (over) endCard(g, t, W, H, "GAME OVER");
    g.textAlign = "left";
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
