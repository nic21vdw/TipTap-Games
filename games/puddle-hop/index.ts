import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "puddle-hop",
  title: "Nic's Puddle Hop",
  rule: "Hop before the platform sinks.",
  year: 2015,
  description: "The water rises. The platforms don't wait.",
  history:
    "Homage to the mid-2010s shrinking-platform hoppers — one calm decision at a time, until it isn't calm anymore.",
  tags: ["reflex", "precision"],
  palette: {
    hero: "#f77f00",
    foe: "#003049",
    prize: "#fcbf49",
    deep: "#00171f",
    glow: "#90e0ef",
  },
  intensity: 0.4,
  luck: 0.1,
  nostalgia: 0.4,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

interface Plat {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  let plats: Plat[] = [];
  let curIdx = 0;
  let waterY = 0;
  let score = 0;
  let over = false;
  let playerY = 0;
  let playerX = 0;

  const spawnPlat = (x: number, y: number): Plat => ({ x, y, r: 26, life: rand(3, 5), maxLife: 0 });

  const buildField = () => {
    plats = [];
    for (let i = 0; i < 6; i++) {
      const p = spawnPlat(rand(40, W - 40), H * 0.2 + i * (H * 0.12));
      p.maxLife = p.life;
      plats.push(p);
    }
  };

  const reset = () => {
    buildField();
    curIdx = 0;
    playerX = plats[0].x;
    playerY = plats[0].y;
    waterY = H + 40;
    score = 0;
    over = false;
    ctx.onScore(0);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best = -1;
    let bestD = 60;
    plats.forEach((p, i) => {
      if (i === curIdx) return;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      curIdx = best;
      playerX = plats[best].x;
      playerY = plats[best].y;
      plats[best].life = plats[best].maxLife;
      score += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      const maxY = Math.min(...plats.map((p) => p.y));
      plats.push(
        Object.assign(spawnPlat(rand(30, W - 30), maxY - rand(80, 130)), { maxLife: 4 })
      );
      plats = plats.filter((p) => p.y < waterY + 60);
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();
  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();
    if (!over) {
      waterY -= dt * 12;
      for (const p of plats) p.life -= dt;
      if (plats[curIdx] && plats[curIdx].life <= 0) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
      if (playerY > waterY) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          autoCd = 0.6;
          let best = -1;
          let bestScore = -Infinity;
          plats.forEach((p, i) => {
            if (i === curIdx) return;
            const s = p.life - Math.hypot(p.x - playerX, p.y - playerY) * 0.01;
            if (s > bestScore) {
              bestScore = s;
              best = i;
            }
          });
          if (best >= 0) {
            curIdx = best;
            playerX = plats[best].x;
            playerY = plats[best].y;
            plats[best].life = plats[best].maxLife;
            score += 1;
            ctx.onScore(score);
            const maxY = Math.min(...plats.map((p) => p.y));
            plats.push(Object.assign(spawnPlat(rand(30, W - 30), maxY - rand(80, 130)), { maxLife: 4 }));
            plats = plats.filter((p) => p.y < waterY + 60);
          }
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.3);
    g.fillRect(0, 0, W, H);

    for (const p of plats) {
      const k = clamp(p.life / p.maxLife, 0, 1);
      g.fillStyle = k < 0.3 ? pal.foe : pal.hero;
      g.beginPath();
      g.arc(p.x, p.y, p.r * (0.4 + k * 0.6), 0, Math.PI * 2);
      g.fill();
    }

    g.fillStyle = shade(pal.glow, 0.1);
    g.globalAlpha = 0.6;
    g.fillRect(0, waterY, W, H - waterY);
    g.globalAlpha = 1;

    drawNicHead(g, {
      x: playerX,
      y: playerY - 4,
      r: 12,
      skin: over ? pal.foe : pal.prize,
      hair: shade(pal.deep, -0.4),
      eye: theme.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: theme.ink,
      gape: over ? 0.9 : 0,
      scowl: over ? 1 : 0,
    });

    if (over) endCard(g, theme, W, H, "SUNK");
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
