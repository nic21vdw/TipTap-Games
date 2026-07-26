import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawCan, drawRoom, skins } from "@/games/nic-art";

const meta = {
  slug: "flash-recall",
  title: "Fridge Order",
  rule: "Repeat the order they lit up",
  year: 1978,
  description: "The glowing memory grid, rebuilt as a fridge shelf.",
  history:
    "Homage to the 1978 electronic memory toys that started the pattern-repeat genre — four glowing buttons on every family's shelf, now nine cans on one basement shelf.",
  tags: ["memory", "calm"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#12161f",
    glow: "#c9d3dc",
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

    drawRoom(g, W, H, pal.deep, pal.glow);
    const sk = skins(pal);

    // the shelf the cans stand on
    g.fillStyle = shade(pal.deep, 0.18);
    for (let r = 0; r <= N; r++) {
      g.fillRect(gx - 10, gy + r * cell - 3, cell * N + 20, 4);
    }

    for (let i = 0; i < N * N; i++) {
      const c = i % N;
      const r = Math.floor(i / N);
      const lit =
        (phase === "show" && litTile === i) ||
        (tapFlashT > 0 && tapFlash === i);
      const pad = 6;
      const x = gx + c * cell + cell / 2;
      const y = gy + r * cell + cell / 2;
      // slot recess, so an unlit shelf still reads as a grid
      g.fillStyle = t.surface;
      g.fillRect(gx + c * cell + pad, gy + r * cell + pad, cell - pad * 2, cell - pad * 2);
      // the can. Alternating drinks give the shelf a pattern to remember by.
      const kind = (c + r) % 2 === 0 ? "cola" : "energy";
      const skin = lit
        ? { ...sk[kind], body: shade(sk[kind].body, 0.5), band: pal.prize }
        : sk[kind];
      if (lit) {
        g.fillStyle = pal.hero + "55";
        g.fillRect(gx + c * cell + pad, gy + r * cell + pad, cell - pad * 2, cell - pad * 2);
      }
      drawCan(g, x, y, cell * 0.42, cell * 0.66, skin, kind);
    }

    g.textAlign = "center";
    g.fillStyle = t.inkDim;
    g.font = `500 15px ${t.fontBody}`;
    g.fillText(
      phase === "input" ? "your turn" : phase === "show" ? "watch the shelf..." : "get ready",
      W / 2,
      gy + N * cell + 40
    );

    if (over) {
      endCard(g, t, W, H, "WRONG CAN");
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
