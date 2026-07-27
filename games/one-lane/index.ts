import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, makeLoop, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";
import {
  createFx,
  createCombo,
  drawBackdrop,
  drawCombo,
  resultCard,
  hexA,
  mix,
  halo,
  pulse,
  approach,
  groundInk,
} from "@/games/fx";

const meta = {
  slug: "one-lane",
  title: "Nic's Basement Run",
  rule: "Tap to switch sides. Grab the cold ones",
  year: 2012,
  description: "The endless-runner era, compressed into one basement and one nerve.",
  history:
    "Homage to 2012's lane-runner boom — swipe-to-dodge commutes on a billion phones. Ours strips it to a single input, bare feet, and no mercy.",
  tags: ["endurance", "oneTap", "retro"],
  palette: {
    hero: "#e8b48c",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#1f6fd0",
  },
  intensity: 0.65,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 12,
} satisfies GameModule["meta"];

type Lane = 0 | 1;

interface Ob {
  lane: Lane;
  y: number;
  passed: boolean;
  /** true = a spark to collect, false = a wall to dodge */
  prize: boolean;
  taken: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(4, 3);

  const laneX: [number, number] = [W * 0.33, W * 0.67];
  const py = H * 0.72; // clear of the feed caption
  const size = 32;

  let lane: Lane = 0;
  let drawX = laneX[0]; // the car eases between lanes instead of teleporting
  let score = 0;
  let best = 0;
  let over = false;
  let overAge = 0;
  let obs: Ob[] = [];
  let spawnIn = 1;
  let speed = 250;
  let scroll = 0;
  let clock = 0;
  let sparks = 0;
  let nearMiss = 0;
  let tilt = 0;
  let deathT = 0;

  const reset = () => {
    lane = 0;
    drawX = laneX[0];
    score = 0;
    over = false;
    overAge = 0;
    obs = [];
    spawnIn = 1;
    speed = 250;
    sparks = 0;
    nearMiss = 0;
    deathT = 0;
    combo.clear();
    fx.clear();
    ctx.onScore(0);
  };

  const onDown = () => {
    if (over) {
      if (overAge > 0.3) reset();
      return;
    }
    lane = lane === 0 ? 1 : 0;
    tilt = lane === 1 ? 0.4 : -0.4;
    ctx.haptic("light");
    // tyre smoke off the old lane
    fx.burst(drawX, py + size * 0.5, {
      count: 6,
      colour: hexA("#ffffff", 0.5),
      speed: 90,
      life: 0.35,
      size: 4,
      angle: Math.PI / 2,
      spread: 0.7,
    });
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    combo.update(dt);

    if (over) {
      overAge += dt;
      deathT += dt;
    } else {
      // attract mode: flip out of the lane a wall is closing on, and take
      // any spark that is free to take
      if (auto) {
        for (const o of obs) {
          const dist = py - o.y;
          if (dist <= 0 || dist > size * 6) continue;
          if (!o.prize && o.lane === lane) {
            const blocked = obs.some(
              (x) => !x.prize && x.lane !== lane && Math.abs(py - x.y) < size * 3.5
            );
            if (!blocked) lane = lane === 0 ? 1 : 0;
            break;
          }
          if (o.prize && o.lane !== lane) {
            const blocked = obs.some(
              (x) => !x.prize && x.lane !== lane && Math.abs(py - x.y) < size * 3.5
            );
            if (!blocked) lane = o.lane;
            break;
          }
        }
      }

      scroll += speed * dt;
      speed = Math.min(620, speed + dt * 12);
      spawnIn -= dt;
      if (spawnIn <= 0) {
        const wallLane: Lane = Math.random() < 0.5 ? 0 : 1;
        obs.push({ lane: wallLane, y: -60, passed: false, prize: false, taken: false });
        // a spark rides the safe lane often enough to be worth chasing
        if (Math.random() < 0.55) {
          obs.push({
            lane: (wallLane === 0 ? 1 : 0) as Lane,
            y: -60 - size * 2.2,
            passed: false,
            prize: true,
            taken: false,
          });
        }
        spawnIn = clamp(0.95 - score * 0.004, 0.42, 0.95);
      }

      for (let i = obs.length - 1; i >= 0; i--) {
        const o = obs[i];
        o.y += speed * dt;
        const dy = Math.abs(o.y - py);
        const hit = o.lane === lane && dy < size * (o.prize ? 1.1 : 0.95);

        if (o.prize && hit && !o.taken) {
          o.taken = true;
          sparks += 1;
          const gained = 2 * combo.hit();
          score += gained;
          ctx.onScore(score);
          ctx.haptic("hit");
          fx.ring(laneX[o.lane], o.y, pal.prize, 18, 4);
          fx.burst(laneX[o.lane], o.y, {
            count: 14,
            colour: [pal.prize, "#ffffff"],
            speed: 200,
            life: 0.45,
            size: 3,
          });
          fx.pop(laneX[o.lane], o.y - 26, `+${gained}`, pal.prize, 19, th.fontDisplay);
        } else if (!o.prize && hit) {
          over = true;
          overAge = 0;
          deathT = 0;
          best = Math.max(best, score);
          combo.break();
          ctx.haptic("fail");
          fx.shake(18);
          fx.flash(pal.foe, 0.36);
          fx.burst(drawX, py, {
            count: 30,
            colour: [pal.foe, pal.hero, "#ffffff"],
            speed: 340,
            life: 0.9,
            size: 5,
            gravity: 500,
            kind: "square",
          });
          ctx.onRunEnd(score);
        }

        if (!o.passed && o.y > py + size) {
          o.passed = true;
          if (!o.prize) {
            score += 1;
            ctx.onScore(score);
            // a wall cleared from the neighbouring lane at speed is a near miss
            if (o.lane !== lane) {
              nearMiss += 1;
              if (nearMiss % 3 === 0) {
                fx.pop(W / 2, py - 70, "CLOSE!", pal.hero, 20, th.fontDisplay);
              }
            }
          }
        }
        if (o.y > H + 100 || (o.prize && o.taken)) obs.splice(i, 1);
      }
    }

    drawX = approach(drawX, laneX[lane], 0.28, dt);
    tilt = approach(tilt, 0, 0.15, dt);

    // ---- road ----
    drawBackdrop(g, W, H, pal, clock, {
      kind: "hills",
      intensity: 0.8,
      scroll,
      vignette: 0.5,
    });

    fx.begin(g);

    const roadL = W * 0.16;
    const roadR = W * 0.84;
    const tarmac = g.createLinearGradient(roadL, 0, roadR, 0);
    tarmac.addColorStop(0, mix(pal.deep, "#000000", 0.5));
    tarmac.addColorStop(0.5, mix(pal.deep, "#000000", 0.25));
    tarmac.addColorStop(1, mix(pal.deep, "#000000", 0.5));
    g.fillStyle = tarmac;
    g.fillRect(roadL, 0, roadR - roadL, H);

    // dashed centre line + edge rails, scrolling with the run
    const dash = 48;
    const off = scroll % dash;
    g.fillStyle = hexA(pal.prize, 0.55);
    for (let y = -dash + off; y < H; y += dash) {
      g.fillRect(W / 2 - 3, y, 6, dash * 0.55);
    }
    for (const x of [roadL, roadR - 5]) {
      const rail = g.createLinearGradient(0, 0, 0, H);
      rail.addColorStop(0, hexA(pal.glow, 0.2));
      rail.addColorStop(1, hexA(pal.glow, 0.9));
      g.fillStyle = rail;
      g.fillRect(x, 0, 5, H);
    }
    // speed streaks, so velocity is visible even between obstacles
    g.fillStyle = hexA("#ffffff", 0.06 + Math.min(0.12, speed / 5000));
    for (let i = 0; i < 8; i++) {
      const sx = roadL + 14 + ((i * 53) % (roadR - roadL - 28));
      const sy = (scroll * 1.6 + i * 190) % (H + 160) - 80;
      g.fillRect(sx, sy, 2, 60);
    }

    fx.drawUnder(g);

    // ---- obstacles ----
    for (const o of obs) {
      const x = laneX[o.lane];
      if (o.prize) {
        const spin = clock * 4 + o.y * 0.02;
        halo(g, x, o.y, 34, pal.prize, 0.45);
        g.save();
        g.translate(x, o.y);
        g.rotate(spin);
        g.fillStyle = pal.prize;
        g.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
          g.lineTo(Math.cos(a + Math.PI / 4) * 5, Math.sin(a + Math.PI / 4) * 5);
        }
        g.closePath();
        g.fill();
        g.restore();
      } else {
        // a barrier: hazard chevrons and a lit top edge
        const w = size * 1.7;
        const h = size * 1.05;
        g.fillStyle = "rgba(0,0,0,.35)";
        roundRect(g, x - w / 2 + 3, o.y - h / 2 + 5, w, h, 6);
        g.fill();
        g.save();
        roundRect(g, x - w / 2, o.y - h / 2, w, h, 6);
        g.clip();
        g.fillStyle = pal.foe;
        g.fillRect(x - w / 2, o.y - h / 2, w, h);
        // whoever is driving the thing in your way is him
        drawNicHead(g, {
          x,
          y: o.y,
          r: Math.min(w, h) * 0.34,
          skin: shade(pal.foe, 0.25),
          hair: shade(pal.deep, -0.4),
          eye: th.ink,
          pupil: shade(pal.deep, -0.65),
          dark: shade(pal.deep, -0.65),
          tooth: th.ink,
          scowl: 1,
        });
        g.fillStyle = "rgba(0,0,0,.25)";
        for (let s = -h; s < w; s += 18) {
          g.beginPath();
          g.moveTo(x - w / 2 + s, o.y + h / 2);
          g.lineTo(x - w / 2 + s + h, o.y - h / 2);
          g.lineTo(x - w / 2 + s + h + 8, o.y - h / 2);
          g.lineTo(x - w / 2 + s + 8, o.y + h / 2);
          g.closePath();
          g.fill();
        }
        g.restore();
        g.fillStyle = hexA("#ffffff", 0.75);
        g.fillRect(x - w / 2 + 4, o.y - h / 2 + 2, w - 8, 2.5);
      }
    }

    // ---- the car ----
    if (!over || deathT < 0.15) {
      const bob = Math.sin(clock * 18) * 0.8;
      halo(g, drawX, py + 6, 46, pal.hero, 0.3);
      g.save();
      g.translate(drawX, py + bob);
      g.rotate(tilt * 0.35);
      // exhaust trail
      g.fillStyle = hexA(pal.hero, 0.18);
      g.beginPath();
      g.moveTo(-size * 0.35, size * 0.5);
      g.lineTo(size * 0.35, size * 0.5);
      g.lineTo(size * 0.12, size * 2.4);
      g.lineTo(-size * 0.12, size * 2.4);
      g.closePath();
      g.fill();
      // body
      const body = g.createLinearGradient(0, -size * 0.7, 0, size * 0.6);
      body.addColorStop(0, mix(pal.hero, "#ffffff", 0.4));
      body.addColorStop(1, pal.hero);
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(0, -size * 0.78);
      g.lineTo(size * 0.58, size * 0.52);
      g.lineTo(size * 0.2, size * 0.34);
      g.lineTo(-size * 0.2, size * 0.34);
      g.lineTo(-size * 0.58, size * 0.52);
      g.closePath();
      g.fill();
      // cockpit
      g.fillStyle = hexA("#0b1220", 0.75);
      g.beginPath();
      g.ellipse(0, -size * 0.14, size * 0.2, size * 0.26, 0, 0, Math.PI * 2);
      g.fill();
      // headlight
      g.fillStyle = hexA("#ffffff", 0.9);
      g.fillRect(-2, -size * 0.8, 4, 5);
      g.restore();
    }

    // ---- HUD ----
    drawCombo(g, combo, W / 2, H * 0.13, pal.prize, th.fontDisplay, clock);
    g.textAlign = "center";
    g.fillStyle = hexA(ink.main, 0.35);
    g.font = `700 12px ${th.fontBody}`;
    g.fillText(`${Math.round(speed)} KM/H`, W / 2, H * 0.18);
    if (score === 0 && !over) {
      g.fillStyle = hexA("#ffffff", 0.4 + pulse(clock, 1.5) * 0.4);
      g.font = `700 14px ${th.fontBody}`;
      g.fillText("tap anywhere to switch lanes", W / 2, H * 0.62);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: "crashed",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `${sparks} sparks · ${nearMiss} close calls`,
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
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
