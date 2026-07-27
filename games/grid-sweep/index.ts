import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, pick, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "grid-sweep",
  title: "Nic's Grid Sweep",
  rule: "Tap to clear, long-press to flag mines",
  year: 1990,
  description:
    "Tap a tile, trust the numbers, flag what you fear. One wrong click ends it.",
  history:
    "Homage to the 1990 desktop deduction game that hid a count of hidden dangers under every tile and dared you to trust the numbers.",
  tags: ["precision", "luck", "memory"],
  palette: {
    hero: "#4dabf7",
    foe: "#fa5252",
    prize: "#ffe066",
    deep: "#12181f",
    glow: "#63e6be",
  },
  intensity: 0.4,
  luck: 0.4,
  nostalgia: 1.0,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

const COLS = 9;
const MINE_RATIO = 0.14;
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

type Cell = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adj: number;
};

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const cell = Math.floor(W / COLS);
  const ROWS = Math.floor((H * 0.92) / cell);
  const gx = Math.floor((W - cell * COLS) / 2);
  const gy = Math.floor((H - cell * ROWS) / 2);
  const TOTAL = COLS * ROWS;
  const MINES = Math.max(6, Math.round(TOTAL * MINE_RATIO));

  let grid: Cell[][] = [];
  let minesPlaced = false;
  let revealedCount = 0;
  let over = false;
  let won = false;
  let score = 0;
  let auto = false;
  let autoCd = 0;

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressCell: { x: number; y: number } | null = null;
  let pressDown: { x: number; y: number } | null = null;
  let longFired = false;

  const inBounds = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

  const neighbors = (x: number, y: number) => {
    const out: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny)) out.push([nx, ny]);
      }
    return out;
  };

  const makeGrid = () => {
    grid = [];
    for (let y = 0; y < ROWS; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < COLS; x++) row.push({ mine: false, revealed: false, flagged: false, adj: 0 });
      grid.push(row);
    }
  };

  const placeMines = (safeX: number, safeY: number) => {
    const safe = new Set<string>([`${safeX},${safeY}`]);
    for (const [nx, ny] of neighbors(safeX, safeY)) safe.add(`${nx},${ny}`);
    let placed = 0;
    while (placed < MINES) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      if (safe.has(`${x},${y}`) || grid[y][x].mine) continue;
      grid[y][x].mine = true;
      placed++;
    }
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x].mine) continue;
        grid[y][x].adj = neighbors(x, y).filter(([nx, ny]) => grid[ny][nx].mine).length;
      }
    minesPlaced = true;
  };

  const reveal = (x: number, y: number) => {
    const c = grid[y][x];
    if (c.revealed || c.flagged) return;
    c.revealed = true;
    revealedCount++;
    if (c.adj === 0 && !c.mine) {
      for (const [nx, ny] of neighbors(x, y)) reveal(nx, ny);
    }
  };

  const setScore = (v: number) => {
    if (v !== score) {
      score = v;
      ctx.onScore(score);
    }
  };

  const reset = () => {
    makeGrid();
    minesPlaced = false;
    revealedCount = 0;
    over = false;
    won = false;
    score = 0;
    ctx.onScore(0);
  };

  const cellAt = (px: number, py: number) => {
    const cx = Math.floor((px - gx) / cell);
    const cy = Math.floor((py - gy) / cell);
    if (!inBounds(cx, cy)) return null;
    return { x: cx, y: cy };
  };

  const handleTap = (cx: number, cy: number) => {
    if (over) {
      reset();
      return;
    }
    const c = grid[cy][cx];
    if (c.flagged || c.revealed) return;
    if (!minesPlaced) placeMines(cx, cy);
    const target = grid[cy][cx];
    if (target.mine) {
      target.revealed = true;
      over = true;
      won = false;
      ctx.haptic("fail");
      ctx.onRunEnd(score);
      return;
    }
    reveal(cx, cy);
    setScore(revealedCount);
    ctx.haptic("light");
    if (revealedCount === TOTAL - MINES) {
      over = true;
      won = true;
      ctx.haptic("hit");
      ctx.onRunEnd(score);
    }
  };

  const toggleFlag = (cx: number, cy: number) => {
    const c = grid[cy][cx];
    if (c.revealed) return;
    c.flagged = !c.flagged;
    ctx.haptic("light");
  };

  const pointerPos = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // Flag mode: press and hold a cell for ~450ms without moving to toggle a
  // flag; a quick tap (release before the timer fires) reveals the cell.
  const onDown = (e: PointerEvent) => {
    const { x, y } = pointerPos(e);
    pressDown = { x, y };
    longFired = false;
    const hit = cellAt(x, y);
    pressCell = hit;
    if (over) {
      reset();
      return;
    }
    if (!hit) return;
    pressTimer = setTimeout(() => {
      if (!pressCell || over) return;
      toggleFlag(pressCell.x, pressCell.y);
      longFired = true;
    }, LONG_PRESS_MS);
  };

  const onMove = (e: PointerEvent) => {
    if (!pressDown || !pressTimer) return;
    const { x, y } = pointerPos(e);
    if (Math.abs(x - pressDown.x) > MOVE_TOLERANCE || Math.abs(y - pressDown.y) > MOVE_TOLERANCE) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  const onUp = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (!longFired && pressCell && !over) handleTap(pressCell.x, pressCell.y);
    pressCell = null;
    pressDown = null;
    longFired = false;
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  const numberColor = (n: number) => {
    if (n === 1) return pal.hero;
    if (n === 2) return pal.glow;
    if (n === 3) return pal.foe;
    return pal.prize;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (auto && !over) {
      autoCd -= dt;
      if (autoCd <= 0) {
        autoCd = 0.22;
        const candidates: { x: number; y: number }[] = [];
        for (let y = 0; y < ROWS; y++)
          for (let x = 0; x < COLS; x++)
            if (!grid[y][x].revealed && !grid[y][x].flagged) candidates.push({ x, y });
        if (candidates.length > 0) {
          const choice = pick(candidates);
          handleTap(choice.x, choice.y);
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = grid[y][x];
        const px = gx + x * cell;
        const py = gy + y * cell;
        if (c.revealed) {
          g.fillStyle = c.mine ? pal.foe : t.surface;
          roundRect(g, px + 1, py + 1, cell - 2, cell - 2, 4);
          g.fill();
          if (!c.mine && c.adj > 0) {
            g.fillStyle = numberColor(c.adj);
            g.font = `800 ${Math.round(cell * 0.5)}px ${t.fontDisplay}`;
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.fillText(String(c.adj), px + cell / 2, py + cell / 2 + 1);
          } else if (c.mine) {
            g.beginPath();
            g.arc(px + cell / 2, py + cell / 2, cell * 0.22, 0, Math.PI * 2);
            g.fillStyle = "#101418";
            g.fill();
          }
        } else {
          g.fillStyle = shade(pal.deep, 0.12 + ((x + y) % 2 === 0 ? 0.02 : 0));
          roundRect(g, px + 1, py + 1, cell - 2, cell - 2, 4);
          g.fill();
          if (over && c.mine && !c.flagged) {
            // the mine you did not want to find is him
            drawNicHead(g, {
              x: px + cell / 2,
              y: py + cell / 2,
              r: cell * 0.26,
              skin: shade(pal.foe, -0.1),
              hair: shade(pal.deep, -0.4),
              eye: t.ink,
              pupil: shade(pal.deep, -0.65),
              dark: shade(pal.deep, -0.65),
              tooth: t.ink,
              gape: 0.8,
              scowl: 1,
            });
          }
          if (c.flagged) {
            g.beginPath();
            g.moveTo(px + cell * 0.35, py + cell * 0.22);
            g.lineTo(px + cell * 0.35, py + cell * 0.78);
            g.lineTo(px + cell * 0.72, py + cell * 0.42);
            g.closePath();
            g.fillStyle = pal.prize;
            g.fill();
          }
        }
      }
    }
    g.textAlign = "left";
    g.textBaseline = "alphabetic";

    if (over) endCard(g, t, W, H, won ? "CLEARED" : "BOOM");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
      if (pressTimer) clearTimeout(pressTimer);
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
