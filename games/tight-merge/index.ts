import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, pick, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "tight-merge",
  title: "Tight Merge",
  rule: "Swipe to slide. Same tiles merge.",
  year: 2014,
  description:
    "Swipe, slide, merge — but the numbers grow tighter than you'd expect.",
  history:
    "Homage to the 2014 sliding-tile puzzle craze that turned a single swipe gesture into an addictive numbers ladder played by millions on the bus.",
  tags: ["precision", "drag", "calm"],
  palette: {
    hero: "#4cc9f0",
    foe: "#f72585",
    prize: "#ffd166",
    deep: "#22223b",
    glow: "#7209b7",
  },
  intensity: 0.35,
  luck: 0.15,
  nostalgia: 0.4,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

const SEQ = [1, 2, 3, 6, 12, 24, 48, 96, 192, 384, 768, 1536, 3072, 6144, 12288];
const SIZE = 4;

function nextVal(v: number): number {
  const i = SEQ.indexOf(v);
  return i >= 0 && i < SEQ.length - 1 ? SEQ[i + 1] : v * 2;
}

type Dir = "up" | "down" | "left" | "right";

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let grid: number[] = new Array(SIZE * SIZE).fill(0);
  let score = 0;
  let over = false;

  const idx = (r: number, c: number) => r * SIZE + c;

  const emptyCells = () => {
    const cells: number[] = [];
    for (let i = 0; i < grid.length; i++) if (grid[i] === 0) cells.push(i);
    return cells;
  };

  const spawn = () => {
    const cells = emptyCells();
    if (cells.length === 0) return;
    const cell = pick(cells);
    grid[cell] = Math.random() < 0.9 ? 1 : 2;
  };

  const reset = () => {
    grid = new Array(SIZE * SIZE).fill(0);
    score = 0;
    over = false;
    ctx.onScore(0);
    spawn();
    spawn();
  };

  // slide+merge a single line of 4 values, left-to-right semantics
  const slideLine = (line: number[]): { line: number[]; gained: number } => {
    const vals = line.filter((v) => v !== 0);
    const out: number[] = [];
    let gained = 0;
    let i = 0;
    while (i < vals.length) {
      if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
        const nv = nextVal(vals[i]);
        out.push(nv);
        gained += nv;
        i += 2;
      } else {
        out.push(vals[i]);
        i += 1;
      }
    }
    while (out.length < SIZE) out.push(0);
    return { line: out, gained };
  };

  const getLine = (dir: Dir, k: number): number[] => {
    const line: number[] = [];
    for (let j = 0; j < SIZE; j++) {
      if (dir === "left" || dir === "right") line.push(grid[idx(k, j)]);
      else line.push(grid[idx(j, k)]);
    }
    if (dir === "right" || dir === "down") line.reverse();
    return line;
  };

  const setLine = (dir: Dir, k: number, line: number[]) => {
    const out = dir === "right" || dir === "down" ? [...line].reverse() : line;
    for (let j = 0; j < SIZE; j++) {
      if (dir === "left" || dir === "right") grid[idx(k, j)] = out[j];
      else grid[idx(j, k)] = out[j];
    }
  };

  const isGameOver = (): boolean => {
    if (emptyCells().length > 0) return false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[idx(r, c)];
        if (c + 1 < SIZE && grid[idx(r, c + 1)] === v) return false;
        if (r + 1 < SIZE && grid[idx(r + 1, c)] === v) return false;
      }
    }
    return true;
  };

  const move = (dir: Dir): boolean => {
    let changed = false;
    let gained = 0;
    for (let k = 0; k < SIZE; k++) {
      const before = getLine(dir, k);
      const { line: after, gained: g2 } = slideLine(before);
      if (before.some((v, i) => v !== after[i])) changed = true;
      gained += g2;
      setLine(dir, k, after);
    }
    if (changed) {
      score += gained;
      ctx.onScore(score);
      if (gained > 0) ctx.haptic("hit");
      else ctx.haptic("light");
      spawn();
      if (isGameOver()) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }
    return changed;
  };

  let startX = 0;
  let startY = 0;
  let dragging = false;

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
  };

  const onUp = (e: PointerEvent) => {
    if (!dragging || over) return;
    dragging = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const THRESH = 24;
    if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
    else move(dy > 0 ? "down" : "up");
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  let auto = false;
  let autoCd = 0;
  const DIRS: Dir[] = ["left", "right", "up", "down"];

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over && auto) {
      autoCd -= dt;
      if (autoCd <= 0) {
        autoCd = 0.42;
        const order = [...DIRS].sort(() => Math.random() - 0.5);
        for (const d of order) {
          if (move(d)) break;
        }
      }
    } else if (over && auto) {
      autoCd -= dt;
      if (autoCd <= 0) {
        autoCd = 1.0;
        reset();
      }
    }

    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);

    g.textAlign = "left";
    g.fillStyle = t.inkDim;
    g.font = `700 14px ${t.fontBody}`;
    g.fillText(`SCORE ${score}`, 16, 28);

    const boardSize = Math.min(W * 0.86, H * 0.6);
    const cell = boardSize / SIZE;
    const bx = W / 2 - boardSize / 2;
    const by = H * 0.32;

    g.fillStyle = shade(pal.deep, -0.3);
    roundRect(g, bx - 6, by - 6, boardSize + 12, boardSize + 12, 14);
    g.fill();

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[idx(r, c)];
        const x = bx + c * cell;
        const y = by + r * cell;
        g.fillStyle = "rgba(255,255,255,.04)";
        roundRect(g, x + 3, y + 3, cell - 6, cell - 6, 10);
        g.fill();
        if (v === 0) continue;
        const tier = Math.max(0, SEQ.indexOf(v));
        const base = tier >= SEQ.length - 3 ? pal.prize : pal.hero;
        g.fillStyle = shade(base, -0.35 + Math.min(0.55, tier * 0.07));
        roundRect(g, x + 3, y + 3, cell - 6, cell - 6, 10);
        g.fill();
        g.textAlign = "center";
        g.fillStyle = tier >= SEQ.length - 3 ? "#1a1a1a" : "#0d1117";
        const fs = v >= 1000 ? cell * 0.24 : cell * 0.32;
        g.font = `800 ${fs}px ${t.fontDisplay}`;
        g.fillText(String(v), x + cell / 2, y + cell / 2 + fs * 0.32);
      }
    }
    g.textAlign = "left";

    if (over) endCard(g, t, W, H, "BOARD LOCKED");
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
