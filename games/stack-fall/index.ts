import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "stack-fall",
  title: "Fall Stacker",
  rule: "Shift, rotate, and drop pieces to clear rows",
  year: 1984,
  description: "Stack the shapes. Clear the lines. Don't top out.",
  history:
    "Homage to the 1984 falling-block puzzle that turned seven simple shapes into the most ported game of all time.",
  tags: ["retro", "precision", "endurance"],
  palette: {
    hero: "#4ecdc4",
    foe: "#ff5768",
    prize: "#ffd166",
    deep: "#1a1a2e",
    glow: "#a29bfe",
  },
  intensity: 0.55,
  luck: 0.15,
  nostalgia: 1.0,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

interface Cell {
  x: number;
  y: number;
}

interface PieceDef {
  cells: Cell[];
  box: number;
  color: string;
}

const COLS = 8;
const ROWS = 14;

function rotateCells(cells: Cell[], box: number): Cell[] {
  return cells.map((c) => ({ x: box - 1 - c.y, y: c.x }));
}

function cellsAtRotation(def: PieceDef, r: number): Cell[] {
  let c = def.cells;
  const n = ((r % 4) + 4) % 4;
  for (let i = 0; i < n; i++) c = rotateCells(c, def.box);
  return c;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const defs: PieceDef[] = [
    { cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }], box: 4, color: pal.hero }, // I
    { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], box: 2, color: pal.prize }, // O
    { cells: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], box: 3, color: pal.glow }, // T
    { cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], box: 3, color: shade(pal.hero, 0.3) }, // S
    { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }], box: 3, color: pal.foe }, // Z
    { cells: [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], box: 3, color: shade(pal.prize, -0.25) }, // L
    { cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }], box: 3, color: shade(pal.glow, -0.3) }, // J
  ];

  const cell = Math.min((W - 16) / COLS, (H * 0.92) / ROWS);
  const ox = (W - cell * COLS) / 2;
  const oy = (H - cell * ROWS) / 2;

  let grid: (string | null)[][] = [];
  let piece!: { def: PieceDef; rot: number; cells: Cell[]; gx: number; gy: number };
  let botTarget: { rot: number; gx: number } | null = null;
  let score = 0;
  let over = false;
  let softDrop = false;
  let fallT = 0;
  let fallInterval = 0.8;
  let linesCleared = 0;
  let clearing: number[] = [];
  let clearTimer = 0;
  let flashPulse = 0;

  const collides = (cells: Cell[], gx: number, gy: number) => {
    for (const c of cells) {
      const ax = gx + c.x;
      const ay = gy + c.y;
      if (ax < 0 || ax >= COLS || ay >= ROWS) return true;
      if (ay >= 0 && grid[ay][ax]) return true;
    }
    return false;
  };

  const spawn = () => {
    const def = defs[Math.floor(Math.random() * defs.length)];
    const cells = def.cells;
    const gx = Math.floor((COLS - def.box) / 2);
    const gy = -1;
    piece = { def, rot: 0, cells, gx, gy };
    botTarget = null;
    if (collides(cells, gx, gy)) {
      over = true;
      ctx.haptic("fail");
      ctx.onRunEnd(score);
    }
  };

  const reset = () => {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    score = 0;
    over = false;
    softDrop = false;
    fallT = 0;
    fallInterval = 0.8;
    linesCleared = 0;
    clearing = [];
    clearTimer = 0;
    ctx.onScore(0);
    spawn();
  };

  const lockPiece = () => {
    for (const c of piece.cells) {
      const ax = piece.gx + c.x;
      const ay = piece.gy + c.y;
      if (ay >= 0 && ay < ROWS && ax >= 0 && ax < COLS) grid[ay][ax] = piece.def.color;
    }
    const full: number[] = [];
    for (let r = 0; r < ROWS; r++) if (grid[r].every((v) => v)) full.push(r);
    if (full.length > 0) {
      clearing = full;
      clearTimer = 0.22;
      const pts = [0, 100, 300, 500, 800][full.length] ?? 800;
      score += pts;
      linesCleared += full.length;
      ctx.onScore(score);
      ctx.haptic("hit");
      fallInterval = Math.max(0.16, 0.8 - linesCleared * 0.025);
    } else {
      ctx.haptic("light");
      spawn();
    }
  };

  const tryMove = (dx: number) => {
    if (over || clearing.length > 0) return;
    if (!collides(piece.cells, piece.gx + dx, piece.gy)) piece.gx += dx;
  };

  const tryRotate = () => {
    if (over || clearing.length > 0) return;
    const rotated = rotateCells(piece.cells, piece.def.box);
    const nextRot = (piece.rot + 1) % 4;
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(rotated, piece.gx + kick, piece.gy)) {
        piece.cells = rotated;
        piece.rot = nextRot;
        piece.gx += kick;
        return;
      }
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < W / 3) {
      tryMove(-1);
      ctx.haptic("light");
    } else if (x > (W * 2) / 3) {
      tryMove(1);
      ctx.haptic("light");
    } else if (y < H / 2) {
      tryRotate();
      ctx.haptic("light");
    } else {
      softDrop = true;
    }
  };
  const onUp = () => {
    softDrop = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  let auto = false;

  const planBot = () => {
    let best: { rot: number; gx: number; score: number } | null = null;
    for (let rot = 0; rot < 4; rot++) {
      const cells = cellsAtRotation(piece.def, rot);
      const minX = Math.min(...cells.map((c) => c.x));
      const maxX = Math.max(...cells.map((c) => c.x));
      for (let gx = -minX; gx <= COLS - 1 - maxX; gx++) {
        let gy = -1;
        while (!collides(cells, gx, gy + 1)) gy++;
        // simulate placement to score holes + aggregate height
        const tmp = grid.map((row) => row.slice());
        for (const c of cells) {
          const ax = gx + c.x;
          const ay = gy + c.y;
          if (ay >= 0 && ay < ROWS && ax >= 0 && ax < COLS) tmp[ay][ax] = "x";
        }
        let holes = 0;
        let heightSum = 0;
        for (let col = 0; col < COLS; col++) {
          let seenFilled = false;
          for (let row = 0; row < ROWS; row++) {
            if (tmp[row][col]) {
              if (!seenFilled) {
                heightSum += ROWS - row;
                seenFilled = true;
              }
            } else if (seenFilled) {
              holes++;
            }
          }
        }
        const s = holes * 25 + heightSum;
        if (!best || s < best.score) best = { rot, gx, score: s };
      }
    }
    botTarget = best ? { rot: best.rot, gx: best.gx } : null;
  };

  reset();

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    flashPulse += dt;

    if (!over) {
      if (clearing.length > 0) {
        clearTimer -= dt;
        if (clearTimer <= 0) {
          const remove = new Set(clearing);
          const kept = grid.filter((_, r) => !remove.has(r));
          const blank = Array.from({ length: clearing.length }, () => Array(COLS).fill(null));
          grid = [...blank, ...kept] as (string | null)[][];
          clearing = [];
          spawn();
        }
      } else {
        if (auto) {
          if (!botTarget) planBot();
          if (botTarget) {
            if (piece.rot !== botTarget.rot) {
              tryRotate();
            } else if (piece.gx !== botTarget.gx) {
              tryMove(piece.gx < botTarget.gx ? 1 : -1);
            } else {
              softDrop = true;
            }
          }
        }
        fallT += dt;
        const interval = softDrop ? fallInterval / 9 : fallInterval;
        if (fallT >= interval) {
          fallT = 0;
          if (!collides(piece.cells, piece.gx, piece.gy + 1)) {
            piece.gy += 1;
          } else {
            lockPiece();
          }
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    // tap-zone guides
    g.strokeStyle = "rgba(255,255,255,.05)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(W / 3, 0);
    g.lineTo(W / 3, H);
    g.moveTo((W * 2) / 3, 0);
    g.lineTo((W * 2) / 3, H);
    g.stroke();

    // well background
    g.fillStyle = "rgba(255,255,255,.03)";
    g.fillRect(ox, oy, cell * COLS, cell * ROWS);

    // locked cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = grid[r][c];
        if (!v) continue;
        const flashing = clearing.includes(r);
        g.fillStyle = flashing && Math.floor(flashPulse * 16) % 2 === 0 ? "#ffffff" : v;
        roundRect(g, ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2, cell * 0.18);
        g.fill();
      }
    }

    // falling piece
    if (!over && clearing.length === 0) {
      for (const c of piece.cells) {
        const ay = piece.gy + c.y;
        if (ay < 0) continue;
        const ax = piece.gx + c.x;
        g.fillStyle = piece.def.color;
        roundRect(g, ox + ax * cell + 1, oy + ay * cell + 1, cell - 2, cell - 2, cell * 0.18);
        g.fill();
      }
    }

    if (over) endCard(g, t, W, H, "TOPPED OUT");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      botTarget = null;
      if (!on) {
        softDrop = false;
        reset();
      }
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
