import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "spiral-fall",
  title: "Nic's Spiral Fall",
  rule: "Drag to rotate the tower, find the gap",
  year: 2018,
  description: "Spin the tower. Slip through the gap. Repeat until you don't.",
  history:
    "Homage to the 2018 one-thumb tower-diving craze that turned falling through spinning rings into a pocket-sized obsession.",
  tags: ["drag", "precision", "reflex"],
  palette: {
    hero: "#7c4dff",
    foe: "#ff5470",
    prize: "#ffd460",
    deep: "#0d0f1a",
    glow: "#2de1c2",
  },
  intensity: 0.6,
  luck: 0.1,
  nostalgia: 0.2,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

// Top-down interpretation: the tower is unrolled into a horizontal strip of N
// angular segments per ring. The ball sits at a fixed screen position; rings
// fall upward toward it. Dragging rotates the whole tower (ringOffset) so a
// gap segment lines up under the ball before the ring reaches it.
const N = 8;
const RING_H = 22;
const SPACING = 120;

interface Ring {
  y: number;
  pattern: boolean[]; // true = danger segment
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const ballY = H * 0.26;

  const wrap = (v: number) => ((v % 1) + 1) % 1;

  let ringOffset = 0;
  let rings: Ring[] = [];
  let fallSpeed = 95;
  let score = 0;
  let over = false;
  let dragging = false;
  let lastX = 0;

  const dangerCountFor = (s: number) => Math.min(N - 1, 2 + Math.floor(s / 5));

  const makePattern = (dangerCount: number): boolean[] => {
    const arr = new Array(N).fill(false) as boolean[];
    const idxs = Array.from({ length: N }, (_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    for (let i = 0; i < dangerCount; i++) arr[idxs[i]] = true;
    return arr;
  };

  const spawnRing = (y: number): Ring => ({ y, pattern: makePattern(dangerCountFor(score)) });

  const reset = () => {
    score = 0;
    over = false;
    fallSpeed = 95;
    ringOffset = 0;
    rings = [];
    for (let i = 0; i < 5; i++) rings.push(spawnRing(ballY + SPACING * (i + 1)));
    ctx.onScore(0);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    dragging = true;
    lastX = e.clientX - r.left;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const dx = x - lastX;
    lastX = x;
    ringOffset = wrap(ringOffset + dx / W);
  };
  const onUp = () => {
    dragging = false;
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      fallSpeed = Math.min(260, 95 + score * 5);
      for (const ring of rings) ring.y -= dt * fallSpeed;

      if (auto && rings.length) {
        const near = rings.reduce((a, b) => (b.y < a.y ? b : a), rings[0]);
        const gapIdx = near.pattern.findIndex((d) => !d);
        if (gapIdx >= 0) {
          const a = (gapIdx + 0.5) / N;
          const targetOffset = wrap(0.5 - a);
          let diff = wrap(targetOffset - ringOffset);
          if (diff > 0.5) diff -= 1;
          ringOffset = wrap(ringOffset + diff * Math.min(1, dt * 6));
        }
      }

      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        if (ring.y <= ballY) {
          const a = wrap(0.5 - ringOffset);
          const idx = Math.min(N - 1, Math.floor(a * N));
          if (ring.pattern[idx]) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          } else {
            score += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
            const maxY = rings.reduce((m, r) => Math.max(m, r.y), ballY);
            rings.splice(i, 1);
            rings.push(spawnRing(maxY + SPACING));
          }
          break;
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.deep, 0.08);
    g.fillRect(W / 2 - 1, 0, 2, H);

    const stripW = 6;
    for (const ring of rings) {
      if (ring.y < -RING_H || ring.y > H + RING_H) continue;
      for (let x = 0; x < W; x += stripW) {
        const a = wrap(x / W - ringOffset);
        const idx = Math.min(N - 1, Math.floor(a * N));
        g.fillStyle = ring.pattern[idx] ? pal.foe : shade(pal.deep, 0.12);
        g.fillRect(x, ring.y - RING_H / 2, stripW - 1, RING_H);
      }
    }

    // ball
    drawNicHead(g, {
      x: W / 2,
      y: ballY,
      r: 11,
      skin: over ? shade(pal.hero, -0.25) : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      gape: over ? 0.9 : 0.2,
      scowl: over ? 1 : 0,
    });

    if (over) endCard(g, t, W, H, "CLIPPED");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
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
