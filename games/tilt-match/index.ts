import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, pick, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "tilt-match",
  title: "Nic's Tilt Match",
  rule: "Tilt a direction. Gems slide and match.",
  year: 2008,
  description: "No swapping. Just tilt the whole board and watch it settle.",
  history:
    "Homage to the 2008 tilt-aware match games — before touch got clever, phones just leaned into it.",
  tags: ["calm", "precision"],
  palette: {
    hero: "#f4a259",
    foe: "#5b8e7d",
    prize: "#bc4b51",
    deep: "#2e3532",
    glow: "#f9dbbd",
  },
  intensity: 0.3,
  luck: 0.35,
  nostalgia: 0.8,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

const COLS = 6;
type Dir = "L" | "R" | "U" | "D";

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  // Square cells, full width, and as many rows as the phone actually has room
  // for — a fixed row count left a third of a tall screen empty below the board.
  const cell = W / COLS;
  const ROWS = Math.max(7, Math.floor(H / cell));
  const ox = 0;
  const oy = (H - cell * ROWS) / 2;
  const colors = [pal.hero, pal.foe, pal.prize, pal.glow];
  let grid: number[][] = [];
  let score = 0;
  let tilts = 0;
  let over = false;
  let settling = false;

  const newGrid = () =>
    Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => Math.floor(Math.random() * colors.length)));

  const reset = () => {
    grid = newGrid();
    score = 0;
    tilts = 12;
    over = false;
    settling = false;
    ctx.onScore(0);
  };

  const clearMatches = (): boolean => {
    const toClear: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    let any = false;
    for (let r = 0; r < ROWS; r++) {
      let run = 1;
      for (let c = 1; c <= COLS; c++) {
        if (c < COLS && grid[r][c] === grid[r][c - 1]) run++;
        else {
          if (run >= 3) {
            for (let k = 0; k < run; k++) toClear[r][c - 1 - k] = true;
            any = true;
          }
          run = 1;
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      let run = 1;
      for (let r = 1; r <= ROWS; r++) {
        if (r < ROWS && grid[r][c] === grid[r - 1][c]) run++;
        else {
          if (run >= 3) {
            for (let k = 0; k < run; k++) toClear[r - 1 - k][c] = true;
            any = true;
          }
          run = 1;
        }
      }
    }
    if (any) {
      let cleared = 0;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (toClear[r][c]) {
            grid[r][c] = -1;
            cleared++;
          }
      score += cleared * 5;
      ctx.onScore(score);
      ctx.haptic("hit");
    }
    return any;
  };

  const tilt = (dir: Dir) => {
    if (over || settling || tilts <= 0) return;
    tilts -= 1;
    if (dir === "D" || dir === "U") {
      for (let c = 0; c < COLS; c++) {
        const vals: number[] = [];
        for (let r = 0; r < ROWS; r++) if (grid[r][c] >= 0) vals.push(grid[r][c]);
        while (vals.length < ROWS) dir === "D" ? vals.unshift(pick(colors.map((_, i) => i))) : vals.push(pick(colors.map((_, i) => i)));
        for (let r = 0; r < ROWS; r++) grid[r][c] = vals[r];
      }
    } else {
      for (let r = 0; r < ROWS; r++) {
        const vals: number[] = [];
        for (let c = 0; c < COLS; c++) if (grid[r][c] >= 0) vals.push(grid[r][c]);
        while (vals.length < COLS) dir === "R" ? vals.unshift(pick(colors.map((_, i) => i))) : vals.push(pick(colors.map((_, i) => i)));
        for (let c = 0; c < COLS; c++) grid[r][c] = vals[c];
      }
    }
    settling = true;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (y > H * 0.88) {
      tilt(x < W / 3 ? "L" : x > (2 * W) / 3 ? "R" : "D");
    } else {
      tilt(y < H / 2 ? "U" : "D");
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();
  let auto = false;
  let autoCd = 0;
  const dirs: Dir[] = ["L", "R", "U", "D"];

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();
    if (!over) {
      if (settling) {
        if (!clearMatches()) settling = false;
      } else if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          autoCd = 0.5;
          tilt(pick(dirs));
        }
      }
      if (!settling && tilts <= 0) {
        over = true;
        ctx.onRunEnd(score);
      }
    }

    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = grid[r][c];
        const x = ox + c * cell;
        const y = oy + r * cell;
        g.fillStyle = v >= 0 ? colors[v] : "rgba(255,255,255,.05)";
        roundRect(g, x + 3, y + 3, cell - 6, cell - 6, 8);
        g.fill();
        // a filled tile is one of him sliding around the tray
        if (v >= 0)
          drawNicHead(g, {
            x: x + cell / 2,
            y: y + cell / 2,
            r: cell * 0.3,
            skin: colors[v],
            hair: shade(pal.deep, -0.4),
            eye: theme.ink,
            pupil: shade(pal.deep, -0.65),
            dark: shade(pal.deep, -0.65),
            tooth: theme.ink,
          });
      }

    g.fillStyle = theme.ink;
    g.font = "700 14px system-ui";
    g.textAlign = "center";
    g.fillText(`Tilts left: ${tilts}`, W / 2, oy - 14);

    if (over) endCard(g, theme, W, H, "OUT OF TILTS");
    g.textAlign = "left";
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
