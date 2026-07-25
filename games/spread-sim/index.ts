import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "spread-sim",
  title: "Color Spread",
  rule: "Tap regions to spread. Boost before the cure wins.",
  year: 2012,
  description: "Claim the grid before the cure claims you back.",
  history:
    "Homage to the 2012 territory-infection toys that turned a plain grid of tiles into a slow-burn tug of war between growth and the cure chasing it.",
  tags: ["precision", "calm", "endurance"],
  palette: {
    hero: "#39c8a0",
    foe: "#ff5d5d",
    prize: "#f9c74f",
    deep: "#1c2a3a",
    glow: "#7fe0c9",
  },
  intensity: 0.35,
  luck: 0.15,
  nostalgia: 0.6,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

const COLS = 8;
const ROWS = 6;
const CURE_RATIO = 0.12;
const BOOST_COST = 30;
const BOOST_DURATION = 5;
const MUTATION_RATE = 4; // per second
const MUTATION_MAX = 100;

interface Cell {
  claimed: boolean;
  isCure: boolean;
  jx: number;
  jy: number;
  jw: number;
  jh: number;
  spreadT: number;
  spreadEvery: number;
  cureT: number;
  cureEvery: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const gx = W * 0.04;
  const gy = H * 0.14;
  const gw = W * 0.92;
  const gh = H * 0.78;
  const cellW = gw / COLS;
  const cellH = gh / ROWS;

  let cells: Cell[] = [];
  let mutation = 0;
  let boostT = 0;
  let started = false;
  let peak = 0;
  let over = false;
  let winMsg = "";

  const idx = (c: number, r: number) => r * COLS + c;
  const claimableTotal = () => cells.filter((c) => !c.isCure).length;

  const neighbors = (i: number): number[] => {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    const out: number[] = [];
    if (c > 0) out.push(idx(c - 1, r));
    if (c < COLS - 1) out.push(idx(c + 1, r));
    if (r > 0) out.push(idx(c, r - 1));
    if (r < ROWS - 1) out.push(idx(c, r + 1));
    return out;
  };

  const coverage = () => {
    const total = claimableTotal();
    if (total === 0) return 0;
    const claimed = cells.filter((c) => c.claimed).length;
    return (claimed / total) * 100;
  };

  const reset = () => {
    cells = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      cells.push({
        claimed: false,
        isCure: false,
        jx: (Math.random() - 0.5) * cellW * 0.14,
        jy: (Math.random() - 0.5) * cellH * 0.14,
        jw: (Math.random() - 0.5) * cellW * 0.1,
        jh: (Math.random() - 0.5) * cellH * 0.1,
        spreadT: Math.random() * 0.4,
        spreadEvery: 1.4 + Math.random() * 0.6,
        cureT: Math.random() * 0.4,
        cureEvery: 2.2 + Math.random() * 0.8,
      });
    }
    const cureCount = Math.round(COLS * ROWS * CURE_RATIO);
    let placed = 0;
    while (placed < cureCount) {
      const i = Math.floor(Math.random() * cells.length);
      if (!cells[i].isCure) {
        cells[i].isCure = true;
        placed++;
      }
    }
    mutation = 0;
    boostT = 0;
    started = false;
    peak = 0;
    over = false;
    winMsg = "";
    ctx.onScore(0);
  };

  const claimAt = (i: number) => {
    const cell = cells[i];
    if (cell.isCure || cell.claimed || over) return;
    cell.claimed = true;
    cell.spreadT = 0;
    started = true;
    ctx.haptic("light");
    const cov = coverage();
    if (cov > peak) peak = cov;
    ctx.onScore(Math.round(cov));
  };

  const boostAt = (i: number) => {
    const cell = cells[i];
    if (!cell.claimed || over) return;
    if (mutation >= BOOST_COST) {
      mutation -= BOOST_COST;
      boostT = BOOST_DURATION;
      ctx.haptic("hit");
    }
  };

  const cellAtPoint = (x: number, y: number): number => {
    const c = Math.floor((x - gx) / cellW);
    const r = Math.floor((y - gy) / cellH);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return idx(c, r);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const i = cellAtPoint(x, y);
    if (i < 0) return;
    const cell = cells[i];
    if (cell.claimed) boostAt(i);
    else claimAt(i);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0;

  const endRun = (win: boolean) => {
    over = true;
    winMsg = win ? "FULL SPREAD" : "CURED OUT";
    const finalScore = win ? 100 : Math.round(peak);
    ctx.haptic(win ? "hit" : "fail");
    ctx.onRunEnd(finalScore);
  };

  const loop = makeLoop((dt, t) => {
    const theme = ctx.getTheme();

    if (!over) {
      mutation = Math.min(MUTATION_MAX, mutation + dt * MUTATION_RATE);
      if (boostT > 0) boostT = Math.max(0, boostT - dt);
      const boosted = boostT > 0;

      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          autoCd = 0.35;
          // greedy bot: prefer boosting when flush, else claim a frontier cell
          if (mutation >= BOOST_COST && Math.random() < 0.5) {
            const owned = cells
              .map((c, i) => (c.claimed ? i : -1))
              .filter((i) => i >= 0);
            if (owned.length) boostAt(owned[Math.floor(Math.random() * owned.length)]);
          } else {
            const frontier: number[] = [];
            cells.forEach((c, i) => {
              if (c.isCure || c.claimed) return;
              if (!c.claimed && neighbors(i).some((n) => cells[n].claimed)) frontier.push(i);
            });
            const pool = frontier.length
              ? frontier
              : cells
                  .map((c, i) => (!c.isCure && !c.claimed ? i : -1))
                  .filter((i) => i >= 0);
            if (pool.length) claimAt(pool[Math.floor(Math.random() * pool.length)]);
          }
        }
      }

      // spread: each claimed cell tries to infect a neutral neighbor
      cells.forEach((cell, i) => {
        if (!cell.claimed) return;
        cell.spreadT += dt;
        const every = boosted ? cell.spreadEvery * 0.45 : cell.spreadEvery;
        if (cell.spreadT >= every) {
          cell.spreadT = 0;
          const opts = neighbors(i).filter((n) => !cells[n].isCure && !cells[n].claimed);
          if (opts.length) claimAt(opts[Math.floor(Math.random() * opts.length)]);
        }
      });

      // cure: each cure cell tries to reclaim an adjacent claimed neighbor
      cells.forEach((cell, i) => {
        if (!cell.isCure) return;
        cell.cureT += dt;
        if (cell.cureT >= cell.cureEvery) {
          cell.cureT = 0;
          const opts = neighbors(i).filter((n) => cells[n].claimed);
          if (opts.length) {
            const resisted = boosted && Math.random() < 0.7;
            if (!resisted) {
              cells[opts[Math.floor(Math.random() * opts.length)]].claimed = false;
              const cov = coverage();
              ctx.onScore(Math.round(cov));
            }
          }
        }
      });

      const claimedCount = cells.filter((c) => c.claimed).length;
      const cov = coverage();
      if (cov >= 100) endRun(true);
      else if (started && claimedCount === 0) endRun(false);
    }

    // background
    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    // mutation meter
    const mw = W * 0.86;
    const mx = W / 2 - mw / 2;
    const my = H * 0.045;
    g.fillStyle = "rgba(255,255,255,.08)";
    roundRect(g, mx, my, mw, 10, 5);
    g.fill();
    g.fillStyle = boostT > 0 ? pal.glow : pal.prize;
    roundRect(g, mx, my, mw * (mutation / MUTATION_MAX), 10, 5);
    g.fill();

    // grid
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      const x = gx + c * cellW + cellW * 0.06 + cell.jx;
      const y = gy + r * cellH + cellH * 0.06 + cell.jy;
      const w = cellW * 0.88 + cell.jw;
      const h = cellH * 0.88 + cell.jh;
      let fill: string;
      if (cell.isCure) fill = pal.foe;
      else if (cell.claimed) fill = boostT > 0 ? pal.glow : pal.hero;
      else fill = shade(theme.surface, -0.05);
      g.fillStyle = fill;
      roundRect(g, x, y, w, h, 5);
      g.fill();
    }

    g.textAlign = "center";
    g.fillStyle = theme.ink;
    g.font = `700 13px ${theme.fontBody}`;
    g.fillText(`${Math.round(coverage())}% covered`, W / 2, H * 0.035 + 4);
    g.textAlign = "left";

    if (over) endCard(g, theme, W, H, winMsg);
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
