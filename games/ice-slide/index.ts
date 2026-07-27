import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "ice-slide",
  title: "Nic's Ice Slide",
  rule: "Swipe. The puck slides until it hits something.",
  year: 2002,
  description: "Frictionless. Every swipe is a commitment.",
  history:
    "Homage to the early-2000s feature-phone ice puzzles — physics simple enough to run on nothing.",
  tags: ["precision", "calm"],
  palette: {
    hero: "#48cae4",
    foe: "#03045e",
    prize: "#ffea00",
    deep: "#023e8a",
    glow: "#ade8f4",
  },
  intensity: 0.25,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

const COLS = 7;
const ROWS = 9;

interface Cell {
  wall: boolean;
  hole: boolean;
  goal: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const cell = Math.min(W / COLS, H / ROWS);
  const ox = (W - cell * COLS) / 2;
  const oy = (H - cell * ROWS) / 2;
  let grid: Cell[][] = [];
  let px = 0;
  let py = 0;
  let sliding = false;
  let dir = { x: 0, y: 0 };
  let swipes = 0;
  let score = 0;
  let over = false;
  let downPt = { x: 0, y: 0 };
  let level = 1;

  const buildLevel = () => {
    grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ wall: false, hole: false, goal: false })));
    for (let i = 0; i < ROWS + COLS; i++) {
      const r = Math.floor(rand(0, ROWS));
      const c = Math.floor(rand(0, COLS));
      if ((r === 0 && c === 0) || Math.random() < 0.5) grid[r][c].wall = true;
    }
    for (let i = 0; i < Math.min(6, level + 2); i++) {
      const r = Math.floor(rand(1, ROWS - 1));
      const c = Math.floor(rand(1, COLS - 1));
      grid[r][c] = { wall: false, hole: true, goal: false };
    }
    const gr = Math.floor(rand(0, ROWS));
    const gc = Math.floor(rand(0, COLS));
    grid[gr][gc] = { wall: false, hole: false, goal: true };
    px = 0;
    py = 0;
    grid[0][0] = { wall: false, hole: false, goal: false };
  };

  const reset = () => {
    score = 0;
    swipes = 0;
    level = 1;
    over = false;
    buildLevel();
    ctx.onScore(0);
  };

  const inBounds = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

  const slide = (dx: number, dy: number) => {
    if (sliding || over) return;
    dir = { x: dx, y: dy };
    sliding = true;
    swipes += 1;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    downPt = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onUp = (e: PointerEvent) => {
    if (over) return;
    const r = ctx.canvas.getBoundingClientRect();
    const dx = e.clientX - r.left - downPt.x;
    const dy = e.clientY - r.top - downPt.y;
    if (Math.hypot(dx, dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) slide(dx > 0 ? 1 : -1, 0);
    else slide(0, dy > 0 ? 1 : -1);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();
  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();
    if (!over) {
      if (sliding) {
        const nr = py + dir.y;
        const nc = px + dir.x;
        if (!inBounds(nr, nc) || grid[nr][nc].wall) {
          sliding = false;
        } else if (grid[nr][nc].hole) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
          sliding = false;
        } else {
          py = nr;
          px = nc;
          if (grid[py][px].goal) {
            score += 20;
            level += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
            buildLevel();
          }
          sliding = false;
        }
      } else if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          autoCd = 0.5;
          const options = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
          ];
          slide(options[Math.floor(Math.random() * options.length)].x, options[Math.floor(Math.random() * options.length)].y);
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.3);
    g.fillRect(0, 0, W, H);

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const cl = grid[r][c];
        const x = ox + c * cell;
        const y = oy + r * cell;
        g.fillStyle = cl.hole ? shade(pal.foe, -0.3) : "rgba(255,255,255,.06)";
        roundRect(g, x + 2, y + 2, cell - 4, cell - 4, 6);
        g.fill();
        if (cl.wall) {
          g.fillStyle = pal.foe;
          roundRect(g, x + 4, y + 4, cell - 8, cell - 8, 4);
          g.fill();
        }
        if (cl.goal) {
          g.fillStyle = pal.prize;
          g.beginPath();
          g.arc(x + cell / 2, y + cell / 2, cell * 0.28, 0, Math.PI * 2);
          g.fill();
        }
      }

    drawNicHead(g, {
      x: ox + px * cell + cell / 2,
      y: oy + py * cell + cell / 2,
      r: cell * 0.32,
      skin: pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: theme.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: theme.ink,
      gape: over ? 0.9 : 0,
      scowl: over ? 1 : 0,
    });

    if (over) endCard(g, theme, W, H, "INTO THE ICE");
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
