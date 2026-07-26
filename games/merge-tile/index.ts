import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, pick, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "merge-tile",
  title: "Nic's Merge Tile",
  rule: "Swipe to slide and merge matching numbers",
  year: 2014,
  description: "Swipe smart. Merge big. Don't fill the board.",
  history:
    "Homage to the 2014 sliding-number puzzle that turned four directions and powers of two into a viral obsession.",
  tags: ["precision", "calm", "chaos"],
  palette: {
    hero: "#4a69bd",
    foe: "#e55039",
    prize: "#f6b93b",
    deep: "#181c25",
    glow: "#60a3bc",
  },
  intensity: 0.3,
  luck: 0.25,
  nostalgia: 0.4,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

const SIZE = 4;
type Dir = "left" | "right" | "up" | "down";

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const boardSize = Math.min(W, H * 0.94);
  const bx = (W - boardSize) / 2;
  const by = (H - boardSize) / 2;
  const pad = boardSize * 0.035;
  const tileSize = (boardSize - pad * (SIZE + 1)) / SIZE;

  let grid: number[][] = [];
  let anim: number[][] = [];
  let score = 0;
  let over = false;
  let start: { x: number; y: number } | null = null;

  const emptyCells = () => {
    const cells: { r: number; c: number }[] = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) if (grid[r][c] === 0) cells.push({ r, c });
    return cells;
  };

  const spawnTile = () => {
    const cells = emptyCells();
    if (cells.length === 0) return;
    const cell = pick(cells);
    grid[cell.r][cell.c] = Math.random() < 0.9 ? 2 : 4;
    anim[cell.r][cell.c] = 0;
  };

  const checkGameOver = () => {
    if (emptyCells().length > 0) return false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        if (c < SIZE - 1 && grid[r][c + 1] === v) return false;
        if (r < SIZE - 1 && grid[r + 1][c] === v) return false;
      }
    }
    return true;
  };

  const reset = () => {
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    anim = Array.from({ length: SIZE }, () => Array(SIZE).fill(1));
    score = 0;
    over = false;
    ctx.onScore(0);
    spawnTile();
    spawnTile();
  };

  const compactLine = (line: number[]) => {
    const orig = line.slice();
    const nums = line.filter((v) => v !== 0);
    const out: number[] = [];
    const merged: boolean[] = [];
    let gained = 0;
    for (let i = 0; i < nums.length; i++) {
      if (i < nums.length - 1 && nums[i] === nums[i + 1]) {
        const v = nums[i] * 2;
        out.push(v);
        merged.push(true);
        gained += v;
        i++;
      } else {
        out.push(nums[i]);
        merged.push(false);
      }
    }
    while (out.length < SIZE) {
      out.push(0);
      merged.push(false);
    }
    const moved = out.some((v, i) => v !== orig[i]);
    return { line: out, merged, gained, moved };
  };

  const applyMove = (dir: Dir): boolean => {
    let moved = false;
    let gained = 0;
    const mergedCells: { r: number; c: number }[] = [];

    if (dir === "left" || dir === "right") {
      for (let r = 0; r < SIZE; r++) {
        const raw = grid[r].slice();
        const line = dir === "right" ? raw.slice().reverse() : raw;
        const res = compactLine(line);
        const finalLine = dir === "right" ? res.line.slice().reverse() : res.line;
        const finalMerged = dir === "right" ? res.merged.slice().reverse() : res.merged;
        if (res.moved) moved = true;
        gained += res.gained;
        grid[r] = finalLine;
        for (let c = 0; c < SIZE; c++) if (finalMerged[c]) mergedCells.push({ r, c });
      }
    } else {
      for (let c = 0; c < SIZE; c++) {
        const raw = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]];
        const line = dir === "down" ? raw.slice().reverse() : raw;
        const res = compactLine(line);
        const finalLine = dir === "down" ? res.line.slice().reverse() : res.line;
        const finalMerged = dir === "down" ? res.merged.slice().reverse() : res.merged;
        if (res.moved) moved = true;
        gained += res.gained;
        for (let r = 0; r < SIZE; r++) {
          grid[r][c] = finalLine[r];
          if (finalMerged[r]) mergedCells.push({ r, c });
        }
      }
    }

    if (moved) {
      for (const m of mergedCells) anim[m.r][m.c] = 0;
      score += gained;
      ctx.onScore(score);
      ctx.haptic(gained > 0 ? "hit" : "light");
      spawnTile();
      if (checkGameOver()) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }
    return moved;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    start = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onUp = (e: PointerEvent) => {
    if (!start || over) return;
    const r = ctx.canvas.getBoundingClientRect();
    const dx = e.clientX - r.left - start.x;
    const dy = e.clientY - r.top - start.y;
    start = null;
    if (Math.hypot(dx, dy) < 22) return;
    const dir: Dir =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    applyMove(dir);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  let auto = false;
  let autoCd = 0;

  const tileColor = (v: number) => {
    const k = Math.log2(v);
    if (k <= 6) return shade(pal.hero, Math.min(0.55, (k - 1) * 0.11));
    return shade(pal.prize, -0.3 + Math.min(0.35, (k - 6) * 0.09));
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) anim[r][c] = Math.min(1, anim[r][c] + dt / 0.14);

    if (!over && auto) {
      autoCd -= dt;
      if (autoCd <= 0) {
        const prefs: Dir[] = pick([
          ["left", "down", "up", "right"],
          ["down", "left", "right", "up"],
          ["right", "down", "left", "up"],
        ] as Dir[][]);
        for (const d of prefs) {
          if (applyMove(d)) break;
        }
        autoCd = 0.38;
      }
    }

    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);

    g.fillStyle = shade(pal.deep, -0.15);
    roundRect(g, bx, by, boardSize, boardSize, 14);
    g.fill();

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const x = bx + pad + c * (tileSize + pad);
        const y = by + pad + r * (tileSize + pad);
        g.fillStyle = "rgba(255,255,255,.05)";
        roundRect(g, x, y, tileSize, tileSize, 8);
        g.fill();

        const v = grid[r][c];
        if (v === 0) continue;
        const k = anim[r][c];
        const scale = 0.65 + 0.35 * k;
        const cx = x + tileSize / 2;
        const cy = y + tileSize / 2;
        const s = tileSize * scale;
        g.fillStyle = tileColor(v);
        roundRect(g, cx - s / 2, cy - s / 2, s, s, 8);
        g.fill();

        g.fillStyle = v <= 4 ? t.ink : "#ffffff";
        g.font = `800 ${Math.floor(tileSize * (v < 100 ? 0.42 : v < 1000 ? 0.34 : 0.27))}px ${t.fontDisplay}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(v), cx, cy + 1);
      }
    }
    g.textAlign = "left";
    g.textBaseline = "alphabetic";

    if (over) endCard(g, t, W, H, "BOARD FULL");
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
      autoCd = 0.3;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
