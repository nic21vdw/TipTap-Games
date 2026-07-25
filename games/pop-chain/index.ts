import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, roundRect } from "@/games/engine";
import {
  createFx,
  drawBackdrop,
  resultCard,
  hexA,
  mix,
  halo,
  pulse,
  approach,
  groundInk,
  safeBox,
} from "@/games/fx";

const meta = {
  slug: "pop-chain",
  title: "Pop Chain",
  rule: "Tap groups of 3+. Bigger groups pay more",
  year: 1985,
  description: "Tap-to-collapse — the OG match puzzle. Clear it out for a bonus.",
  history:
    "Homage to SameGame (1985), the tile-collapse puzzle that predates match-3 itself and quietly spawned a whole genre's family tree.",
  tags: ["calm", "retro", "precision"],
  palette: {
    hero: "#ff70a6",
    foe: "#ff9770",
    prize: "#ffd670",
    deep: "#122c4a",
    glow: "#70d6ff",
  },
  intensity: 0.15,
  luck: 0.35,
  nostalgia: 0.8,
  sessionLength: 0.8,
  scoreUnit: "pts",
  maxScorePerSecond: 40,
} satisfies GameModule["meta"];

const COLS = 7;
const ROWS = 9;
const NCOL = 4;

interface Cell {
  colour: number;
  /** current draw offset from the cell's home position, animated to 0 */
  dx: number;
  dy: number;
  /** spawn/press scale */
  pop: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();

  // the board lives inside the feed's chrome, not under the action rail
  const box = safeBox(W, H);
  const cell = Math.min((box.right * 0.94) / COLS, (box.height * 0.86) / ROWS);
  const gx = box.right / 2 - (cell * COLS) / 2;
  const gy = box.top + 26;

  let grid: (Cell | null)[][] = [];
  let score = 0;
  let best = 0;
  let over = false;
  let overAge = 0;
  let boards = 0; // boards cleared this run
  let biggest = 0;
  let clock = 0;
  let hint: { c: number; r: number }[] = [];
  let idle = 0;

  const colours = () => [pal.hero, pal.glow, pal.prize, pal.foe];

  const newCell = (dy: number): Cell => ({
    colour: Math.floor(Math.random() * NCOL),
    dx: 0,
    dy,
    pop: 0,
  });

  const fillGrid = () => {
    grid = Array.from({ length: COLS }, (_, c) =>
      Array.from({ length: ROWS }, (_, r) => newCell(-(gy + (r + c * 0.3) * cell + 120)))
    );
  };

  const group = (c0: number, r0: number): { c: number; r: number }[] => {
    const cell0 = grid[c0][r0];
    if (!cell0) return [];
    const colour = cell0.colour;
    const seen = new Set<string>();
    const stack: [number, number][] = [[c0, r0]];
    const out: { c: number; r: number }[] = [];
    while (stack.length) {
      const [c, r] = stack.pop()!;
      const k = `${c},${r}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      const cur = grid[c][r];
      if (!cur || cur.colour !== colour) continue;
      out.push({ c, r });
      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return out;
  };

  const findMove = (): { c: number; r: number }[] => {
    let bestGrp: { c: number; r: number }[] = [];
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        if (!grid[c][r]) continue;
        const grp = group(c, r);
        if (grp.length > bestGrp.length) bestGrp = grp;
      }
    return bestGrp.length >= 3 ? bestGrp : [];
  };

  const remaining = () => {
    let n = 0;
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (grid[c][r]) n += 1;
    return n;
  };

  const collapse = () => {
    // tiles fall, then columns pack left — and each survivor remembers how
    // far it moved so it can slide into place instead of teleporting
    for (let c = 0; c < COLS; c++) {
      const col = grid[c].filter((v): v is Cell => v !== null);
      const pad = ROWS - col.length;
      for (let i = 0; i < col.length; i++) {
        const from = grid[c].indexOf(col[i]);
        col[i].dy += (from - (i + pad)) * cell;
      }
      grid[c] = [...Array.from({ length: pad }, () => null), ...col];
    }
    const kept: (Cell | null)[][] = [];
    for (let c = 0; c < COLS; c++) {
      if (grid[c].some((v) => v !== null)) {
        for (const v of grid[c]) if (v) v.dx += (c - kept.length) * cell;
        kept.push(grid[c]);
      }
    }
    while (kept.length < COLS) kept.push(Array.from({ length: ROWS }, () => null));
    grid = kept;
  };

  const reset = () => {
    score = 0;
    over = false;
    overAge = 0;
    boards = 0;
    biggest = 0;
    hint = [];
    idle = 0;
    fx.clear();
    ctx.onScore(0);
    fillGrid();
  };

  const pop = (grp: { c: number; r: number }[]) => {
    const th = ctx.getTheme();
    const cols = colours();
    const colour = cols[grid[grp[0].c][grp[0].r]!.colour];
    let sx = 0;
    let sy = 0;
    for (const { c, r } of grp) {
      const x = gx + c * cell + cell / 2;
      const y = gy + r * cell + cell / 2;
      sx += x;
      sy += y;
      fx.burst(x, y, {
        count: 5,
        colour,
        speed: 140,
        life: 0.45,
        size: 3,
        gravity: 260,
      });
      grid[c][r] = null;
    }
    sx /= grp.length;
    sy /= grp.length;

    const gained = grp.length * (grp.length - 2);
    score += gained;
    biggest = Math.max(biggest, grp.length);
    ctx.onScore(score);
    ctx.haptic("hit");
    fx.ring(sx, sy, colour, cell * 0.8, 5);
    fx.pop(sx, sy - cell * 0.6, `+${gained}`, colour, grp.length > 5 ? 26 : 20, th.fontDisplay);
    if (grp.length >= 6) {
      fx.shake(5);
      fx.flash(colour, 0.14);
      fx.pop(W / 2, gy - 20, `${grp.length} CHAIN!`, pal.prize, 24, th.fontDisplay);
    }
    collapse();
    hint = [];
    idle = 0;

    const left = remaining();
    if (left === 0) {
      // a swept board is the score you chase
      boards += 1;
      const bonus = 100;
      score += bonus;
      ctx.onScore(score);
      fx.flash(pal.prize, 0.3);
      fx.shake(8);
      fx.pop(W / 2, H * 0.45, `BOARD CLEARED +${bonus}`, pal.prize, 26, th.fontDisplay);
      fillGrid();
      return;
    }
    if (findMove().length === 0) {
      over = true;
      overAge = 0;
      best = Math.max(best, score);
      ctx.onRunEnd(score);
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      if (overAge > 0.25) reset();
      return;
    }
    const rect = ctx.canvas.getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left - gx) / cell);
    const r = Math.floor((e.clientY - rect.top - gy) / cell);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    if (!grid[c][r]) return;
    const grp = group(c, r);
    if (grp.length < 3) {
      ctx.haptic("light");
      for (const { c: gc, r: gr } of grp) grid[gc][gr]!.pop = 0.35;
      return;
    }
    pop(grp);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  fillGrid();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);

    // slide every tile home
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const v = grid[c][r];
        if (!v) continue;
        v.dx = approach(v.dx, 0, 0.25, dt);
        v.dy = approach(v.dy, 0, 0.25, dt);
        if (Math.abs(v.dx) < 0.3) v.dx = 0;
        if (Math.abs(v.dy) < 0.3) v.dy = 0;
        v.pop = Math.max(0, v.pop - dt * 2);
      }
    }

    if (over) {
      overAge += dt;
    } else {
      // attract mode: keep popping the biggest group on the board
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          const grp = findMove();
          if (grp.length >= 3) pop(grp);
          else fillGrid(); // attract mode never stalls out
          autoCd = 0.5;
        }
      } else {
        // after a while thinking, the board points at a move
        idle += dt;
        if (idle > 4 && hint.length === 0) hint = findMove();
      }
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "blobs",
      intensity: 0.45,
      vignette: 0.55,
    });

    fx.begin(g);

    // the tray the tiles sit in
    g.fillStyle = hexA("#000000", 0.28);
    roundRect(g, gx - 10, gy - 10, cell * COLS + 20, cell * ROWS + 20, 18);
    g.fill();

    fx.drawUnder(g);

    const cols = colours();
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const v = grid[c][r];
        if (!v) continue;
        const colour = cols[v.colour];
        const pad = 2.5;
        const x = gx + c * cell + pad + v.dx;
        const y = gy + r * cell + pad + v.dy;
        const s = cell - pad * 2;
        const wob = v.pop > 0 ? Math.sin(v.pop * 40) * 2 : 0;
        const hinted =
          hint.length > 0 && hint.some((h) => h.c === c && h.r === r)
            ? 0.4 + pulse(clock, 0.9) * 0.6
            : 0;

        if (hinted > 0) halo(g, x + s / 2, y + s / 2, s, colour, 0.4 * hinted);
        g.fillStyle = hexA("#000000", 0.3);
        roundRect(g, x + 1.5 + wob, y + 2.5, s, s, 7);
        g.fill();
        const face = g.createLinearGradient(x, y, x, y + s);
        face.addColorStop(0, mix(colour, "#ffffff", 0.3));
        face.addColorStop(0.55, colour);
        face.addColorStop(1, mix(colour, "#000000", 0.28));
        g.fillStyle = face;
        roundRect(g, x + wob, y, s, s, 7);
        g.fill();
        // a gloss cap so the tiles read as gems, not squares
        g.fillStyle = hexA("#ffffff", 0.28);
        roundRect(g, x + s * 0.16 + wob, y + s * 0.12, s * 0.68, s * 0.28, 5);
        g.fill();
      }
    }

    // ---- HUD
    g.textAlign = "center";
    g.fillStyle = hexA(ink.main, 0.45);
    g.font = `700 13px ${th.fontBody}`;
    g.fillText(
      `${remaining()} TILES LEFT${boards > 0 ? ` · ${boards} BOARDS` : ""}`,
      W / 2,
      gy - 24
    );
    if (score === 0 && !over) {
      g.fillStyle = hexA(ink.main, 0.35 + pulse(clock, 1.6) * 0.35);
      g.font = `700 13px ${th.fontBody}`;
      g.fillText("tap any group of three or more", W / 2, gy + cell * ROWS + 34);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: "no moves left",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `biggest chain ${biggest} · ${boards} boards swept`,
        age: overAge,
        accent: pal.prize,
      });
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
