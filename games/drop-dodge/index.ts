import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand, clamp, roundRect } from "@/games/engine";
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
  slug: "drop-dodge",
  title: "Crumb Field",
  rule: "Drag through the gaps. Shave them for points",
  year: 2008,
  description: "Falling granola. Tiny gaps. One shield between you and the carpet.",
  history:
    "Homage to the first wave of dodgers on the 2008 App Store, back when steering with your phone felt like the future. Ours trades tilt for a thumb and a very messy desk.",
  tags: ["endurance", "drag", "chaos"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#b07a3c",
    deep: "#171a24",
    glow: "#c9d3dc",
  },
  intensity: 0.75,
  luck: 0.2,
  nostalgia: 0.3,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 14,
} satisfies GameModule["meta"];

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  passed: boolean;
  grazed: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(4, 3.5);

  const R = 14;
  const py = H * 0.72; // clear of the feed caption
  let px = W / 2;
  let targetX = W / 2;
  let vx = 0;
  let score = 0;
  let best = 0;
  let over = false;
  let overAge = 0;
  let blocks: Block[] = [];
  let spawnIn = 0.7;
  let speed = 210;
  let shield = 1; // one hit absorbed per run, re-earned every 25 points
  let shieldAt = 25;
  let invuln = 0;
  let clock = 0;
  let grazes = 0;
  let depth = 0; // distance travelled, for the backdrop parallax

  const reset = () => {
    score = 0;
    over = false;
    overAge = 0;
    blocks = [];
    spawnIn = 0.7;
    speed = 210;
    shield = 1;
    shieldAt = 25;
    invuln = 0;
    grazes = 0;
    px = targetX = W / 2;
    vx = 0;
    combo.clear();
    fx.clear();
    ctx.onScore(0);
  };

  const onMove = (e: PointerEvent) => {
    const rect = ctx.canvas.getBoundingClientRect();
    targetX = clamp(e.clientX - rect.left, R, W - R);
  };
  const onDown = (e: PointerEvent) => {
    if (over) {
      if (overAge > 0.3) reset();
      return;
    }
    ctx.canvas.setPointerCapture(e.pointerId);
    onMove(e);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);

  let auto = false;

  const hit = (bx: number, by: number) => {
    const th = ctx.getTheme();
    if (invuln > 0) return;
    combo.break();
    ctx.haptic("fail");
    if (shield > 0) {
      shield -= 1;
      invuln = 1.1;
      fx.shake(11);
      fx.flash(pal.prize, 0.3);
      fx.ring(px, py, pal.prize, 32, 6);
      fx.pop(px, py - 46, "SHIELD GONE", pal.prize, 20, th.fontDisplay);
      // shove the offending wall past you rather than pretending it missed
      for (const b of blocks) {
        if (b.y + b.h > py - R * 2 && b.y < py + R * 2) b.y = py + R * 3;
      }
      return;
    }
    over = true;
    overAge = 0;
    best = Math.max(best, score);
    fx.shake(20);
    fx.flash(pal.foe, 0.4);
    fx.burst(bx, by, {
      count: 34,
      colour: [pal.hero, pal.foe, "#ffffff"],
      speed: 380,
      life: 0.9,
      size: 5,
      gravity: 600,
    });
    ctx.onRunEnd(score);
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
      depth += speed * dt;
      invuln = Math.max(0, invuln - dt);
      // attract mode: aim at the widest gap beside the nearest incoming wall
      if (auto) {
        let threat: Block | null = null;
        for (const b of blocks)
          if (b.y < py && (!threat || b.y > threat.y)) threat = b;
        if (threat) {
          const leftGap = threat.x;
          const rightGap = W - (threat.x + threat.w);
          targetX = leftGap > rightGap ? leftGap / 2 : W - rightGap / 2;
          targetX = clamp(targetX, R, W - R);
        } else {
          targetX = W / 2;
        }
      }
      const prev = px;
      px = approach(px, targetX, 0.28, dt);
      vx = (px - prev) / Math.max(dt, 0.0001);

      spawnIn -= dt;
      speed = Math.min(540, speed + dt * 9);
      if (spawnIn <= 0) {
        const w = rand(W * 0.24, W * 0.52);
        blocks.push({
          x: rand(0, W - w),
          y: -40,
          w,
          h: 34,
          passed: false,
          grazed: false,
        });
        spawnIn = clamp(0.85 - score * 0.003, 0.36, 0.85);
      }

      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        b.y += speed * dt;

        // circle-rect collision
        const cx = clamp(px, b.x, b.x + b.w);
        const cy = clamp(py, b.y, b.y + b.h);
        const d2 = (px - cx) ** 2 + (py - cy) ** 2;
        if (d2 < R * R) hit(cx, cy);

        // a graze: passing within a hair of the wall while it goes by
        if (!b.grazed && d2 < (R + 16) ** 2 && b.y + b.h > py - R) {
          b.grazed = true;
          grazes += 1;
          const gained = combo.hit();
          score += gained;
          ctx.onScore(score);
          fx.burst(cx, cy, {
            count: 8,
            colour: [pal.prize, "#ffffff"],
            speed: 170,
            life: 0.35,
            size: 2.6,
            kind: "spark",
          });
          fx.pop(px, py - 34, `GRAZE +${gained}`, pal.prize, 17, th.fontDisplay);
        }

        if (!b.passed && b.y > py + R) {
          b.passed = true;
          score += 1;
          ctx.onScore(score);
          if (score >= shieldAt && shield < 1) {
            shield = 1;
            shieldAt += 25;
            fx.ring(px, py, pal.prize, 26, 5);
            fx.pop(px, py - 52, "SHIELD UP", pal.prize, 20, th.fontDisplay);
            ctx.haptic("hit");
          }
        }
        if (b.y > H + 60) blocks.splice(i, 1);
      }
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "grid",
      intensity: 0.75,
      scroll: depth,
      vignette: 0.55,
    });

    fx.begin(g);
    fx.drawUnder(g);

    // ---- walls: hazard stripes, a lit leading edge, a shadow beneath
    for (const b of blocks) {
      g.fillStyle = "rgba(0,0,0,.35)";
      roundRect(g, b.x + 2, b.y + 5, b.w, b.h, 8);
      g.fill();
      g.save();
      roundRect(g, b.x, b.y, b.w, b.h, 8);
      g.clip();
      const face = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      face.addColorStop(0, mix(pal.foe, "#ffffff", 0.18));
      face.addColorStop(1, pal.foe);
      g.fillStyle = face;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle = "rgba(0,0,0,.22)";
      for (let s = -b.h; s < b.w; s += 22) {
        g.beginPath();
        g.moveTo(b.x + s, b.y + b.h);
        g.lineTo(b.x + s + b.h, b.y);
        g.lineTo(b.x + s + b.h + 10, b.y);
        g.lineTo(b.x + s + 10, b.y + b.h);
        g.closePath();
        g.fill();
      }
      g.restore();
      g.fillStyle = pal.prize;
      g.fillRect(b.x + 6, b.y + b.h - 4, b.w - 12, 3);
    }

    // ---- the marble: trail, glow, body, highlight
    if (!over) {
      fx.trail(px, py, hexA(pal.hero, 0.5), R * 0.75, 0.28);
    }
    const squash = clamp(Math.abs(vx) / 900, 0, 0.3);
    halo(g, px, py, R * 3.4, over ? pal.foe : pal.hero, 0.45);
    if (invuln > 0 || shield > 0) {
      // the shield bubble, brighter while it is soaking a hit
      const a = shield > 0 ? 0.5 : 0.25;
      g.strokeStyle = hexA(pal.prize, a * (invuln > 0 ? 1 : 0.6 + pulse(clock, 1.2) * 0.4));
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(px, py, R * 1.9, 0, Math.PI * 2);
      g.stroke();
    }
    g.save();
    g.translate(px, py);
    g.scale(1 + squash, 1 - squash);
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    const ball = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    ball.addColorStop(0, "#ffffff");
    ball.addColorStop(0.4, over ? pal.foe : pal.hero);
    ball.addColorStop(1, mix(over ? pal.foe : pal.hero, "#000000", 0.35));
    g.fillStyle = ball;
    g.fill();
    g.restore();

    // ---- HUD
    drawCombo(g, combo, W / 2, H * 0.13, pal.prize, th.fontDisplay, clock);
    g.textAlign = "center";
    if (score === 0 && !over) {
      g.fillStyle = hexA(ink.main, 0.4 + pulse(clock, 1.5) * 0.4);
      g.font = `700 14px ${th.fontBody}`;
      g.fillText("drag to steer — brush a wall to graze", W / 2, H * 0.62);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: "clipped",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `${grazes} grazes · chain ${combo.best}`,
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
      ctx.canvas.removeEventListener("pointermove", onMove);
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
