import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "territory-claim",
  title: "Nic's Claim",
  rule: "Drag out from your zone, loop back to claim",
  year: 2018,
  description: "Paint the field. Loop home before the rivals catch your line.",
  history:
    "Homage to the 2018 grid-painting arcade wave that turned drawing enclosed loops on a field into a pocket-sized turf war.",
  tags: ["precision", "chaos", "endurance"],
  palette: {
    hero: "#5bc0be",
    foe: "#d64550",
    prize: "#ffd166",
    deep: "#0b3948",
    glow: "#9be564",
  },
  intensity: 0.55,
  luck: 0.1,
  nostalgia: 0.2,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

interface Cell {
  cx: number;
  cy: number;
}
interface Rival {
  x: number;
  y: number;
  vx: number;
  vy: number;
  retargetT: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const cell = Math.max(10, Math.floor(W / 20));
  const cols = Math.ceil(W / cell);
  const rows = Math.ceil(H / cell);

  let claimed: boolean[][] = [];
  let trail: Cell[] = [];
  let px = 0;
  let py = 0;
  let dragging = false;
  let score = 0;
  let over = false;
  let rivals: Rival[] = [];

  const cellAt = (x: number, y: number): Cell => ({
    cx: Math.max(0, Math.min(cols - 1, Math.floor(x / cell))),
    cy: Math.max(0, Math.min(rows - 1, Math.floor(y / cell))),
  });

  const countClaimed = () => {
    let n = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (claimed[y][x]) n++;
    return n;
  };

  const reset = () => {
    claimed = Array.from({ length: rows }, () => Array(cols).fill(false));
    // seed zone: bottom-left 3x3 block
    const sx = 1;
    const sy = rows - 4;
    for (let y = sy; y < sy + 3; y++)
      for (let x = sx; x < sx + 3; x++)
        if (y >= 0 && y < rows && x >= 0 && x < cols) claimed[y][x] = true;
    px = (sx + 1.5) * cell;
    py = (sy + 1.5) * cell;
    trail = [];
    dragging = false;
    score = 0;
    over = false;
    rivals = [
      { x: rand(W * 0.5, W * 0.9), y: rand(H * 0.1, H * 0.5), vx: 0, vy: 0, retargetT: 0 },
      { x: rand(W * 0.2, W * 0.7), y: rand(H * 0.5, H * 0.85), vx: 0, vy: 0, retargetT: 0 },
    ];
    ctx.onScore(0);
  };

  const closeLoop = () => {
    // mark trail cells as boundary, flood fill from border to find "outside" cells
    const outside: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    const boundary: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (const c of trail) boundary[c.cy][c.cx] = true;

    const queue: Cell[] = [];
    const pushIfOpen = (cx: number, cy: number) => {
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return;
      if (outside[cy][cx] || boundary[cy][cx] || claimed[cy][cx]) return;
      outside[cy][cx] = true;
      queue.push({ cx, cy });
    };
    for (let x = 0; x < cols; x++) {
      pushIfOpen(x, 0);
      pushIfOpen(x, rows - 1);
    }
    for (let y = 0; y < rows; y++) {
      pushIfOpen(0, y);
      pushIfOpen(cols - 1, y);
    }
    while (queue.length) {
      const c = queue.pop()!;
      pushIfOpen(c.cx + 1, c.cy);
      pushIfOpen(c.cx - 1, c.cy);
      pushIfOpen(c.cx, c.cy + 1);
      pushIfOpen(c.cx, c.cy - 1);
    }
    // anything not outside, not already claimed -> enclosed, claim it (plus the trail itself)
    for (const c of trail) claimed[c.cy][c.cx] = true;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if (!outside[y][x] && !claimed[y][x]) claimed[y][x] = true;
    trail = [];
    score = countClaimed();
    ctx.onScore(score);
    ctx.haptic("hit");
  };

  const endRun = () => {
    if (over) return;
    over = true;
    trail = [];
    ctx.haptic("fail");
    ctx.onRunEnd(score);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    dragging = true;
    px = e.clientX - r.left;
    py = e.clientY - r.top;
    trail = [];
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const r = ctx.canvas.getBoundingClientRect();
    px = Math.max(0, Math.min(W, e.clientX - r.left));
    py = Math.max(0, Math.min(H, e.clientY - r.top));
  };
  const onUp = () => {
    dragging = false;
    trail = [];
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;
  let autoT = 0;
  let autoPhase: "out" | "back" = "out";
  let autoTarget = { x: px, y: py };

  const stepTrailFromPlayer = () => {
    const c = cellAt(px, py);
    const inZone = claimed[c.cy][c.cx];
    if (inZone) {
      if (trail.length > 0) closeLoop();
      return;
    }
    const last = trail[trail.length - 1];
    if (!last || last.cx !== c.cx || last.cy !== c.cy) {
      if (trail.some((t) => t.cx === c.cx && t.cy === c.cy)) {
        endRun();
        return;
      }
      trail.push(c);
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      if (auto) {
        autoT -= dt;
        if (autoT <= 0) {
          if (autoPhase === "out") {
            autoTarget = { x: px + rand(-cell * 4, cell * 4), y: py + rand(-cell * 4, cell * 4) };
            autoTarget.x = Math.max(cell, Math.min(W - cell, autoTarget.x));
            autoTarget.y = Math.max(cell, Math.min(H - cell, autoTarget.y));
            autoPhase = "back";
            autoT = 0.5;
          } else {
            const sx = 2.5 * cell;
            const sy = (rows - 2.5) * cell;
            autoTarget = { x: sx, y: sy };
            autoPhase = "out";
            autoT = 0.6;
          }
        }
        const dx = autoTarget.x - px;
        const dy = autoTarget.y - py;
        const d = Math.hypot(dx, dy) || 1;
        const step = 130 * dt;
        px += (dx / d) * Math.min(step, d);
        py += (dy / d) * Math.min(step, d);
        dragging = true;
        stepTrailFromPlayer();
      } else if (dragging) {
        stepTrailFromPlayer();
      }

      for (const rv of rivals) {
        rv.retargetT -= dt;
        if (rv.retargetT <= 0) {
          rv.vx = rand(-1, 1);
          rv.vy = rand(-1, 1);
          rv.retargetT = rand(1, 2.2);
        }
        const speed = 46;
        rv.x += rv.vx * speed * dt;
        rv.y += rv.vy * speed * dt;
        if (rv.x < 10 || rv.x > W - 10) rv.vx *= -1;
        if (rv.y < 10 || rv.y > H - 10) rv.vy *= -1;
        rv.x = Math.max(10, Math.min(W - 10, rv.x));
        rv.y = Math.max(10, Math.min(H - 10, rv.y));

        if (trail.length > 0 && !auto) {
          const rc = cellAt(rv.x, rv.y);
          if (trail.some((c) => c.cx === rc.cx && c.cy === rc.cy)) {
            endRun();
          }
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.6);
    g.fillRect(0, 0, W, H);

    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if (claimed[y][x]) {
          g.fillStyle = shade(pal.hero, -0.15);
          g.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        }

    g.fillStyle = pal.glow;
    for (const c of trail) g.fillRect(c.cx * cell + cell * 0.25, c.cy * cell + cell * 0.25, cell * 0.5, cell * 0.5);

    // rivals and the claimant alike — the whole board is him against himself
    for (const rv of rivals) {
      drawNicHead(g, {
        x: rv.x,
        y: rv.y,
        r: 9,
        skin: pal.foe,
        hair: shade(pal.deep, -0.4),
        eye: t.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: t.ink,
        scowl: 1,
      });
    }

    drawNicHead(g, {
      x: px,
      y: py,
      r: 9,
      skin: pal.prize,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      gape: over ? 0.9 : 0,
    });

    if (over) endCard(g, t, W, H, "TERRITORY LOST");
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
