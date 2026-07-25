import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, clamp, shade, roundRect } from "@/games/engine";

const meta = {
  slug: "drop-dodge",
  title: "Drop Dodge",
  rule: "Drag through the gaps",
  year: 2008,
  description: "Falling blocks. Tiny gaps. Go.",
  history:
    "Homage to the first wave of dodgers on the 2008 App Store, back when steering with your phone felt like the future. Ours trades tilt for a thumb.",
  tags: ["endurance", "drag", "chaos"],
  palette: {
    hero: "#ffd166",
    foe: "#e63946",
    prize: "#06d6a0",
    deep: "#1d3557",
    glow: "#457b9d",
  },
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
  const { g, width: W, height: H, pal } = ctx;
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

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: aim at the widest gap beside the nearest incoming block
      if (auto) {
        let threat: Block | null = null;
        for (const b of blocks)
          if (b.y < py && (!threat || b.y > threat.y)) threat = b;
        if (threat) {
          const leftGap = threat.x;
          const rightGap = W - (threat.x + threat.w);
          targetX = leftGap > rightGap ? leftGap / 2 : W - rightGap / 2;
          targetX = clamp(targetX, R, W - R);
        } else {
          targetX = W / 2;
        }
      }
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
          ctx.onRunEnd(score, "CLIPPED");
        }
      }
    }

    const ground = g.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, shade(pal.deep, -0.15));
    ground.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);

    // hazard bars: hazard stripes, a lit leading edge, a shadow beneath
    for (const b of blocks) {
      g.fillStyle = "rgba(0,0,0,.3)";
      roundRect(g, b.x + 2, b.y + 4, b.w, b.h, 8);
      g.fill();
      g.save();
      roundRect(g, b.x, b.y, b.w, b.h, 8);
      g.clip();
      g.fillStyle = pal.foe;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle = "rgba(0,0,0,.22)";
      for (let s = -b.h; s < b.w; s += 22) {
        g.beginPath();
        g.moveTo(b.x + s, b.y + b.h);
        g.lineTo(b.x + s + b.h, b.y);
        g.lineTo(b.x + s + b.h + 10, b.y);
        g.lineTo(b.x + s + 10, b.y + b.h);
        g.closePath();
        g.fill();
      }
      g.restore();
      g.fillStyle = pal.prize;
      g.fillRect(b.x + 6, b.y + b.h - 4, b.w - 12, 3);
    }

    // the ball: a glow, a body, and a highlight so it reads as a marble
    const halo = g.createRadialGradient(px, py, R * 0.4, px, py, R * 2.4);
    halo.addColorStop(0, (over ? pal.foe : pal.hero) + "88");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = halo;
    g.beginPath();
    g.arc(px, py, R * 2.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(px, py, R, 0, Math.PI * 2);
    g.fillStyle = over ? pal.foe : pal.hero;
    g.fill();
    g.beginPath();
    g.arc(px - R * 0.32, py - R * 0.34, R * 0.34, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,.75)";
    g.fill();

    if (over) {
      endCard(g, t, W, H, "CLIPPED");
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
    autoplay: (on) => {
      auto = on;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
