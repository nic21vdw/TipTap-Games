import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "hue-pass",
  title: "Hue Pass",
  rule: "Tap to match your color to the gate",
  year: 2015,
  description: "Cycle your hue, thread the spinning gate, don't clash.",
  history:
    "Homage to the 2015 color-matching arcade wave that turned split-second hue swaps into a mobile phenomenon.",
  tags: ["oneTap", "reflex", "precision"],
  palette: {
    hero: "#ff6f59",
    foe: "#9c2b2b",
    prize: "#ffd23f",
    deep: "#101418",
    glow: "#3bceac",
  },
  intensity: 0.65,
  luck: 0.1,
  nostalgia: 0.4,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

// Gates are unrolled rings, same trick as a tower dive: N angular segments,
// each holding one of 3 colors, rendered as a horizontal strip that spins on
// its own (gate.rot advances every frame). The ball sits at a fixed screen
// spot; tapping cycles its own color through the same 3-color set. When a
// gate's Y reaches the ball, the segment aligned at the ball's fixed screen
// position must share the ball's current color.
const N = 3;
const GATE_H = 20;
const SPACING = 130;

interface Gate {
  y: number;
  rot: number;
  spin: number;
  colors: number[]; // indices into COLORS, one per segment
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const ballY = H * 0.26;
  const COLORS = [pal.hero, pal.prize, pal.glow];

  const wrap = (v: number) => ((v % 1) + 1) % 1;

  let gates: Gate[] = [];
  let fallSpeed = 100;
  let ballColor = 0;
  let score = 0;
  let over = false;

  const shuffledColors = (): number[] => {
    const idxs = [0, 1, 2];
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    return idxs;
  };

  const spawnGate = (y: number): Gate => ({
    y,
    rot: Math.random(),
    spin: 0.15 + Math.min(0.6, score * 0.01),
    colors: shuffledColors(),
  });

  const reset = () => {
    score = 0;
    over = false;
    fallSpeed = 100;
    ballColor = 0;
    gates = [];
    for (let i = 0; i < 5; i++) gates.push(spawnGate(ballY + SPACING * (i + 1)));
    ctx.onScore(0);
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    ballColor = (ballColor + 1) % 3;
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      fallSpeed = Math.min(280, 100 + score * 6);
      for (const gate of gates) {
        gate.y -= dt * fallSpeed;
        gate.rot = wrap(gate.rot + dt * gate.spin);
      }

      if (auto && gates.length) {
        const near = gates.reduce((a, b) => (b.y < a.y ? b : a), gates[0]);
        const a = wrap(0.5 - near.rot);
        const idx = Math.min(N - 1, Math.floor(a * N));
        ballColor = near.colors[idx];
      }

      for (let i = 0; i < gates.length; i++) {
        const gate = gates[i];
        if (gate.y <= ballY) {
          const a = wrap(0.5 - gate.rot);
          const idx = Math.min(N - 1, Math.floor(a * N));
          if (gate.colors[idx] === ballColor) {
            score += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
            const maxY = gates.reduce((m, r) => Math.max(m, r.y), ballY);
            gates.splice(i, 1);
            gates.push(spawnGate(maxY + SPACING));
          } else {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
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
    for (const gate of gates) {
      if (gate.y < -GATE_H || gate.y > H + GATE_H) continue;
      for (let x = 0; x < W; x += stripW) {
        const a = wrap(x / W - gate.rot);
        const idx = Math.min(N - 1, Math.floor(a * N));
        g.fillStyle = COLORS[gate.colors[idx]];
        g.fillRect(x, gate.y - GATE_H / 2, stripW - 1, GATE_H);
      }
    }

    // ball shows its current color
    g.beginPath();
    g.arc(W / 2, ballY, 11, 0, Math.PI * 2);
    g.fillStyle = over ? shade(pal.foe, -0.1) : COLORS[ballColor];
    g.fill();
    g.strokeStyle = shade(t.surface, 0.2);
    g.lineWidth = 2;
    g.stroke();

    if (over) endCard(g, t, W, H, "WRONG HUE");
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
