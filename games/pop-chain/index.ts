import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawBlob, drawCanTop, drawCrumb, drawRoom, skins } from "@/games/nic-art";

const meta = {
  slug: "pop-chain",
  title: "Empties",
  rule: "Tap groups of 3 or more to clear",
  year: 1985,
  description: "Tap-to-collapse. The 4am desk cleanup.",
  history:
    "Homage to SameGame (1985), the tile-collapse puzzle that predates match-3 itself and quietly spawned a whole genre's family tree. Here it is pointed at the pile beside the monitor.",
  tags: ["calm", "retro", "precision"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#c9d3dc",
  },
  intensity: 0.15,
  luck: 0.35,
  nostalgia: 0.8,
  sessionLength: 0.8,
  scoreUnit: "pts",
  maxScorePerSecond: 30,
} satisfies GameModule["meta"];

const COLS = 7;
const ROWS = 9;
const NCOL = 4; // colour roles: accent, accentAlt, success, danger

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const cell = Math.min((W * 0.92) / COLS, (H * 0.62) / ROWS);
  const gx = W / 2 - (cell * COLS) / 2;
  const gy = H * 0.16;
  let grid: (number | null)[][] = [];
  let score = 0;
  let over = false;
  let popFlash: { c: number; r: number }[] = [];
  let flashT = 0;

  const fillGrid = () => {
    grid = Array.from({ length: COLS }, () =>
      Array.from({ length: ROWS }, () => Math.floor(Math.random() * NCOL))
    );
  };

  const group = (c0: number, r0: number): { c: number; r: number }[] => {
    const colour = grid[c0][r0];
    if (colour === null) return [];
    const seen = new Set<string>();
    const stack = [[c0, r0]];
    const out: { c: number; r: number }[] = [];
    while (stack.length) {
      const [c, r] = stack.pop()!;
      const k = `${c},${r}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      if (grid[c][r] !== colour) continue;
      out.push({ c, r });
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return out;
  };

  const anyMoves = (): boolean => {
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++)
        if (grid[c][r] !== null && group(c, r).length >= 3) return true;
    return false;
  };

  const collapse = () => {
    for (let c = 0; c < COLS; c++) {
      const col = grid[c].filter((v) => v !== null);
      grid[c] = [
        ...Array.from({ length: ROWS - col.length }, () => null as null),
        ...col,
      ];
    }
    // shift empty columns toward centre-out is overkill; left-pack like the OG
    const nonEmpty = grid.filter((col) => col.some((v) => v !== null));
    while (nonEmpty.length < COLS)
      nonEmpty.push(Array.from({ length: ROWS }, () => null as null));
    grid = nonEmpty;
  };

  const reset = () => {
    score = 0;
    over = false;
    ctx.onScore(0);
    fillGrid();
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const rect = ctx.canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left - gx) / cell);
    const r = Math.floor((e.clientY - rect.top - gy) / cell);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    if (grid[c][r] === null) return;
    const grp = group(c, r);
    if (grp.length < 3) {
      ctx.haptic("light");
      return;
    }
    popFlash = grp;
    flashT = 0.15;
    for (const { c: gc, r: gr } of grp) grid[gc][gr] = null;
    score += grp.length * (grp.length - 2);
    ctx.onScore(score);
    ctx.haptic("hit");
    collapse();
    if (!anyMoves()) {
      over = true;
      ctx.onRunEnd(score);
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  fillGrid();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    // attract mode: keep popping the biggest group on the board
    if (auto && !over) {
      autoCd -= dt;
      if (autoCd <= 0) {
        let best: { c: number; r: number }[] = [];
        for (let c = 0; c < COLS; c++)
          for (let r = 0; r < ROWS; r++) {
            if (grid[c][r] === null) continue;
            const grp = group(c, r);
            if (grp.length > best.length) best = grp;
          }
        if (best.length >= 3) {
          popFlash = best;
          flashT = 0.15;
          for (const { c, r } of best) grid[c][r] = null;
          score += best.length * (best.length - 2);
          ctx.onScore(score);
          collapse();
          if (!anyMoves()) fillGrid(); // attract mode never stalls out
        } else {
          fillGrid();
        }
        autoCd = 0.5;
      }
    }
    flashT = Math.max(0, flashT - dt);
    const colours = [pal.foe, pal.hero, pal.prize, pal.glow];

    drawRoom(g, W, H, pal.deep, pal.glow);
    const sk = skins(pal);

    // The four kinds of thing left on the desk. Each keeps its own tinted
    // slot underneath so a big group still reads as one blob of colour.
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const v = grid[c][r];
        if (v === null) continue;
        const pad = 2.5;
        g.fillStyle = colours[v] + "33";
        g.fillRect(gx + c * cell + pad, gy + r * cell + pad, cell - pad * 2, cell - pad * 2);
        const x = gx + c * cell + cell / 2;
        const y = gy + r * cell + cell / 2;
        const rr = cell * 0.36;
        if (v === 0) drawCanTop(g, x, y, rr, sk.cola);
        else if (v === 1) drawCanTop(g, x, y, rr, sk.energy);
        else if (v === 2) drawBlob(g, x, y, rr, pal.prize, c + r);
        else drawCrumb(g, x, y, rr, pal.glow, c * 3 + r);
      }
    }

    if (flashT > 0) {
      g.fillStyle = t.ink + "66";
      for (const { c, r } of popFlash)
        g.fillRect(gx + c * cell, gy + r * cell, cell, cell);
    }

    g.textAlign = "center";

    if (over) {
      endCard(g, t, W, H, "NOTHING LEFT TO CLEAR");
    }
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
