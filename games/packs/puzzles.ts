// Puzzle pack — grids, matches, merges and one very fast game of cards.

import type { GameModule } from "@/games/types";
import { centred, defineGame, sky } from "@/games/kit";
import { alpha, clamp, mix, pick, rand, roundRect, shade } from "@/games/engine";

/** Grid geometry shared by every board in this pack. */
function board(W: number, H: number, cols: number, rows: number, topPad = 0.2) {
  const cell = Math.min((W * 0.9) / cols, (H * (0.94 - topPad)) / rows);
  return {
    cell,
    ox: (W - cell * cols) / 2,
    oy: H * topPad,
    hit(x: number, y: number) {
      const c = Math.floor((x - this.ox) / this.cell);
      const r = Math.floor((y - this.oy) / this.cell);
      return c >= 0 && c < cols && r >= 0 && r < rows ? { c, r } : null;
    },
  };
}

// -------------------------------------------------------------- Line Fall

const SHAPES: number[][][] = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
];

function rotate(m: number[][]): number[][] {
  const R = m.length;
  const C = m[0].length;
  const out: number[][] = [];
  for (let c = 0; c < C; c++) {
    out.push([]);
    for (let r = R - 1; r >= 0; r--) out[c].push(m[r][c]);
  }
  return out;
}

const COLS = 8;
const ROWS = 14;

const lineFall = defineGame<{
  grid: number[][];
  piece: number[][];
  kind: number;
  px: number;
  py: number;
  fall: number;
  flashRows: number[];
  flash: number;
}>(
  {
    slug: "line-fall",
    title: "Line Fall",
    rule: "Sides to slide, top to spin",
    year: 1984,
    description: "The oldest argument in games: where does this one go?",
    history:
      "Homage to the 1984 falling-block puzzle written on an Electronika 60 — the single most ported idea in the medium.",
    tags: ["precision", "endurance", "retro", "calm"],
    palette: {
      hero: "#00e5ff",
      foe: "#ff3d6e",
      prize: "#ffd60a",
      deep: "#10121c",
      glow: "#2a2f45",
    },
    intensity: 0.45,
    speed: 0.4,
    difficulty: 0.55,
    luck: 0.25,
    nostalgia: 1,
    realism: 0.05,
    sessionLength: 0.7,
    scoreUnit: "lines",
    maxScorePerSecond: 2,
  },
  {
    hint: "sides move · top spins · bottom drops",
    overMsg: "STACKED OUT",
    init: () => {
      const kind = Math.floor(rand(0, SHAPES.length));
      return {
        grid: Array.from({ length: ROWS }, () => Array(COLS).fill(0)),
        piece: SHAPES[kind].map((r) => [...r]),
        kind: kind + 1,
        px: 3,
        py: 0,
        fall: 0,
        flashRows: [],
        flash: 0,
      };
    },
    down: (s, x, y, api) => {
      const { W, H } = api;
      const fits = (p: number[][], px: number, py: number) => {
        for (let r = 0; r < p.length; r++)
          for (let c = 0; c < p[r].length; c++) {
            if (!p[r][c]) continue;
            const gx = px + c;
            const gy = py + r;
            if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
            if (gy >= 0 && s.grid[gy][gx]) return false;
          }
        return true;
      };
      if (y > H * 0.78) {
        while (fits(s.piece, s.px, s.py + 1)) s.py += 1;
        s.fall = 99;
      } else if (y < H * 0.34) {
        const rot = rotate(s.piece);
        if (fits(rot, s.px, s.py)) s.piece = rot;
      } else if (x < W / 2) {
        if (fits(s.piece, s.px - 1, s.py)) s.px -= 1;
      } else if (fits(s.piece, s.px + 1, s.py)) s.px += 1;
      api.haptic("light");
    },
    update: (s, dt, api) => {
      if (s.flash > 0) {
        s.flash -= dt;
        if (s.flash <= 0) {
          for (const r of s.flashRows.sort((a, b) => a - b)) {
            s.grid.splice(r, 1);
            s.grid.unshift(Array(COLS).fill(0));
          }
          s.flashRows = [];
        }
        return;
      }
      const fits = (p: number[][], px: number, py: number) => {
        for (let r = 0; r < p.length; r++)
          for (let c = 0; c < p[r].length; c++) {
            if (!p[r][c]) continue;
            const gx = px + c;
            const gy = py + r;
            if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
            if (gy >= 0 && s.grid[gy][gx]) return false;
          }
        return true;
      };
      s.fall += dt * (1.6 + api.score * 0.08);
      if (s.fall < 1) return;
      s.fall = 0;
      if (fits(s.piece, s.px, s.py + 1)) {
        s.py += 1;
        return;
      }
      for (let r = 0; r < s.piece.length; r++)
        for (let c = 0; c < s.piece[r].length; c++)
          if (s.piece[r][c]) {
            const gy = s.py + r;
            if (gy < 0) {
              api.end();
              return;
            }
            s.grid[gy][s.px + c] = s.kind;
          }
      const full = s.grid
        .map((row, i) => (row.every((v) => v) ? i : -1))
        .filter((i) => i >= 0);
      if (full.length) {
        s.flashRows = full;
        s.flash = 0.25;
        api.add(full.length * (full.length > 2 ? 2 : 1));
        api.haptic("hit");
      }
      const kind = Math.floor(rand(0, SHAPES.length));
      s.piece = SHAPES[kind].map((r) => [...r]);
      s.kind = kind + 1;
      s.px = 3;
      s.py = 0;
      if (!fits(s.piece, s.px, s.py)) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      void api;
      // drift toward the lowest column so the preview keeps clearing rows
      const heights = Array.from({ length: COLS }, (_, c) => {
        for (let r = 0; r < ROWS; r++) if (s.grid[r][c]) return ROWS - r;
        return 0;
      });
      let bestC = 0;
      for (let c = 1; c < COLS; c++) if (heights[c] < heights[bestC]) bestC = c;
      if (s.px < bestC) s.px += 1;
      else if (s.px > bestC) s.px -= 1;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, 0.2));
      const b = board(W, H, COLS, ROWS, 0.12);
      const cols = [pal.hero, pal.prize, pal.foe, pal.glow, "#7cf5a0", "#c77dff", "#ff9f45"];
      g.fillStyle = alpha("#000000", 0.3);
      g.fillRect(b.ox - 4, b.oy - 4, b.cell * COLS + 8, b.cell * ROWS + 8);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const v = s.grid[r][c];
          const x = b.ox + c * b.cell;
          const y = b.oy + r * b.cell;
          if (!v) {
            g.fillStyle = alpha(pal.glow, 0.35);
            g.fillRect(x + 1, y + 1, b.cell - 2, b.cell - 2);
            continue;
          }
          const on = s.flashRows.includes(r);
          g.fillStyle = on ? "#ffffff" : cols[(v - 1) % cols.length];
          roundRect(g, x + 1, y + 1, b.cell - 2, b.cell - 2, 3);
          g.fill();
          g.fillStyle = alpha("#ffffff", 0.22);
          g.fillRect(x + 3, y + 3, b.cell - 6, 4);
        }
      for (let r = 0; r < s.piece.length; r++)
        for (let c = 0; c < s.piece[r].length; c++) {
          if (!s.piece[r][c]) continue;
          const gy = s.py + r;
          if (gy < 0) continue;
          const x = b.ox + (s.px + c) * b.cell;
          const y = b.oy + gy * b.cell;
          g.fillStyle = cols[(s.kind - 1) % cols.length];
          roundRect(g, x + 1, y + 1, b.cell - 2, b.cell - 2, 3);
          g.fill();
          g.fillStyle = alpha("#ffffff", 0.25);
          g.fillRect(x + 3, y + 3, b.cell - 6, 4);
        }
      centred(g, `${api.score} lines`, W / 2, 34, 20, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Merge Grid

const N = 4;

function slide(grid: number[][], dir: 0 | 1 | 2 | 3): { grid: number[][]; gained: number; moved: boolean } {
  const g = grid.map((r) => [...r]);
  let gained = 0;
  let moved = false;
  const line = (arr: number[]) => {
    const v = arr.filter((n) => n);
    for (let i = 0; i < v.length - 1; i++)
      if (v[i] === v[i + 1]) {
        v[i] *= 2;
        gained += v[i];
        v.splice(i + 1, 1);
      }
    while (v.length < N) v.push(0);
    return v;
  };
  for (let i = 0; i < N; i++) {
    let row: number[];
    if (dir === 0) row = g[i];
    else if (dir === 1) row = [...g[i]].reverse();
    else if (dir === 2) row = g.map((r) => r[i]);
    else row = g.map((r) => r[i]).reverse();
    const out = line(row);
    if (out.some((v, k) => v !== row[k])) moved = true;
    for (let k = 0; k < N; k++) {
      if (dir === 0) g[i][k] = out[k];
      else if (dir === 1) g[i][N - 1 - k] = out[k];
      else if (dir === 2) g[k][i] = out[k];
      else g[N - 1 - k][i] = out[k];
    }
  }
  return { grid: g, gained, moved };
}

function spawn(g: number[][]) {
  const free: [number, number][] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!g[r][c]) free.push([r, c]);
  if (!free.length) return;
  const [r, c] = pick(free);
  g[r][c] = Math.random() < 0.9 ? 2 : 4;
}

const mergeGrid = defineGame<{ g: number[][]; sx: number; sy: number; best: number }>(
  {
    slug: "merge-grid",
    title: "Merge Grid",
    rule: "Swipe to slide, equals merge",
    year: 2014,
    description: "One weekend project that ate a whole year of everyone's commute.",
    history:
      "Homage to the 2014 merge puzzle built in a weekend as a clone of a clone, which promptly out-ran both of them.",
    tags: ["precision", "calm", "memory"],
    palette: {
      hero: "#f2b179",
      foe: "#edc22e",
      prize: "#f65e3b",
      deep: "#faf8ef",
      glow: "#bbada0",
    },
    intensity: 0.25,
    speed: 0.25,
    difficulty: 0.45,
    luck: 0.35,
    nostalgia: 0.4,
    realism: 0.05,
    sessionLength: 0.8,
    scoreUnit: "pts",
    maxScorePerSecond: 60,
  },
  {
    hint: "swipe any direction",
    overMsg: "NO MOVES",
    init: () => {
      const g = Array.from({ length: N }, () => Array(N).fill(0));
      spawn(g);
      spawn(g);
      return { g, sx: 0, sy: 0, best: 2 };
    },
    down: (s, x, y) => {
      s.sx = x;
      s.sy = y;
    },
    up: (s, x, y, api) => {
      const dx = x - s.sx;
      const dy = y - s.sy;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
      const dir: 0 | 1 | 2 | 3 =
        Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : dy < 0 ? 2 : 3;
      const res = slide(s.g, dir);
      if (!res.moved) {
        api.haptic("fail");
        return;
      }
      s.g = res.grid;
      spawn(s.g);
      api.add(res.gained);
      s.best = Math.max(s.best, ...s.g.flat());
      api.haptic("hit");
      const stuck = ([0, 1, 2, 3] as const).every((d) => !slide(s.g, d).moved);
      if (stuck) api.end();
    },
    update: () => {},
    bot: (s, dt, api) => {
      void dt;
      s.sy += 1;
      if (s.sy < 34) return;
      s.sy = 0;
      const order = ([2, 0, 3, 1] as const).filter((d) => slide(s.g, d).moved);
      if (!order.length) {
        api.end();
        return;
      }
      const res = slide(s.g, order[0]);
      s.g = res.grid;
      spawn(s.g);
      api.add(res.gained);
      s.best = Math.max(s.best, ...s.g.flat());
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, -0.05));
      const b = board(W, H, N, N, 0.24);
      g.fillStyle = pal.glow;
      roundRect(g, b.ox - 7, b.oy - 7, b.cell * N + 14, b.cell * N + 14, 10);
      g.fill();
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const v = s.g[r][c];
          const x = b.ox + c * b.cell;
          const y = b.oy + r * b.cell;
          const lv = v ? Math.log2(v) : 0;
          g.fillStyle = v
            ? mix(pal.hero, pal.prize, clamp((lv - 1) / 8, 0, 1))
            : alpha("#ffffff", 0.22);
          roundRect(g, x + 4, y + 4, b.cell - 8, b.cell - 8, 7);
          g.fill();
          if (v)
            centred(
              g,
              `${v}`,
              x + b.cell / 2,
              y + b.cell / 2 + 9,
              v < 100 ? 27 : v < 1000 ? 22 : 17,
              lv > 3 ? "#fff" : "#6b5f52",
              t.fontDisplay
            );
        }
      centred(g, `${api.score}`, W / 2, H * 0.14, 34, t.ink, t.fontDisplay);
      centred(g, `best tile ${s.best}`, W / 2, H * 0.18, 14, t.inkDim, t.fontBody, 700);
    },
  }
);

// -------------------------------------------------------------- Block Fit

const BF = 9;
const BF_PIECES: number[][][] = [
  [[1]],
  [[1, 1]],
  [[1], [1]],
  [[1, 1, 1]],
  [[1], [1], [1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 0],
    [1, 1],
  ],
  [
    [1, 1],
    [0, 1],
  ],
  [[1, 1, 1, 1]],
];

const blockFit = defineGame<{
  grid: number[][];
  tray: (number[][] | null)[];
  held: number | null;
  hx: number;
  hy: number;
}>(
  {
    slug: "block-fit",
    title: "Block Fit",
    rule: "Drag shapes in, fill a line",
    year: 2014,
    description: "No falling, no timer, no mercy. Just space, running out.",
    history:
      "Homage to the 2014 no-gravity block puzzle that proved the falling part was never the interesting bit.",
    tags: ["precision", "calm", "drag"],
    palette: {
      hero: "#4cc9f0",
      foe: "#f72585",
      prize: "#b5179e",
      deep: "#1b1b2f",
      glow: "#3f37c9",
    },
    intensity: 0.25,
    speed: 0.2,
    difficulty: 0.5,
    luck: 0.35,
    nostalgia: 0.4,
    realism: 0.05,
    sessionLength: 0.7,
    scoreUnit: "pts",
    maxScorePerSecond: 25,
  },
  {
    hint: "drag a shape onto the board",
    overMsg: "NO ROOM",
    init: () => ({
      grid: Array.from({ length: BF }, () => Array(BF).fill(0)),
      tray: [0, 1, 2].map(() => pick(BF_PIECES).map((r) => [...r])),
      held: null,
      hx: 0,
      hy: 0,
    }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y < H * 0.78) return;
      const i = clamp(Math.floor((x / W) * 3), 0, 2);
      if (s.tray[i]) {
        s.held = i;
        s.hx = x;
        s.hy = y;
      }
    },
    move: (s, x, y) => {
      if (s.held === null) return;
      s.hx = x;
      s.hy = y;
    },
    up: (s, x, y, api) => {
      if (s.held === null) return;
      const { W, H } = api;
      const b = board(W, H, BF, BF, 0.14);
      const p = s.tray[s.held]!;
      // the shape is carried above the finger so it isn't hidden by it
      const cell = b.hit(x - (p[0].length * b.cell) / 2 + b.cell / 2, y - 62);
      s.held = null;
      if (!cell) return;
      const fits = p.every((row, r) =>
        row.every(
          (v, c) =>
            !v ||
            (cell.c + c < BF && cell.r + r < BF && !s.grid[cell.r + r][cell.c + c])
        )
      );
      if (!fits) {
        api.haptic("fail");
        return;
      }
      let placed = 0;
      p.forEach((row, r) =>
        row.forEach((v, c) => {
          if (v) {
            s.grid[cell.r + r][cell.c + c] = 1;
            placed += 1;
          }
        })
      );
      api.add(placed);
      api.haptic("hit");
      const idx = s.tray.findIndex((tp) => tp === p);
      s.tray[idx] = null;
      // clear full rows and columns together
      const rows = [];
      const colsF = [];
      for (let r = 0; r < BF; r++) if (s.grid[r].every((v) => v)) rows.push(r);
      for (let c = 0; c < BF; c++)
        if (s.grid.every((row) => row[c])) colsF.push(c);
      for (const r of rows) s.grid[r] = Array(BF).fill(0);
      for (const c of colsF) for (let r = 0; r < BF; r++) s.grid[r][c] = 0;
      const cleared = rows.length + colsF.length;
      if (cleared) api.add(cleared * BF * 2);
      if (s.tray.every((tp) => !tp))
        s.tray = [0, 1, 2].map(() => pick(BF_PIECES).map((r) => [...r]));
      // dead when nothing left in the tray fits anywhere
      const anyFits = s.tray.some(
        (tp) =>
          tp &&
          Array.from({ length: BF }, (_, r) =>
            Array.from({ length: BF }, (_, c) =>
              tp.every((row, dr) =>
                row.every(
                  (v, dc) =>
                    !v ||
                    (c + dc < BF && r + dr < BF && !s.grid[r + dr][c + dc])
                )
              )
            ).some(Boolean)
          ).some(Boolean)
      );
      if (!anyFits) api.end();
    },
    update: () => {},
    bot: (s, dt, api) => {
      s.hy += dt;
      if (s.hy < 0.7) return;
      s.hy = 0;
      const i = s.tray.findIndex((p) => p);
      if (i < 0) {
        s.tray = [0, 1, 2].map(() => pick(BF_PIECES).map((r) => [...r]));
        return;
      }
      const p = s.tray[i]!;
      for (let r = 0; r < BF; r++)
        for (let c = 0; c < BF; c++) {
          const fits = p.every((row, dr) =>
            row.every(
              (v, dc) =>
                !v ||
                (c + dc < BF && r + dr < BF && !s.grid[r + dr][c + dc])
            )
          );
          if (!fits) continue;
          p.forEach((row, dr) =>
            row.forEach((v, dc) => {
              if (v) s.grid[r + dr][c + dc] = 1;
            })
          );
          s.tray[i] = null;
          api.add(4);
          for (let k = 0; k < BF; k++) {
            if (s.grid[k].every((v) => v)) s.grid[k] = Array(BF).fill(0);
            if (s.grid.every((row) => row[k]))
              for (let q = 0; q < BF; q++) s.grid[q][k] = 0;
          }
          return;
        }
      s.tray[i] = null;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.glow, -0.45));
      const b = board(W, H, BF, BF, 0.14);
      for (let r = 0; r < BF; r++)
        for (let c = 0; c < BF; c++) {
          const x = b.ox + c * b.cell;
          const y = b.oy + r * b.cell;
          g.fillStyle = s.grid[r][c] ? pal.hero : alpha("#ffffff", 0.09);
          roundRect(g, x + 1.5, y + 1.5, b.cell - 3, b.cell - 3, 4);
          g.fill();
        }
      const tw = W / 3;
      s.tray.forEach((p, i) => {
        if (!p || s.held === i) return;
        const sc = 16;
        const px = i * tw + tw / 2 - (p[0].length * sc) / 2;
        const py = H * 0.84 - (p.length * sc) / 2;
        p.forEach((row, r) =>
          row.forEach((v, c) => {
            if (!v) return;
            g.fillStyle = pal.prize;
            roundRect(g, px + c * sc, py + r * sc, sc - 2, sc - 2, 3);
            g.fill();
          })
        );
      });
      if (s.held !== null) {
        const p = s.tray[s.held]!;
        const px = s.hx - (p[0].length * b.cell) / 2;
        const py = s.hy - 62;
        p.forEach((row, r) =>
          row.forEach((v, c) => {
            if (!v) return;
            g.fillStyle = alpha(pal.foe, 0.9);
            roundRect(g, px + c * b.cell + 1, py + r * b.cell + 1, b.cell - 2, b.cell - 2, 4);
            g.fill();
          })
        );
      }
      centred(g, `${api.score}`, W / 2, H * 0.09, 30, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------------ Sweep

const SW_C = 7;
const SW_R = 9;

const sweep = defineGame<{
  mines: boolean[][];
  open: boolean[][];
  flag: boolean[][];
  first: boolean;
  left: number;
  down: number;
  cell: { c: number; r: number } | null;
}>(
  {
    slug: "sweep",
    title: "Sweep",
    rule: "Tap to clear, hold to flag",
    year: 1990,
    description: "Pure deduction, one bad guess from over. Shipped with the whole world.",
    history:
      "Homage to the 1990 desktop grid that came free with an operating system and taught a generation probability by accident.",
    tags: ["memory", "precision", "calm", "retro"],
    palette: {
      hero: "#3a86ff",
      foe: "#e63946",
      prize: "#06d6a0",
      deep: "#c5c9d3",
      glow: "#8d99ae",
    },
    intensity: 0.3,
    speed: 0.25,
    difficulty: 0.6,
    luck: 0.4,
    nostalgia: 1,
    realism: 0.1,
    sessionLength: 0.6,
    scoreUnit: "cells",
    maxScorePerSecond: 8,
  },
  {
    hint: "tap a square",
    overMsg: "BOOM",
    init: () => ({
      mines: Array.from({ length: SW_R }, () => Array(SW_C).fill(false)),
      open: Array.from({ length: SW_R }, () => Array(SW_C).fill(false)),
      flag: Array.from({ length: SW_R }, () => Array(SW_C).fill(false)),
      first: true,
      left: SW_C * SW_R - 10,
      down: 0,
      cell: null,
    }),
    down: (s, x, y, api) => {
      const b = board(api.W, api.H, SW_C, SW_R, 0.18);
      s.cell = b.hit(x, y);
      s.down = api.t;
    },
    up: (s, _x, _y, api) => {
      const cell = s.cell;
      s.cell = null;
      if (!cell) return;
      const { c, r } = cell;
      if (api.t - s.down > 0.35) {
        if (!s.open[r][c]) {
          s.flag[r][c] = !s.flag[r][c];
          api.haptic("light");
        }
        return;
      }
      if (s.flag[r][c] || s.open[r][c]) return;
      if (s.first) {
        s.first = false;
        let placed = 0;
        while (placed < 10) {
          const mr = Math.floor(rand(0, SW_R));
          const mc = Math.floor(rand(0, SW_C));
          if (s.mines[mr][mc] || (Math.abs(mr - r) <= 1 && Math.abs(mc - c) <= 1))
            continue;
          s.mines[mr][mc] = true;
          placed += 1;
        }
      }
      if (s.mines[r][c]) {
        for (let rr = 0; rr < SW_R; rr++)
          for (let cc = 0; cc < SW_C; cc++) if (s.mines[rr][cc]) s.open[rr][cc] = true;
        api.end();
        return;
      }
      // flood the empty region
      const around = (rr: number, cc: number) => {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const r2 = rr + dr;
            const c2 = cc + dc;
            if (r2 >= 0 && r2 < SW_R && c2 >= 0 && c2 < SW_C && s.mines[r2][c2]) n++;
          }
        return n;
      };
      const stack = [[r, c]];
      while (stack.length) {
        const [rr, cc] = stack.pop()!;
        if (rr < 0 || rr >= SW_R || cc < 0 || cc >= SW_C) continue;
        if (s.open[rr][cc] || s.mines[rr][cc]) continue;
        s.open[rr][cc] = true;
        s.left -= 1;
        api.add(1);
        if (around(rr, cc) === 0)
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) stack.push([rr + dr, cc + dc]);
      }
      api.haptic("hit");
      if (s.left <= 0) {
        api.add(50);
        api.end();
      }
    },
    update: () => {},
    bot: (s, dt, api) => {
      s.down += dt;
      if (s.down < 0.55) return;
      s.down = 0;
      const closed: [number, number][] = [];
      for (let r = 0; r < SW_R; r++)
        for (let c = 0; c < SW_C; c++) if (!s.open[r][c] && !s.mines[r][c]) closed.push([r, c]);
      if (!closed.length) {
        api.end();
        return;
      }
      const [r, c] = pick(closed);
      if (s.first) {
        s.first = false;
        let placed = 0;
        while (placed < 10) {
          const mr = Math.floor(rand(0, SW_R));
          const mc = Math.floor(rand(0, SW_C));
          if (s.mines[mr][mc] || (Math.abs(mr - r) <= 1 && Math.abs(mc - c) <= 1)) continue;
          s.mines[mr][mc] = true;
          placed += 1;
        }
      }
      s.open[r][c] = true;
      api.add(1);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, -0.12));
      const b = board(W, H, SW_C, SW_R, 0.18);
      const around = (rr: number, cc: number) => {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const r2 = rr + dr;
            const c2 = cc + dc;
            if (r2 >= 0 && r2 < SW_R && c2 >= 0 && c2 < SW_C && s.mines[r2][c2]) n++;
          }
        return n;
      };
      const NUMS = ["", "#1565c0", "#2e7d32", "#c62828", "#4527a0", "#8d6e63", "#00838f", "#37474f", "#000"];
      for (let r = 0; r < SW_R; r++)
        for (let c = 0; c < SW_C; c++) {
          const x = b.ox + c * b.cell;
          const y = b.oy + r * b.cell;
          if (s.open[r][c]) {
            g.fillStyle = s.mines[r][c] ? pal.foe : alpha("#ffffff", 0.65);
            g.fillRect(x + 1, y + 1, b.cell - 2, b.cell - 2);
            if (s.mines[r][c]) {
              g.fillStyle = "#1b1b1b";
              g.beginPath();
              g.arc(x + b.cell / 2, y + b.cell / 2, b.cell * 0.22, 0, Math.PI * 2);
              g.fill();
            } else {
              const n = around(r, c);
              if (n)
                centred(g, `${n}`, x + b.cell / 2, y + b.cell * 0.68, b.cell * 0.5, NUMS[n], t.fontDisplay);
            }
          } else {
            g.fillStyle = pal.glow;
            roundRect(g, x + 1, y + 1, b.cell - 2, b.cell - 2, 3);
            g.fill();
            g.fillStyle = alpha("#ffffff", 0.35);
            g.fillRect(x + 2, y + 2, b.cell - 4, 4);
            if (s.flag[r][c]) {
              g.fillStyle = pal.foe;
              g.beginPath();
              g.moveTo(x + b.cell * 0.32, y + b.cell * 0.25);
              g.lineTo(x + b.cell * 0.72, y + b.cell * 0.42);
              g.lineTo(x + b.cell * 0.32, y + b.cell * 0.55);
              g.closePath();
              g.fill();
            }
          }
        }
      centred(g, `${s.left} to clear`, W / 2, H * 0.12, 20, t.ink, t.fontDisplay);
    },
  }
);

// -------------------------------------------------------------- Pipe Link

const PL = 6;
const PL_COLS = ["#e63946", "#3a86ff", "#ffbe0b", "#2ec4b6", "#c77dff"];

interface PipeState {
  ends: { a: [number, number]; b: [number, number] }[];
  paths: [number, number][][];
  drawing: number | null;
  solved: number;
  round: number;
}

function makePipes(): PipeState {
  // carve non-crossing paths with random walks, then keep only their endpoints
  const used: number[][] = Array.from({ length: PL }, () => Array(PL).fill(-1));
  const ends: { a: [number, number]; b: [number, number] }[] = [];
  for (let k = 0; k < 4; k++) {
    const free: [number, number][] = [];
    for (let r = 0; r < PL; r++)
      for (let c = 0; c < PL; c++) if (used[r][c] < 0) free.push([r, c]);
    if (free.length < 4) break;
    let [r, c] = pick(free);
    const path: [number, number][] = [[r, c]];
    used[r][c] = k;
    const steps = Math.floor(rand(3, 8));
    for (let i = 0; i < steps; i++) {
      const opts: [number, number][] = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ].filter(
        ([r2, c2]) => r2 >= 0 && r2 < PL && c2 >= 0 && c2 < PL && used[r2][c2] < 0
      ) as [number, number][];
      if (!opts.length) break;
      const [nr, nc] = pick(opts);
      used[nr][nc] = k;
      path.push([nr, nc]);
      r = nr;
      c = nc;
    }
    if (path.length < 3) {
      for (const [pr, pc] of path) used[pr][pc] = -1;
      continue;
    }
    ends.push({ a: path[0], b: path[path.length - 1] });
  }
  return { ends, paths: ends.map(() => []), drawing: null, solved: 0, round: 1 };
}

const pipeLink = defineGame<PipeState>(
  {
    slug: "pipe-link",
    title: "Pipe Link",
    rule: "Drag each pair together",
    year: 2012,
    description: "Connect everything. Cross nothing. Simple, and then not.",
    history:
      "Homage to the 2012 connection puzzle whose thousands of levels all came from one rule about lines that must not touch.",
    tags: ["calm", "precision", "drag", "memory"],
    palette: {
      hero: "#8ecae6",
      foe: "#fb8500",
      prize: "#ffb703",
      deep: "#0b1b2b",
      glow: "#126782",
    },
    intensity: 0.2,
    speed: 0.2,
    difficulty: 0.45,
    luck: 0.2,
    nostalgia: 0.6,
    realism: 0.05,
    sessionLength: 0.7,
    scoreUnit: "links",
    maxScorePerSecond: 3,
  },
  {
    hint: "drag from dot to dot",
    overMsg: "BOARD DONE",
    init: () => makePipes(),
    down: (s, x, y, api) => {
      const b = board(api.W, api.H, PL, PL, 0.2);
      const cell = b.hit(x, y);
      if (!cell) return;
      const i = s.ends.findIndex(
        (e) =>
          (e.a[0] === cell.r && e.a[1] === cell.c) ||
          (e.b[0] === cell.r && e.b[1] === cell.c)
      );
      if (i < 0) return;
      s.drawing = i;
      s.paths[i] = [[cell.r, cell.c]];
    },
    move: (s, x, y, api) => {
      if (s.drawing === null) return;
      const b = board(api.W, api.H, PL, PL, 0.2);
      const cell = b.hit(x, y);
      if (!cell) return;
      const path = s.paths[s.drawing];
      const last = path[path.length - 1];
      if (last[0] === cell.r && last[1] === cell.c) return;
      if (Math.abs(last[0] - cell.r) + Math.abs(last[1] - cell.c) !== 1) return;
      // backing up along your own line erases it
      if (path.length > 1) {
        const prev = path[path.length - 2];
        if (prev[0] === cell.r && prev[1] === cell.c) {
          path.pop();
          return;
        }
      }
      const taken = s.paths.some((p, k) =>
        k !== s.drawing ? p.some(([r, c]) => r === cell.r && c === cell.c) : false
      );
      const otherEnd = s.ends.some(
        (e, k) =>
          k !== s.drawing &&
          ((e.a[0] === cell.r && e.a[1] === cell.c) ||
            (e.b[0] === cell.r && e.b[1] === cell.c))
      );
      if (taken || otherEnd) return;
      path.push([cell.r, cell.c]);
    },
    up: (s, _x, _y, api) => {
      if (s.drawing === null) return;
      const i = s.drawing;
      s.drawing = null;
      const path = s.paths[i];
      const e = s.ends[i];
      const last = path[path.length - 1];
      const joined =
        path.length > 1 &&
        ((last[0] === e.b[0] && last[1] === e.b[1]) ||
          (last[0] === e.a[0] && last[1] === e.a[1]));
      if (!joined) {
        s.paths[i] = [];
        api.haptic("fail");
        return;
      }
      api.haptic("hit");
      const done = s.paths.filter((p) => p.length > 1).length;
      api.set(done + (s.round - 1) * s.ends.length);
      if (done === s.ends.length) {
        // fresh board, keep the score
        const next = makePipes();
        s.ends = next.ends;
        s.paths = next.paths;
        s.round += 1;
        api.haptic("hit");
      }
    },
    update: () => {},
    bot: (s, dt, api) => {
      s.solved += dt;
      if (s.solved < 0.8) return;
      s.solved = 0;
      const i = s.paths.findIndex((p) => p.length < 2);
      if (i < 0) {
        const next = makePipes();
        s.ends = next.ends;
        s.paths = next.paths;
        s.round += 1;
        return;
      }
      // draw the L-shaped route between the pair, good enough for a preview
      const { a, b } = s.ends[i];
      const path: [number, number][] = [];
      let [r, c] = a;
      while (c !== b[1]) {
        path.push([r, c]);
        c += Math.sign(b[1] - c);
      }
      while (r !== b[0]) {
        path.push([r, c]);
        r += Math.sign(b[0] - r);
      }
      path.push([b[0], b[1]]);
      s.paths[i] = path;
      api.add(1);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.glow, -0.6));
      const b = board(W, H, PL, PL, 0.2);
      g.fillStyle = alpha("#ffffff", 0.05);
      roundRect(g, b.ox - 6, b.oy - 6, b.cell * PL + 12, b.cell * PL + 12, 12);
      g.fill();
      g.strokeStyle = alpha("#ffffff", 0.1);
      g.lineWidth = 1;
      for (let i = 0; i <= PL; i++) {
        g.beginPath();
        g.moveTo(b.ox, b.oy + i * b.cell);
        g.lineTo(b.ox + PL * b.cell, b.oy + i * b.cell);
        g.stroke();
        g.beginPath();
        g.moveTo(b.ox + i * b.cell, b.oy);
        g.lineTo(b.ox + i * b.cell, b.oy + PL * b.cell);
        g.stroke();
      }
      s.paths.forEach((p, i) => {
        if (p.length < 2) return;
        g.strokeStyle = PL_COLS[i % PL_COLS.length];
        g.lineWidth = b.cell * 0.36;
        g.lineCap = "round";
        g.lineJoin = "round";
        g.beginPath();
        p.forEach(([r, c], k) => {
          const x = b.ox + c * b.cell + b.cell / 2;
          const y = b.oy + r * b.cell + b.cell / 2;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        });
        g.stroke();
      });
      s.ends.forEach((e, i) => {
        for (const [r, c] of [e.a, e.b]) {
          g.fillStyle = PL_COLS[i % PL_COLS.length];
          g.beginPath();
          g.arc(
            b.ox + c * b.cell + b.cell / 2,
            b.oy + r * b.cell + b.cell / 2,
            b.cell * 0.3,
            0,
            Math.PI * 2
          );
          g.fill();
        }
      });
      centred(g, `${api.score} linked`, W / 2, H * 0.14, 22, t.ink, t.fontDisplay);
      centred(g, `board ${s.round}`, W / 2, H * 0.175, 13, t.inkDim, t.fontBody, 700);
    },
  }
);

// --------------------------------------------------------------- Dot Link

const DL = 6;
const DOT_COLS = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#c77dff"];

const dotLink = defineGame<{
  grid: number[][];
  chain: [number, number][];
  drag: boolean;
  left: number;
}>(
  {
    slug: "dot-link",
    title: "Dot Link",
    rule: "Drag through matching dots",
    year: 2013,
    description: "Sixty seconds. Long chains only. Squares are cheating and you should.",
    history:
      "Homage to the 2013 connection game whose entire personality was restraint — five colours, one gesture, one minute.",
    tags: ["calm", "precision", "drag"],
    palette: {
      hero: "#ffffff",
      foe: "#ef476f",
      prize: "#06d6a0",
      deep: "#f8f9fa",
      glow: "#dee2e6",
    },
    intensity: 0.4,
    speed: 0.4,
    difficulty: 0.35,
    luck: 0.3,
    nostalgia: 0.6,
    realism: 0.05,
    sessionLength: 0.4,
    scoreUnit: "dots",
    maxScorePerSecond: 8,
  },
  {
    hint: "drag between same colours",
    overMsg: "TIME UP",
    init: () => ({
      grid: Array.from({ length: DL }, () =>
        Array.from({ length: DL }, () => Math.floor(rand(0, DOT_COLS.length)))
      ),
      chain: [],
      drag: false,
      left: 60,
    }),
    down: (s, x, y, api) => {
      const b = board(api.W, api.H, DL, DL, 0.22);
      const cell = b.hit(x, y);
      if (!cell) return;
      s.chain = [[cell.r, cell.c]];
      s.drag = true;
    },
    move: (s, x, y, api) => {
      if (!s.drag) return;
      const b = board(api.W, api.H, DL, DL, 0.22);
      const cell = b.hit(x, y);
      if (!cell) return;
      const last = s.chain[s.chain.length - 1];
      if (last[0] === cell.r && last[1] === cell.c) return;
      if (Math.abs(last[0] - cell.r) + Math.abs(last[1] - cell.c) !== 1) return;
      if (s.grid[cell.r][cell.c] !== s.grid[last[0]][last[1]]) return;
      if (s.chain.length > 1) {
        const prev = s.chain[s.chain.length - 2];
        if (prev[0] === cell.r && prev[1] === cell.c) {
          s.chain.pop();
          return;
        }
      }
      if (s.chain.some(([r, c]) => r === cell.r && c === cell.c)) return;
      s.chain.push([cell.r, cell.c]);
      api.haptic("light");
    },
    up: (s, _x, _y, api) => {
      s.drag = false;
      if (s.chain.length < 2) {
        s.chain = [];
        return;
      }
      const colour = s.grid[s.chain[0][0]][s.chain[0][1]];
      for (const [r, c] of s.chain) s.grid[r][c] = -1;
      api.add(s.chain.length);
      api.haptic("hit");
      s.chain = [];
      void colour;
      // gravity, then refill from the top
      for (let c = 0; c < DL; c++) {
        const col = [];
        for (let r = DL - 1; r >= 0; r--) if (s.grid[r][c] >= 0) col.push(s.grid[r][c]);
        for (let r = DL - 1; r >= 0; r--)
          s.grid[r][c] =
            col[DL - 1 - r] ?? Math.floor(rand(0, DOT_COLS.length));
      }
    },
    update: (s, dt, api) => {
      s.left -= dt;
      if (s.left <= 0) api.end();
    },
    bot: (s, dt, api) => {
      s.left -= dt * 0.2;
      if (s.chain.length) {
        s.chain = [];
        return;
      }
      // find any adjacent matching pair and take it
      for (let r = 0; r < DL; r++)
        for (let c = 0; c < DL - 1; c++)
          if (s.grid[r][c] === s.grid[r][c + 1]) {
            s.grid[r][c] = Math.floor(rand(0, DOT_COLS.length));
            s.grid[r][c + 1] = Math.floor(rand(0, DOT_COLS.length));
            api.add(2);
            return;
          }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const b = board(W, H, DL, DL, 0.22);
      if (s.chain.length > 1) {
        g.strokeStyle = DOT_COLS[s.grid[s.chain[0][0]][s.chain[0][1]]];
        g.lineWidth = 7;
        g.lineCap = "round";
        g.beginPath();
        s.chain.forEach(([r, c], k) => {
          const x = b.ox + c * b.cell + b.cell / 2;
          const y = b.oy + r * b.cell + b.cell / 2;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        });
        g.stroke();
      }
      for (let r = 0; r < DL; r++)
        for (let c = 0; c < DL; c++) {
          const v = s.grid[r][c];
          if (v < 0) continue;
          const inChain = s.chain.some(([cr, cc]) => cr === r && cc === c);
          const x = b.ox + c * b.cell + b.cell / 2;
          const y = b.oy + r * b.cell + b.cell / 2;
          g.fillStyle = DOT_COLS[v];
          g.beginPath();
          g.arc(x, y, b.cell * (inChain ? 0.3 : 0.24), 0, Math.PI * 2);
          g.fill();
        }
      centred(g, `${api.score}`, W / 2, H * 0.12, 32, t.ink, t.fontDisplay);
      const frac = clamp(s.left / 60, 0, 1);
      g.fillStyle = alpha(t.ink, 0.12);
      roundRect(g, W * 0.2, H * 0.155, W * 0.6, 9, 5);
      g.fill();
      g.fillStyle = frac < 0.25 ? pal.foe : pal.prize;
      roundRect(g, W * 0.2, H * 0.155, W * 0.6 * frac, 9, 5);
      g.fill();
    },
  }
);

// ---------------------------------------------------------------- Cascade

const CC = 7;
const CR = 8;
const CANDY = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93", "#ff8fab"];

const cascade = defineGame<{
  g: number[][];
  sel: { c: number; r: number } | null;
  settle: number;
  moves: number;
}>(
  {
    slug: "cascade",
    title: "Cascade",
    rule: "Swap neighbours, match three",
    year: 2012,
    description: "One more move. That is a lie and you know it.",
    history:
      "Homage to the 2012 match-three that industrialised the genre and made 'lives' a business model.",
    tags: ["calm", "precision", "luck"],
    palette: {
      hero: "#ff8fab",
      foe: "#6a4c93",
      prize: "#ffca3a",
      deep: "#2b124c",
      glow: "#854f6c",
    },
    intensity: 0.35,
    speed: 0.35,
    difficulty: 0.35,
    luck: 0.45,
    nostalgia: 0.6,
    realism: 0.1,
    sessionLength: 0.6,
    scoreUnit: "pts",
    maxScorePerSecond: 60,
  },
  {
    hint: "tap two neighbours",
    overMsg: "OUT OF MOVES",
    init: () => ({
      g: Array.from({ length: CR }, () =>
        Array.from({ length: CC }, () => Math.floor(rand(0, CANDY.length)))
      ),
      sel: null,
      settle: 0,
      moves: 20,
    }),
    down: (s, x, y, api) => {
      if (s.settle > 0) return;
      const b = board(api.W, api.H, CC, CR, 0.2);
      const cell = b.hit(x, y);
      if (!cell) return;
      if (!s.sel) {
        s.sel = cell;
        return;
      }
      const adj =
        Math.abs(s.sel.c - cell.c) + Math.abs(s.sel.r - cell.r) === 1;
      if (!adj) {
        s.sel = cell;
        return;
      }
      const a = s.sel;
      const tmp = s.g[a.r][a.c];
      s.g[a.r][a.c] = s.g[cell.r][cell.c];
      s.g[cell.r][cell.c] = tmp;
      s.sel = null;
      if (findMatches(s.g).length === 0) {
        // illegal swap snaps back
        s.g[cell.r][cell.c] = s.g[a.r][a.c];
        s.g[a.r][a.c] = tmp;
        api.haptic("fail");
        return;
      }
      s.moves -= 1;
      s.settle = 0.12;
      api.haptic("hit");
    },
    update: (s, dt, api) => {
      if (s.settle <= 0) return;
      s.settle -= dt;
      if (s.settle > 0) return;
      const hits = findMatches(s.g);
      if (!hits.length) {
        if (s.moves <= 0) api.end();
        return;
      }
      for (const [r, c] of hits) s.g[r][c] = -1;
      api.add(hits.length * 10);
      for (let c = 0; c < CC; c++) {
        const col: number[] = [];
        for (let r = CR - 1; r >= 0; r--) if (s.g[r][c] >= 0) col.push(s.g[r][c]);
        for (let r = CR - 1; r >= 0; r--)
          s.g[r][c] = col[CR - 1 - r] ?? Math.floor(rand(0, CANDY.length));
      }
      s.settle = 0.12;
    },
    bot: (s, dt, api) => {
      if (s.settle > 0) return;
      s.settle = -1;
      void dt;
      // find any swap that scores and take it
      for (let r = 0; r < CR; r++)
        for (let c = 0; c < CC; c++)
          for (const [dr, dc] of [
            [0, 1],
            [1, 0],
          ]) {
            const r2 = r + dr;
            const c2 = c + dc;
            if (r2 >= CR || c2 >= CC) continue;
            const t0 = s.g[r][c];
            s.g[r][c] = s.g[r2][c2];
            s.g[r2][c2] = t0;
            if (findMatches(s.g).length) {
              s.settle = 0.12;
              s.moves = 20;
              api.add(20);
              return;
            }
            s.g[r2][c2] = s.g[r][c];
            s.g[r][c] = t0;
          }
      s.settle = 0.12;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const b = board(W, H, CC, CR, 0.2);
      for (let r = 0; r < CR; r++)
        for (let c = 0; c < CC; c++) {
          const v = s.g[r][c];
          if (v < 0) continue;
          const x = b.ox + c * b.cell + b.cell / 2;
          const y = b.oy + r * b.cell + b.cell / 2;
          const on = s.sel && s.sel.c === c && s.sel.r === r;
          const rad = b.cell * (on ? 0.42 : 0.36);
          g.fillStyle = alpha("#000000", 0.18);
          g.beginPath();
          g.arc(x, y + 3, rad, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = CANDY[v];
          g.beginPath();
          g.arc(x, y, rad, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = alpha("#ffffff", 0.4);
          g.beginPath();
          g.arc(x - rad * 0.3, y - rad * 0.35, rad * 0.3, 0, Math.PI * 2);
          g.fill();
        }
      centred(g, `${api.score}`, W / 2, H * 0.12, 30, t.ink, t.fontDisplay);
      centred(g, `${s.moves} moves`, W / 2, H * 0.16, 14, t.inkDim, t.fontBody, 700);
    },
  }
);

function findMatches(g: number[][]): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<string>();
  const push = (r: number, c: number) => {
    const k = `${r},${c}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push([r, c]);
    }
  };
  for (let r = 0; r < g.length; r++)
    for (let c = 0; c < g[0].length - 2; c++) {
      const v = g[r][c];
      if (v >= 0 && v === g[r][c + 1] && v === g[r][c + 2]) {
        push(r, c);
        push(r, c + 1);
        push(r, c + 2);
      }
    }
  for (let c = 0; c < g[0].length; c++)
    for (let r = 0; r < g.length - 2; r++) {
      const v = g[r][c];
      if (v >= 0 && v === g[r + 1][c] && v === g[r + 2][c]) {
        push(r, c);
        push(r + 1, c);
        push(r + 2, c);
      }
    }
  return out;
}

// ------------------------------------------------------------ Prism Match

const PM = 6;
const PRISM = ["#f94144", "#f9c74f", "#90be6d", "#43aa8b", "#577590"];

const prismMatch = defineGame<{ g: number[][]; settle: number; left: number }>(
  {
    slug: "prism-match",
    title: "Prism Match",
    rule: "Tap to twist four tiles",
    year: 2008,
    description: "Rotate the corner, not the tile. Your brain will catch up.",
    history:
      "Homage to the 2008 launch-window match puzzle that arrived with the very first app store and asked for a whole new gesture.",
    tags: ["precision", "memory", "calm"],
    palette: {
      hero: "#90be6d",
      foe: "#f94144",
      prize: "#f9c74f",
      deep: "#1d3557",
      glow: "#457b9d",
    },
    intensity: 0.4,
    speed: 0.4,
    difficulty: 0.5,
    luck: 0.3,
    nostalgia: 0.8,
    realism: 0.05,
    sessionLength: 0.5,
    scoreUnit: "pts",
    maxScorePerSecond: 40,
  },
  {
    hint: "tap a corner to rotate",
    overMsg: "TIME UP",
    init: () => ({
      g: Array.from({ length: PM }, () =>
        Array.from({ length: PM }, () => Math.floor(rand(0, PRISM.length)))
      ),
      settle: 0.1,
      left: 45,
    }),
    down: (s, x, y, api) => {
      if (s.settle > 0) return;
      const b = board(api.W, api.H, PM, PM, 0.22);
      const cell = b.hit(x, y);
      if (!cell) return;
      const r = clamp(cell.r, 0, PM - 2);
      const c = clamp(cell.c, 0, PM - 2);
      // rotate the 2x2 block clockwise
      const tl = s.g[r][c];
      s.g[r][c] = s.g[r + 1][c];
      s.g[r + 1][c] = s.g[r + 1][c + 1];
      s.g[r + 1][c + 1] = s.g[r][c + 1];
      s.g[r][c + 1] = tl;
      s.settle = 0.1;
      api.haptic("light");
    },
    update: (s, dt, api) => {
      s.left -= dt;
      if (s.left <= 0) {
        api.end();
        return;
      }
      if (s.settle <= 0) return;
      s.settle -= dt;
      if (s.settle > 0) return;
      const hits = findMatches(s.g);
      if (!hits.length) return;
      for (const [r, c] of hits) s.g[r][c] = -1;
      api.add(hits.length * 8);
      api.haptic("hit");
      for (let c = 0; c < PM; c++) {
        const col: number[] = [];
        for (let r = PM - 1; r >= 0; r--) if (s.g[r][c] >= 0) col.push(s.g[r][c]);
        for (let r = PM - 1; r >= 0; r--)
          s.g[r][c] = col[PM - 1 - r] ?? Math.floor(rand(0, PRISM.length));
      }
      s.settle = 0.1;
    },
    bot: (s, dt, api) => {
      s.left -= dt * 0.3;
      if (s.settle > 0) return;
      for (let r = 0; r < PM - 1; r++)
        for (let c = 0; c < PM - 1; c++) {
          const tl = s.g[r][c];
          s.g[r][c] = s.g[r + 1][c];
          s.g[r + 1][c] = s.g[r + 1][c + 1];
          s.g[r + 1][c + 1] = s.g[r][c + 1];
          s.g[r][c + 1] = tl;
          if (findMatches(s.g).length) {
            s.settle = 0.1;
            api.add(8);
            return;
          }
          // undo (three more turns brings it back around)
          for (let k = 0; k < 3; k++) {
            const t2 = s.g[r][c];
            s.g[r][c] = s.g[r + 1][c];
            s.g[r + 1][c] = s.g[r + 1][c + 1];
            s.g[r + 1][c + 1] = s.g[r][c + 1];
            s.g[r][c + 1] = t2;
          }
        }
      s.settle = 0.1;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const b = board(W, H, PM, PM, 0.22);
      for (let r = 0; r < PM; r++)
        for (let c = 0; c < PM; c++) {
          const v = s.g[r][c];
          if (v < 0) continue;
          const x = b.ox + c * b.cell;
          const y = b.oy + r * b.cell;
          g.fillStyle = PRISM[v];
          g.beginPath();
          if ((r + c) % 2 === 0) {
            g.moveTo(x + 3, y + b.cell - 3);
            g.lineTo(x + b.cell / 2, y + 3);
            g.lineTo(x + b.cell - 3, y + b.cell - 3);
          } else {
            g.moveTo(x + 3, y + 3);
            g.lineTo(x + b.cell - 3, y + 3);
            g.lineTo(x + b.cell / 2, y + b.cell - 3);
          }
          g.closePath();
          g.fill();
          g.fillStyle = alpha("#ffffff", 0.22);
          g.fill();
        }
      centred(g, `${api.score}`, W / 2, H * 0.13, 30, t.ink, t.fontDisplay);
      const frac = clamp(s.left / 45, 0, 1);
      g.fillStyle = alpha(t.ink, 0.12);
      roundRect(g, W * 0.2, H * 0.165, W * 0.6, 9, 5);
      g.fill();
      g.fillStyle = frac < 0.25 ? pal.foe : pal.prize;
      roundRect(g, W * 0.2, H * 0.165, W * 0.6 * frac, 9, 5);
      g.fill();
    },
  }
);

// --------------------------------------------------------------- Patience

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];

interface Card {
  r: number; // 0..12
  s: number; // 0..3
}

const patience = defineGame<{
  cols: Card[][];
  waste: Card;
  stock: Card[];
  cleared: number;
}>(
  {
    slug: "patience",
    title: "Patience",
    rule: "Play one above or below",
    year: 1990,
    description: "The card game that came free with every computer, cut to sixty seconds.",
    history:
      "Homage to the 1990 desktop card game bundled to teach people what a mouse drag was, and quietly played ever since.",
    tags: ["calm", "luck", "retro", "precision"],
    palette: {
      hero: "#ffffff",
      foe: "#c1121f",
      prize: "#ffd166",
      deep: "#0b6e4f",
      glow: "#08553d",
    },
    intensity: 0.25,
    speed: 0.3,
    difficulty: 0.35,
    luck: 0.55,
    nostalgia: 1,
    realism: 0.2,
    sessionLength: 0.5,
    scoreUnit: "cards",
    maxScorePerSecond: 4,
  },
  {
    hint: "tap a card one step away",
    overMsg: "STUCK",
    init: () => {
      const deck: Card[] = [];
      for (let r = 0; r < 13; r++) for (let s2 = 0; s2 < 4; s2++) deck.push({ r, s: s2 });
      deck.sort(() => Math.random() - 0.5);
      const cols: Card[][] = [];
      for (let c = 0; c < 7; c++) cols.push(deck.splice(0, 5));
      return { cols, waste: deck.pop()!, stock: deck, cleared: 0 };
    },
    down: (s, x, y, api) => {
      const { W, H } = api;
      // bottom-right stock: deal a new waste card
      if (y > H * 0.78 && x > W * 0.62) {
        if (!s.stock.length) {
          api.end();
          return;
        }
        s.waste = s.stock.pop()!;
        api.haptic("light");
        return;
      }
      const cw = W / 7;
      const col = clamp(Math.floor(x / cw), 0, 6);
      const stack = s.cols[col];
      if (!stack.length) return;
      const top = stack[stack.length - 1];
      const diff = Math.abs(top.r - s.waste.r);
      if (diff === 1 || diff === 12) {
        stack.pop();
        s.waste = top;
        s.cleared += 1;
        api.add(1);
        api.haptic("hit");
        if (s.cols.every((c) => c.length === 0)) {
          api.add(25);
          api.end();
        }
      } else api.haptic("fail");
    },
    update: (s, _dt, api) => {
      const playable = s.cols.some((c) => {
        if (!c.length) return false;
        const d = Math.abs(c[c.length - 1].r - s.waste.r);
        return d === 1 || d === 12;
      });
      if (!playable && !s.stock.length) api.end();
    },
    bot: (s, dt, api) => {
      s.cleared += dt;
      if (s.cleared % 1 < 0.94) return;
      const i = s.cols.findIndex((c) => {
        if (!c.length) return false;
        const d = Math.abs(c[c.length - 1].r - s.waste.r);
        return d === 1 || d === 12;
      });
      if (i >= 0) {
        s.waste = s.cols[i].pop()!;
        api.add(1);
      } else if (s.stock.length) s.waste = s.stock.pop()!;
      else api.end();
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const cw = W / 7;
      const cardW = cw - 6;
      const cardH = cardW * 1.38;
      const face = (c: Card, x: number, y: number, w: number, h: number) => {
        g.fillStyle = alpha("#000000", 0.22);
        roundRect(g, x + 2, y + 3, w, h, 5);
        g.fill();
        g.fillStyle = "#fdfdfd";
        roundRect(g, x, y, w, h, 5);
        g.fill();
        const red = c.s === 1 || c.s === 2;
        g.fillStyle = red ? pal.foe : "#16161a";
        g.textAlign = "left";
        g.font = `800 ${Math.round(w * 0.4)}px ${t.fontDisplay}`;
        g.fillText(RANKS[c.r], x + 4, y + w * 0.44);
        g.font = `700 ${Math.round(w * 0.42)}px ${t.fontBody}`;
        g.fillText(SUITS[c.s], x + 4, y + h - 6);
      };
      s.cols.forEach((stack, i) => {
        const x = i * cw + 3;
        if (!stack.length) {
          g.strokeStyle = alpha("#ffffff", 0.2);
          g.lineWidth = 2;
          roundRect(g, x, H * 0.24, cardW, cardH, 5);
          g.stroke();
          return;
        }
        stack.forEach((c, k) => {
          const y = H * 0.24 + k * 17;
          if (k === stack.length - 1) face(c, x, y, cardW, cardH);
          else {
            g.fillStyle = k % 2 ? "#2a4d8f" : "#31589f";
            roundRect(g, x, y, cardW, cardH, 5);
            g.fill();
            g.fillStyle = alpha("#ffffff", 0.14);
            roundRect(g, x + 3, y + 3, cardW - 6, 10, 3);
            g.fill();
          }
        });
      });
      face(s.waste, W * 0.12, H * 0.8, cardW * 1.5, cardH * 1.5);
      g.fillStyle = s.stock.length ? "#2a4d8f" : alpha("#ffffff", 0.12);
      roundRect(g, W * 0.66, H * 0.8, cardW * 1.5, cardH * 1.5, 6);
      g.fill();
      g.textAlign = "center";
      centred(g, `${s.stock.length}`, W * 0.66 + cardW * 0.75, H * 0.8 + cardH * 0.9, 20, "#fff", t.fontDisplay);
      centred(g, `${api.score} cleared`, W / 2, H * 0.14, 22, t.ink, t.fontDisplay);
      g.textAlign = "left";
    },
  }
);

// -------------------------------------------------------------- Tile Duel

const LETTER_POOL = "AAAABBCDDEEEEEFGGHHIIIIJKLLMMNNNOOOOPQRRRSSSTTTUUVWXYZ";
const LETTER_SCORE: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1,
  M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8,
  Y: 4, Z: 10,
};
const WORDS = new Set(
  ("the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use dad mom big red hot cat dog run sun top ten win bat bed cup egg fan gas hat ink jam key lip map net oak pen rat sea tap van wax yes zip star game play word tile duel life love time hand head fire wind rain snow gold rock swim jump fast slow calm loud dark near open ring song tree wave zone bank cave dice edge fish gate hill iron jazz kite lake mint node oval palm quiz road sand tide unit vine wolf yarn").split(
    " "
  )
);

const tileDuel = defineGame<{
  rack: string[];
  picked: number[];
  left: number;
  rival: number;
  rivalTick: number;
  msg: string;
  msgT: number;
}>(
  {
    slug: "tile-duel",
    title: "Tile Duel",
    rule: "Build words, beat the rival",
    year: 2009,
    description: "Seven letters, ninety seconds, and someone who is definitely cheating.",
    history:
      "Homage to the 2009 asynchronous word game that turned a board-game night into a thing you did in a queue.",
    tags: ["memory", "calm", "precision"],
    palette: {
      hero: "#f4a261",
      foe: "#e76f51",
      prize: "#2a9d8f",
      deep: "#264653",
      glow: "#e9c46a",
    },
    intensity: 0.35,
    speed: 0.3,
    difficulty: 0.55,
    luck: 0.35,
    nostalgia: 0.8,
    realism: 0.2,
    sessionLength: 0.6,
    scoreUnit: "pts",
    maxScorePerSecond: 12,
  },
  {
    hint: "tap letters to spell",
    overMsg: "TIME UP",
    init: () => ({
      rack: Array.from({ length: 7 }, () => pick(LETTER_POOL.split(""))),
      picked: [],
      left: 90,
      rival: 0,
      rivalTick: 6,
      msg: "",
      msgT: 0,
    }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y > H * 0.72) {
        const i = clamp(Math.floor((x / W) * 7), 0, 6);
        if (s.picked.includes(i)) s.picked = s.picked.filter((k) => k !== i);
        else s.picked.push(i);
        api.haptic("light");
        return;
      }
      // tapping the word area submits it
      const word = s.picked.map((i) => s.rack[i]).join("");
      if (word.length < 3) return;
      if (WORDS.has(word.toLowerCase())) {
        const pts = s.picked.reduce((n, i) => n + (LETTER_SCORE[s.rack[i]] ?? 1), 0) *
          (word.length >= 5 ? 2 : 1);
        api.add(pts);
        s.msg = `${word} +${pts}`;
        s.msgT = 1.4;
        for (const i of s.picked) s.rack[i] = pick(LETTER_POOL.split(""));
        api.haptic("hit");
      } else {
        s.msg = `${word}?`;
        s.msgT = 1;
        api.haptic("fail");
      }
      s.picked = [];
    },
    update: (s, dt, api) => {
      s.left -= dt;
      s.msgT = Math.max(0, s.msgT - dt);
      s.rivalTick -= dt;
      if (s.rivalTick <= 0) {
        s.rival += Math.floor(rand(6, 15));
        s.rivalTick = rand(5, 9);
      }
      if (s.left <= 0) {
        if (api.score > s.rival) api.add(25);
        api.end();
      }
    },
    bot: (s, dt, api) => {
      s.left -= dt * 0.4;
      s.msgT = Math.max(0, s.msgT - dt);
      if (s.picked.length) {
        s.picked = [];
        return;
      }
      // spell a real word from the pool so the preview reads as a word game
      const w = pick([...WORDS].filter((q) => q.length >= 4));
      s.rack = w.toUpperCase().split("").slice(0, 7);
      while (s.rack.length < 7) s.rack.push(pick(LETTER_POOL.split("")));
      s.picked = w.split("").map((_, i) => i);
      s.msg = `${w.toUpperCase()} +${w.length * 3}`;
      s.msgT = 1.2;
      api.add(w.length * 3);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, 0.2));
      centred(g, `${api.score}`, W * 0.28, H * 0.16, 36, pal.prize, t.fontDisplay);
      centred(g, "you", W * 0.28, H * 0.2, 13, t.inkDim, t.fontBody, 700);
      centred(g, `${s.rival}`, W * 0.72, H * 0.16, 36, pal.foe, t.fontDisplay);
      centred(g, "rival", W * 0.72, H * 0.2, 13, t.inkDim, t.fontBody, 700);
      const word = s.picked.map((i) => s.rack[i]).join("");
      g.fillStyle = alpha("#ffffff", 0.08);
      roundRect(g, W * 0.1, H * 0.32, W * 0.8, 76, 14);
      g.fill();
      centred(g, word || "tap letters", W / 2, H * 0.32 + 48, word ? 34 : 17, word ? t.ink : t.inkDim, t.fontDisplay);
      if (s.msgT > 0) {
        g.globalAlpha = clamp(s.msgT, 0, 1);
        centred(g, s.msg, W / 2, H * 0.52, 20, pal.prize, t.fontDisplay);
        g.globalAlpha = 1;
      }
      centred(g, "tap the word box to play it", W / 2, H * 0.61, 13, t.inkDim, t.fontBody, 700);
      const tw = W / 7;
      s.rack.forEach((ch, i) => {
        const on = s.picked.includes(i);
        const x = i * tw + 4;
        const y = H * 0.76 - (on ? 8 : 0);
        g.fillStyle = alpha("#000000", 0.25);
        roundRect(g, x + 2, y + 3, tw - 8, tw - 8, 7);
        g.fill();
        g.fillStyle = on ? pal.prize : pal.glow;
        roundRect(g, x, y, tw - 8, tw - 8, 7);
        g.fill();
        centred(g, ch, x + (tw - 8) / 2, y + (tw - 8) * 0.68, tw * 0.44, "#25201a", t.fontDisplay);
        centred(
          g,
          `${LETTER_SCORE[ch] ?? 1}`,
          x + tw - 15,
          y + tw - 14,
          11,
          alpha("#25201a", 0.7),
          t.fontBody,
          800
        );
      });
      const frac = clamp(s.left / 90, 0, 1);
      g.fillStyle = alpha(t.ink, 0.12);
      roundRect(g, W * 0.15, H * 0.25, W * 0.7, 8, 4);
      g.fill();
      g.fillStyle = frac < 0.2 ? pal.foe : pal.prize;
      roundRect(g, W * 0.15, H * 0.25, W * 0.7 * frac, 8, 4);
      g.fill();
    },
  }
);

export const puzzlePack: GameModule[] = [
  lineFall,
  mergeGrid,
  blockFit,
  sweep,
  pipeLink,
  dotLink,
  cascade,
  prismMatch,
  patience,
  tileDuel,
];
