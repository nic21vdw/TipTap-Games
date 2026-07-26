import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "cascade-match",
  title: "Cascade",
  rule: "Swap gems to match 3. Chain the cascades.",
  year: 2012,
  description: "Swap, match, chain reactions — how far can you stretch your moves?",
  history:
    "Homage to the 2012 swap-and-match puzzle wave that turned falling gem grids into a worldwide commute companion.",
  tags: ["calm", "precision", "luck"],
  palette: {
    hero: "#ff6b6b",
    foe: "#4ecdc4",
    prize: "#ffe66d",
    deep: "#1a1a2e",
    glow: "#a685e2",
  },
  intensity: 0.35,
  luck: 0.4,
  nostalgia: 0.6,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

const COLS = 7;
const START_MOVES = 25;
const CLEAR_DUR = 0.18;
const DROP_DUR = 0.22;

type Phase = "idle" | "clearing" | "dropping";

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const COLORS = [pal.hero, pal.foe, pal.prize, pal.glow, shade(pal.hero, -0.35)];

  // Full-width square cells with the row count taken from the phone: a fixed
  // square board left better than a third of a tall screen doing nothing.
  const cell = W / COLS;
  const ROWS = Math.max(COLS, Math.floor(H / cell));
  const offX = 0;
  const offY = (H - cell * ROWS) / 2;

  const idx = (r: number, c: number) => r * COLS + c;

  let grid: number[] = [];
  let dropOffset: number[] = [];
  let clearingSet = new Set<number>();
  let phase: Phase = "idle";
  let phaseT = 0;
  let combo = 1;
  let movesLeft = START_MOVES;
  let score = 0;
  let over = false;
  let dragStart: { x: number; y: number; r: number; c: number } | null = null;

  const randColor = () => Math.floor(Math.random() * COLORS.length);

  const fillGridNoMatches = () => {
    grid = new Array(ROWS * COLS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let cv: number;
        do {
          cv = randColor();
        } while (
          (c >= 2 && grid[idx(r, c - 1)] === cv && grid[idx(r, c - 2)] === cv) ||
          (r >= 2 && grid[idx(r - 1, c)] === cv && grid[idx(r - 2, c)] === cv)
        );
        grid[idx(r, c)] = cv;
      }
    }
    dropOffset = new Array(ROWS * COLS).fill(0);
  };

  const findMatches = (): Set<number> => {
    const matched = new Set<number>();
    for (let r = 0; r < ROWS; r++) {
      let runStart = 0;
      for (let c = 1; c <= COLS; c++) {
        const cur = c < COLS ? grid[idx(r, c)] : -2;
        if (c < COLS && cur !== -1 && cur === grid[idx(r, runStart)]) continue;
        const runLen = c - runStart;
        if (runLen >= 3 && grid[idx(r, runStart)] !== -1) {
          for (let k = runStart; k < c; k++) matched.add(idx(r, k));
        }
        runStart = c;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let runStart = 0;
      for (let r = 1; r <= ROWS; r++) {
        const cur = r < ROWS ? grid[idx(r, c)] : -2;
        if (r < ROWS && cur !== -1 && cur === grid[idx(runStart, c)]) continue;
        const runLen = r - runStart;
        if (runLen >= 3 && grid[idx(runStart, c)] !== -1) {
          for (let k = runStart; k < r; k++) matched.add(idx(k, c));
        }
        runStart = r;
      }
    }
    return matched;
  };

  const beginClear = (matches: Set<number>) => {
    clearingSet = matches;
    phase = "clearing";
    phaseT = 0;
  };

  const reset = () => {
    fillGridNoMatches();
    movesLeft = START_MOVES;
    score = 0;
    combo = 1;
    phase = "idle";
    phaseT = 0;
    clearingSet.clear();
    over = false;
    ctx.onScore(0);
  };

  const cellAt = (px: number, py: number): { r: number; c: number } | null => {
    const c = Math.floor((px - offX) / cell);
    const r = Math.floor((py - offY) / cell);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r, c };
  };

  const attemptSwap = (a: number, b: number) => {
    if (over || phase !== "idle" || movesLeft <= 0) return;
    const tmp = grid[a];
    grid[a] = grid[b];
    grid[b] = tmp;
    const matches = findMatches();
    movesLeft -= 1;
    if (matches.size > 0) {
      combo = 1;
      beginClear(matches);
    } else {
      const tmp2 = grid[a];
      grid[a] = grid[b];
      grid[b] = tmp2;
      ctx.haptic("light");
    }
    if (movesLeft <= 0 && phase === "idle") {
      over = true;
      ctx.haptic("fail");
      ctx.onRunEnd(score);
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const cell2 = cellAt(e.clientX - r.left, e.clientY - r.top);
    if (cell2) dragStart = { x: e.clientX - r.left, y: e.clientY - r.top, r: cell2.r, c: cell2.c };
  };
  const onUp = (e: PointerEvent) => {
    if (!dragStart) return;
    const r = ctx.canvas.getBoundingClientRect();
    const dx = e.clientX - r.left - dragStart.x;
    const dy = e.clientY - r.top - dragStart.y;
    const { r: sr, c: sc } = dragStart;
    dragStart = null;
    if (Math.hypot(dx, dy) < 12) return;
    let tr = sr;
    let tc = sc;
    if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1;
    else tr += dy > 0 ? 1 : -1;
    if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) return;
    attemptSwap(idx(sr, sc), idx(tr, tc));
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  let auto = false;
  let autoCd = 0.5;

  const autoFindMove = (): [number, number] | null => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const neighbors: [number, number][] = [
          [r, c + 1],
          [r + 1, c],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr >= ROWS || nc >= COLS) continue;
          const a = idx(r, c);
          const b = idx(nr, nc);
          const tmp = grid[a];
          grid[a] = grid[b];
          grid[b] = tmp;
          const found = findMatches().size > 0;
          const tmp2 = grid[a];
          grid[a] = grid[b];
          grid[b] = tmp2;
          if (found) return [a, b];
        }
      }
    }
    return null;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0 && phase === "idle" && movesLeft > 0) {
          const mv = autoFindMove();
          if (mv) attemptSwap(mv[0], mv[1]);
          autoCd = 0.5;
        }
      }

      if (phase === "clearing") {
        phaseT += dt;
        if (phaseT >= CLEAR_DUR) {
          const gained = clearingSet.size * 10 * combo;
          score += gained;
          ctx.onScore(score);
          ctx.haptic("hit");
          for (const i of clearingSet) grid[i] = -1;
          clearingSet.clear();
          for (let c = 0; c < COLS; c++) {
            let write = ROWS - 1;
            for (let r = ROWS - 1; r >= 0; r--) {
              if (grid[idx(r, c)] !== -1) {
                if (write !== r) {
                  grid[idx(write, c)] = grid[idx(r, c)];
                  grid[idx(r, c)] = -1;
                  dropOffset[idx(write, c)] = write - r;
                }
                write -= 1;
              }
            }
            for (let r = write; r >= 0; r--) {
              grid[idx(r, c)] = randColor();
              dropOffset[idx(r, c)] = write - r + 1;
            }
          }
          phase = "dropping";
          phaseT = 0;
        }
      } else if (phase === "dropping") {
        phaseT += dt;
        if (phaseT >= DROP_DUR) {
          dropOffset.fill(0);
          const matches2 = findMatches();
          if (matches2.size > 0) {
            combo += 1;
            beginClear(matches2);
          } else {
            phase = "idle";
            if (movesLeft <= 0) {
              over = true;
              ctx.haptic("fail");
              ctx.onRunEnd(score);
            }
          }
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);

    g.fillStyle = shade(pal.deep, -0.15);
    roundRect(g, offX - 8, offY - 8, cell * COLS + 16, cell * ROWS + 16, 14);
    g.fill();

    const dropEase = phase === "dropping" ? 1 - phaseT / DROP_DUR : 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = idx(r, c);
        const color = grid[i];
        if (color === -1 || color === undefined) continue;
        const isClearing = clearingSet.has(i);
        const scale = isClearing ? clamp(1 - phaseT / CLEAR_DUR, 0, 1) : 1;
        const cx = offX + c * cell + cell / 2;
        const cy = offY + r * cell + cell / 2 - dropOffset[i] * cell * dropEase;
        const rad = (cell / 2 - 4) * scale;
        if (rad <= 0) continue;
        g.beginPath();
        g.arc(cx, cy, rad, 0, Math.PI * 2);
        g.fillStyle = COLORS[color];
        g.fill();
        g.beginPath();
        g.arc(cx - rad * 0.3, cy - rad * 0.3, rad * 0.25, 0, Math.PI * 2);
        g.fillStyle = "rgba(255,255,255,.35)";
        g.fill();
      }
    }

    // moves bar
    const fw = W * 0.5;
    g.fillStyle = t.surface;
    g.fillRect(W / 2 - fw / 2, H * 0.06, fw, 10);
    g.fillStyle = movesLeft < 6 ? pal.hero : pal.prize;
    g.fillRect(W / 2 - fw / 2, H * 0.06, fw * clamp(movesLeft / START_MOVES, 0, 1), 10);

    g.fillStyle = t.ink;
    g.font = `700 13px ${t.fontBody}`;
    g.textAlign = "center";
    g.fillText(`${Math.max(0, movesLeft)} moves left`, W / 2, H * 0.06 - 8);
    g.textAlign = "left";

    if (over) endCard(g, t, W, H, "OUT OF MOVES");
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
