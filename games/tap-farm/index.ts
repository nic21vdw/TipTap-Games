import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { drawDrink, skins } from "@/games/nic-art";
import { makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "tap-farm",
  title: "Nic's Tap Farm",
  rule: "Plant empty plots. Harvest ripe ones.",
  year: 2009,
  description: "Plant it, wait a beat, tap it ripe. Repeat forever.",
  history:
    "Homage to the 2009 social farming craze that got an entire generation refreshing browser tabs just to harvest a virtual crop before it wilted.",
  tags: ["calm", "endurance", "retro"],
  palette: {
    hero: "#606c38",
    foe: "#bc6c25",
    prize: "#f4a261",
    deep: "#283618",
    glow: "#a7c957",
  },
  intensity: 0.15,
  luck: 0.15,
  nostalgia: 0.8,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

const COLS = 4;
const ROWS = 5;
const UNLOCK_AT = 20;

// stage: -1 empty, 0 seedling, 1 sprout, 2 ripe
interface Plot {
  stage: number;
  t: number;
  stageDur: number;
  tier: number;
  pop: number; // little "+N" pop animation
}

interface CropTier {
  value: number;
  color: string;
  growMin: number;
  growMax: number;
}

const TIERS: CropTier[] = [
  { value: 1, color: "#a7c957", growMin: 3, growMax: 5 },
  { value: 3, color: "#f4a261", growMin: 4, growMax: 6 },
];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fridge = skins(pal);
  const pad = W * 0.04;
  const cellW = (W - pad * 2) / COLS;
  const cellH = (H * 0.72 - pad) / ROWS;
  const gridY = H * 0.14;

  let score = 0;
  let harvested = 0;
  let unlocked = false;
  let plots: Plot[] = [];

  const makePlot = (): Plot => ({ stage: -1, t: 0, stageDur: 0, tier: 0, pop: 0 });

  const reset = () => {
    score = 0;
    harvested = 0;
    unlocked = false;
    plots = Array.from({ length: COLS * ROWS }, makePlot);
    ctx.onScore(0);
  };
  reset();

  const plant = (i: number) => {
    const p = plots[i];
    if (p.stage !== -1) return;
    const tier = unlocked && Math.random() < 0.4 ? 1 : 0;
    const t = TIERS[tier];
    p.stage = 0;
    p.t = 0;
    p.tier = tier;
    p.stageDur = rand(t.growMin, t.growMax) / 2; // two transitions to ripe
    ctx.haptic("light");
  };

  const harvest = (i: number) => {
    const p = plots[i];
    if (p.stage !== 2) return;
    const value = TIERS[p.tier].value;
    score += value;
    harvested += 1;
    p.pop = 1;
    if (harvested >= UNLOCK_AT) unlocked = true;
    p.stage = -1;
    p.t = 0;
    ctx.onScore(score);
    ctx.haptic("hit");
  };

  const plotAt = (px: number, py: number): number => {
    const col = Math.floor((px - pad) / cellW);
    const row = Math.floor((py - gridY) / cellH);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1;
    return row * COLS + col;
  };

  const onDown = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    const i = plotAt(e.clientX - r.left, e.clientY - r.top);
    if (i < 0) return;
    const p = plots[i];
    if (p.stage === -1) plant(i);
    else if (p.stage === 2) harvest(i);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;
  let autoTimer = 0.3;
  let clock = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    clock += dt;

    for (const p of plots) {
      if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 1.2);
      if (p.stage >= 0 && p.stage < 2) {
        p.t += dt;
        if (p.t >= p.stageDur) {
          p.t = 0;
          p.stage += 1;
        }
      }
    }

    if (auto) {
      autoTimer -= dt;
      if (autoTimer <= 0) {
        const ripe = plots
          .map((p, i) => ({ p, i }))
          .filter((x) => x.p.stage === 2);
        const empty = plots
          .map((p, i) => ({ p, i }))
          .filter((x) => x.p.stage === -1);
        if (ripe.length) harvest(ripe[0].i);
        else if (empty.length) plant(empty[Math.floor(Math.random() * empty.length)].i);
        autoTimer = rand(0.25, 0.45);
      }
    }

    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);

    g.textAlign = "center";
    g.fillStyle = t.ink;
    g.font = `700 16px ${t.fontBody}`;
    g.fillText(
      unlocked ? "prize crop unlocked" : `${harvested}/${UNLOCK_AT} to unlock prize crop`,
      W / 2,
      H * 0.08
    );
    g.textAlign = "left";

    for (let i = 0; i < plots.length; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = pad + col * cellW;
      const y = gridY + row * cellH;
      const p = plots[i];
      const inset = 3;

      g.fillStyle = shade(pal.hero, -0.55);
      roundRect(g, x + inset, y + inset, cellW - inset * 2, cellH - inset * 2, 8);
      g.fill();

      const ccx = x + cellW / 2;
      const ccy = y + cellH / 2;
      const tierColor = p.tier === 1 ? pal.prize : pal.glow;

      if (p.stage === 0) {
        g.fillStyle = shade(tierColor, -0.2);
        g.beginPath();
        g.arc(ccx, ccy + cellH * 0.18, cellH * 0.08, 0, Math.PI * 2);
        g.fill();
      } else if (p.stage === 1) {
        g.strokeStyle = tierColor;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(ccx, ccy + cellH * 0.22);
        g.lineTo(ccx, ccy - cellH * 0.05);
        g.stroke();
        g.fillStyle = tierColor;
        g.beginPath();
        g.arc(ccx - cellW * 0.1, ccy, cellH * 0.09, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(ccx + cellW * 0.1, ccy - cellH * 0.05, cellH * 0.09, 0, Math.PI * 2);
        g.fill();
      } else if (p.stage === 2) {
        const wobble = Math.sin(clock * 3.3 + i) * 1.5;
        // a ripe crop is a can, ready to pick
        drawDrink(g, ccx, ccy + wobble, cellH * 0.3, p.tier === 1 ? fridge.cola : fridge.energy, p.tier === 1 ? "cola" : "energy");
        g.fillStyle = tierColor;
        g.beginPath();
        g.arc(ccx, ccy + wobble, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,.35)";
        g.beginPath();
        g.arc(ccx - cellW * 0.06, ccy - cellH * 0.06 + wobble, cellH * 0.07, 0, Math.PI * 2);
        g.fill();
      }

      if (p.pop > 0) {
        g.globalAlpha = p.pop;
        g.fillStyle = pal.prize;
        g.font = `800 13px ${t.fontDisplay}`;
        g.textAlign = "center";
        g.fillText(`+${TIERS[p.tier].value}`, ccx, y - (1 - p.pop) * 14);
        g.globalAlpha = 1;
        g.textAlign = "left";
      }
    }
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
