import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand, clamp, roundRect } from "@/games/engine";
import {
  createFx,
  createCombo,
  drawBackdrop,
  drawCombo,
  resultCard,
  pips,
  hexA,
  halo,
  pulse,
  easeOutCubic,
  groundInk,
} from "@/games/fx";

const meta = {
  slug: "hold-line",
  title: "Hold the Line",
  rule: "Hold to fill. Release on the line",
  year: 2026,
  description: "One press, one release. Nerves of glass.",
  history:
    "An original — the power gauge from golf and fighting games, isolated into its purest, meanest form. The tolerance band only shrinks, and the line starts to drift.",
  tags: ["precision", "hold", "calm"],
  palette: {
    hero: "#00e0a4",
    foe: "#ff4d6d",
    prize: "#ffd166",
    deep: "#04222e",
    glow: "#22a6f2",
  },
  intensity: 0.3,
  luck: 0.05,
  nostalgia: 0.15,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(3);

  let score = 0;
  let lives = 3;
  let over = false;
  let overAge = 0;
  let best = 0;
  let holding = false;
  let fill = 0; // 0..1
  let target = rand(0.45, 0.85);
  let tol = 0.1;
  let fillSpeed = 0.5;
  let drift = 0; // the line starts moving once you get good
  let driftPhase = 0;
  let result: "hit" | "perfect" | "miss" | null = null;
  let resultT = 0;
  let rounds = 0;
  let perfects = 0;
  let clock = 0;
  let shakeHold = 0; // the tube trembles the closer you get

  const tubeGeom = () => {
    const bw = Math.min(W * 0.3, 110);
    const bh = H * 0.5;
    // the tube sits clear of the caption at the bottom of the card
    return { x: W / 2 - bw / 2, w: bw, bottom: H * 0.74, h: bh };
  };

  const liveTarget = () => clamp(target + Math.sin(driftPhase) * drift, 0.16, 0.94);

  const newRound = () => {
    fill = 0;
    target = rand(0.38, 0.88);
    driftPhase = rand(0, Math.PI * 2);
    result = null;
  };

  const reset = () => {
    score = 0;
    lives = 3;
    rounds = 0;
    perfects = 0;
    over = false;
    overAge = 0;
    tol = 0.1;
    drift = 0;
    fillSpeed = 0.5;
    holding = false;
    combo.clear();
    fx.clear();
    ctx.onScore(0);
    newRound();
  };

  const spill = (y: number, colour: string, n: number) => {
    const { x, w } = tubeGeom();
    fx.burst(x + w / 2, y, {
      count: n,
      colour,
      speed: 210,
      life: 0.6,
      size: 4,
      gravity: 520,
      angle: -Math.PI / 2,
      spread: 1.1,
    });
  };

  const onDown = () => {
    if (over) {
      if (overAge > 0.25) reset();
      return;
    }
    if (result === null) {
      holding = true;
      ctx.haptic("light");
    }
  };

  const onUp = () => {
    if (over || !holding) return;
    holding = false;
    const th = ctx.getTheme();
    const { x, w, bottom, h } = tubeGeom();
    const tgt = liveTarget();
    const y = bottom - fill * h;
    const err = Math.abs(fill - tgt);

    if (err <= tol * 0.3) {
      perfects += 1;
      rounds += 1;
      const gained = 3 * combo.hit();
      score += gained;
      ctx.onScore(score);
      ctx.haptic("hit");
      result = "perfect";
      resultT = 0.5;
      fx.shake(6);
      fx.flash(pal.prize, 0.2);
      fx.ring(x + w / 2, y, pal.prize, 30, 6);
      spill(y, pal.prize, 26);
      fx.pop(x + w / 2, y - 44, `DEAD ON +${gained}`, pal.prize, 22, th.fontDisplay);
    } else if (err <= tol) {
      rounds += 1;
      const gained = 1 * combo.hit();
      score += gained;
      ctx.onScore(score);
      ctx.haptic("hit");
      result = "hit";
      resultT = 0.42;
      fx.ring(x + w / 2, y, pal.hero, 22, 4);
      spill(y, pal.hero, 12);
      fx.pop(x + w / 2, y - 40, `+${gained}`, pal.hero, 19, th.fontDisplay);
    } else {
      lives -= 1;
      combo.break();
      ctx.haptic("fail");
      result = "miss";
      resultT = 0.7;
      fx.shake(12);
      fx.flash(pal.foe, 0.28);
      spill(y, pal.foe, 18);
      if (lives <= 0) {
        over = true;
        overAge = 0;
        best = Math.max(best, score);
        ctx.onRunEnd(score);
      } else {
        fx.pop(
          x + w / 2,
          y - 40,
          fill > tgt ? "OVERSHOT" : "SHORT",
          pal.foe,
          20,
          th.fontDisplay
        );
      }
    }

    if (result !== "miss") {
      // the ramp: tighter band, faster pump, and eventually a drifting line
      tol = Math.max(0.028, tol * 0.9);
      fillSpeed = Math.min(1.15, fillSpeed * 1.055);
      if (rounds >= 4) drift = Math.min(0.14, 0.02 + (rounds - 4) * 0.012);
    }
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  let auto = false;

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    combo.update(dt);

    if (over) {
      overAge += dt;
    } else {
      driftPhase += dt * 1.5;
      const tgt = liveTarget();
      // attract mode: hold, then release just inside the band
      if (auto && result === null) {
        if (!holding) holding = true;
        else if (fill >= tgt - tol * (rounds % 3 === 0 ? 0.1 : 0.5)) onUp();
      }
      if (holding && result === null) {
        fill += fillSpeed * dt;
        shakeHold = clamp(1 - Math.abs(fill - tgt) / 0.25, 0, 1);
        if (fill >= 1) {
          fill = 1;
          holding = false;
          lives -= 1;
          combo.break();
          ctx.haptic("fail");
          result = "miss";
          resultT = 0.7;
          fx.shake(15);
          fx.flash(pal.foe, 0.34);
          const { x, w, bottom, h } = tubeGeom();
          spill(bottom - h, pal.foe, 26);
          if (lives <= 0) {
            over = true;
            overAge = 0;
            best = Math.max(best, score);
            ctx.onRunEnd(score);
          } else {
            fx.pop(x + w / 2, bottom - h - 30, "BURST", pal.foe, 22, th.fontDisplay);
          }
        }
      } else {
        shakeHold = Math.max(0, shakeHold - dt * 3);
      }
      if (result !== null && !over) {
        resultT -= dt;
        if (resultT <= 0) newRound();
      }
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "blobs",
      intensity: 0.55,
      vignette: 0.6,
    });

    fx.begin(g);
    fx.drawUnder(g);

    const { x: bx, w: bw, bottom: by, h: bh } = tubeGeom();
    const tgt = liveTarget();
    const targetY = by - tgt * bh;
    const bandTop = by - (tgt + tol) * bh;
    const bandH = tol * 2 * bh;
    const surfaceY = by - fill * bh;

    // the tube: a glass column with a soft inner shadow
    g.save();
    g.translate(0, Math.sin(clock * 40) * shakeHold * 1.2);

    g.fillStyle = hexA("#000000", 0.35);
    roundRect(g, bx + 3, by - bh + 5, bw, bh, 16);
    g.fill();
    g.fillStyle = hexA(ink.main, 0.07);
    roundRect(g, bx, by - bh, bw, bh, 16);
    g.fill();

    // tolerance band, drawn behind the liquid so the liquid reads on top
    const bandCol = result === "miss" ? pal.foe : pal.prize;
    g.fillStyle = hexA(bandCol, 0.16);
    g.fillRect(bx - 16, bandTop, bw + 32, bandH);
    // the perfect core
    g.fillStyle = hexA(bandCol, 0.3);
    g.fillRect(bx - 16, by - (tgt + tol * 0.3) * bh, bw + 32, tol * 0.6 * bh);

    // the liquid
    g.save();
    roundRect(g, bx, by - bh, bw, bh, 16);
    g.clip();
    const liquidCol =
      result === "miss"
        ? pal.foe
        : result === "perfect"
          ? pal.prize
          : result === "hit"
            ? pal.hero
            : pal.hero;
    const lg = g.createLinearGradient(0, surfaceY, 0, by);
    lg.addColorStop(0, hexA(liquidCol, 0.95));
    lg.addColorStop(1, hexA(liquidCol, 0.55));
    g.fillStyle = lg;
    // a wavy surface, so the fill feels like a liquid and not a progress bar
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(bx, surfaceY);
    for (let x = 0; x <= bw; x += 6) {
      const wob = holding ? 3.5 : 1.5;
      g.lineTo(
        bx + x,
        surfaceY + Math.sin(x * 0.09 + clock * 7) * wob + Math.sin(clock * 3) * 1.2
      );
    }
    g.lineTo(bx + bw, by);
    g.closePath();
    g.fill();

    // rising bubbles while the pump runs
    if (holding) {
      g.fillStyle = hexA("#ffffff", 0.35);
      for (let i = 0; i < 7; i++) {
        const bxo = bx + ((i * 37) % bw);
        const byo = by - ((clock * (60 + i * 13) + i * 90) % Math.max(1, by - surfaceY));
        if (byo > surfaceY) {
          g.beginPath();
          g.arc(bxo, byo, 2 + (i % 3), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // glass gloss
    const gloss = g.createLinearGradient(bx, 0, bx + bw, 0);
    gloss.addColorStop(0, hexA("#ffffff", 0.16));
    gloss.addColorStop(0.22, hexA("#ffffff", 0.04));
    gloss.addColorStop(1, hexA("#ffffff", 0));
    g.fillStyle = gloss;
    g.fillRect(bx, by - bh, bw, bh);
    g.restore();

    // the line itself, lit
    halo(g, bx + bw / 2, targetY, bw * 1.1, bandCol, 0.32);
    g.fillStyle = bandCol;
    g.fillRect(bx - 20, targetY - 1.5, bw + 40, 3);
    // end caps, so the line reads as a target and not a fill level
    g.beginPath();
    g.moveTo(bx - 20, targetY - 7);
    g.lineTo(bx - 8, targetY);
    g.lineTo(bx - 20, targetY + 7);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(bx + bw + 20, targetY - 7);
    g.lineTo(bx + bw + 8, targetY);
    g.lineTo(bx + bw + 20, targetY + 7);
    g.closePath();
    g.fill();

    // tube outline last, so it frames everything
    g.strokeStyle = hexA(ink.main, 0.28);
    g.lineWidth = 2;
    roundRect(g, bx, by - bh, bw, bh, 16);
    g.stroke();
    g.restore();

    // ---- HUD
    pips(g, W / 2, H * 0.12, 3, lives, pal.prize, ink.main, 6);
    drawCombo(g, combo, W / 2, H * 0.2, pal.prize, th.fontDisplay, clock);

    g.textAlign = "center";
    if (result === null && !holding && !over) {
      g.fillStyle = hexA(ink.main, 0.4 + pulse(clock, 1.5) * 0.4);
      g.font = `700 15px ${th.fontBody}`;
      g.fillText(
        rounds === 0 ? "press and hold — let go on the line" : "hold",
        W / 2,
        by - bh - 26
      );
    } else if (holding) {
      const near = easeOutCubic(shakeHold);
      g.fillStyle = hexA(near > 0.6 ? pal.prize : ink.dim, 0.5 + near * 0.5);
      g.font = `800 15px ${th.fontBody}`;
      g.fillText(near > 0.75 ? "NOW" : "…", W / 2, by - bh - 26);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: fill >= 1 ? "burst" : "off the line",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `${rounds} clean · ${perfects} dead on`,
        age: overAge,
        accent: pal.hero,
      });
    }
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      holding = false;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
