import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand } from "@/games/engine";

const meta = {
  slug: "tap-rush",
  title: "Tap Rush",
  rule: "Hit the targets before they vanish",
  year: 2026,
  description: "Whack-a-target at feed speed. Three misses and out.",
  history:
    "An original descended from every light-gun cabinet and whack-a-mole machine ever built, rebuilt for one thumb.",
  tags: ["reflex", "chaos", "oneTap"],
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
  const { g, width: W, height: H } = ctx;
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

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);

    for (const tg of targets) {
      const p = tg.life / tg.maxLife;
      g.beginPath();
      g.arc(tg.x, tg.y, R * (0.45 + 0.55 * p), 0, Math.PI * 2);
      g.fillStyle = p < 0.35 ? t.danger : t.accent;
      g.fill();
      g.beginPath();
      g.arc(tg.x, tg.y, R + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      g.strokeStyle = t.ink;
      g.lineWidth = 3;
      g.stroke();
    }

    // miss pips
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(W / 2 - 28 + i * 28, H * 0.09, 7, 0, Math.PI * 2);
      g.fillStyle = i < misses ? t.danger : t.surface;
      g.fill();
    }

    if (over) {
      g.fillStyle = t.ink;
      g.textAlign = "center";
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("OUT OF MISSES", W / 2, H * 0.42);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, H * 0.42 + 34);
    }
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
