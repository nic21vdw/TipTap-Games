import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "tight-merge",
  title: "Tight Merge",
  rule: "Swipe to slide. Same tiles merge",
  year: 2014,
  description: "Swipe, slide, merge — but the numbers grow tight.",
  history:
    "Homage to the 2014 sliding-number craze that swept every phone: four rows, one gesture, powers of two that never stop climbing.",
  tags: ["precision", "calm", "drag"],
  palette: {
    hero: "#219ebc",
    foe: "#e63946",
    prize: "#ffb703",
    deep: "#023047",
    glow: "#8ecae6",
  },
  intensity: 0.35,
  luck: 0.2,
  nostalgia: 0.6,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 60,
} satisfies GameModule["meta"];

const N = 4;
type Dir = "up" | "down" | "left" | "right";

interface Tile {
  id: number;
  val: number;
  r: number; // logical target cell
  c: number;
  // animated pixel centre (what we actually draw), and where it slides toward
  px: number;
  py: number;
  sx: number; // slide origin, captured when a move begins
  sy: number;
  appear: number; // 0..1 spawn scale-in (1 = fully grown)
  pop: number; // 1..0 merge overshoot (0 = settled)
}

// iOS-feel timings. Slides are quick and decelerate; pops overshoot and settle.
const SLIDE = 0.11;
const SPAWN = 0.16;
const POP = 0.19;

// Snappy deceleration — the canvas twin of the feed's slide curve.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
// Overshoot-and-settle, mirrors cubic-bezier(0.34,1.56,0.64,1) used in chrome.
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const boardSize = Math.min(W * 0.9, H * 0.56);
  const gap = boardSize * 0.032;
  const cell = (boardSize - gap * (N + 1)) / N;
  const gx = W / 2 - boardSize / 2;
  const gy = H / 2 - boardSize / 2;

  const cx = (c: number) => gx + gap + c * (cell + gap) + cell / 2;
  const cy = (r: number) => gy + gap + r * (cell + gap) + cell / 2;

  let board: (Tile | null)[] = Array(N * N).fill(null);
  let ghosts: Tile[] = []; // merged-away tiles: slide in, then vanish
  let nextId = 1;
  let score = 0;
  let over = false;
  let slideT = 1; // 1 = settled; <1 = a slide is in flight (input locked)

  const spawn = (grown = false) => {
    const empties: number[] = [];
    for (let i = 0; i < N * N; i++) if (!board[i]) empties.push(i);
    if (!empties.length) return;
    const i = empties[Math.floor(Math.random() * empties.length)];
    const r = Math.floor(i / N);
    const c = i % N;
    // 1 is the common spawn; the odd 2 keeps the board climbing.
    const val = Math.random() < 0.85 ? 1 : 2;
    board[i] = {
      id: nextId++,
      val,
      r,
      c,
      px: cx(c),
      py: cy(r),
      sx: cx(c),
      sy: cy(r),
      appear: grown ? 1 : 0,
      pop: 0,
    };
  };

  const reset = () => {
    board = Array(N * N).fill(null);
    ghosts = [];
    score = 0;
    over = false;
    slideT = 1;
    spawn(true);
    spawn(true);
    ctx.onScore(0);
  };

  // Front-to-back cell order for a swipe: the front is the wall tiles pack against.
  const lineOrder = (dir: Dir, k: number): number[] => {
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      if (dir === "left") idx.push(k * N + i);
      else if (dir === "right") idx.push(k * N + (N - 1 - i));
      else if (dir === "up") idx.push(i * N + k);
      else idx.push((N - 1 - i) * N + k);
    }
    return idx;
  };

  // Returns true if the swipe changed anything (and a new tile should spawn).
  const move = (dir: Dir): boolean => {
    let moved = false;
    let gained = 0;
    const next: (Tile | null)[] = Array(N * N).fill(null);
    ghosts = [];

    for (let k = 0; k < N; k++) {
      const line = lineOrder(dir, k);
      const packed = line.map((i) => board[i]).filter((t): t is Tile => !!t);
      let write = 0;
      for (let i = 0; i < packed.length; i++) {
        const cur = packed[i];
        const nextTile = packed[i + 1];
        const dest = line[write];
        const dr = Math.floor(dest / N);
        const dc = dest % N;
        if (nextTile && nextTile.val === cur.val) {
          // merge: cur survives and doubles; nextTile slides under, then dies
          cur.r = dr;
          cur.c = dc;
          cur.sx = cur.px;
          cur.sy = cur.py;
          cur.val *= 2;
          cur.pop = 1;
          nextTile.r = dr;
          nextTile.c = dc;
          nextTile.sx = nextTile.px;
          nextTile.sy = nextTile.py;
          ghosts.push(nextTile);
          next[dest] = cur;
          gained += cur.val;
          moved = true;
          i++; // consume the absorbed tile
        } else {
          if (cur.r !== dr || cur.c !== dc) moved = true;
          cur.r = dr;
          cur.c = dc;
          cur.sx = cur.px;
          cur.sy = cur.py;
          next[dest] = cur;
        }
        write++;
      }
    }

    if (!moved) return false;
    board = next;
    if (gained > 0) {
      score += gained;
      ctx.onScore(score);
    }
    slideT = 0; // kick off the slide; spawn/pop resolve when it lands
    return true;
  };

  const canMove = (): boolean => {
    for (let i = 0; i < N * N; i++) {
      if (!board[i]) return true;
      const r = Math.floor(i / N);
      const c = i % N;
      const v = board[i]!.val;
      if (c + 1 < N && board[i + 1] && board[i + 1]!.val === v) return true;
      if (r + 1 < N && board[i + N] && board[i + N]!.val === v) return true;
    }
    return false;
  };

  const doMove = (dir: Dir) => {
    if (over || slideT < 1) return;
    if (move(dir)) {
      ctx.haptic("light");
    }
  };

  // ---- input: swipe gestures -------------------------------------------
  let downX = 0;
  let downY = 0;
  let tracking = false;
  const THRESH = 22;

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    downX = e.clientX;
    downY = e.clientY;
    tracking = true;
  };
  const onUp = (e: PointerEvent) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? "right" : "left");
    else doMove(dy > 0 ? "down" : "up");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", () => (tracking = false));

  reset();

  let auto = false;
  let autoCd = 0;

  // ---- render + tick ----------------------------------------------------
  const drawTile = (t: Tile, scale: number) => {
    const size = cell * scale;
    const x = t.px - size / 2;
    const y = t.py - size / 2;
    const level = Math.max(0, Math.log2(t.val)); // 1->0, 2->1, 4->2...
    // low tiles sit on the hero colour and warm toward the prize as they climb
    const warm = Math.min(1, level / 8);
    const face = shade(
      warm < 0.5 ? pal.hero : pal.prize,
      -0.12 + Math.min(0.34, level * 0.05)
    );

    g.save();
    g.shadowColor = "rgba(0,0,0,.28)";
    g.shadowBlur = size * 0.12;
    g.shadowOffsetY = size * 0.05;
    g.fillStyle = face;
    roundRect(g, x, y, size, size, size * 0.16);
    g.fill();
    g.restore();

    // pick legible text against the tile face
    const n = parseInt(face.slice(1), 16);
    const lum =
      (0.299 * ((n >> 16) & 255) +
        0.587 * ((n >> 8) & 255) +
        0.114 * (n & 255)) /
      255;
    g.fillStyle = lum > 0.6 ? "#0b1220" : "#f7fbff";
    const digits = String(t.val).length;
    const fs = cell * (digits > 3 ? 0.3 : digits > 2 ? 0.36 : 0.44) * scale;
    g.font = `800 ${fs}px ${ctx.getTheme().fontDisplay}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(t.val), t.px, t.py + size * 0.02);
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    // attract mode: keep merging so the preview is always in motion
    if (auto && !over && slideT >= 1) {
      autoCd -= dt;
      if (autoCd <= 0) {
        const dirs: Dir[] = ["down", "left", "down", "right", "up"];
        for (const d of dirs) if (move(d)) break;
        if (!canMove()) reset();
        autoCd = 0.55;
      }
    }

    // advance the slide; resolve spawn + collapse ghosts exactly on arrival
    if (slideT < 1) {
      const prev = slideT;
      slideT = Math.min(1, slideT + dt / SLIDE);
      const e = easeOutCubic(slideT);
      for (const t2 of board) {
        if (!t2) continue;
        t2.px = t2.sx + (cx(t2.c) - t2.sx) * e;
        t2.py = t2.sy + (cy(t2.r) - t2.sy) * e;
      }
      for (const gh of ghosts) {
        gh.px = gh.sx + (cx(gh.c) - gh.sx) * e;
        gh.py = gh.sy + (cy(gh.r) - gh.sy) * e;
      }
      if (prev < 1 && slideT >= 1) {
        ghosts = [];
        spawn();
        if (!canMove()) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
      }
    }

    // advance spawn-in and merge-pop timers
    for (const t2 of board) {
      if (!t2) continue;
      if (t2.appear < 1) t2.appear = Math.min(1, t2.appear + dt / SPAWN);
      if (t2.pop > 0) t2.pop = Math.max(0, t2.pop - dt / POP);
    }

    // ---- paint ----
    const ground = g.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, shade(pal.deep, -0.15));
    ground.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);

    // board panel + empty wells
    g.fillStyle = shade(t.surface, -0.28);
    roundRect(g, gx, gy, boardSize, boardSize, boardSize * 0.045);
    g.fill();
    g.fillStyle = shade(t.surface, -0.12);
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = cx(c) - cell / 2;
        const y = cy(r) - cell / 2;
        roundRect(g, x, y, cell, cell, cell * 0.16);
        g.fill();
      }
    }

    // ghosts slide beneath survivors
    for (const gh of ghosts) drawTile(gh, 1);
    for (const t2 of board) {
      if (!t2) continue;
      // spawn scale-in (overshoot) and a quick merge bump, layered
      const grow = t2.appear < 1 ? easeOutBack(t2.appear) : 1;
      const bump = t2.pop > 0 ? 1 + Math.sin(t2.pop * Math.PI) * 0.16 : 1;
      drawTile(t2, Math.max(0.02, grow) * bump);
    }

    if (over) endCard(g, t, W, H, "NO MOVES");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointerup", onUp);
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
