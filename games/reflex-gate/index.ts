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
  slug: "reflex-gate",
  title: "Reflex Gate",
  rule: "Tap in the light. Centre pays double",
  year: 2026,
  description: "Pure timing. The gate shrinks every hit — the core never lies.",
  history:
    "An original for the feed — the timing-bar tension of arcade bonus rounds, distilled to one tap, a shrinking window, and a bullseye worth chasing.",
  tags: ["reflex", "precision", "oneTap"],
  palette: {
    hero: "#00e5ff",
    foe: "#ff2e63",
    prize: "#3dffa2",
    deep: "#04122b",
    glow: "#7b61ff",
  },
  intensity: 0.55,
  luck: 0.1,
  nostalgia: 0.2,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 8,
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
  let pos = 0; // 0..1 along the track
  let dir = 1;
  let speed = 0.62; // track lengths per second
  let zoneC = rand(0.25, 0.75);
  let zoneW = 0.24;
  let hitFlash = 0;
  let missFlash = 0;
  let clock = 0;
  let gates = 0; // gates cleared this run, drives the ramp
  let perfects = 0;

  const CORE = 0.34; // fraction of the gate that counts as the bullseye

  const newZone = () => {
    const prev = zoneC;
    // never re-place the gate under the marker, and never twice in the same spot
    for (let i = 0; i < 8; i++) {
      zoneC = rand(0.12 + zoneW / 2, 0.88 - zoneW / 2);
      if (Math.abs(zoneC - prev) > 0.18 && Math.abs(zoneC - pos) > zoneW) break;
    }
  };

  const reset = () => {
    score = 0;
    lives = 3;
    over = false;
    overAge = 0;
    pos = 0;
    dir = 1;
    speed = 0.62;
    zoneW = 0.24;
    gates = 0;
    perfects = 0;
    combo.clear();
    fx.clear();
    newZone();
    ctx.onScore(0);
  };

  let auto = false;

  const trackGeom = () => ({ y: H * 0.5, x: W * 0.13, w: W * 0.74 });

  const tap = () => {
    if (over) {
      if (overAge > 0.25) reset();
      return;
    }
    const { y, x, w } = trackGeom();
    const px = x + pos * w;
    const d = Math.abs(pos - zoneC);
    const inZone = d <= zoneW / 2;
    const inCore = d <= (zoneW * CORE) / 2;

    if (inZone) {
      const mult = combo.hit();
      const gained = (inCore ? 2 : 1) * mult;
      score += gained;
      gates += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      hitFlash = 0.3;

      if (inCore) {
        perfects += 1;
        fx.shake(5);
        fx.flash(pal.prize, 0.16);
        fx.ring(px, y, pal.prize, 22, 6);
        fx.burst(px, y, {
          count: 22,
          colour: [pal.prize, pal.hero, "#ffffff"],
          speed: 300,
          life: 0.6,
          size: 4,
          kind: "spark",
        });
        fx.pop(px, y - 62, `PERFECT +${gained}`, pal.prize, 22, t().fontDisplay);
      } else {
        fx.ring(px, y, pal.hero, 16, 4);
        fx.burst(px, y, {
          count: 10,
          colour: [pal.hero, pal.glow],
          speed: 190,
          life: 0.45,
          size: 3,
        });
        fx.pop(px, y - 56, `+${gained}`, pal.hero, 19, t().fontDisplay);
      }

      // the ramp: faster rail, tighter gate
      speed = Math.min(2.6, speed * 1.075);
      zoneW = Math.max(0.055, zoneW * 0.935);
      newZone();
    } else {
      lives -= 1;
      combo.break();
      ctx.haptic("fail");
      missFlash = 0.4;
      fx.shake(13);
      fx.flash(pal.foe, 0.3);
      fx.burst(px, y, {
        count: 16,
        colour: [pal.foe, "#ffffff"],
        speed: 240,
        life: 0.5,
        size: 4,
        gravity: 420,
        kind: "square",
      });
      if (lives <= 0) {
        over = true;
        overAge = 0;
        best = Math.max(best, score);
        ctx.onRunEnd(score);
      } else {
        fx.pop(px, y - 56, "MISS", pal.foe, 20, t().fontDisplay);
        // a miss re-opens the gate a touch: the run keeps its shape
        zoneW = Math.min(0.24, zoneW * 1.12);
        newZone();
      }
    }
  };

  const t = () => ctx.getTheme();
  const onDown = () => tap();
  ctx.canvas.addEventListener("pointerdown", onDown);

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    combo.update(dt);

    if (over) {
      overAge += dt;
    } else {
      // attract mode: land the tap just inside the gate, coring it sometimes
      if (auto) {
        const d = Math.abs(pos - zoneC);
        if (d < zoneW * (gates % 3 === 0 ? 0.14 : 0.4)) tap();
      }
      pos += dir * speed * dt;
      if (pos > 1) {
        pos = 1;
        dir = -1;
      } else if (pos < 0) {
        pos = 0;
        dir = 1;
      }
      hitFlash = Math.max(0, hitFlash - dt);
      missFlash = Math.max(0, missFlash - dt);
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "rays",
      intensity: 0.55 + Math.min(0.45, gates * 0.03),
      vignette: 0.55,
    });

    fx.begin(g);

    const { y: trackY, x: trackX, w: trackW } = trackGeom();
    const px = trackX + pos * trackW;
    const barH = 16;

    fx.drawUnder(g);

    // ---- the rail
    g.fillStyle = hexA("#000000", 0.35);
    roundRect(g, trackX - 8, trackY - barH / 2 - 3, trackW + 16, barH + 6, 12);
    g.fill();
    const rail = g.createLinearGradient(trackX, 0, trackX + trackW, 0);
    rail.addColorStop(0, hexA(ink.dim, 0.18));
    rail.addColorStop(0.5, hexA(ink.main, 0.24));
    rail.addColorStop(1, hexA(ink.dim, 0.18));
    g.fillStyle = rail;
    roundRect(g, trackX, trackY - barH / 2, trackW, barH, 8);
    g.fill();

    // tick marks so the eye can measure the swing
    g.fillStyle = hexA(ink.main, 0.14);
    for (let i = 0; i <= 10; i++) {
      g.fillRect(trackX + (i / 10) * trackW - 1, trackY - barH / 2 - 7, 2, 5);
    }

    // ---- the gate
    const gx = trackX + (zoneC - zoneW / 2) * trackW;
    const gw = zoneW * trackW;
    const lit = hitFlash > 0 ? easeOutCubic(hitFlash / 0.3) : 0;
    const gateCol = missFlash > 0 ? pal.foe : pal.prize;

    // gate light column, so the target reads before you look at the marker
    const col = g.createLinearGradient(0, trackY - 90, 0, trackY + 90);
    col.addColorStop(0, hexA(gateCol, 0));
    col.addColorStop(0.5, hexA(gateCol, 0.2 + lit * 0.35));
    col.addColorStop(1, hexA(gateCol, 0));
    g.fillStyle = col;
    g.fillRect(gx, trackY - 90, gw, 180);

    // the bullseye core
    const cw = gw * CORE;
    const coreGrad = g.createLinearGradient(0, trackY - 30, 0, trackY + 30);
    coreGrad.addColorStop(0, hexA(pal.hero, 0.1));
    coreGrad.addColorStop(0.5, hexA(pal.hero, 0.55 + pulse(clock, 0.9) * 0.2));
    coreGrad.addColorStop(1, hexA(pal.hero, 0.1));
    g.fillStyle = coreGrad;
    g.fillRect(gx + gw / 2 - cw / 2, trackY - 30, cw, 60);

    g.fillStyle = hexA(gateCol, 0.85);
    roundRect(g, gx, trackY - barH / 2 - 4, gw, barH + 8, 7);
    g.fill();
    // gate posts
    g.fillStyle = gateCol;
    g.fillRect(gx - 2, trackY - barH / 2 - 16, 3, barH + 32);
    g.fillRect(gx + gw - 1, trackY - barH / 2 - 16, 3, barH + 32);

    // ---- the marker: a comet, so speed is visible even when it is still
    const tail = clamp(speed * 0.09, 0.02, 0.13) * trackW * dir;
    const streak = g.createLinearGradient(px - tail, 0, px, 0);
    streak.addColorStop(0, hexA(pal.hero, 0));
    streak.addColorStop(1, hexA(pal.hero, 0.75));
    g.fillStyle = streak;
    g.fillRect(Math.min(px, px - tail), trackY - 5, Math.abs(tail), 10);

    halo(g, px, trackY, 46, over ? pal.foe : pal.hero, 0.5);
    g.fillStyle = over ? pal.foe : "#ffffff";
    roundRect(g, px - 3.5, trackY - barH / 2 - 20, 7, barH + 40, 3.5);
    g.fill();
    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(px, trackY, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(px, trackY, 4, 0, Math.PI * 2);
    g.fill();

    // ---- HUD
    pips(g, W / 2, H * 0.13, 3, lives, pal.prize, ink.main, 6);
    drawCombo(g, combo, W / 2, H * 0.24, pal.prize, th.fontDisplay, clock);

    g.textAlign = "center";
    g.fillStyle = hexA(ink.main, 0.5);
    g.font = `700 13px ${th.fontBody}`;
    g.fillText(
      `GATE ${gates + 1}  ·  x${(speed / 0.62).toFixed(1)} SPEED`,
      W / 2,
      trackY + 118
    );
    if (gates === 0 && !over) {
      g.fillStyle = hexA(ink.main, 0.35 + pulse(clock, 1.6) * 0.35);
      g.font = `700 14px ${th.fontBody}`;
      g.fillText("tap when the comet crosses the light", W / 2, trackY + 148);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: "gate closed",
        score,
        unit: meta.scoreUnit,
        best,
        sub:
          perfects > 0
            ? `${perfects} perfect · best chain ${combo.best}`
            : undefined,
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
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      if (!on) reset(); // hand the player a fresh run
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
