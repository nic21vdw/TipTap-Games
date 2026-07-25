import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand, clamp } from "@/games/engine";

const meta = {
  slug: "drop-dodge",
  title: "Drop Dodge",
  rule: "Drag through the gaps",
  tags: ["endurance", "drag", "chaos"],
  intensity: 0.75,
  luck: 0.2,
  nostalgia: 0.3,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  passed: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
  const R = 14;
  const py = H * 0.82;
  let px = W / 2;
  let targetX = W / 2;
  let score = 0;
  let over = false;
  let blocks: Block[] = [];
  let spawnIn = 0.5;
  let speed = 220;

  const reset = () => {
    score = 0;
    over = false;
    blocks = [];
    spawnIn = 0.5;
    speed = 220;
    px = targetX = W / 2;
    ctx.onScore(0);
  };

  const onMove = (e: PointerEvent) => {
    const rect = ctx.canvas.getBoundingClientRect();
    targetX = clamp(e.clientX - rect.left, R, W - R);
  };
  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    ctx.canvas.setPointerCapture(e.pointerId);
    onMove(e);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      px += (targetX - px) * Math.min(1, dt * 18);
      spawnIn -= dt;
      speed = Math.min(520, speed + dt * 9);
      if (spawnIn <= 0) {
        const w = rand(W * 0.22, W * 0.5);
        blocks.push({ x: rand(0, W - w), y: -40, w, h: 34, passed: false });
        spawnIn = Math.max(0.34, 0.85 - score * 0.004);
      }
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        b.y += speed * dt;
        if (!b.passed && b.y > py + R) {
          b.passed = true;
          score += 1;
          ctx.onScore(score);
        }
        if (b.y > H + 60) blocks.splice(i, 1);
        // circle-rect collision
        const cx = clamp(px, b.x, b.x + b.w);
        const cy = clamp(py, b.y, b.y + b.h);
        if ((px - cx) ** 2 + (py - cy) ** 2 < R * R) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
      }
    }

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);

    for (const b of blocks) {
      g.fillStyle = t.surface;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle = t.accentAlt + "33";
      g.fillRect(b.x, b.y, b.w, 4);
    }

    g.beginPath();
    g.arc(px, py, R, 0, Math.PI * 2);
    g.fillStyle = over ? t.danger : t.accent;
    g.fill();

    if (over) {
      g.textAlign = "center";
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("CLIPPED", W / 2, H * 0.4);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, H * 0.4 + 34);
      g.textAlign = "left";
    }
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
    },
    pause: loop.pause,
    resume: loop.resume,
  };
}

const mod: GameModule = { meta, mount };
export default mod;
