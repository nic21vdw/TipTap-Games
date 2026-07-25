import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand } from "@/games/engine";

const meta = {
  slug: "one-gap",
  title: "One Gap",
  rule: "Tap to flap through the gaps",
  year: 2013,
  description: "Tap to flap. The gap is smaller than your ego.",
  history:
    "Homage to 2013's infamous one-button rage game — pulled from the stores at its peak by its own creator, never really gone since.",
  tags: ["reflex", "oneTap", "endurance", "chaos"],
  intensity: 0.7,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

interface Pipe {
  x: number;
  gapY: number;
  passed: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
  const bx = W * 0.3;
  const R = 13;
  const GAP = H * 0.24;
  const PIPE_W = 58;
  let by = H / 2;
  let vy = 0;
  let pipes: Pipe[] = [];
  let spawnIn = 0;
  let score = 0;
  let over = false;
  let started = false;

  const reset = () => {
    by = H / 2;
    vy = 0;
    pipes = [];
    spawnIn = 0.4;
    score = 0;
    over = false;
    started = false;
    ctx.onScore(0);
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    started = true;
    vy = -H * 0.55;
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    // attract mode: flap to hold the line of the next gap
    if (auto) {
      started = true;
      const next = pipes.find((p) => p.x + PIPE_W > bx - R);
      const aim = next ? next.gapY - GAP * 0.12 : H / 2;
      if (by > aim && vy > -H * 0.1) vy = -H * 0.55;
    }
    if (!over && started) {
      vy += H * 1.5 * dt;
      by += vy * dt;
      spawnIn -= dt;
      if (spawnIn <= 0) {
        pipes.push({ x: W + PIPE_W, gapY: rand(GAP * 0.7, H - GAP * 0.7), passed: false });
        spawnIn = 1.6;
      }
      const speed = W * 0.42 + score * 2;
      for (let i = pipes.length - 1; i >= 0; i--) {
        const p = pipes[i];
        p.x -= speed * dt;
        if (!p.passed && p.x + PIPE_W < bx - R) {
          p.passed = true;
          score += 1;
          ctx.onScore(score);
          ctx.haptic("hit");
        }
        if (p.x < -PIPE_W) pipes.splice(i, 1);
        const inX = bx + R > p.x && bx - R < p.x + PIPE_W;
        const inGap = by - R > p.gapY - GAP / 2 && by + R < p.gapY + GAP / 2;
        if (inX && !inGap) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
      }
      if (by + R > H || by - R < 0) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);
    for (const p of pipes) {
      g.fillStyle = t.surface;
      g.fillRect(p.x, 0, PIPE_W, p.gapY - GAP / 2);
      g.fillRect(p.x, p.gapY + GAP / 2, PIPE_W, H - p.gapY - GAP / 2);
      g.fillStyle = t.accentAlt;
      g.fillRect(p.x, p.gapY - GAP / 2 - 5, PIPE_W, 5);
      g.fillRect(p.x, p.gapY + GAP / 2, PIPE_W, 5);
    }
    g.beginPath();
    g.arc(bx, by, R, 0, Math.PI * 2);
    g.fillStyle = over ? t.danger : t.accent;
    g.fill();

    g.textAlign = "center";
    if (!started && !over) {
      g.fillStyle = t.inkDim;
      g.font = `600 17px ${t.fontBody}`;
      g.fillText("tap to start flapping", W / 2, H * 0.32);
    }
    if (over) {
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("DOWN", W / 2, H * 0.3);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, H * 0.3 + 34);
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
