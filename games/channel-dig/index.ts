import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "channel-dig",
  title: "Channel Dig",
  rule: "Dig channels to guide water into the basin",
  year: 2011,
  description: "Dig smart, let gravity do the rest, fill the basin.",
  history:
    "Homage to the 2011 physics-toy wave that turned digging dirt to route trickling water into a pocket-sized engineering puzzle.",
  tags: ["precision", "chaos", "drag"],
  palette: {
    hero: "#2f9bda",
    foe: "#a4533d",
    prize: "#37c9a1",
    deep: "#241b14",
    glow: "#8fd3f4",
  },
  intensity: 0.4,
  luck: 0.15,
  nostalgia: 0.6,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

const COLS = 12;
const ROWS = 16;
const SIM_INTERVAL = 0.055;
const SPOUT_INTERVAL = 0.16;
const SPILL_LIMIT = 14;

interface PathCell {
  r: number;
  c: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const margin = 14;
  const cell = Math.floor(
    Math.min((W - margin * 2) / COLS, (H * 0.82) / ROWS)
  );
  const boardW = cell * COLS;
  const boardH = cell * ROWS;
  const boardX = (W - boardW) / 2;
  const boardY = H * 0.08;

  let dirt: boolean[][] = [];
  let water: boolean[][] = [];
  let spoutCol = Math.floor(COLS / 2);
  let basinCol = Math.floor(COLS / 2);
  let score = 0;
  let spilled = 0;
  let over = false;
  let isDown = false;
  let simTimer = 0;
  let spoutTimer = 0;

  let auto = false;
  let autoPath: PathCell[] = [];
  let autoIdx = 0;
  let autoTimer = 0;

  const buildPath = (): PathCell[] => {
    const path: PathCell[] = [];
    let r = 0;
    let c = spoutCol;
    path.push({ r, c });
    const midRow = ROWS - 2;
    while (r < midRow) {
      r++;
      path.push({ r, c });
    }
    const dir = basinCol > c ? 1 : basinCol < c ? -1 : 0;
    while (c !== basinCol) {
      c += dir;
      path.push({ r, c });
    }
    while (r < ROWS - 1) {
      r++;
      path.push({ r, c });
    }
    return path;
  };

  const newLayout = () => {
    dirt = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(true));
    water = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
    spoutCol = Math.floor(rand(2, COLS - 2));
    basinCol = Math.floor(rand(1, COLS - 1));
    dirt[0][spoutCol] = false;
    dirt[ROWS - 1][basinCol] = false;
    simTimer = 0;
    spoutTimer = 0;
    if (auto) {
      autoPath = buildPath();
      autoIdx = 0;
      autoTimer = 0;
    }
  };

  const reset = () => {
    score = 0;
    spilled = 0;
    over = false;
    ctx.onScore(0);
    newLayout();
  };

  const digAt = (px: number, py: number) => {
    const col = Math.floor((px - boardX) / cell);
    const row = Math.floor((py - boardY) / cell);
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    dirt[row][col] = false;
  };

  const canvasPoint = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    isDown = true;
    const p = canvasPoint(e);
    digAt(p.x, p.y);
  };
  const onMove = (e: PointerEvent) => {
    if (!isDown || over) return;
    const p = canvasPoint(e);
    digAt(p.x, p.y);
  };
  const onUp = () => {
    isDown = false;
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  const simStep = () => {
    for (let r = ROWS - 1; r >= 0; r--) {
      const order = Math.random() < 0.5;
      for (let ci = 0; ci < COLS; ci++) {
        const c = order ? ci : COLS - 1 - ci;
        if (!water[r][c]) continue;
        if (r === ROWS - 1) {
          water[r][c] = false;
          if (c === basinCol) {
            score += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
            spilled = Math.max(0, spilled - 4);
            newLayout();
            return; // grid regenerated, stop this pass
          } else {
            spilled += 1;
            ctx.haptic("light");
            if (spilled >= SPILL_LIMIT) {
              over = true;
              ctx.haptic("fail");
              ctx.onRunEnd(score);
              return;
            }
          }
          continue;
        }
        const below = r + 1;
        if (!dirt[below][c] && !water[below][c]) {
          water[r][c] = false;
          water[below][c] = true;
          continue;
        }
        const dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
        let moved = false;
        for (const d of dirs) {
          const nc = c + d;
          if (nc >= 0 && nc < COLS && !dirt[r][nc] && !water[r][nc]) {
            water[r][c] = false;
            water[r][nc] = true;
            moved = true;
            break;
          }
        }
        void moved;
      }
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (auto) {
        autoTimer += dt;
        if (autoTimer >= 0.05) {
          autoTimer = 0;
          if (autoIdx < autoPath.length) {
            const cell2 = autoPath[autoIdx++];
            dirt[cell2.r][cell2.c] = false;
          }
        }
      }

      spoutTimer += dt;
      if (spoutTimer >= SPOUT_INTERVAL) {
        spoutTimer = 0;
        if (!water[0][spoutCol]) water[0][spoutCol] = true;
      }

      simTimer += dt;
      while (simTimer >= SIM_INTERVAL && !over) {
        simTimer -= SIM_INTERVAL;
        simStep();
      }
    }

    // background
    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    // board frame
    g.fillStyle = shade(pal.deep, -0.25);
    roundRect(g, boardX - 6, boardY - 6, boardW + 12, boardH + 12, 10);
    g.fill();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = boardX + c * cell;
        const cy = boardY + r * cell;
        const isBasin = r === ROWS - 1 && c === basinCol;
        if (dirt[r][c]) {
          g.fillStyle = shade(pal.foe, -0.1 - ((r + c) % 3) * 0.05);
        } else if (isBasin) {
          g.fillStyle = shade(pal.prize, -0.1);
        } else {
          g.fillStyle = "rgba(255,255,255,.04)";
        }
        g.fillRect(cx + 0.5, cy + 0.5, cell - 1, cell - 1);
        if (water[r][c]) {
          g.fillStyle = pal.hero;
          g.beginPath();
          g.arc(cx + cell / 2, cy + cell / 2, cell * 0.38, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // spout marker above the grid
    const spoutX = boardX + spoutCol * cell + cell / 2;
    g.fillStyle = pal.glow;
    g.beginPath();
    g.moveTo(spoutX - 7, boardY - 14);
    g.lineTo(spoutX + 7, boardY - 14);
    g.lineTo(spoutX, boardY - 2);
    g.closePath();
    g.fill();

    // hud: score + spill meter
    g.textAlign = "left";
    g.fillStyle = t.ink;
    g.font = `700 15px ${t.fontDisplay}`;
    g.fillText(`${score}`, margin, boardY - 18);
    const meterW = 70;
    g.fillStyle = "rgba(255,255,255,.12)";
    g.fillRect(W - margin - meterW, boardY - 22, meterW, 8);
    g.fillStyle = spilled > SPILL_LIMIT * 0.6 ? pal.foe : pal.glow;
    g.fillRect(
      W - margin - meterW,
      boardY - 22,
      meterW * Math.min(1, spilled / SPILL_LIMIT),
      8
    );

    if (over) endCard(g, t, W, H, "FLOODED OUT");
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
