import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, clamp, roundRect } from "@/games/engine";
import {
  createFx,
  drawBackdrop,
  resultCard,
  pips,
  hexA,
  mix,
  halo,
  pulse,
  groundInk,
  safeBox,
} from "@/games/fx";

const meta = {
  slug: "flash-recall",
  title: "Flash Recall",
  rule: "Watch the pads. Play them back",
  year: 1978,
  description: "The glowing memory grid, reborn at nine pads and no mercy.",
  history:
    "Homage to the 1978 electronic memory toys that started the pattern-repeat genre — four glowing buttons on every family's shelf, now nine on your feed.",
  tags: ["memory", "calm"],
  palette: {
    hero: "#4cc9f0",
    foe: "#ef476f",
    prize: "#f9c74f",
    deep: "#0d1b3e",
    glow: "#b388ff",
  },
  intensity: 0.2,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 1.5,
} satisfies GameModule["meta"];

const N = 3; // 3x3 grid

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();

  let score = 0;
  let best = 0;
  let lives = 3;
  let over = false;
  let overAge = 0;
  let seq: number[] = [];
  let inputPos = 0;
  let phase: "show" | "input" | "gap" = "gap";
  let showIdx = 0;
  let phaseT = 0.8;
  let litTile = -1;
  let clock = 0;
  let longest = 0;
  /** per-tile press glow, so a pad stays warm for a beat after it fires */
  const heat = new Array(N * N).fill(0);
  const wrongT = new Array(N * N).fill(0);

  const box = safeBox(W, H);
  const cell = Math.min(box.right * 0.84, box.height * 0.62) / N;
  const gx = box.right / 2 - (cell * N) / 2;
  const gy = box.midY - (cell * N) / 2 - 10;

  const tileColour = (i: number) => {
    const p = (i % 4) / 3;
    return p < 0.5 ? mix(pal.hero, pal.glow, p * 2) : mix(pal.glow, pal.prize, (p - 0.5) * 2);
  };

  const centre = (i: number) => ({
    x: gx + (i % N) * cell + cell / 2,
    y: gy + Math.floor(i / N) * cell + cell / 2,
  });

  const light = (i: number, strength = 1) => {
    heat[i] = strength;
    const c = centre(i);
    fx.ring(c.x, c.y, tileColour(i), cell * 0.35, 4);
  };

  const extend = () => {
    // never the same pad three times running — that reads as a stutter
    let next = Math.floor(Math.random() * N * N);
    const tail = seq.slice(-2);
    let guard = 0;
    while (tail.length === 2 && tail[0] === next && tail[1] === next && guard++ < 8) {
      next = Math.floor(Math.random() * N * N);
    }
    seq.push(next);
    phase = "show";
    showIdx = 0;
    phaseT = 0.4;
    litTile = -1;
  };

  const reset = () => {
    score = 0;
    lives = 3;
    longest = 0;
    over = false;
    overAge = 0;
    seq = [];
    phase = "gap";
    phaseT = 0.8;
    heat.fill(0);
    wrongT.fill(0);
    fx.clear();
    ctx.onScore(0);
  };

  const tileAt = (x: number, y: number): number => {
    const c = Math.floor((x - gx) / cell);
    const r = Math.floor((y - gy) / cell);
    if (c < 0 || c >= N || r < 0 || r >= N) return -1;
    return r * N + c;
  };

  const press = (tile: number) => {
    const th = ctx.getTheme();
    const c = centre(tile);
    if (tile === seq[inputPos]) {
      light(tile);
      inputPos += 1;
      ctx.haptic("light");
      fx.burst(c.x, c.y, {
        count: 8,
        colour: tileColour(tile),
        speed: 150,
        life: 0.4,
        size: 3,
      });
      if (inputPos >= seq.length) {
        score = seq.length;
        longest = Math.max(longest, seq.length);
        ctx.onScore(score);
        ctx.haptic("hit");
        fx.flash(pal.prize, 0.14);
        fx.pop(box.right / 2, gy - 26, `${seq.length} IN A ROW`, pal.prize, 22, th.fontDisplay);
        phase = "gap";
        phaseT = 0.6;
      }
    } else {
      wrongT[tile] = 0.5;
      lives -= 1;
      ctx.haptic("fail");
      fx.shake(12);
      fx.flash(pal.foe, 0.28);
      fx.burst(c.x, c.y, {
        count: 16,
        colour: [pal.foe, "#ffffff"],
        speed: 220,
        life: 0.5,
        size: 4,
        kind: "square",
        gravity: 300,
      });
      if (lives <= 0) {
        over = true;
        overAge = 0;
        best = Math.max(best, score);
        ctx.onRunEnd(score);
      } else {
        // a slip replays the same sequence — the memory, not the run, is the test
        fx.pop(box.right / 2, gy - 26, "WATCH AGAIN", pal.foe, 20, th.fontDisplay);
        phase = "show";
        showIdx = 0;
        phaseT = 0.55;
        litTile = -1;
        inputPos = 0;
      }
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      if (overAge > 0.25) reset();
      return;
    }
    if (phase !== "input") return;
    const rect = ctx.canvas.getBoundingClientRect();
    const tile = tileAt(e.clientX - rect.left, e.clientY - rect.top);
    if (tile === -1) return;
    press(tile);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    for (let i = 0; i < heat.length; i++) {
      heat[i] = Math.max(0, heat[i] - dt * 2.6);
      wrongT[i] = Math.max(0, wrongT[i] - dt * 2);
    }

    if (over) {
      overAge += dt;
    } else {
      // attract mode: play the sequence back, pad by pad
      if (auto && phase === "input") {
        autoCd -= dt;
        if (autoCd <= 0) {
          press(seq[inputPos]);
          autoCd = 0.3;
        }
      }
      phaseT -= dt;
      if (phase === "gap" && phaseT <= 0) extend();
      if (phase === "show" && phaseT <= 0) {
        if (litTile === -1) {
          litTile = seq[showIdx];
          light(litTile, 1);
          phaseT = Math.max(0.2, 0.46 - seq.length * 0.015);
        } else {
          litTile = -1;
          showIdx += 1;
          if (showIdx >= seq.length) {
            phase = "input";
            inputPos = 0;
          } else {
            phaseT = 0.13;
          }
        }
      }
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "blobs",
      intensity: 0.5,
      vignette: 0.6,
    });

    fx.begin(g);
    fx.drawUnder(g);

    // ---- the pads
    for (let i = 0; i < N * N; i++) {
      const c = i % N;
      const r = Math.floor(i / N);
      const pad = 7;
      const x = gx + c * cell + pad;
      const y = gy + r * cell + pad;
      const s = cell - pad * 2;
      const on = clamp(heat[i], 0, 1);
      const bad = clamp(wrongT[i], 0, 1);
      const col = bad > 0 ? pal.foe : tileColour(i);

      if (on > 0.02 || bad > 0) {
        halo(g, x + s / 2, y + s / 2, s * 0.95, col, 0.42 * Math.max(on, bad));
      }
      // the unlit pad: a dark slab with a rim of its own colour
      g.fillStyle = hexA("#000000", 0.35);
      roundRect(g, x + 2, y + 4, s, s, 16);
      g.fill();
      const face = g.createLinearGradient(x, y, x, y + s);
      const lift = Math.max(on, bad);
      face.addColorStop(0, hexA(col, 0.16 + lift * 0.75));
      face.addColorStop(1, hexA(col, 0.06 + lift * 0.5));
      g.fillStyle = face;
      roundRect(g, x, y - lift * 2, s, s, 16);
      g.fill();
      g.strokeStyle = hexA(col, 0.35 + lift * 0.65);
      g.lineWidth = 2;
      roundRect(g, x + 1, y + 1 - lift * 2, s - 2, s - 2, 15);
      g.stroke();
      // a lit pad gets a bright core
      if (lift > 0.05) {
        g.fillStyle = hexA("#ffffff", lift * 0.35);
        roundRect(g, x + s * 0.2, y + s * 0.2 - lift * 2, s * 0.6, s * 0.6, 12);
        g.fill();
      }
    }

    // ---- progress: one dot per step in the sequence
    if (seq.length > 0) {
      const dots = Math.min(seq.length, 14);
      const gap = Math.min(16, (box.right * 0.7) / dots);
      const start = box.right / 2 - ((dots - 1) * gap) / 2;
      for (let i = 0; i < dots; i++) {
        const done = phase === "input" ? i < inputPos : phase === "show" ? i < showIdx : true;
        g.beginPath();
        g.arc(start + i * gap, gy + N * cell + 34, done ? 4.5 : 3, 0, Math.PI * 2);
        g.fillStyle = done ? pal.prize : hexA(ink.main, 0.25);
        g.fill();
      }
    }

    // ---- HUD
    pips(g, box.right / 2, H * 0.12, 3, lives, pal.prize, ink.main, 6);
    g.textAlign = "center";
    const label =
      phase === "input" ? "your turn" : phase === "show" ? "watch…" : "get ready";
    g.fillStyle =
      phase === "input"
        ? hexA(pal.prize, 0.7 + pulse(clock, 1.2) * 0.3)
        : hexA(ink.dim, 0.9);
    g.font = `800 15px ${th.fontBody}`;
    g.fillText(label.toUpperCase(), box.right / 2, gy + N * cell + 66);
    g.fillStyle = hexA(ink.main, 0.4);
    g.font = `700 13px ${th.fontBody}`;
    g.fillText(`LENGTH ${seq.length}`, box.right / 2, H * 0.19);
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: "wrong pad",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `longest sequence ${longest}`,
        age: overAge,
        accent: pal.hero,
      });
    }
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
