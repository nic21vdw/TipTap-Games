import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "flash-recall",
  title: "Flash Recall",
  rule: "Repeat the sequence",
  year: 1978,
  description: "The glowing memory grid, reborn at 9 tiles.",
  history:
    "Homage to the 1978 electronic memory toys that started the pattern-repeat genre — four glowing buttons on every family's shelf, now nine on your feed.",
  tags: ["memory", "calm"],
  palette: {
    hero: "#4cc9f0",
    foe: "#ef476f",
    prize: "#f9c74f",
    deep: "#1d3557",
    glow: "#a8dadc",
  },
  intensity: 0.2,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 1.5,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const N = 3; // 3x3 grid
  let score = 0;
  let over = false;
  let seq: number[] = [];
  let inputPos = 0;
  let phase: "show" | "input" | "gap" = "gap";
  let showIdx = 0;
  let phaseT = 0.8;
  let litTile = -1;
  let tapFlash = -1;
  let tapFlashT = 0;

  // Pads as big as the phone allows: half-height cells left the card looking
  // like a widget dropped in the middle of an empty screen.
  const cell = Math.min(W, H * 0.86) / N;
  const gx = W / 2 - (cell * N) / 2;
  const gy = H / 2 - (cell * N) / 2;

  const extend = () => {
    seq.push(Math.floor(Math.random() * N * N));
    phase = "show";
    showIdx = 0;
    phaseT = 0.35;
    litTile = -1;
  };

  const reset = () => {
    score = 0;
    over = false;
    seq = [];
    phase = "gap";
    phaseT = 0.8;
    ctx.onScore(0);
  };

  const tileAt = (x: number, y: number): number => {
    const c = Math.floor((x - gx) / cell);
    const r = Math.floor((y - gy) / cell);
    if (c < 0 || c >= N || r < 0 || r >= N) return -1;
    return r * N + c;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    if (phase !== "input") return;
    const rect = ctx.canvas.getBoundingClientRect();
    const tile = tileAt(e.clientX - rect.left, e.clientY - rect.top);
    if (tile === -1) return;
    tapFlash = tile;
    tapFlashT = 0.2;
    if (tile === seq[inputPos]) {
      inputPos += 1;
      ctx.haptic("light");
      if (inputPos >= seq.length) {
        score = seq.length;
        ctx.onScore(score);
        ctx.haptic("hit");
        phase = "gap";
        phaseT = 0.7;
      }
    } else {
      over = true;
      ctx.haptic("fail");
      ctx.onRunEnd(score, "WRONG TILE");
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: play the sequence back, tile by tile
      if (auto && phase === "input") {
        autoCd -= dt;
        if (autoCd <= 0) {
          tapFlash = seq[inputPos];
          tapFlashT = 0.2;
          inputPos += 1;
          autoCd = 0.3;
          if (inputPos >= seq.length) {
            score = seq.length;
            ctx.onScore(score);
            phase = "gap";
            phaseT = 0.7;
          }
        }
      }
      phaseT -= dt;
      tapFlashT = Math.max(0, tapFlashT - dt);
      if (phase === "gap" && phaseT <= 0) extend();
      if (phase === "show" && phaseT <= 0) {
        if (litTile === -1) {
          litTile = seq[showIdx];
          phaseT = Math.max(0.22, 0.5 - seq.length * 0.02);
        } else {
          litTile = -1;
          showIdx += 1;
          if (showIdx >= seq.length) {
            phase = "input";
            inputPos = 0;
          } else {
            phaseT = 0.12;
          }
        }
      }
    }

    const ground = g.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, shade(pal.deep, -0.15));
    ground.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < N * N; i++) {
      const c = i % N;
      const r = Math.floor(i / N);
      const lit =
        (phase === "show" && litTile === i) ||
        (tapFlashT > 0 && tapFlash === i);
      g.fillStyle = lit ? pal.hero : t.surface;
      const pad = 6;
      g.fillRect(gx + c * cell + pad, gy + r * cell + pad, cell - pad * 2, cell - pad * 2);
    }

    g.textAlign = "center";
    g.fillStyle = t.inkDim;
    g.font = `500 15px ${t.fontBody}`;
    g.fillText(
      phase === "input" ? "your turn" : phase === "show" ? "watch..." : "get ready",
      W / 2,
      gy + N * cell + 40
    );

    if (over) {
      endCard(g, t, W, H, "WRONG TILE");
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
