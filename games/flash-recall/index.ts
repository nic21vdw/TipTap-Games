import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop } from "@/games/engine";

const meta = {
  slug: "flash-recall",
  title: "Flash Recall",
  rule: "Repeat the sequence",
  tags: ["memory", "calm"],
  intensity: 0.2,
  luck: 0.05,
  nostalgia: 0.5,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 1.5,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
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

  const cell = Math.min(W * 0.8, H * 0.5) / N;
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
      ctx.onRunEnd(score);
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
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

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < N * N; i++) {
      const c = i % N;
      const r = Math.floor(i / N);
      const lit =
        (phase === "show" && litTile === i) ||
        (tapFlashT > 0 && tapFlash === i);
      g.fillStyle = lit ? t.accent : t.surface;
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
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("WRONG TILE", W / 2, gy - 60);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, gy - 28);
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
  };
}

const mod: GameModule = { meta, mount };
export default mod;
