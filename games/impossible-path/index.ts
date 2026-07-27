import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "impossible-path",
  title: "Nic's Impossible Path",
  rule: "Rotate tiles to steer the walker to the goal",
  year: 2014,
  description: "Turn the tiles. Bend the path. Never lose a step.",
  history:
    "Homage to the 2014 wave of Escher-flavoured mobile puzzles where rotating a handful of walkway tiles rerouted a wandering figure toward an impossible-looking goal.",
  tags: ["calm", "memory", "precision"],
  palette: {
    hero: "#6a4c93",
    foe: "#b5838d",
    prize: "#ffca3a",
    deep: "#1d2d44",
    glow: "#8ecae6",
  },
  intensity: 0.15,
  luck: 0.15,
  nostalgia: 0.4,
  sessionLength: 0.65,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

// directions: 0=N 1=E 2=S 3=W
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const opposite = (d: number) => (d + 2) % 4;

interface Tile {
  want: [number, number];
  rot: number;
  isPath: boolean;
}

const SHAPES: [number, number][] = [
  [0, 2], // straight vertical
  [1, 3], // straight horizontal
  [0, 1], // corner N-E
  [1, 2], // corner E-S
  [2, 3], // corner S-W
  [3, 0], // corner W-N
];

const STEP_EVERY = 0.6;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let gridSize = 3;
  let level = 0;
  let score = 0;
  let grid: (Tile | null)[][] = [];
  let startExit = 1;
  let walker = { x: 0, y: 0 };
  let incoming: number | null = null;
  let fromCell = { x: 0, y: 0 };
  let tickTimer = 0;
  let idle = false;
  let idlePulse = 0;
  let auto = false;

  const genPath = (n: number) => {
    const path = [{ x: 0, y: 0 }];
    let x = 0;
    let y = 0;
    while (x < n - 1 || y < n - 1) {
      let dir: 1 | 2;
      if (x >= n - 1) dir = 2;
      else if (y >= n - 1) dir = 1;
      else dir = Math.random() < 0.5 ? 1 : 2;
      if (dir === 1) x++;
      else y++;
      path.push({ x, y });
    }
    return path;
  };

  const dirBetween = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (b.x > a.x) return 1;
    if (b.x < a.x) return 3;
    if (b.y > a.y) return 2;
    return 0;
  };

  const newLayout = () => {
    gridSize = Math.min(6, 3 + Math.floor(level / 2));
    grid = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => null as Tile | null)
    );
    const path = genPath(gridSize);
    for (let i = 0; i < path.length; i++) {
      const c = path[i];
      if (i === 0) {
        startExit = dirBetween(path[0], path[1]);
        continue;
      }
      if (i === path.length - 1) continue; // goal, no tile
      const dirIn = opposite(dirBetween(path[i - 1], c));
      const dirOut = dirBetween(c, path[i + 1]);
      grid[c.y][c.x] = {
        want: [dirIn, dirOut],
        rot: Math.floor(Math.random() * 4),
        isPath: true,
      };
    }
    // decorative filler on remaining cells
    for (let yy = 0; yy < gridSize; yy++) {
      for (let xx = 0; xx < gridSize; xx++) {
        const isStart = xx === 0 && yy === 0;
        const isGoal = xx === gridSize - 1 && yy === gridSize - 1;
        if (isStart || isGoal || grid[yy][xx]) continue;
        grid[yy][xx] = {
          want: SHAPES[Math.floor(Math.random() * SHAPES.length)],
          rot: Math.floor(Math.random() * 4),
          isPath: false,
        };
      }
    }
    walker = { x: 0, y: 0 };
    fromCell = { x: 0, y: 0 };
    incoming = null;
    tickTimer = 0;
    idle = false;
  };

  const reset = () => {
    level = 0;
    score = 0;
    newLayout();
    ctx.onScore(0);
  };
  reset();

  const inBounds = (x: number, y: number) => x >= 0 && x < gridSize && y >= 0 && y < gridSize;
  const openDirs = (tile: Tile) => tile.want.map((d) => (d + tile.rot) % 4);

  const stepWalker = () => {
    const atStart = walker.x === 0 && walker.y === 0 && incoming === null;
    let exitDir: number;
    if (atStart) {
      exitDir = startExit;
    } else {
      const tile = grid[walker.y][walker.x];
      if (!tile) {
        idle = true;
        return;
      }
      const open = openDirs(tile);
      if (incoming === null || !open.includes(incoming)) {
        idle = true;
        return;
      }
      const other = open.find((d) => d !== incoming);
      exitDir = other ?? open[0];
    }
    const nx = walker.x + DX[exitDir];
    const ny = walker.y + DY[exitDir];
    if (!inBounds(nx, ny)) {
      idle = true;
      return;
    }
    idle = false;
    fromCell = { x: walker.x, y: walker.y };
    if (nx === gridSize - 1 && ny === gridSize - 1) {
      score += 1;
      level += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      newLayout();
      return;
    }
    walker = { x: nx, y: ny };
    incoming = opposite(exitDir);
  };

  const board = () => {
    const size = Math.min(W, H * 0.94);
    const cell = size / gridSize;
    const bx = (W - size) / 2;
    const by = (H - size) / 2;
    return { size, cell, bx, by };
  };

  const cellAt = (px: number, py: number) => {
    const { cell, bx, by } = board();
    const cx = Math.floor((px - bx) / cell);
    const cy = Math.floor((py - by) / cell);
    if (!inBounds(cx, cy)) return null;
    return { x: cx, y: cy };
  };

  const onDown = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const c = cellAt(px, py);
    if (!c) return;
    const isStart = c.x === 0 && c.y === 0;
    const isGoal = c.x === gridSize - 1 && c.y === gridSize - 1;
    if (isStart || isGoal) return;
    const tile = grid[c.y][c.x];
    if (!tile) return;
    tile.rot = (tile.rot + 1) % 4;
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    idlePulse += dt;
    tickTimer += dt;
    if (tickTimer >= STEP_EVERY) {
      tickTimer = 0;
      if (auto && idle) {
        const tile = grid[walker.y]?.[walker.x];
        if (tile) tile.rot = (tile.rot + 1) % 4;
      }
      stepWalker();
    }

    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);

    g.fillStyle = t.ink;
    g.font = `700 15px ${t.fontBody}`;
    g.textAlign = "center";
    g.fillText(`layouts: ${score}`, W / 2, H * 0.12);
    g.textAlign = "left";

    const { cell, bx, by } = board();

    for (let yy = 0; yy < gridSize; yy++) {
      for (let xx = 0; xx < gridSize; xx++) {
        const x0 = bx + xx * cell;
        const y0 = by + yy * cell;
        const isStart = xx === 0 && yy === 0;
        const isGoal = xx === gridSize - 1 && yy === gridSize - 1;
        g.fillStyle = "rgba(255,255,255,.03)";
        roundRect(g, x0 + 2, y0 + 2, cell - 4, cell - 4, 8);
        g.fill();

        if (isStart) {
          drawNicHead(g, {
            x: x0 + cell / 2,
            y: y0 + cell / 2,
            r: cell * 0.22,
            skin: pal.hero,
            hair: shade(pal.deep, -0.4),
            eye: t.ink,
            pupil: shade(pal.deep, -0.65),
            dark: shade(pal.deep, -0.65),
            tooth: t.ink,
          });
          continue;
        }
        if (isGoal) {
          g.fillStyle = pal.prize;
          roundRect(g, x0 + cell * 0.32, y0 + cell * 0.32, cell * 0.36, cell * 0.36, 6);
          g.fill();
          continue;
        }
        const tile = grid[yy][xx];
        if (!tile) continue;
        const open = openDirs(tile);
        const cx = x0 + cell / 2;
        const cy = y0 + cell / 2;
        g.strokeStyle = tile.isPath ? pal.glow : shade(pal.glow, -0.35);
        g.lineWidth = Math.max(3, cell * 0.14);
        g.lineCap = "round";
        for (const d of open) {
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + DX[d] * cell * 0.46, cy + DY[d] * cell * 0.46);
          g.stroke();
        }
        g.fillStyle = shade(pal.glow, 0.3);
        g.beginPath();
        g.arc(cx, cy, cell * 0.07, 0, Math.PI * 2);
        g.fill();
      }
    }

    // walker
    const prog = idle ? 0 : Math.min(1, tickTimer / STEP_EVERY);
    const wx = bx + (fromCell.x + (walker.x - fromCell.x) * prog + 0.5) * cell;
    const wy = by + (fromCell.y + (walker.y - fromCell.y) * prog + 0.5) * cell;
    const bob = idle ? Math.sin(idlePulse * 4) * 3 : 0;
    g.fillStyle = idle ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(wx, wy + bob, cell * 0.22, 0, Math.PI * 2);
    g.fill();
    if (idle) {
      g.strokeStyle = pal.foe;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(wx, wy + bob, cell * 0.22 + 4 + Math.sin(idlePulse * 5) * 2, 0, Math.PI * 2);
      g.stroke();
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
