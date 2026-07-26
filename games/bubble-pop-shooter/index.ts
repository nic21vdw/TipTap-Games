import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "bubble-pop-shooter",
  title: "Bubble Pop",
  rule: "Drag to aim, release to fire and match 3",
  year: 1994,
  description: "Pop the ceiling before it pops you.",
  history:
    "Homage to the 1994 arcade cabinet that taught a generation to think in hexagons and colour clusters.",
  tags: ["precision", "reflex", "retro"],
  palette: {
    hero: "#ff477e",
    foe: "#7209b7",
    prize: "#ffd60a",
    deep: "#03071e",
    glow: "#4cc9f0",
  },
  intensity: 0.6,
  luck: 0.15,
  nostalgia: 0.8,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

const COLS = 7;
const N_COLORS = 4;
const BALL_SPEED = 470;
const NEW_ROW_INTERVAL = 7;
const INIT_ROWS = 4;
const MAX_ANGLE = 1.3; // rad from straight up

interface Row {
  cells: (number | null)[];
  offset: boolean; // true = shifted right by half a cell
}

interface Flying {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  t: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const COLORS = [pal.hero, pal.foe, pal.prize, shade(pal.glow, -0.05)];

  const cellSize = W / (COLS + 0.5);
  const rowH = cellSize * 0.86;
  const radius = cellSize * 0.42;
  const topMargin = cellSize * 0.65;
  const launcherY = H - cellSize * 0.95;
  const launcherX = W / 2;

  let rows: Row[] = [];
  let fly: Flying | null = null;
  let loadedColor = 0;
  let angle = 0;
  let dragging = false;
  let score = 0;
  let over = false;
  let rowTimer = 0;

  const randomRowCells = (offset: boolean): (number | null)[] => {
    const len = offset ? COLS - 1 : COLS;
    const arr: (number | null)[] = [];
    for (let i = 0; i < len; i++) arr.push(Math.random() < 0.08 ? null : Math.floor(Math.random() * N_COLORS));
    return arr;
  };

  const cellCenter = (r: number, c: number) => {
    const row = rows[r];
    const offsetX = row.offset ? cellSize / 2 : 0;
    return { x: offsetX + cellSize * 0.5 + c * cellSize, y: topMargin + r * rowH };
  };

  const valid = (r: number, c: number) => r >= 0 && r < rows.length && c >= 0 && c < rows[r].cells.length;

  const neighbors = (r: number, c: number): [number, number][] => {
    const row = rows[r];
    if (!row.offset) {
      return [
        [r, c - 1], [r, c + 1],
        [r - 1, c - 1], [r - 1, c],
        [r + 1, c - 1], [r + 1, c],
      ];
    }
    return [
      [r, c - 1], [r, c + 1],
      [r - 1, c], [r - 1, c + 1],
      [r + 1, c], [r + 1, c + 1],
    ];
  };

  const emptyNear = (r0: number, c0: number): [number, number] | null => {
    const seen = new Set<string>();
    const queue: [number, number][] = [[r0, c0]];
    seen.add(`${r0},${c0}`);
    let guard = 0;
    while (queue.length && guard < 300) {
      guard++;
      const [r, c] = queue.shift() as [number, number];
      if (valid(r, c) && rows[r].cells[c] === null) return [r, c];
      for (const [nr, nc] of neighbors(r, c)) {
        const key = `${nr},${nc}`;
        if (!seen.has(key) && valid(nr, nc)) {
          seen.add(key);
          queue.push([nr, nc]);
        }
      }
    }
    return null;
  };

  const popCheck = (r: number, c: number) => {
    const color = rows[r].cells[c];
    if (color === null || color === undefined) return;
    const visited = new Set<string>();
    const stack: [number, number][] = [[r, c]];
    const group: [number, number][] = [];
    while (stack.length) {
      const [rr, cc] = stack.pop() as [number, number];
      const key = `${rr},${cc}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!valid(rr, cc) || rows[rr].cells[cc] !== color) continue;
      group.push([rr, cc]);
      for (const n of neighbors(rr, cc)) stack.push(n);
    }
    if (group.length >= 3) {
      for (const [gr, gc] of group) rows[gr].cells[gc] = null;
      score += group.length * 10;
      ctx.haptic("hit");

      // orphan drop: anything not connected back to the ceiling row also pops
      const reach = new Set<string>();
      const q: [number, number][] = [];
      for (let cc = 0; cc < rows[0].cells.length; cc++) {
        if (rows[0].cells[cc] !== null) {
          q.push([0, cc]);
          reach.add(`0,${cc}`);
        }
      }
      while (q.length) {
        const [rr, cc] = q.shift() as [number, number];
        for (const [nr, nc] of neighbors(rr, cc)) {
          const key = `${nr},${nc}`;
          if (!reach.has(key) && valid(nr, nc) && rows[nr].cells[nc] !== null) {
            reach.add(key);
            q.push([nr, nc]);
          }
        }
      }
      let orphans = 0;
      for (let rr = 0; rr < rows.length; rr++) {
        for (let cc = 0; cc < rows[rr].cells.length; cc++) {
          if (rows[rr].cells[cc] !== null && !reach.has(`${rr},${cc}`)) {
            rows[rr].cells[cc] = null;
            orphans++;
          }
        }
      }
      if (orphans > 0) {
        score += orphans * 15;
        ctx.haptic("hit");
      }
      ctx.onScore(score);
    }
  };

  const resolveAttach = (fx: number) => {
    if (!fly) return;
    let target: [number, number] | null = null;
    if (fly.y - radius <= topMargin) {
      const offsetX0 = rows[0].offset ? cellSize / 2 : 0;
      let col = Math.round((fx - offsetX0 - cellSize * 0.5) / cellSize);
      col = clamp(col, 0, rows[0].cells.length - 1);
      target = emptyNear(0, col);
      if (!target) target = [0, col];
    } else {
      let bestDist = Infinity;
      let bestCell: [number, number] | null = null;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].cells.length; c++) {
          if (rows[r].cells[c] === null) continue;
          const { x, y } = cellCenter(r, c);
          const d = Math.hypot(x - fly.x, y - fly.y);
          if (d < cellSize * 0.95 && d < bestDist) {
            bestDist = d;
            bestCell = [r, c];
          }
        }
      }
      if (bestCell) {
        target = emptyNear(bestCell[0], bestCell[1]);
      }
    }
    if (target) {
      rows[target[0]].cells[target[1]] = fly.color;
      popCheck(target[0], target[1]);
    }
    fly = null;
    loadedColor = Math.floor(Math.random() * N_COLORS);
  };

  const addRow = () => {
    const newOffset = !rows[0].offset;
    rows.unshift({ cells: randomRowCells(newOffset), offset: newOffset });
  };

  const reset = () => {
    rows = [];
    for (let i = 0; i < INIT_ROWS; i++) {
      const offset = i % 2 === 1;
      rows.push({ cells: randomRowCells(offset), offset });
    }
    fly = null;
    loadedColor = Math.floor(Math.random() * N_COLORS);
    angle = 0;
    dragging = false;
    score = 0;
    over = false;
    rowTimer = 0;
    ctx.onScore(0);
  };

  const fire = () => {
    if (fly || over) return;
    fly = {
      x: launcherX,
      y: launcherY,
      vx: Math.sin(angle) * BALL_SPEED,
      vy: -Math.cos(angle) * BALL_SPEED,
      color: loadedColor,
      t: 0,
    };
    ctx.haptic("light");
  };

  const angleFromPoint = (clientX: number, clientY: number) => {
    const r = ctx.canvas.getBoundingClientRect();
    const dx = clientX - r.left - launcherX;
    const dy = clientY - r.top - launcherY;
    return clamp(Math.atan2(dx, -Math.min(-1, dy)), -MAX_ANGLE, MAX_ANGLE);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    dragging = true;
    angle = angleFromPoint(e.clientX, e.clientY);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    angle = angleFromPoint(e.clientX, e.clientY);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    fire();
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  let auto = false;
  let autoCd = 0.4;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (auto && !fly) {
        autoCd -= dt;
        if (autoCd <= 0) {
          let bestCell: [number, number] | null = null;
          for (let r = 0; r < rows.length && !bestCell; r++) {
            for (let c = 0; c < rows[r].cells.length; c++) {
              if (rows[r].cells[c] === loadedColor) {
                bestCell = [r, c];
                break;
              }
            }
          }
          if (!bestCell) {
            for (let r = 0; r < rows.length && !bestCell; r++) {
              for (let c = 0; c < rows[r].cells.length; c++) {
                if (rows[r].cells[c] !== null) {
                  bestCell = [r, c];
                  break;
                }
              }
            }
          }
          if (bestCell) {
            const { x, y } = cellCenter(bestCell[0], bestCell[1]);
            angle = clamp(Math.atan2(x - launcherX, launcherY - y), -MAX_ANGLE, MAX_ANGLE);
          }
          fire();
          autoCd = rand(0.6, 1.0);
        }
      }

      rowTimer += dt;
      if (rowTimer >= NEW_ROW_INTERVAL) {
        rowTimer = 0;
        addRow();
        if (topMargin + rows.length * rowH >= launcherY - cellSize * 0.3) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
      }

      if (fly && !over) {
        fly.t += dt;
        fly.x += fly.vx * dt;
        fly.y += fly.vy * dt;
        if (fly.x < radius) {
          fly.x = radius;
          fly.vx = -fly.vx;
        } else if (fly.x > W - radius) {
          fly.x = W - radius;
          fly.vx = -fly.vx;
        }
        let hit = fly.y - radius <= topMargin;
        if (!hit) {
          outer: for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < rows[r].cells.length; c++) {
              if (rows[r].cells[c] === null) continue;
              const { x, y } = cellCenter(r, c);
              if (Math.hypot(x - fly.x, y - fly.y) < cellSize * 0.92) {
                hit = true;
                break outer;
              }
            }
          }
        }
        if (hit || fly.t > 2.5) resolveAttach(fly.x);
      }
    }

    // background
    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.deep, -0.6);
    g.fillRect(0, 0, W, topMargin * 0.7);

    // grid bubbles
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].cells.length; c++) {
        const color = rows[r].cells[c];
        if (color === null) continue;
        const { x, y } = cellCenter(r, c);
        if (y > H) continue;
        g.beginPath();
        g.arc(x, y, radius, 0, Math.PI * 2);
        g.fillStyle = COLORS[color];
        g.fill();
        g.beginPath();
        g.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.32, 0, Math.PI * 2);
        g.fillStyle = "rgba(255,255,255,.4)";
        g.fill();
      }
    }

    // flying bubble
    if (fly) {
      g.beginPath();
      g.arc(fly.x, fly.y, radius, 0, Math.PI * 2);
      g.fillStyle = COLORS[fly.color];
      g.fill();
    }

    // launcher + aim line
    if (!over) {
      const aimLen = cellSize * 1.6;
      const ax = launcherX + Math.sin(angle) * aimLen;
      const ay = launcherY - Math.cos(angle) * aimLen;
      g.strokeStyle = shade(pal.glow, 0.1);
      g.globalAlpha = 0.5;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(launcherX, launcherY);
      g.lineTo(ax, ay);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.beginPath();
    g.arc(launcherX, launcherY, radius * 1.15, 0, Math.PI * 2);
    g.fillStyle = t.surface;
    g.fill();
    g.beginPath();
    g.arc(launcherX, launcherY, radius * 0.8, 0, Math.PI * 2);
    g.fillStyle = COLORS[loadedColor];
    g.fill();

    if (over) endCard(g, t, W, H, "CEILING HIT");
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
