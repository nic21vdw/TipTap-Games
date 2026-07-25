import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand, clamp } from "@/games/engine";
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
  easeOutBack,
  safeBox,
  mix,
  groundInk,
} from "@/games/fx";

const meta = {
  slug: "tap-rush",
  title: "Tap Rush",
  rule: "Pop the lights. Never pop the red",
  year: 2026,
  description: "Whack-a-target at feed speed. Gold pays triple, red bites.",
  history:
    "An original descended from every light-gun cabinet and whack-a-mole machine ever built, rebuilt for one thumb — and one target you must not touch.",
  tags: ["reflex", "chaos", "oneTap"],
  palette: {
    hero: "#ff5fa2",
    foe: "#ff1f4b",
    prize: "#ffd60a",
    deep: "#25004f",
    glow: "#8a2be2",
  },
  intensity: 0.9,
  luck: 0.15,
  nostalgia: 0.25,
  sessionLength: 0.25,
  scoreUnit: "pts",
  maxScorePerSecond: 22,
} satisfies GameModule["meta"];

type Kind = "normal" | "gold" | "bomb";

interface Target {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  kind: Kind;
  born: number; // age, for the spawn spring
  wobble: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(4, 2.2); // a chain you have to keep feeding

  const R = 40;
  let score = 0;
  let misses = 0;
  let over = false;
  let overAge = 0;
  let best = 0;
  let targets: Target[] = [];
  let spawnIn = 0.35;
  let clock = 0;
  let hits = 0;
  let taps = 0;
  let golds = 0;

  const reset = () => {
    score = 0;
    misses = 0;
    hits = 0;
    taps = 0;
    golds = 0;
    over = false;
    overAge = 0;
    targets = [];
    spawnIn = 0.35;
    combo.clear();
    fx.clear();
    ctx.onScore(0);
  };

  const value = (k: Kind) => (k === "gold" ? 3 : 1);

  const loseLife = (x: number, y: number, why: string) => {
    misses += 1;
    combo.break();
    ctx.haptic("fail");
    fx.shake(12);
    fx.flash(pal.foe, 0.26);
    fx.burst(x, y, {
      count: 18,
      colour: [pal.foe, "#ffffff"],
      speed: 260,
      life: 0.55,
      size: 5,
      gravity: 380,
      kind: "square",
    });
    if (misses >= 3) {
      over = true;
      overAge = 0;
      best = Math.max(best, score);
      ctx.onRunEnd(score);
    } else {
      fx.pop(x, y - 30, why, pal.foe, 20, ctx.getTheme().fontDisplay);
    }
  };

  const strike = (tg: Target, i: number) => {
    const th = ctx.getTheme();
    targets.splice(i, 1);
    if (tg.kind === "bomb") {
      loseLife(tg.x, tg.y, "BOOM");
      return;
    }
    const mult = combo.hit();
    const gained = value(tg.kind) * mult;
    score += gained;
    hits += 1;
    if (tg.kind === "gold") golds += 1;
    ctx.onScore(score);
    ctx.haptic("hit");
    const col = tg.kind === "gold" ? pal.prize : pal.hero;
    fx.ring(tg.x, tg.y, col, R * 0.6, 5);
    fx.burst(tg.x, tg.y, {
      count: tg.kind === "gold" ? 24 : 12,
      colour: tg.kind === "gold" ? [pal.prize, "#ffffff"] : [col, pal.glow],
      speed: tg.kind === "gold" ? 300 : 210,
      life: 0.5,
      size: 4,
    });
    fx.pop(tg.x, tg.y - 26, `+${gained}`, col, tg.kind === "gold" ? 24 : 19, th.fontDisplay);
    if (tg.kind === "gold") {
      fx.shake(4);
      fx.flash(pal.prize, 0.12);
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      if (overAge > 0.25) reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    taps += 1;
    for (let i = targets.length - 1; i >= 0; i--) {
      const tg = targets[i];
      if ((x - tg.x) ** 2 + (y - tg.y) ** 2 <= (R + 14) ** 2) {
        strike(tg, i);
        return;
      }
    }
    // an empty tap costs you the chain, not a life
    combo.break();
    ctx.haptic("light");
    fx.ring(x, y, ctx.getTheme().inkDim, 10, 2);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;
  let autoCd = 0;

  const spawn = () => {
    // bombs arrive once the player has found their rhythm; gold is the carrot
    const roll = Math.random();
    const bombChance = hits > 6 ? Math.min(0.24, 0.06 + hits * 0.006) : 0;
    const kind: Kind =
      roll < bombChance ? "bomb" : roll < bombChance + 0.13 ? "gold" : "normal";
    const life = clamp(2.3 - hits * 0.035, kind === "bomb" ? 1.4 : 0.85, 2.3);
    // keep new targets off each other, and out from under the feed's chrome
    const box = safeBox(W, H);
    let x = 0;
    let y = 0;
    for (let i = 0; i < 10; i++) {
      x = rand(R + 16, Math.max(R + 40, box.right - R));
      y = rand(box.top + R, box.bottom - R);
      if (targets.every((o) => (o.x - x) ** 2 + (o.y - y) ** 2 > (R * 2.1) ** 2))
        break;
    }
    targets.push({ x, y, life, maxLife: life, kind, born: 0, wobble: rand(0, 6) });
  };

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    combo.update(dt);

    if (over) {
      overAge += dt;
    } else {
      // attract mode: pop the most urgent light, and never touch the red
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          let idx = -1;
          for (let i = 0; i < targets.length; i++) {
            if (targets[i].kind === "bomb") continue;
            if (idx === -1 || targets[i].life < targets[idx].life) idx = i;
          }
          if (idx >= 0) {
            strike(targets[idx], idx);
            autoCd = 0.26;
          }
        }
      }
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        spawnIn = Math.max(0.3, 0.95 - hits * 0.022);
      }
      for (let i = targets.length - 1; i >= 0; i--) {
        const tg = targets[i];
        tg.born += dt;
        tg.life -= dt;
        if (tg.life <= 0) {
          targets.splice(i, 1);
          // a bomb that times out is a gift, not a penalty
          if (tg.kind !== "bomb") loseLife(tg.x, tg.y, "MISSED");
        }
      }
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "blobs",
      intensity: 0.7 + Math.min(0.5, combo.value * 0.05),
      vignette: 0.5,
    });

    fx.begin(g);
    fx.drawUnder(g);

    for (const tg of targets) {
      const p = clamp(tg.life / tg.maxLife, 0, 1);
      const pop = easeOutBack(clamp(tg.born / 0.22, 0, 1));
      const breathe = 1 + Math.sin(clock * 6 + tg.wobble) * 0.03;
      const r = R * pop * breathe;
      const isBomb = tg.kind === "bomb";
      const body = isBomb ? pal.foe : tg.kind === "gold" ? pal.prize : pal.hero;

      halo(g, tg.x, tg.y, r * 2, body, isBomb ? 0.42 : 0.3);

      // the fuse ring: how long you have left, drawn as a shrinking arc
      g.beginPath();
      g.arc(tg.x, tg.y, r + 8, 0, Math.PI * 2);
      g.strokeStyle = hexA(ink.main, 0.12);
      g.lineWidth = 4;
      g.stroke();
      g.beginPath();
      g.arc(tg.x, tg.y, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      g.strokeStyle = p < 0.3 ? pal.foe : body;
      g.lineWidth = 4;
      g.lineCap = "round";
      g.stroke();
      g.lineCap = "butt";

      // body
      const grad = g.createRadialGradient(
        tg.x - r * 0.3,
        tg.y - r * 0.35,
        r * 0.1,
        tg.x,
        tg.y,
        r
      );
      grad.addColorStop(0, mix(body, "#ffffff", isBomb ? 0.4 : 0.7));
      grad.addColorStop(0.45, body);
      grad.addColorStop(1, mix(body, "#000000", 0.3));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(tg.x, tg.y, r * 0.78, 0, Math.PI * 2);
      g.fill();

      if (isBomb) {
        // a hard X — unmistakable, even mid-panic
        g.strokeStyle = "#ffffff";
        g.lineWidth = 5;
        g.lineCap = "round";
        const s = r * 0.34;
        g.beginPath();
        g.moveTo(tg.x - s, tg.y - s);
        g.lineTo(tg.x + s, tg.y + s);
        g.moveTo(tg.x + s, tg.y - s);
        g.lineTo(tg.x - s, tg.y + s);
        g.stroke();
        g.lineCap = "butt";
      } else if (tg.kind === "gold") {
        g.fillStyle = hexA("#ffffff", 0.9);
        g.textAlign = "center";
        g.font = `900 ${Math.round(r * 0.6)}px ${th.fontDisplay}`;
        g.fillText("3", tg.x, tg.y + r * 0.22);
        g.textAlign = "left";
      }
    }

    // ---- HUD
    pips(g, W / 2, H * 0.11, 3, 3 - misses, pal.prize, ink.main, 6);
    drawCombo(g, combo, W / 2, H * 0.19, pal.prize, th.fontDisplay, clock);

    if (hits === 0 && !over) {
      g.textAlign = "center";
      g.fillStyle = hexA(ink.main, 0.35 + pulse(clock, 1.6) * 0.35);
      g.font = `700 14px ${th.fontBody}`;
      g.fillText("tap the lights before the ring runs out", W / 2, H * 0.77);
      g.textAlign = "left";
    }

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      const acc = taps > 0 ? Math.round((hits / taps) * 100) : 0;
      resultCard(g, th, W, H, {
        title: "out of misses",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `${acc}% accuracy · ${golds} gold · chain ${combo.best}`,
        age: overAge,
        accent: pal.hero,
      });
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
