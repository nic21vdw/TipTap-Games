import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawCan, drawRoom, drawBubbles, skins } from "@/games/nic-art";

const meta = {
  slug: "hold-line",
  title: "The Pour",
  rule: "Pour to the line, don't overflow",
  year: 2026,
  description: "One press, one release. Nerves of glass, glass of cola.",
  history:
    "An original — the power gauge from golf and fighting games, isolated into its purest, meanest form, then pointed at a glass. The tolerance band only shrinks.",
  tags: ["precision", "hold", "calm"],
  palette: {
    hero: "#6d3b1c",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#c9d3dc",
  },
  intensity: 0.3,
  luck: 0.05,
  nostalgia: 0.15,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
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

    drawRoom(g, W, H, pal.deep, pal.glow);

    const bx = W / 2 - 44;
    const bw = 88;
    const by = H * 0.78;
    const bh = H * 0.56;
    const sk = skins(pal);

    // the glass
    g.fillStyle = t.surface;
    g.fillRect(bx, by - bh, bw, bh);
    // the band you are allowed to land in
    g.fillStyle = pal.prize + "55";
    g.fillRect(bx - 14, by - (target + tol) * bh, bw + 28, tol * 2 * bh);
    // the line itself
    g.fillStyle = pal.prize;
    g.fillRect(bx - 14, by - target * bh - 2, bw + 28, 4);
    // the cola
    g.fillStyle =
      result === "miss" ? pal.foe : result === "hit" ? pal.prize : pal.hero;
    g.fillRect(bx, by - fill * bh, bw, fill * bh);
    // foam sitting on the surface, and carbonation climbing the glass
    if (fill > 0.02) {
      g.fillStyle = shade(pal.glow, 0.25);
      g.fillRect(bx, by - fill * bh - 5, bw, 6);
      drawBubbles(g, bx + bw / 2, by - (fill * bh) / 2, bw * 0.4, 9, pal.glow + "66", score);
    }
    // glass edges, drawn over the liquid so it reads as being inside
    g.strokeStyle = shade(pal.glow, -0.25);
    g.lineWidth = 3;
    g.strokeRect(bx, by - bh, bw, bh);

    // the can doing the pouring, tipping further the fuller it gets
    const canY = by - bh - 34;
    g.save();
    g.translate(bx + bw / 2, canY);
    g.rotate(holding ? 0.55 : 0.2);
    drawCan(g, 0, 0, 34, 60, sk.cola, "cola");
    g.restore();
    if (holding && result === null) {
      g.fillStyle = pal.hero;
      g.fillRect(bx + bw / 2 - 4, canY + 18, 8, bh - fill * bh + 16);
    }

    g.textAlign = "center";

    if (over) {
      endCard(g, t, W, H, fill >= 1 ? "ALL OVER THE DESK" : "SHORT POUR");
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
