import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawCan, drawCanTop, drawRoom, skins } from "@/games/nic-art";

const meta = {
  slug: "tap-rush",
  title: "Can Rush",
  rule: "Grab the cans before they go warm",
  year: 2026,
  description: "The fridge run at feed speed. Three misses and out.",
  history:
    "An original descended from every light-gun cabinet and whack-a-mole machine ever built, rebuilt for one thumb and one very full fridge.",
  tags: ["reflex", "chaos", "oneTap"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#f0b429",
    deep: "#171a24",
    glow: "#c9d3dc",
  },
  intensity: 0.9,
  luck: 0.15,
  nostalgia: 0.25,
  sessionLength: 0.25,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

interface Target {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const R = 42;
  let score = 0;
  let misses = 0;
  let over = false;
  let targets: Target[] = [];
  let spawnIn = 0.4;

  const reset = () => {
    score = 0;
    misses = 0;
    over = false;
    targets = [];
    spawnIn = 0.4;
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
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      if ((x - t.x) ** 2 + (y - t.y) ** 2 <= (R + 12) ** 2) {
        targets.splice(i, 1);
        score += 1;
        ctx.onScore(score);
        ctx.haptic("hit");
        return;
      }
    }
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: pop the most urgent target on a human-ish cadence
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0 && targets.length > 0) {
          let idx = 0;
          for (let i = 1; i < targets.length; i++)
            if (targets[i].life < targets[idx].life) idx = i;
          targets.splice(idx, 1);
          score += 1;
          ctx.onScore(score);
          autoCd = 0.28;
        }
      }
      spawnIn -= dt;
      const pace = Math.max(0.35, 1.0 - score * 0.02);
      if (spawnIn <= 0) {
        const life = Math.max(0.9, 2.2 - score * 0.03);
        targets.push({
          x: rand(R + 20, W - R - 20),
          y: rand(H * 0.18, H * 0.82),
          life,
          maxLife: life,
        });
        spawnIn = pace;
      }
      for (let i = targets.length - 1; i >= 0; i--) {
        targets[i].life -= dt;
        if (targets[i].life <= 0) {
          targets.splice(i, 1);
          misses += 1;
          ctx.haptic("fail");
          if (misses >= 3) {
            over = true;
            ctx.onRunEnd(score);
          }
        }
      }
    }

    drawRoom(g, W, H, pal.deep, pal.glow);
    const sk = skins(pal);

    for (const tg of targets) {
      const p = tg.life / tg.maxLife;
      const rr = R * (0.45 + 0.55 * p);
      // which drink this one is, decided by where it spawned — purely cosmetic
      const kind = Math.floor(tg.x) % 2 === 0 ? "cola" : "energy";
      const skin = p < 0.35 ? { ...sk[kind], body: pal.foe } : sk[kind];
      drawCan(g, tg.x, tg.y, rr * 1.5, rr * 2.3, skin, kind);
      // the cold-timer ring: full circle when fresh, gone when it goes warm
      g.beginPath();
      g.arc(tg.x, tg.y, R + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      g.strokeStyle = t.ink;
      g.lineWidth = 3;
      g.stroke();
    }

    // miss pips, as cans you let go warm
    for (let i = 0; i < 3; i++) {
      const x = W / 2 - 28 + i * 28;
      if (i < misses) {
        drawCanTop(g, x, H * 0.09, 8, { ...sk.cola, body: pal.foe });
      } else {
        g.beginPath();
        g.arc(x, H * 0.09, 7, 0, Math.PI * 2);
        g.fillStyle = t.surface;
        g.fill();
      }
    }

    if (over) endCard(g, t, W, H, "ALL WARM");
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
