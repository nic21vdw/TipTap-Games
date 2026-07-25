import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand } from "@/games/engine";

const meta = {
  slug: "hold-line",
  title: "Hold the Line",
  rule: "Fill to the line, don't overshoot",
  year: 2026,
  description: "One press, one release. Nerves of glass.",
  history:
    "An original — the power gauge from golf and fighting games, isolated into its purest, meanest form. The tolerance band only shrinks.",
  tags: ["precision", "hold", "calm"],
  intensity: 0.3,
  luck: 0.05,
  nostalgia: 0.15,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
  let score = 0;
  let over = false;
  let holding = false;
  let fill = 0; // 0..1
  let target = rand(0.45, 0.85);
  let tol = 0.09;
  let fillSpeed = 0.55;
  let result: "hit" | "miss" | null = null;
  let resultT = 0;

  const newRound = () => {
    fill = 0;
    target = rand(0.4, 0.88);
    result = null;
  };

  const reset = () => {
    score = 0;
    over = false;
    tol = 0.09;
    fillSpeed = 0.55;
    ctx.onScore(0);
    newRound();
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    if (result === null) holding = true;
  };
  const onUp = () => {
    if (over || !holding) return;
    holding = false;
    if (Math.abs(fill - target) <= tol) {
      score += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      result = "hit";
      resultT = 0.45;
      tol = Math.max(0.03, tol * 0.9);
      fillSpeed = Math.min(1.1, fillSpeed * 1.06);
    } else {
      ctx.haptic("fail");
      result = "miss";
      resultT = 0.9;
      over = true;
      ctx.onRunEnd(score);
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: hold, then release just inside the band
      if (auto && result === null) {
        if (!holding) holding = true;
        else if (fill >= target - tol * 0.4) onUp();
      }
      if (holding && result === null) {
        fill += fillSpeed * dt;
        if (fill >= 1) {
          fill = 1;
          holding = false;
          ctx.haptic("fail");
          result = "miss";
          over = true;
          ctx.onRunEnd(score);
        }
      }
      if (result === "hit") {
        resultT -= dt;
        if (resultT <= 0) newRound();
      }
    }

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);

    const bx = W / 2 - 44;
    const bw = 88;
    const by = H * 0.78;
    const bh = H * 0.56;

    // tube
    g.fillStyle = t.surface;
    g.fillRect(bx, by - bh, bw, bh);
    // tolerance band
    g.fillStyle = t.success + "55";
    g.fillRect(bx - 14, by - (target + tol) * bh, bw + 28, tol * 2 * bh);
    // target line
    g.fillStyle = t.success;
    g.fillRect(bx - 14, by - target * bh - 2, bw + 28, 4);
    // fill
    g.fillStyle =
      result === "miss" ? t.danger : result === "hit" ? t.success : t.accent;
    g.fillRect(bx, by - fill * bh, bw, fill * bh);

    g.textAlign = "center";
    g.fillStyle = t.inkDim;
    g.font = `500 15px ${t.fontBody}`;
    g.fillText("hold to fill · release on the line", W / 2, by + 40);

    if (over) {
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText(fill >= 1 ? "OVERFLOWED" : "MISSED IT", W / 2, H * 0.14);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, H * 0.14 + 34);
    }
    g.textAlign = "left";
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      holding = false;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
