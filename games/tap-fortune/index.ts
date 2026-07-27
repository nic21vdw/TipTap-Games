import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, makeLoop, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "tap-fortune",
  title: "Nic's Tap Fortune",
  rule: "Tap to earn. Upgrade to earn more.",
  year: 2013,
  description: "Numbers go up. That's the whole game and it works.",
  history:
    "Homage to the 2013 idle-tapper boom — the genre that proved a number going up is its own reward.",
  tags: ["calm", "endurance"],
  palette: {
    hero: "#ffb703",
    foe: "#fb8500",
    prize: "#8ecae6",
    deep: "#023047",
    glow: "#219ebc",
  },
  intensity: 0.15,
  luck: 0.05,
  nostalgia: 0.6,
  sessionLength: 0.7,
  scoreUnit: "pts",
  maxScorePerSecond: 50,
} satisfies GameModule["meta"];

interface Gen {
  name: string;
  baseCost: number;
  rate: number;
  owned: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  let coins = 0;
  let total = 0;
  let pulse = 0;
  let pops: { x: number; y: number; t: number; v: number }[] = [];
  let gens: Gen[] = [];

  const reset = () => {
    coins = 0;
    total = 0;
    pulse = 0;
    pops = [];
    gens = [
      { name: "Helper", baseCost: 10, rate: 0.5, owned: 0 },
      { name: "Crew", baseCost: 60, rate: 3, owned: 0 },
      { name: "Studio", baseCost: 400, rate: 18, owned: 0 },
    ];
    ctx.onScore(0);
  };

  const cost = (gen: Gen) => Math.floor(gen.baseCost * Math.pow(1.16, gen.owned));

  const cx = W / 2;
  const cy = H * 0.36;
  const R = Math.min(W, H) * 0.2;

  const onDown = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (Math.hypot(x - cx, y - cy) < R * 1.2) {
      const gain = 1 + Math.floor(total / 500);
      coins += gain;
      total += gain;
      pulse = 1;
      pops.push({ x: x + (Math.random() - 0.5) * 20, y, t: 0.7, v: gain });
      ctx.onScore(Math.floor(total));
      ctx.haptic("light");
      return;
    }
    gens.forEach((gen, i) => {
      const gy = H * 0.62 + i * 62;
      if (y > gy && y < gy + 52 && x > W * 0.08 && x < W * 0.92) {
        const c = cost(gen);
        if (coins >= c) {
          coins -= c;
          gen.owned += 1;
          ctx.haptic("hit");
        }
      }
    });
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();
  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();
    let perSec = 0;
    for (const gen of gens) perSec += gen.rate * gen.owned;
    coins += perSec * dt;
    total += perSec * dt;
    ctx.onScore(Math.floor(total));
    pulse = clamp(pulse - dt * 2, 0, 1);
    pops = pops.filter((p) => (p.t -= dt) > 0);

    if (auto) {
      autoCd -= dt;
      if (autoCd <= 0) {
        autoCd = 0.4;
        coins += 1;
        total += 1;
        const affordable = [...gens].sort((a, b) => cost(a) - cost(b)).find((gn) => coins >= cost(gn));
        if (affordable) {
          coins -= cost(affordable);
          affordable.owned += 1;
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    g.fillStyle = shade(pal.hero, -0.1 + pulse * 0.2);
    g.beginPath();
    g.arc(cx, cy, R * (1 + pulse * 0.08), 0, Math.PI * 2);
    g.fill();
    // the button you hammer all game is his face
    drawNicHead(g, {
      x: cx,
      y: cy,
      r: R * 0.74 * (1 + pulse * 0.08),
      skin: shade(pal.prize, 0.15),
      hair: shade(pal.deep, -0.4),
      eye: theme.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: theme.ink,
      gape: pulse * 0.8,
    });
    g.fillStyle = "#fff";
    g.font = "800 15px system-ui";
    g.textAlign = "center";
    g.fillText("TAP", cx, cy + R + 20);

    for (const p of pops) {
      g.globalAlpha = clamp(p.t / 0.7, 0, 1);
      g.fillStyle = pal.prize;
      g.font = "700 16px system-ui";
      g.fillText(`+${p.v}`, p.x, p.y - (0.7 - p.t) * 40);
      g.globalAlpha = 1;
    }

    gens.forEach((gen, i) => {
      const gy = H * 0.62 + i * 62;
      const c = cost(gen);
      g.fillStyle = coins >= c ? theme.surface : shade(theme.surface, -0.3);
      roundRect(g, W * 0.08, gy, W * 0.84, 52, 14);
      g.fill();
      g.fillStyle = theme.ink;
      g.textAlign = "left";
      g.font = "700 14px system-ui";
      g.fillText(`${gen.name} x${gen.owned}`, W * 0.12, gy + 22);
      g.fillStyle = theme.inkDim;
      g.font = "600 12px system-ui";
      g.fillText(`+${(gen.rate * gen.owned).toFixed(1)}/s`, W * 0.12, gy + 40);
      g.fillStyle = coins >= c ? pal.glow : theme.inkDim;
      g.textAlign = "right";
      g.font = "800 14px system-ui";
      g.fillText(`${c}`, W * 0.88, gy + 30);
    });
    g.textAlign = "left";
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
