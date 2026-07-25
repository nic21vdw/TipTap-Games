import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "jewel-swap",
  title: "Jewel Swap",
  rule: "Swap adjacent gems to match 3 or more",
  year: 2001,
  description: "Swap. Cascade. Chase the sparkle streak.",
  history:
    "Homage to the 2001 puzzle era that turned swapping shapes into a genre of its own — the swap-to-match loop that still anchors mobile puzzle charts today.",
  tags: ["precision", "retro", "calm"],
  palette: {
    hero: "#ff5da2",
    foe: "#2b2d42",
    prize: "#ffd23f",
    deep: "#161327",
    glow: "#7fffd4",
  },
  intensity: 0.35,
  luck: 0.15,
  nostalgia: 0.8,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

const COLS = 6;
const ROWS = 7;
const RUN_SECONDS = 60;

interface Cell {
  t: number; // gem type 0..4
  power: boolean;
  dir: "row" | "col";
  vr: number; // visual row (lerps toward r)
  vc: number; // visual col (lerps toward c)
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const gemColors = [pal.hero, pal.foe, pal.prize, pal.glow, shade(pal.hero, 0.4)];

  const boardTop = H * 0.14;
  const boardH = H * 0.78;
  const cell = Math.min(W / COLS, boardH / ROWS);
  const boardW = cell * COLS;
  const bx = (W - boardW) / 2;
  const by = boardTop;

  let grid: (Cell | null)[][] = [];
  let score = 0;
  let over = false;
  let timeLeft = RUN_SECONDS;
  let selected: { r: number; c: number } | null = null;
  let pending: { a: { r: number; c: number }; b: { r: number; c: number }; t: number } | null = null;
  let pulse = 0;

  const randType = () => Math.floor(Math.random() * gemColors.length);

  const makeCell = (r: number, c: number, t: number): Cell => ({
    t,
    power: false,
    dir: "row",
    vr: r,
    vc: c,
  });

  const buildInitial = () => {
    grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row: (Cell | null)[] = [];
      for (let c = 0; c < COLS; c++) {
        let t = randType();
        let guard = 0;
        while (
          guard++ < 30 &&
          ((c >= 2 && row[c - 1]?.t === t && row[c - 2]?.t === t) ||
            (r >= 2 && grid[r - 1][c]?.t === t && grid[r - 2][c]?.t === t))
        ) {
          t = randType();
        }
        row.push(makeCell(r, c, t));
      }
      grid.push(row);
    }
  };

  const reset = () => {
    buildInitial();
    score = 0;
    over = false;
    timeLeft = RUN_SECONDS;
    selected = null;
    pending = null;
    ctx.onScore(0);
  };

  // returns set of "r,c" keys that are part of a run of 3+, plus 4+ groups for power creation
  const collectMatches = () => {
    const matched = new Set<string>();
    const bigGroups: { cells: [number, number][]; dir: "row" | "col" }[] = [];

    for (let r = 0; r < ROWS; r++) {
      let run: [number, number][] = [];
      for (let c = 0; c <= COLS; c++) {
        const cur = c < COLS ? grid[r][c] : null;
        const prevT = run.length ? grid[run[0][0]][run[0][1]]?.t : undefined;
        if (cur && cur.t === prevT) {
          run.push([r, c]);
        } else {
          if (run.length >= 3) {
            run.forEach(([rr, cc]) => matched.add(`${rr},${cc}`));
            if (run.length >= 4) bigGroups.push({ cells: run.slice(), dir: "row" });
          }
          run = cur ? [[r, c]] : [];
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      let run: [number, number][] = [];
      for (let r = 0; r <= ROWS; r++) {
        const cur = r < ROWS ? grid[r][c] : null;
        const prevT = run.length ? grid[run[0][0]][run[0][1]]?.t : undefined;
        if (cur && cur.t === prevT) {
          run.push([r, c]);
        } else {
          if (run.length >= 3) {
            run.forEach(([rr, cc]) => matched.add(`${rr},${cc}`));
            if (run.length >= 4) bigGroups.push({ cells: run.slice(), dir: "col" });
          }
          run = cur ? [[r, c]] : [];
        }
      }
    }
    return { matched, bigGroups };
  };

  const applyGravity = () => {
    for (let c = 0; c < COLS; c++) {
      const existing: Cell[] = [];
      for (let r = 0; r < ROWS; r++) {
        const cell = grid[r][c];
        if (cell) existing.push(cell);
      }
      const emptyCount = ROWS - existing.length;
      for (let i = 0; i < emptyCount; i++) {
        const r = i;
        const nc = makeCell(r, c, randType());
        nc.vr = r - emptyCount + i - 1;
        nc.vc = c;
        grid[r][c] = nc;
      }
      for (let i = 0; i < existing.length; i++) {
        const r = emptyCount + i;
        grid[r][c] = existing[i];
      }
    }
  };

  const resolveMatches = () => {
    let guard = 0;
    while (guard++ < 25) {
      const { matched, bigGroups } = collectMatches();
      if (matched.size === 0) break;

      const powerAt = new Map<string, "row" | "col">();
      for (const grp of bigGroups) {
        const [pr, pc] = grp.cells[Math.floor(grp.cells.length / 2)];
        const key = `${pr},${pc}`;
        if (!powerAt.has(key)) powerAt.set(key, grp.dir);
      }

      const clearSet = new Set(matched);
      for (const key of powerAt.keys()) clearSet.delete(key);

      // cascade power gems that are themselves being cleared
      let changed = true;
      while (changed) {
        changed = false;
        for (const key of Array.from(clearSet)) {
          const [r, c] = key.split(",").map(Number);
          const cell = grid[r][c];
          if (cell?.power) {
            if (cell.dir === "row") {
              for (let cc = 0; cc < COLS; cc++) {
                const k = `${r},${cc}`;
                if (!clearSet.has(k)) {
                  clearSet.add(k);
                  changed = true;
                }
              }
            } else {
              for (let rr = 0; rr < ROWS; rr++) {
                const k = `${rr},${c}`;
                if (!clearSet.has(k)) {
                  clearSet.add(k);
                  changed = true;
                }
              }
            }
          }
        }
      }

      score += clearSet.size * 10 + powerAt.size * 25;
      ctx.onScore(score);
      ctx.haptic(powerAt.size ? "hit" : "light");

      for (const key of clearSet) {
        const [r, c] = key.split(",").map(Number);
        grid[r][c] = null;
      }
      for (const [key, dir] of powerAt) {
        const [r, c] = key.split(",").map(Number);
        const cell = grid[r][c];
        if (cell) {
          cell.power = true;
          cell.dir = dir;
        }
      }
      applyGravity();
    }
  };

  const cellAt = (px: number, py: number) => {
    const c = Math.floor((px - bx) / cell);
    const r = Math.floor((py - by) / cell);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r, c };
  };

  const trySwap = (a: { r: number; c: number }, b: { r: number; c: number }) => {
    const ca = grid[a.r][a.c];
    const cb = grid[b.r][b.c];
    grid[a.r][a.c] = cb;
    grid[b.r][b.c] = ca;
    const { matched } = collectMatches();
    if (matched.size === 0) {
      pending = { a, b, t: 0 };
    } else {
      resolveMatches();
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    if (pending) return;
    const r = ctx.canvas.getBoundingClientRect();
    const p = cellAt(e.clientX - r.left, e.clientY - r.top);
    if (!p) return;
    if (!selected) {
      selected = p;
      return;
    }
    if (selected.r === p.r && selected.c === p.c) {
      selected = null;
      return;
    }
    const adjacent =
      Math.abs(selected.r - p.r) + Math.abs(selected.c - p.c) === 1;
    if (adjacent) {
      trySwap(selected, p);
      selected = null;
    } else {
      selected = p;
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0;

  const findAutoMove = (): [{ r: number; c: number }, { r: number; c: number }] | null => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const neighbors: [number, number][] = [
          [r, c + 1],
          [r + 1, c],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr >= ROWS || nc >= COLS) continue;
          const a = grid[r][c];
          const b = grid[nr][nc];
          grid[r][c] = b;
          grid[nr][nc] = a;
          const { matched } = collectMatches();
          grid[r][c] = a;
          grid[nr][nc] = b;
          if (matched.size > 0) return [{ r, c }, { r: nr, c: nc }];
        }
      }
    }
    return null;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    pulse += dt;

    if (!over) {
      if (pending) {
        pending.t += dt;
        if (pending.t > 0.22) {
          const { a, b } = pending;
          const ca = grid[a.r][a.c];
          const cb = grid[b.r][b.c];
          grid[a.r][a.c] = cb;
          grid[b.r][b.c] = ca;
          pending = null;
        }
      } else if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          const move = findAutoMove();
          if (move) trySwap(move[0], move[1]);
          autoCd = 0.5;
        }
      }

      // ease visual positions toward logical grid slot
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cel = grid[r][c];
          if (!cel) continue;
          cel.vr += (r - cel.vr) * Math.min(1, dt * 10);
          cel.vc += (c - cel.vc) * Math.min(1, dt * 10);
        }
      }

      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);

    // board backing
    g.fillStyle = t.surface;
    roundRect(g, bx - 6, by - 6, boardW + 12, boardH + 12, 16);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.03)";
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if ((r + c) % 2 === 0) g.fillRect(bx + c * cell, by + r * cell, cell, cell);

    // selection highlight
    if (selected) {
      g.strokeStyle = pal.glow;
      g.lineWidth = 3;
      g.strokeRect(
        bx + selected.c * cell + 2,
        by + selected.r * cell + 2,
        cell - 4,
        cell - 4
      );
    }

    // gems
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cel = grid[r][c];
        if (!cel) continue;
        const cx = bx + cel.vc * cell + cell / 2;
        const cy = by + cel.vr * cell + cell / 2;
        const s = cell * 0.36;
        const col = gemColors[cel.t % gemColors.length];

        g.save();
        g.translate(cx, cy);
        g.rotate(Math.PI / 4);
        g.fillStyle = shade(col, -0.15);
        g.fillRect(-s, -s, s * 2, s * 2);
        g.fillStyle = col;
        g.fillRect(-s * 0.72, -s * 0.72, s * 1.44, s * 1.44);
        // facet highlight
        g.fillStyle = "rgba(255,255,255,.55)";
        g.fillRect(-s * 0.55, -s * 0.55, s * 0.55, s * 0.55);
        g.restore();

        if (cel.power) {
          g.strokeStyle = pal.prize;
          g.lineWidth = 2;
          const ringR = s * 1.25 + Math.sin(pulse * 4 + r + c) * 2;
          g.beginPath();
          g.arc(cx, cy, ringR, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }

    // timer bar
    const barW = W * 0.7;
    g.fillStyle = t.surface;
    roundRect(g, W / 2 - barW / 2, H * 0.03, barW, 8, 4);
    g.fill();
    g.fillStyle = timeLeft < 10 ? pal.foe : pal.prize;
    roundRect(g, W / 2 - barW / 2, H * 0.03, barW * (timeLeft / RUN_SECONDS), 8, 4);
    g.fill();

    if (over) endCard(g, t, W, H, "TIME'S UP");
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
