import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "pipe-flow",
  title: "Nic's Pipe Flow",
  rule: "Drag matching dots together, fill the grid",
  year: 2012,
  description: "Connect the dots. Don't cross the streams.",
  history:
    "Homage to the 2012 touchscreen puzzle craze that turned dragging coloured lines across a grid into a pocket obsession.",
  tags: ["precision", "calm", "drag"],
  palette: {
    hero: "#2a9d8f",
    foe: "#e76f51",
    prize: "#e9c46a",
    deep: "#264653",
    glow: "#8ecae6",
  },
  intensity: 0.25,
  luck: 0.05,
  nostalgia: 0.6,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

const MAX_MISTAKES = 6;

interface Cell {
  r: number;
  c: number;
}

interface Dot {
  r: number;
  c: number;
  color: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const PALETTE = [
    pal.hero,
    pal.foe,
    pal.prize,
    shade(pal.glow, -0.1),
    shade(pal.hero, 0.35),
    shade(pal.foe, 0.35),
    shade(pal.prize, -0.3),
    shade(pal.glow, 0.3),
  ];

  const fieldSize = Math.min(W, H * 0.92);
  const x0 = (W - fieldSize) / 2;
  const y0 = (H - fieldSize) / 2;

  let size = 5;
  let pairCount = 4;
  let cellPx = fieldSize / size;
  let dots: Dot[] = [];
  let pathCells: Map<string, number> = new Map(); // "r,c" -> color, interior pipe segments
  let connected: Set<number> = new Set();
  let level = 1;
  let score = 0;
  let mistakes = 0;
  let over = false;
  let timeAcc = 0;

  let dragging = false;
  let dragColor = -1;
  let dragPath: Cell[] = [];

  const key = (r: number, c: number) => `${r},${c}`;

  const dotAt = (r: number, c: number) => dots.find((d) => d.r === r && d.c === c) ?? null;

  const occupiedColor = (r: number, c: number): number | null => {
    const d = dotAt(r, c);
    if (d) return d.color;
    const p = pathCells.get(key(r, c));
    return p === undefined ? null : p;
  };

  const clearPathsForColor = (color: number) => {
    for (const [k, v] of pathCells) if (v === color) pathCells.delete(k);
    connected.delete(color);
  };

  const setupLevel = (lv: number) => {
    size = clamp(5 + Math.floor((lv - 1) / 2), 5, 8);
    cellPx = fieldSize / size;
    const maxPairs = Math.floor((size * size) / 5);
    pairCount = clamp(3 + lv, 4, Math.min(8, maxPairs));
    dots = [];
    pathCells = new Map();
    connected = new Set();
    dragging = false;
    dragPath = [];

    const used = new Set<string>();
    for (let color = 0; color < pairCount; color++) {
      const pts: Cell[] = [];
      let guard = 0;
      while (pts.length < 2 && guard < 400) {
        guard++;
        const r = Math.floor(Math.random() * size);
        const c = Math.floor(Math.random() * size);
        const k = key(r, c);
        if (used.has(k)) continue;
        used.add(k);
        pts.push({ r, c });
      }
      if (pts.length === 2) {
        dots.push({ r: pts[0].r, c: pts[0].c, color });
        dots.push({ r: pts[1].r, c: pts[1].c, color });
      }
    }
  };

  const reset = () => {
    level = 1;
    score = 0;
    mistakes = 0;
    over = false;
    timeAcc = 0;
    setupLevel(1);
    ctx.onScore(0);
  };

  const toCell = (clientX: number, clientY: number): Cell | null => {
    const r = ctx.canvas.getBoundingClientRect();
    const x = clientX - r.left - x0;
    const y = clientY - r.top - y0;
    if (x < 0 || y < 0 || x >= fieldSize || y >= fieldSize) return null;
    const c = Math.floor(x / cellPx);
    const rr = Math.floor(y / cellPx);
    if (c < 0 || c >= size || rr < 0 || rr >= size) return null;
    return { r: rr, c };
  };

  const finalizeConnection = (color: number, path: Cell[]) => {
    for (let i = 1; i < path.length - 1; i++) pathCells.set(key(path[i].r, path[i].c), color);
    // endpoints belong to the dots themselves visually, but mark occupied too
    connected.add(color);
    score += 5;
    ctx.onScore(score);
    ctx.haptic("hit");
    if (connected.size >= pairCount) {
      score += level * 50;
      ctx.onScore(score);
      ctx.haptic("hit");
      level += 1;
      setupLevel(level);
    }
  };

  const attemptExtend = (cell: Cell) => {
    if (!dragging) return;
    const last = dragPath[dragPath.length - 1];
    if (last.r === cell.r && last.c === cell.c) return;
    const dr = cell.r - last.r;
    const dc = cell.c - last.c;
    if (Math.abs(dr) + Math.abs(dc) !== 1) return; // must be orthogonally adjacent

    // backtrack
    if (dragPath.length >= 2) {
      const prev = dragPath[dragPath.length - 2];
      if (prev.r === cell.r && prev.c === cell.c) {
        dragPath.pop();
        return;
      }
    }

    const occ = occupiedColor(cell.r, cell.c);
    const targetDot = dotAt(cell.r, cell.c);
    if (targetDot && targetDot.color === dragColor && !(cell.r === dragPath[0].r && cell.c === dragPath[0].c)) {
      dragPath.push(cell);
      finalizeConnection(dragColor, dragPath);
      dragging = false;
      dragPath = [];
      return;
    }
    if (occ !== null) return; // blocked: another pipe or dot
    dragPath.push(cell);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const cell = toCell(e.clientX, e.clientY);
    if (!cell) return;
    const d = dotAt(cell.r, cell.c);
    if (d && !connected.has(d.color)) {
      clearPathsForColor(d.color);
      dragging = true;
      dragColor = d.color;
      dragPath = [cell];
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const cell = toCell(e.clientX, e.clientY);
    if (cell) attemptExtend(cell);
  };
  const onUp = () => {
    if (!dragging) return;
    if (dragPath.length > 1) {
      mistakes += 1;
      ctx.haptic("fail");
      if (mistakes >= MAX_MISTAKES) {
        over = true;
        ctx.onRunEnd(score);
      }
    }
    dragging = false;
    dragPath = [];
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  let auto = false;
  let autoCd = 0.6;

  const bfsPath = (start: Dot, end: Dot): Cell[] | null => {
    const visited = new Set<string>([key(start.r, start.c)]);
    const queue: Cell[][] = [[{ r: start.r, c: start.c }]];
    let guard = 0;
    while (queue.length && guard < 2000) {
      guard++;
      const path = queue.shift() as Cell[];
      const cur = path[path.length - 1];
      if (cur.r === end.r && cur.c === end.c) return path;
      const dirs = [
        { r: cur.r - 1, c: cur.c },
        { r: cur.r + 1, c: cur.c },
        { r: cur.r, c: cur.c - 1 },
        { r: cur.r, c: cur.c + 1 },
      ];
      for (const n of dirs) {
        if (n.r < 0 || n.r >= size || n.c < 0 || n.c >= size) continue;
        const k = key(n.r, n.c);
        if (visited.has(k)) continue;
        const isEnd = n.r === end.r && n.c === end.c;
        if (!isEnd && occupiedColor(n.r, n.c) !== null) continue;
        visited.add(k);
        queue.push([...path, n]);
      }
    }
    return null;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      timeAcc += dt;
      if (timeAcc >= 1) {
        timeAcc -= 1;
        score += 1;
        ctx.onScore(score);
      }

      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          autoCd = 0.8;
          const remaining = [...Array(pairCount).keys()].filter((c) => !connected.has(c));
          for (const color of remaining) {
            const pts = dots.filter((d) => d.color === color);
            if (pts.length !== 2) continue;
            const path = bfsPath(pts[0], pts[1]);
            if (path) {
              finalizeConnection(color, path);
              break;
            }
          }
        }
      }
    }

    // background
    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);

    // grid
    g.strokeStyle = "rgba(255,255,255,.08)";
    g.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
      g.beginPath();
      g.moveTo(x0 + i * cellPx, y0);
      g.lineTo(x0 + i * cellPx, y0 + fieldSize);
      g.stroke();
      g.beginPath();
      g.moveTo(x0, y0 + i * cellPx);
      g.lineTo(x0 + fieldSize, y0 + i * cellPx);
      g.stroke();
    }

    const cellCenter = (r: number, c: number) => ({
      x: x0 + c * cellPx + cellPx / 2,
      y: y0 + r * cellPx + cellPx / 2,
    });

    // committed pipes
    const drawPathSegments = (cells: Cell[], color: string) => {
      g.strokeStyle = color;
      g.lineWidth = cellPx * 0.32;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      for (let i = 0; i < cells.length; i++) {
        const p = cellCenter(cells[i].r, cells[i].c);
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
      g.stroke();
    };

    for (let color = 0; color < pairCount; color++) {
      if (!connected.has(color)) continue;
      const pts = dots.filter((d) => d.color === color);
      if (pts.length !== 2) continue;
      const chain: Cell[] = [pts[0]];
      for (const [k, v] of pathCells) {
        if (v !== color) continue;
        const [r, c] = k.split(",").map(Number);
        chain.push({ r, c });
      }
      chain.push(pts[1]);
      drawPathSegments(chain, PALETTE[color % PALETTE.length]);
    }

    // in-progress drag preview
    if (dragging && dragPath.length > 0) {
      drawPathSegments(dragPath, shade(PALETTE[dragColor % PALETTE.length], 0.15));
    }

    // dots
    for (const d of dots) {
      const p = cellCenter(d.r, d.c);
      g.beginPath();
      g.arc(p.x, p.y, cellPx * 0.3, 0, Math.PI * 2);
      g.fillStyle = PALETTE[d.color % PALETTE.length];
      g.fill();
      if (connected.has(d.color)) {
        g.beginPath();
        g.arc(p.x, p.y, cellPx * 0.14, 0, Math.PI * 2);
        g.fillStyle = "rgba(255,255,255,.55)";
        g.fill();
      }
    }

    // HUD: level + mistakes
    g.fillStyle = t.inkDim;
    g.font = `700 13px ${t.fontBody}`;
    g.textAlign = "left";
    g.fillText(`LV ${level}`, x0, y0 - 10);
    g.textAlign = "right";
    g.fillStyle = mistakes >= MAX_MISTAKES - 1 ? pal.foe : t.inkDim;
    g.fillText(`mistakes ${mistakes}/${MAX_MISTAKES}`, x0 + fieldSize, y0 - 10);
    g.textAlign = "left";

    if (over) endCard(g, t, W, H, "GRID JAMMED");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
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
