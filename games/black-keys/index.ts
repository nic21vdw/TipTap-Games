import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, clamp, roundRect } from "@/games/engine";
import {
  createFx,
  createCombo,
  drawBackdrop,
  drawCombo,
  resultCard,
  pips,
  hexA,
  mix,
  halo,
  pulse,
  groundInk,
  safeBox,
} from "@/games/fx";

const meta = {
  slug: "black-keys",
  title: "Black Keys",
  rule: "Tap the lit tile. Nail the line for bonus",
  year: 2014,
  description: "Only the lit tiles. Hit them on the line and they pay double.",
  history:
    "Homage to 2014's tile-tapper that turned pianos into reflex tests and bus rides into speedruns. Ours adds a strike line, so precision beats panic.",
  tags: ["reflex", "oneTap", "precision"],
  palette: {
    hero: "#7b2cff",
    foe: "#ff2e88",
    prize: "#31e1f7",
    deep: "#0b0020",
    glow: "#c77dff",
  },
  intensity: 0.8,
  luck: 0.05,
  nostalgia: 0.4,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 14,
} satisfies GameModule["meta"];

const LANES = 4;

interface Row {
  y: number;
  dark: number; // lane index
  hit: boolean;
  /** press animation */
  pop: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(5);

  // the keyboard is inset so no lane hides under the feed's action rail
  const box = safeBox(W, H);
  const BOARD = box.right;
  const laneW = BOARD / LANES;
  const rowH = H / 4.5;
  const strikeY = H * 0.62; // the sweet spot, clear of the feed caption
  const FLOOR = H * 0.8; // past here a tile is gone for good

  let rows: Row[] = [];
  let speed = H * 0.36;
  let score = 0;
  let best = 0;
  let lives = 3;
  let over = false;
  let overAge = 0;
  let overReason = "";
  let clock = 0;
  let hits = 0;
  let perfects = 0;
  let laneFlash = new Array(LANES).fill(0);

  const reset = () => {
    rows = [];
    for (let i = 0; i < 5; i++)
      rows.push({
        y: -i * rowH - rowH,
        dark: Math.floor(Math.random() * LANES),
        hit: false,
        pop: 0,
      });
    speed = H * 0.36;
    score = 0;
    lives = 3;
    hits = 0;
    perfects = 0;
    over = false;
    overAge = 0;
    laneFlash = new Array(LANES).fill(0);
    combo.clear();
    fx.clear();
    ctx.onScore(0);
  };

  const loseLife = (reason: string, x: number, y: number) => {
    lives -= 1;
    combo.break();
    ctx.haptic("fail");
    fx.shake(12);
    fx.flash(pal.foe, 0.28);
    fx.burst(x, y, {
      count: 16,
      colour: [pal.foe, "#ffffff"],
      speed: 240,
      life: 0.5,
      size: 4,
      kind: "square",
      gravity: 400,
    });
    if (lives <= 0) {
      over = true;
      overAge = 0;
      overReason = reason;
      best = Math.max(best, score);
      ctx.onRunEnd(score);
    } else {
      fx.pop(x, y - 30, reason, pal.foe, 19, ctx.getTheme().fontDisplay);
    }
  };

  const strike = (row: Row) => {
    const th = ctx.getTheme();
    const cx = row.dark * laneW + laneW / 2;
    const cy = row.y + rowH / 2;
    row.hit = true;
    row.pop = 1;
    hits += 1;
    laneFlash[row.dark] = 0.35;
    // hitting near the strike line pays double
    const onLine = Math.abs(cy - strikeY) < rowH * 0.42;
    if (onLine) perfects += 1;
    const gained = (onLine ? 2 : 1) * combo.hit();
    score += gained;
    ctx.onScore(score);
    ctx.haptic("hit");
    speed = Math.min(H * 1.15, speed + H * 0.009);
    fx.ring(cx, cy, onLine ? pal.prize : pal.glow, laneW * 0.35, 4);
    fx.burst(cx, cy, {
      count: onLine ? 18 : 9,
      colour: onLine ? [pal.prize, "#ffffff"] : [pal.glow, pal.hero],
      speed: onLine ? 260 : 170,
      life: 0.45,
      size: 3.4,
      kind: "spark",
    });
    fx.pop(
      cx,
      cy - 20,
      onLine ? `ON THE LINE +${gained}` : `+${gained}`,
      onLine ? pal.prize : pal.glow,
      onLine ? 20 : 17,
      th.fontDisplay
    );
    if (onLine) fx.flash(pal.prize, 0.1);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      if (overAge > 0.25) reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x > BOARD) return;
    const lane = clamp(Math.floor(x / laneW), 0, LANES - 1);
    const row = rows.find((rw) => y >= rw.y && y < rw.y + rowH);
    if (!row) return;
    if (lane === row.dark && !row.hit) strike(row);
    else loseLife("WRONG TILE", x, y);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    combo.update(dt);
    for (let i = 0; i < LANES; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt * 3);
    for (const r of rows) r.pop = Math.max(0, r.pop - dt * 4);

    if (over) {
      overAge += dt;
    } else {
      // attract mode: clear the lowest un-hit row, right on the line
      if (auto) {
        let target: Row | null = null;
        for (const r of rows)
          if (!r.hit && r.y + rowH > 0 && (!target || r.y > target.y)) target = r;
        if (target && target.y + rowH / 2 > strikeY - rowH * 0.3) strike(target);
      }
      let topY = Math.min(...rows.map((r) => r.y));
      for (const row of rows) row.y += speed * dt;
      for (const row of rows) {
        if (row.y > FLOOR) {
          if (!row.hit) {
            loseLife("MISSED ONE", row.dark * laneW + laneW / 2, FLOOR - 20);
            if (over) break;
          }
          row.y = topY - rowH;
          row.dark = Math.floor(Math.random() * LANES);
          row.hit = false;
          row.pop = 0;
          topY = row.y;
        }
      }
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "rays",
      intensity: 0.5,
      vignette: 0.6,
    });

    fx.begin(g);

    // ---- the keyboard: four lanes, each with its own glow when struck
    for (let l = 0; l < LANES; l++) {
      const lit = laneFlash[l];
      if (lit > 0) {
        const beam = g.createLinearGradient(0, 0, 0, H);
        beam.addColorStop(0, hexA(pal.glow, 0));
        beam.addColorStop(1, hexA(pal.glow, 0.35 * lit));
        g.fillStyle = beam;
        g.fillRect(l * laneW, 0, laneW, FLOOR);
      }
      g.fillStyle = hexA(ink.main, 0.08);
      g.fillRect(l * laneW + laneW - 1, 0, 2, FLOOR);
    }

    // the strike line, the thing worth aiming at
    halo(g, BOARD / 2, strikeY, BOARD * 0.8, pal.prize, 0.14);
    g.fillStyle = hexA(pal.prize, 0.5 + pulse(clock, 1.4) * 0.25);
    g.fillRect(0, strikeY - 1.5, BOARD, 3);
    g.fillStyle = hexA(pal.prize, 0.16);
    g.fillRect(0, strikeY - rowH * 0.42, BOARD, rowH * 0.84);

    fx.drawUnder(g);

    // ---- tiles
    for (const row of rows) {
      const x = row.dark * laneW + 3;
      const y = row.y + 3;
      const w = laneW - 6;
      const h = rowH - 6;
      if (y > FLOOR || y + h < 0) continue;
      const onLine = Math.abs(row.y + rowH / 2 - strikeY) < rowH * 0.42;

      if (row.hit) {
        // a struck tile collapses into its own light
        const k = row.pop;
        g.fillStyle = hexA(pal.glow, 0.35 * k);
        roundRect(g, x + (1 - k) * w * 0.2, y + (1 - k) * h * 0.2, w * k, h * k, 12);
        g.fill();
        continue;
      }

      g.fillStyle = hexA("#000000", 0.4);
      roundRect(g, x + 2, y + 4, w, h, 12);
      g.fill();
      const face = g.createLinearGradient(x, y, x, y + h);
      face.addColorStop(0, mix(pal.hero, "#ffffff", onLine ? 0.35 : 0.12));
      face.addColorStop(1, mix(pal.hero, "#000000", 0.45));
      g.fillStyle = face;
      roundRect(g, x, y, w, h, 12);
      g.fill();
      g.strokeStyle = hexA(onLine ? pal.prize : pal.glow, onLine ? 0.9 : 0.4);
      g.lineWidth = onLine ? 2.5 : 1.5;
      roundRect(g, x + 1, y + 1, w - 2, h - 2, 11);
      g.stroke();
      // gloss
      g.fillStyle = hexA("#ffffff", 0.12);
      roundRect(g, x + 6, y + 6, w - 12, h * 0.3, 8);
      g.fill();
    }

    // ---- HUD
    pips(g, BOARD / 2, H * 0.155, 3, lives, pal.prize, ink.main, 5.5);
    drawCombo(g, combo, BOARD / 2, H * 0.22, pal.prize, th.fontDisplay, clock);
    if (hits === 0 && !over) {
      g.textAlign = "center";
      g.fillStyle = hexA(ink.main, 0.4 + pulse(clock, 1.5) * 0.4);
      g.font = `700 13px ${th.fontBody}`;
      g.fillText("tap the tiles as they cross the line", BOARD / 2, H * 0.72);
      g.textAlign = "left";
    }

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: overReason.toLowerCase() || "missed",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `${hits} tiles · ${perfects} on the line`,
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
