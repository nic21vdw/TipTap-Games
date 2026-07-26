import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, clamp, roundRect } from "@/games/engine";
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
  easeOutCubic,
  groundInk,
} from "@/games/fx";

const meta = {
  slug: "split",
  title: "Stack Raid",
  rule: "Grab left or right. Dodge the jars",
  year: 2014,
  description: "Grab fast. Watch the jars. The timer only takes.",
  history:
    "Homage to the 2014 side-switching lumberjack sprint — the purest speed test the app stores ever produced, aimed at a shelf stacked far too high.",
  tags: ["reflex", "oneTap", "chaos"],
  palette: {
    hero: "#e8b48c",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#c9d3dc",
  },
  intensity: 0.85,
  luck: 0.05,
  nostalgia: 0.4,
  sessionLength: 0.25,
  scoreUnit: "pts",
  maxScorePerSecond: 16,
} satisfies GameModule["meta"];

type Branch = -1 | 0 | 1; // left, none, right

interface Chunk {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  life: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(5, 1.6);

  const segH = H * 0.11;
  const trunkW = W * 0.2;
  const baseY = H * 0.76;

  let segs: Branch[] = [];
  let seeds: number[] = []; // per-segment grain seed, so the wood looks cut
  let side: -1 | 1 = -1;
  let score = 0;
  let best = 0;
  let over = false;
  let overAge = 0;
  let fuel = 1; // depletes; chops refill
  let shift = 0; // 0..1 scroll of the trunk between chops
  let swing = 0; // axe animation
  let chunks: Chunk[] = [];
  let clock = 0;
  let ranOut = false;

  const nextBranch = (prev: Branch): Branch => {
    // never two branches in a row on random side-traps; keep it fair but mean
    if (prev !== 0) return 0;
    const r = Math.random();
    return r < 0.4 ? -1 : r < 0.8 ? 1 : 0;
  };

  const reset = () => {
    segs = [0, 0, 0];
    while (segs.length < 9) segs.push(nextBranch(segs[segs.length - 1]));
    seeds = segs.map(() => Math.random() * 1000);
    side = -1;
    score = 0;
    fuel = 1;
    over = false;
    overAge = 0;
    ranOut = false;
    shift = 0;
    chunks = [];
    combo.clear();
    fx.clear();
    ctx.onScore(0);
  };

  const px = () =>
    side === -1 ? W / 2 - trunkW / 2 - W * 0.13 : W / 2 + trunkW / 2 + W * 0.13;

  const chop = (dirSide: -1 | 1) => {
    const th = ctx.getTheme();
    side = dirSide;
    swing = 0.16;
    // the log leaves the stack and flies off the far side
    chunks.push({
      x: W / 2,
      y: baseY - segH * 0.5,
      vx: -dirSide * (380 + Math.random() * 120),
      vy: -180,
      rot: 0,
      spin: -dirSide * 8,
      life: 1.4,
    });
    segs.shift();
    seeds.shift();
    segs.push(nextBranch(segs[segs.length - 1]));
    seeds.push(Math.random() * 1000);
    shift = 1;

    if (segs[0] === side) {
      over = true;
      overAge = 0;
      ranOut = false;
      best = Math.max(best, score);
      combo.break();
      ctx.haptic("fail");
      fx.shake(18);
      fx.flash(pal.foe, 0.38);
      fx.burst(px(), baseY - segH * 0.6, {
        count: 24,
        colour: [pal.foe, pal.hero],
        speed: 300,
        life: 0.8,
        size: 4.5,
        gravity: 700,
      });
      ctx.onRunEnd(score);
      return;
    }

    const gained = combo.hit();
    score += gained;
    fuel = Math.min(1, fuel + 0.085);
    ctx.onScore(score);
    ctx.haptic("hit");
    // wood chips fly out of the cut, away from the axe
    fx.burst(W / 2 - dirSide * trunkW * 0.4, baseY - segH * 0.5, {
      count: 12,
      colour: [pal.hero, mix(pal.hero, "#000000", 0.35), "#ffffff"],
      speed: 240,
      life: 0.5,
      size: 3.4,
      gravity: 900,
      angle: dirSide === 1 ? Math.PI : 0,
      spread: 0.9,
      kind: "square",
    });
    if (combo.mult > 1 && score % 5 === 0) {
      fx.pop(W / 2, baseY - segH * 2, `x${combo.mult}`, pal.prize, 22, th.fontDisplay);
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      if (overAge > 0.3) reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    chop(e.clientX - r.left < W / 2 ? -1 : 1);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    combo.update(dt);
    shift = Math.max(0, shift - dt * 11);
    swing = Math.max(0, swing - dt);

    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i];
      c.life -= dt;
      c.vy += 1400 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.spin * dt;
      if (c.life <= 0) chunks.splice(i, 1);
    }

    if (over) {
      overAge += dt;
    } else {
      // attract mode: always chop from the branch-free side
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          chop(segs[0] === -1 ? 1 : -1);
          autoCd = 0.17;
        }
      }
      fuel -= dt * (0.115 + score * 0.0022);
      if (fuel <= 0) {
        fuel = 0;
        over = true;
        overAge = 0;
        ranOut = true;
        best = Math.max(best, score);
        combo.break();
        ctx.haptic("fail");
        fx.shake(12);
        fx.flash(pal.foe, 0.3);
        ctx.onRunEnd(score);
      }
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "hills",
      intensity: 0.7,
      scroll: score * 40,
      vignette: 0.55,
    });

    fx.begin(g);
    fx.drawUnder(g);

    // ---- the forest floor
    const floor = g.createLinearGradient(0, baseY + segH * 0.4, 0, H);
    floor.addColorStop(0, mix(pal.deep, "#000000", 0.15));
    floor.addColorStop(1, mix(pal.deep, "#000000", 0.55));
    g.fillStyle = floor;
    g.fillRect(0, baseY + segH * 0.4, W, H - baseY);

    // ---- the trunk
    const scrollY = shift * segH;
    for (let i = 0; i < segs.length; i++) {
      const y = baseY - (i + 1) * segH - scrollY;
      if (y > H) continue;
      const x = W / 2 - trunkW / 2;
      const h = segH - 3;

      // bark
      const bark = g.createLinearGradient(x, 0, x + trunkW, 0);
      bark.addColorStop(0, mix(pal.hero, "#000000", 0.5));
      bark.addColorStop(0.35, mix(pal.hero, "#000000", 0.18));
      bark.addColorStop(0.75, pal.hero);
      bark.addColorStop(1, mix(pal.hero, "#000000", 0.45));
      g.fillStyle = bark;
      g.fillRect(x, y, trunkW, h);
      // grain
      g.strokeStyle = hexA("#000000", 0.14);
      g.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const gx = x + 6 + ((seeds[i] + k * 137) % (trunkW - 12));
        g.beginPath();
        g.moveTo(gx, y + 3);
        g.lineTo(gx + Math.sin(seeds[i] + k) * 3, y + h - 3);
        g.stroke();
      }
      // the cut line between logs
      g.fillStyle = hexA("#000000", 0.35);
      g.fillRect(x, y + h - 2, trunkW, 3);

      if (segs[i] !== 0) {
        const bw = W * 0.24;
        const bx = segs[i] === -1 ? x - bw : x + trunkW;
        const by = y + segH * 0.2;
        const bh = segH * 0.34;
        // branch
        const br = g.createLinearGradient(0, by, 0, by + bh);
        br.addColorStop(0, mix(pal.hero, "#000000", 0.3));
        br.addColorStop(1, mix(pal.hero, "#000000", 0.6));
        g.fillStyle = br;
        roundRect(g, bx, by, bw, bh, 5);
        g.fill();
        // leaves at the tip, so the danger side reads instantly
        const tipX = segs[i] === -1 ? bx : bx + bw;
        for (let k = 0; k < 3; k++) {
          g.fillStyle = mix(pal.glow, "#000000", k * 0.14);
          g.beginPath();
          g.ellipse(
            tipX + (segs[i] === -1 ? -1 : 1) * (k * 7 - 4),
            by + bh / 2 + (k - 1) * 11,
            16,
            9,
            (segs[i] === -1 ? -0.4 : 0.4) + k * 0.2,
            0,
            Math.PI * 2
          );
          g.fill();
        }
      }
    }

    // flying logs
    for (const c of chunks) {
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.rot);
      g.globalAlpha = clamp(c.life, 0, 1);
      g.fillStyle = mix(pal.hero, "#000000", 0.25);
      roundRect(g, -trunkW / 2, -segH * 0.4, trunkW, segH * 0.8, 6);
      g.fill();
      g.fillStyle = hexA("#f6e0b5", 0.9);
      g.beginPath();
      g.ellipse(-trunkW / 2, 0, 5, segH * 0.4, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;

    // ---- the lumberjack
    const lx = px();
    const ly = baseY - segH * 0.15;
    const face = side === -1 ? 1 : -1; // faces the trunk
    g.save();
    g.translate(lx, ly);
    g.scale(face, 1);
    // shadow
    g.fillStyle = "rgba(0,0,0,.35)";
    g.beginPath();
    g.ellipse(0, 34, 22, 6, 0, 0, Math.PI * 2);
    g.fill();
    // legs
    g.fillStyle = mix(pal.deep, "#000000", 0.2);
    roundRect(g, -11, 8, 9, 26, 4);
    g.fill();
    roundRect(g, 3, 8, 9, 26, 4);
    g.fill();
    // body
    const shirt = over && !ranOut ? pal.foe : pal.prize;
    g.fillStyle = shirt;
    roundRect(g, -14, -16, 28, 28, 8);
    g.fill();
    g.fillStyle = hexA("#000000", 0.18);
    for (let k = -12; k < 14; k += 9) g.fillRect(k, -16, 3, 28);
    // head
    g.fillStyle = "#f3c9a0";
    g.beginPath();
    g.arc(2, -26, 11, 0, Math.PI * 2);
    g.fill();
    // beard + hat, because a lumberjack needs both
    g.fillStyle = mix(pal.hero, "#000000", 0.35);
    g.beginPath();
    g.arc(4, -22, 8, -0.2, Math.PI - 0.5);
    g.fill();
    g.fillStyle = pal.foe;
    roundRect(g, -9, -38, 22, 8, 3);
    g.fill();
    // the axe, swinging on the chop
    const sw = easeOutCubic(clamp(swing / 0.16, 0, 1));
    g.save();
    g.translate(10, -8);
    g.rotate(-0.9 + sw * 1.7);
    g.strokeStyle = mix(pal.hero, "#000000", 0.45);
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(30, -4);
    g.stroke();
    g.lineCap = "butt";
    g.fillStyle = "#cfd6dd";
    g.beginPath();
    g.moveTo(28, -12);
    g.lineTo(42, -8);
    g.lineTo(42, 4);
    g.lineTo(28, 4);
    g.closePath();
    g.fill();
    g.restore();
    g.restore();

    // ---- the timer, a fuse burning down the left edge where nothing else lives
    const fh = H * 0.42;
    const fy = H * 0.2;
    const fx0 = 16;
    g.fillStyle = hexA("#000000", 0.4);
    roundRect(g, fx0, fy, 12, fh, 6);
    g.fill();
    const low = fuel < 0.3;
    const meter = g.createLinearGradient(0, fy + fh, 0, fy);
    meter.addColorStop(0, low ? pal.foe : pal.glow);
    meter.addColorStop(1, low ? mix(pal.foe, "#ffffff", 0.3) : pal.prize);
    g.fillStyle = meter;
    const lit = Math.max(6, fh * fuel);
    roundRect(g, fx0, fy + fh - lit, 12, lit, 6);
    g.fill();
    if (low && !over) {
      halo(g, fx0 + 6, fy + fh - lit, 30, pal.foe, 0.4 + pulse(clock, 0.4) * 0.4);
    }

    // ---- HUD
    drawCombo(g, combo, W / 2, H * 0.12, pal.prize, th.fontDisplay, clock);
    g.textAlign = "center";
    if (score === 0 && !over) {
      g.fillStyle = hexA(ink.main, 0.4 + pulse(clock, 1.5) * 0.4);
      g.font = `700 14px ${th.fontBody}`;
      g.fillText("tap the side without a branch", W / 2, H * 0.19);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: ranOut ? "out of time" : "branched",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `best chain ${combo.best}`,
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
