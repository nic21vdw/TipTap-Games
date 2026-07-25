import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, pick, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "block-clear",
  title: "Block Clear",
  rule: "Drag blocks onto the grid to clear rows and columns",
  year: 2014,
  description: "Fit the blocks, clear the grid, keep it clean.",
  history:
    "Homage to the 2014 grid-filling puzzle craze that turned polyomino blocks into a slow-burn strategy obsession on every home screen.",
  tags: ["precision", "calm", "drag"],
  palette: {
    hero: "#7b61ff",
    foe: "#ff4d6d",
    prize: "#4ade80",
    deep: "#1b1b2f",
    glow: "#ffb703",
  },
  intensity: 0.3,
  luck: 0.1,
  nostalgia: 0.4,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

const GRID = 10;

type Cell = [number, number];

const SHAPES: Cell[][] = [
  [[0, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 0]],
  [[0, 1], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 0]],
  [[0, 2], [1, 0], [1, 1], [1, 2]],
];

interface TraySlot {
  cells: Cell[];
  color: string;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const boardMargin = 16;
  const boardSize = Math.min(W - boardMargin * 2, H * 0.56);
  const cell = boardSize / GRID;
  const boardX = (W - boardSize) / 2;
  const boardY = H * 0.07;
  const trayY = boardY + boardSize + 26;
  const traySlotW = (W - boardMargin * 2) / 3;
  const traySlotH = Math.min(H - trayY - 14, 96);

  const colors = [pal.hero, pal.foe, pal.prize, pal.glow];

  let grid: (string | null)[][] = [];
  let tray: (TraySlot | null)[] = [null, null, null];
  let score = 0;
  let over = false;

  let dragging: number | null = null;
  let ptrX = 0;
  let ptrY = 0;
  let hoverRow = -1;
  let hoverCol = -1;
  let hoverValid = false;

  const shapeBounds = (cells: Cell[]) => {
    let w = 0;
    let h = 0;
    for (const [r, c] of cells) {
      w = Math.max(w, c + 1);
      h = Math.max(h, r + 1);
    }
    return { w, h };
  };

  const canPlace = (cells: Cell[], row: number, col: number): boolean => {
    for (const [dr, dc] of cells) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false;
      if (grid[r][c] !== null) return false;
    }
    return true;
  };

  const anyFit = (cells: Cell[]): boolean => {
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++) if (canPlace(cells, r, c)) return true;
    return false;
  };

  const checkOver = () => {
    for (const slot of tray) {
      if (slot && anyFit(slot.cells)) return;
    }
    over = true;
    ctx.haptic("fail");
    ctx.onRunEnd(score);
  };

  const refillTray = () => {
    tray = [0, 1, 2].map(() => ({
      cells: pick(SHAPES),
      color: pick(colors),
    }));
    checkOver();
  };

  const reset = () => {
    grid = Array.from({ length: GRID }, () =>
      Array<string | null>(GRID).fill(null)
    );
    dragging = null;
    hoverRow = -1;
    hoverCol = -1;
    score = 0;
    over = false;
    ctx.onScore(0);
    refillTray();
  };

  const clearLines = () => {
    const fullRows: number[] = [];
    const fullCols: number[] = [];
    for (let r = 0; r < GRID; r++)
      if (grid[r].every((v) => v !== null)) fullRows.push(r);
    for (let c = 0; c < GRID; c++)
      if (grid.every((row) => row[c] !== null)) fullCols.push(c);
    if (fullRows.length === 0 && fullCols.length === 0) return;
    for (const r of fullRows) for (let c = 0; c < GRID; c++) grid[r][c] = null;
    for (const c of fullCols) for (let r = 0; r < GRID; r++) grid[r][c] = null;
    const cleared = fullRows.length + fullCols.length;
    score += cleared * 10 * cleared;
    ctx.onScore(score);
    ctx.haptic("hit");
  };

  const placeAt = (idx: number, row: number, col: number): boolean => {
    const slot = tray[idx];
    if (!slot || !canPlace(slot.cells, row, col)) return false;
    for (const [dr, dc] of slot.cells) grid[row + dr][col + dc] = slot.color;
    score += slot.cells.length;
    ctx.onScore(score);
    tray[idx] = null;
    clearLines();
    if (tray.every((s) => s === null)) refillTray();
    else checkOver();
    return true;
  };

  const slotRect = (i: number) => ({
    x: boardMargin + i * traySlotW,
    y: trayY,
    w: traySlotW - 10,
    h: traySlotH,
  });

  const inRect = (
    x: number,
    y: number,
    r: { x: number; y: number; w: number; h: number }
  ) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  const canvasPoint = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const updateHover = () => {
    if (dragging === null) return;
    const slot = tray[dragging];
    if (!slot) return;
    const { w, h } = shapeBounds(slot.cells);
    const anchorX = ptrX;
    const anchorY = ptrY - cell * 2.1;
    let col = Math.round((anchorX - boardX) / cell - w / 2);
    let row = Math.round((anchorY - boardY) / cell - h / 2);
    col = Math.max(0, Math.min(GRID - w, col));
    row = Math.max(0, Math.min(GRID - h, row));
    hoverRow = row;
    hoverCol = col;
    hoverValid = canPlace(slot.cells, row, col);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const p = canvasPoint(e);
    ptrX = p.x;
    ptrY = p.y;
    for (let i = 0; i < tray.length; i++) {
      if (tray[i] && inRect(p.x, p.y, slotRect(i))) {
        dragging = i;
        updateHover();
        break;
      }
    }
  };

  const onMove = (e: PointerEvent) => {
    if (dragging === null) return;
    const p = canvasPoint(e);
    ptrX = p.x;
    ptrY = p.y;
    updateHover();
  };

  const onUp = () => {
    if (dragging === null) return;
    const idx = dragging;
    if (hoverRow >= 0 && hoverCol >= 0) placeAt(idx, hoverRow, hoverCol);
    dragging = null;
    hoverRow = -1;
    hoverCol = -1;
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;
  let autoCd = 0;

  const autoStep = () => {
    for (let i = 0; i < tray.length; i++) {
      const slot = tray[i];
      if (!slot) continue;
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (canPlace(slot.cells, r, c)) {
            placeAt(i, r, c);
            return;
          }
        }
      }
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over && auto) {
      autoCd -= dt;
      if (autoCd <= 0) {
        autoStep();
        autoCd = 0.35;
      }
    }

    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);

    // board
    g.fillStyle = shade(pal.deep, -0.3);
    roundRect(g, boardX - 6, boardY - 6, boardSize + 12, boardSize + 12, 14);
    g.fill();
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const cx = boardX + c * cell;
        const cy = boardY + r * cell;
        const fill = grid[r][c];
        g.fillStyle = fill
          ? shade(fill, -0.05)
          : (r + c) % 2 === 0
            ? "rgba(255,255,255,.04)"
            : "rgba(255,255,255,.02)";
        roundRect(g, cx + 1.5, cy + 1.5, cell - 3, cell - 3, 5);
        g.fill();
      }
    }

    // hover preview
    if (dragging !== null && hoverRow >= 0) {
      const slot = tray[dragging];
      if (slot) {
        g.fillStyle = hoverValid
          ? "rgba(74,222,128,.45)"
          : "rgba(255,77,109,.4)";
        for (const [dr, dc] of slot.cells) {
          const r = hoverRow + dr;
          const c = hoverCol + dc;
          if (r < 0 || r >= GRID || c < 0 || c >= GRID) continue;
          roundRect(
            g,
            boardX + c * cell + 1.5,
            boardY + r * cell + 1.5,
            cell - 3,
            cell - 3,
            5
          );
          g.fill();
        }
      }
    }

    // tray
    for (let i = 0; i < tray.length; i++) {
      const slot = tray[i];
      const rct = slotRect(i);
      g.fillStyle = shade(pal.deep, -0.25);
      roundRect(g, rct.x, rct.y, rct.w, rct.h, 12);
      g.fill();
      if (!slot || i === dragging) continue;
      const { w, h } = shapeBounds(slot.cells);
      const sub = Math.min(rct.w / (w + 1), rct.h / (h + 1));
      const ox = rct.x + (rct.w - w * sub) / 2;
      const oy = rct.y + (rct.h - h * sub) / 2;
      g.fillStyle = slot.color;
      for (const [dr, dc] of slot.cells) {
        roundRect(
          g,
          ox + dc * sub + 1,
          oy + dr * sub + 1,
          sub - 2,
          sub - 2,
          3
        );
        g.fill();
      }
    }

    // dragged shape follows pointer
    if (dragging !== null) {
      const slot = tray[dragging];
      if (slot) {
        const { w, h } = shapeBounds(slot.cells);
        const anchorX = ptrX - (w * cell) / 2;
        const anchorY = ptrY - cell * 2.1 - (h * cell) / 2;
        g.fillStyle = slot.color;
        for (const [dr, dc] of slot.cells) {
          roundRect(
            g,
            anchorX + dc * cell + 2,
            anchorY + dr * cell + 2,
            cell - 4,
            cell - 4,
            5
          );
          g.fill();
        }
      }
    }

    if (over) endCard(g, t, W, H, "GRID FULL");
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
