import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";
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
  title: "Nic's Foot Cam",
  rule: "Tap to kick. Thread it close for bonus",
  year: 2013,
  description: "The camera was pointed down there anyway. Brush the stacks for points.",
  history:
    "Homage to 2013's infamous one-button rage game — pulled from the stores at its peak by its own creator. This one is shot on the basement foot cam.",
  tags: ["reflex", "oneTap", "endurance", "chaos"],
  palette: {
    hero: "#e8b48c",
    foe: "#8d97a3",
    prize: "#e8a33d",
    deep: "#1b2230",
    glow: "#c9d3dc",
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

  // ---- clouds ----
  // They own their own x. They used to be derived from `scroll`, which wraps
  // every 40px for the ground texture — so the whole sky jumped backwards
  // twice a second. Each cloud now drifts continuously and wraps by exactly
  // one span, which keeps the spacing even and the motion seamless.
  interface Cloud {
    x: number;
    y: number;
    w: number;
    par: number; // parallax: far clouds crawl, near ones keep up
    a: number;
  }
  const SPAN = W + 240;
  const clouds: Cloud[] = Array.from({ length: 5 }, (_, i) => ({
    x: (i * SPAN) / 5 - 120,
    y: H * (0.07 + i * 0.1) + rand(-10, 10),
    w: 62 + i * 15,
    par: 0.5 + i * 0.22,
    a: 0.2 + (i % 2) * 0.16,
  }));

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
    fx.flash(th.id === "nic" ? th.danger : pal.foe, 0.3);
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

    // ---- scenery ----
    // Nic's theme redresses the whole card: his sky, his pipes, his face on
    // the bird. Every other theme keeps the game's own palette.
    const nic = th.id === "nic";
    const skyTop = nic ? shade(th.bg, -0.35) : shade(pal.deep, -0.25);
    const skyMid = nic ? th.bg : pal.deep;
    const skyLow = nic ? shade(th.surface, 0.3) : pal.glow;
    const pipeC = nic ? th.accent : pal.foe;
    const sunC = nic ? th.accentAlt : "#ffffff";

    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, skyTop);
    sky.addColorStop(0.55, skyMid);
    sky.addColorStop(1, skyLow);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // a low sun, so the sky has a focal point
    halo(g, W * 0.78, H * 0.2, W * 0.5, sunC, nic ? 0.14 : 0.18);

    // drifting clouds — a wind of their own, plus a share of the pipe speed
    const wind = W * 0.05 + (started && !over ? speed * 0.22 : 0);
    for (const c of clouds) {
      c.x -= wind * c.par * dt;
      while (c.x < -c.w) c.x += SPAN;
      // on a dark sky a bright tint turns to mud, so Nic's clouds stay faint
      g.fillStyle = hexA(nic ? th.ink : "#ffffff", nic ? c.a * 0.4 : c.a);
      g.beginPath();
      g.arc(c.x, c.y, c.w * 0.28, 0, Math.PI * 2);
      g.arc(c.x + c.w * 0.3, c.y + 4, c.w * 0.22, 0, Math.PI * 2);
      g.arc(c.x - c.w * 0.28, c.y + 5, c.w * 0.19, 0, Math.PI * 2);
      g.fill();
    }

    fx.begin(g);
    fx.drawUnder(g);

    // ---- pipes ----
    for (const p of pipes) {
      const body = g.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
      body.addColorStop(0, shade(pipeC, -0.22));
      body.addColorStop(0.35, pipeC);
      body.addColorStop(1, shade(pipeC, -0.32));
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
    g.fillStyle = shade(pipeC, -0.45);
    g.fillRect(0, H - GROUND, W, GROUND);
    g.fillStyle = shade(pipeC, -0.1);
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
      if (nic) {
        // ---- Nic mode: the same flight model, wearing his face ----
        const beat = flap > 0 ? -1.0 : 0.3;
        // wings, drawn behind the head
        for (const s of [-1, 1]) {
          g.save();
          g.translate(s * R * 1.15, R * 0.2);
          g.rotate(s * beat);
          g.beginPath();
          g.ellipse(s * R * 0.4, 0, R * 0.82, R * 0.26, 0, 0, Math.PI * 2);
          g.fillStyle = hexA(th.accentAlt, 0.9);
          g.fill();
          g.strokeStyle = "rgba(0,0,0,.25)";
          g.lineWidth = 1.5;
          g.stroke();
          g.restore();
        }
        const skin = over ? "#c69070" : "#e8b489";
        // head
        g.beginPath();
        g.ellipse(0, R * 0.05, R * 0.92, R * 1.02, 0, 0, Math.PI * 2);
        g.fillStyle = skin;
        g.fill();
        g.strokeStyle = "rgba(0,0,0,.3)";
        g.lineWidth = 2;
        g.stroke();
        // ears
        g.beginPath();
        g.ellipse(-R * 0.9, R * 0.12, R * 0.16, R * 0.24, 0, 0, Math.PI * 2);
        g.ellipse(R * 0.9, R * 0.12, R * 0.16, R * 0.24, 0, 0, Math.PI * 2);
        g.fillStyle = skin;
        g.fill();
        // stubble along the jaw
        g.beginPath();
        g.ellipse(0, R * 0.52, R * 0.66, R * 0.4, 0, 0, Math.PI * 2);
        g.fillStyle = hexA("#3b2b2b", 0.28);
        g.fill();
        // hair: one stubborn swoop, same as the basement
        g.fillStyle = "#2b2233";
        g.beginPath();
        g.moveTo(-R * 0.95, -R * 0.3);
        g.quadraticCurveTo(-R * 0.7, -R * 1.3, R * 0.15, -R * 1.1);
        g.quadraticCurveTo(R * 1.05, -R * 1.0, R * 0.9, -R * 0.18);
        g.quadraticCurveTo(R * 0.55, -R * 0.66, R * 0.05, -R * 0.52);
        g.quadraticCurveTo(-R * 0.45, -R * 0.44, -R * 0.95, -R * 0.3);
        g.closePath();
        g.fill();
        // eyes — wide open, because this is terrifying
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.ellipse(-R * 0.3, 0, R * 0.24, R * 0.22, 0, 0, Math.PI * 2);
        g.ellipse(R * 0.36, -R * 0.02, R * 0.24, R * 0.22, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#1b1b1f";
        const look = over ? -R * 0.1 : R * 0.08;
        g.beginPath();
        g.arc(-R * 0.3 + look, R * 0.02, R * 0.1, 0, Math.PI * 2);
        g.arc(R * 0.36 + look, 0, R * 0.1, 0, Math.PI * 2);
        g.fill();
        // brows
        g.strokeStyle = "#2b2233";
        g.lineWidth = Math.max(1, R * 0.12);
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(-R * 0.58, -R * 0.34);
        g.lineTo(-R * 0.06, -R * 0.26);
        g.moveTo(R * 0.12, -R * 0.28);
        g.lineTo(R * 0.62, -R * 0.38);
        g.stroke();
        // mouth: open on the flap, flat when it all goes wrong
        g.fillStyle = "#5a2b32";
        g.beginPath();
        if (over) {
          g.ellipse(R * 0.05, R * 0.5, R * 0.26, R * 0.08, 0, 0, Math.PI * 2);
        } else {
          g.ellipse(
            R * 0.05,
            R * 0.5,
            R * 0.22,
            flap > 0 ? R * 0.26 : R * 0.12,
            0,
            0,
            Math.PI * 2
          );
        }
        g.fill();
      } else {
        // body
        drawNicHead(g, {
          x: 0,
          y: 0,
          r: R * 1.1,
          skin: over ? shade(pal.hero, -0.3) : pal.hero,
          hair: shade(pal.deep, -0.4),
          eye: th.ink,
          pupil: shade(pal.deep, -0.65),
          dark: shade(pal.deep, -0.65),
          tooth: th.ink,
          gape: over ? 0.9 : 0,
          scowl: over ? 1 : 0,
        });
        g.beginPath();
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
      }
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
