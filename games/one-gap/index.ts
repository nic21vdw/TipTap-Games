import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand, shade, clamp } from "@/games/engine";
import {
  createFx,
  createCombo,
  resultCard,
  drawCombo,
  hexA,
  halo,
  pulse,
  vignette,
} from "@/games/fx";

const meta = {
  slug: "one-gap",
  title: "One Gap",
  rule: "Tap to flap. Thread it close for bonus",
  year: 2013,
  description: "Tap to flap. The gap is smaller than your ego — brush it for points.",
  history:
    "Homage to 2013's infamous one-button rage game — pulled from the stores at its peak by its own creator, never really gone since. Ours pays you for cutting it fine, and gives you exactly one save.",
  tags: ["reflex", "oneTap", "endurance", "chaos"],
  palette: {
    hero: "#ffd166",
    foe: "#1f9c5a",
    prize: "#ffffff",
    deep: "#0b6f9e",
    glow: "#8ecae6",
  },
  intensity: 0.7,
  speed: 0.8,
  difficulty: 0.8,
  luck: 0.1,
  nostalgia: 0.6,
  realism: 0.2,
  kidSafe: true,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

interface Pipe {
  x: number;
  gapY: number;
  passed: boolean;
  /** flashes when you thread it tight */
  lit: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(3);

  const bx = W * 0.3;
  const R = 15;
  const GAP = H * 0.26;
  const PIPE_W = 62;
  const GROUND = H * 0.2; // the floor stays visible above the feed caption
  let by = H / 2;
  let vy = 0;
  let pipes: Pipe[] = [];
  let spawnIn = 0;
  let score = 0;
  let best = 0;
  let over = false;
  let overAge = 0;
  let started = false;
  let auto = false;
  let scroll = 0;
  let flap = 0; // wing animation clock
  let save = true; // one second wind per run
  let invuln = 0;
  let clock = 0;
  let threaded = 0; // tight passes this run
  let dead = false; // ragdoll after the final crash

  const reset = () => {
    by = H / 2;
    vy = 0;
    pipes = [];
    spawnIn = 0.4;
    score = 0;
    over = false;
    overAge = 0;
    started = false;
    save = true;
    invuln = 0;
    threaded = 0;
    dead = false;
    combo.clear();
    fx.clear();
    ctx.onScore(0);
  };

  const onDown = () => {
    if (over) {
      if (overAge > 0.3) reset();
      return;
    }
    started = true;
    vy = -H * 0.55;
    flap = 0.22;
    ctx.haptic("light");
    // a puff of air under the wing
    fx.burst(bx - R, by + R * 0.4, {
      count: 4,
      colour: hexA("#ffffff", 0.9),
      speed: 70,
      life: 0.35,
      size: 3,
      angle: Math.PI * 0.75,
      spread: 0.5,
    });
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  const crash = () => {
    const th = ctx.getTheme();
    if (invuln > 0) return;
    combo.break();
    ctx.haptic("fail");
    fx.shake(15);
    fx.burst(bx, by, {
      count: 20,
      colour: [pal.hero, "#ffffff"],
      speed: 240,
      life: 0.8,
      size: 4,
      gravity: 700,
    });
    if (save) {
      // second wind: one free crash per run, then you are on your own
      save = false;
      invuln = 1.3;
      vy = -H * 0.5;
      by = clamp(by, GAP * 0.6, H - GROUND - GAP * 0.6);
      fx.flash(pal.prize, 0.35);
      fx.ring(bx, by, pal.prize, 30, 6);
      fx.pop(bx, by - 46, "SAVED", pal.prize, 24, th.fontDisplay);
      // clear the pipe you were inside, so the save is actually a save
      for (const p of pipes) {
        if (p.x < bx + R + 20 && p.x + PIPE_W > bx - R - 20) p.x = -PIPE_W - 1;
      }
      return;
    }
    over = true;
    overAge = 0;
    dead = true;
    best = Math.max(best, score);
    fx.flash(pal.foe, 0.3);
    ctx.onRunEnd(score);
  };

  reset();

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    clock += dt;
    fx.update(dt);
    combo.update(dt);
    if (over) overAge += dt;

    if (auto) {
      started = true;
      const next = pipes.find((p) => p.x + PIPE_W > bx - R);
      const aim = next ? next.gapY - GAP * 0.12 : H / 2;
      if (by > aim && vy > -H * 0.1) {
        vy = -H * 0.55;
        flap = 0.22;
      }
    }
    const speed = W * 0.42 + score * 1.6;
    if (!over && started) {
      invuln = Math.max(0, invuln - dt);
      vy += H * 1.5 * dt;
      by += vy * dt;
      flap = Math.max(0, flap - dt);
      scroll = (scroll + speed * dt) % 40;
      spawnIn -= dt;
      if (spawnIn <= 0) {
        pipes.push({
          x: W + PIPE_W,
          gapY: rand(GAP * 0.75, H - GROUND - GAP * 0.75),
          passed: false,
          lit: 0,
        });
        spawnIn = 1.6;
      }
      for (let i = pipes.length - 1; i >= 0; i--) {
        const p = pipes[i];
        p.x -= speed * dt;
        p.lit = Math.max(0, p.lit - dt);
        if (!p.passed && p.x + PIPE_W < bx - R) {
          p.passed = true;
          // threading it close is worth more than sailing through the middle
          const off = Math.abs(by - p.gapY);
          const tight = off > GAP * 0.32;
          const mult = combo.hit();
          const gained = (tight ? 2 : 1) * mult;
          score += gained;
          threaded += tight ? 1 : 0;
          ctx.onScore(score);
          ctx.haptic("hit");
          p.lit = 0.4;
          fx.pop(
            bx + 30,
            by - 34,
            tight ? `THREAD +${gained}` : `+${gained}`,
            tight ? pal.prize : pal.hero,
            tight ? 21 : 18,
            th.fontDisplay
          );
          if (tight) {
            fx.burst(bx + 20, by, {
              count: 12,
              colour: [pal.prize, pal.glow],
              speed: 180,
              life: 0.4,
              size: 3,
            });
          }
        }
        if (p.x < -PIPE_W) pipes.splice(i, 1);
        const inX = bx + R > p.x && bx - R < p.x + PIPE_W;
        const inGap = by - R > p.gapY - GAP / 2 && by + R < p.gapY + GAP / 2;
        if (inX && !inGap) crash();
      }
      if (by + R > H - GROUND || by - R < 0) crash();
    } else if (dead) {
      // the ragdoll: the bird keeps falling after the run ends
      vy += H * 2.2 * dt;
      by = Math.min(H - GROUND - R, by + vy * dt);
    }

    // ---- sky ----
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, -0.25));
    sky.addColorStop(0.55, pal.deep);
    sky.addColorStop(1, pal.glow);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // a low sun, so the sky has a focal point
    halo(g, W * 0.78, H * 0.2, W * 0.5, "#ffffff", 0.18);

    // drifting clouds, parallax at a third of pipe speed
    g.fillStyle = "rgba(255,255,255,.5)";
    for (let i = 0; i < 4; i++) {
      const cw = 70 + i * 18;
      const cx = ((i * 137 + scroll * 0.33 * (i + 1) + clock * 6) % (W + 160)) - 80;
      const cy = H * (0.12 + i * 0.13);
      g.beginPath();
      g.arc(cx, cy, cw * 0.28, 0, Math.PI * 2);
      g.arc(cx + cw * 0.3, cy + 4, cw * 0.22, 0, Math.PI * 2);
      g.arc(cx - cw * 0.28, cy + 5, cw * 0.19, 0, Math.PI * 2);
      g.fill();
    }

    fx.begin(g);
    fx.drawUnder(g);

    // ---- pipes ----
    for (const p of pipes) {
      const body = g.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
      body.addColorStop(0, shade(pal.foe, -0.22));
      body.addColorStop(0.35, pal.foe);
      body.addColorStop(1, shade(pal.foe, -0.32));
      const capH = 22;
      const topH = p.gapY - GAP / 2;
      const botY = p.gapY + GAP / 2;
      g.fillStyle = body;
      g.fillRect(p.x, 0, PIPE_W, topH - capH);
      g.fillRect(p.x, botY + capH, PIPE_W, H - botY - capH);
      // lips
      g.fillRect(p.x - 5, topH - capH, PIPE_W + 10, capH);
      g.fillRect(p.x - 5, botY, PIPE_W + 10, capH);
      g.fillStyle = "rgba(255,255,255,.22)";
      g.fillRect(p.x + 6, 0, 7, topH - capH);
      g.fillRect(p.x + 6, botY + capH, 7, H - botY - capH);
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(p.x - 5, topH - 3, PIPE_W + 10, 3);
      g.fillRect(p.x - 5, botY, PIPE_W + 10, 3);
      // a hard rim, so the pipes never blend into the sky behind them
      g.strokeStyle = "rgba(0,0,0,.35)";
      g.lineWidth = 2;
      g.strokeRect(p.x - 5, topH - capH, PIPE_W + 10, capH);
      g.strokeRect(p.x - 5, botY, PIPE_W + 10, capH);
      if (p.lit > 0) {
        g.fillStyle = hexA(pal.prize, p.lit);
        g.fillRect(p.x - 5, topH - capH, PIPE_W + 10, capH);
        g.fillRect(p.x - 5, botY, PIPE_W + 10, capH);
      }
    }

    // ---- ground ----
    g.fillStyle = shade(pal.foe, -0.45);
    g.fillRect(0, H - GROUND, W, GROUND);
    g.fillStyle = shade(pal.foe, -0.1);
    g.fillRect(0, H - GROUND, W, 7);
    g.fillStyle = "rgba(0,0,0,.14)";
    for (let x = -scroll; x < W; x += 40) g.fillRect(x, H - GROUND + 7, 20, 5);

    // ---- bird ----
    const blink = invuln > 0 && Math.floor(invuln * 12) % 2 === 0;
    if (!blink) {
      const tilt = clamp(vy / (H * 0.9), -0.5, 1.1);
      if (invuln > 0) halo(g, bx, by, 44, pal.prize, 0.45);
      g.save();
      g.translate(bx, by);
      g.rotate(tilt);
      // body
      g.beginPath();
      g.ellipse(0, 0, R * 1.25, R, 0, 0, Math.PI * 2);
      g.fillStyle = over ? shade(pal.hero, -0.3) : pal.hero;
      g.fill();
      g.strokeStyle = "rgba(0,0,0,.28)";
      g.lineWidth = 2;
      g.stroke();
      // belly
      g.beginPath();
      g.ellipse(-2, 4, R * 0.72, R * 0.5, 0, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,.55)";
      g.fill();
      // wing — flaps on tap
      const wing = flap > 0 ? -0.9 : 0.25;
      g.save();
      g.translate(-3, -1);
      g.rotate(wing);
      g.beginPath();
      g.ellipse(0, 0, R * 0.62, R * 0.42, 0, 0, Math.PI * 2);
      g.fillStyle = shade(pal.hero, -0.28);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,.22)";
      g.lineWidth = 1.5;
      g.stroke();
      g.restore();
      // beak
      g.beginPath();
      g.moveTo(R * 1.15, -1);
      g.lineTo(R * 1.85, 3);
      g.lineTo(R * 1.1, 7);
      g.closePath();
      g.fillStyle = "#f4802f";
      g.fill();
      // eye
      g.beginPath();
      g.arc(R * 0.55, -R * 0.35, R * 0.3, 0, Math.PI * 2);
      g.fillStyle = "#fff";
      g.fill();
      g.beginPath();
      g.arc(over ? R * 0.5 : R * 0.66, -R * 0.35, R * 0.14, 0, Math.PI * 2);
      g.fillStyle = "#1b1b1f";
      g.fill();
      g.restore();
    }

    // ---- HUD ----
    drawCombo(g, combo, W / 2, H * 0.16, pal.prize, th.fontDisplay, clock);
    if (save && started && !over) {
      g.textAlign = "center";
      g.fillStyle = hexA(pal.prize, 0.75);
      g.font = `800 12px ${th.fontBody}`;
      g.fillText("★ 1 SAVE", W / 2, H * 0.1);
      g.textAlign = "left";
    }

    g.textAlign = "center";
    if (!started && !over) {
      g.fillStyle = hexA("#ffffff", 0.5 + pulse(clock, 1.4) * 0.45);
      g.font = `800 18px ${th.fontBody}`;
      g.fillText("tap to start flapping", W / 2, H * 0.3);
      g.fillStyle = "rgba(255,255,255,.6)";
      g.font = `700 13px ${th.fontBody}`;
      g.fillText("brush the lip for double points", W / 2, H * 0.34);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    vignette(g, W, H, 0.35);

    if (over) {
      resultCard(g, th, W, H, {
        title: "down",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `${threaded} threaded · chain ${combo.best}`,
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
