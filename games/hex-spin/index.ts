import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "hex-spin",
  title: "Nic's Hex Spin",
  rule: "Tap left or right to orbit through the gaps.",
  year: 2012,
  description: "Spin the wedge. Thread every closing ring.",
  history:
    "Homage to the 2012 orbit-and-thread arcade wave — one wedge circling a point, spinning walls closing in, a single misaligned gap and it's over.",
  tags: ["reflex", "precision", "chaos"],
  palette: {
    hero: "#f72585",
    foe: "#4361ee",
    prize: "#4cc9f0",
    deep: "#10002b",
    glow: "#7209b7",
  },
  intensity: 0.9,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

interface Ring {
  r: number; // current radius, shrinks toward 0
  gapCenter: number; // radians
  gapWidth: number; // radians
  spin: number; // rad/sec, own rotation
  checked: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const cx = W / 2;
  const cy = H / 2;
  const orbitR = Math.min(W, H) * 0.22;
  const maxR = Math.hypot(W, H) * 0.54;
  const wedgeSize = Math.min(W, H) * 0.045;

  let angle = 0;
  let omega = 0;
  let targetOmega = 0;
  const OMEGA_MAX = Math.PI * 1.6;

  let rings: Ring[] = [];
  let spawnT = 0;
  let spawnEvery = 1.3;
  let shrinkSpeed = maxR * 0.32;
  let gapWidth = 0.95;

  let score = 0;
  let over = false;
  let elapsed = 0;

  const spawnRing = () => {
    rings.push({
      r: maxR,
      gapCenter: Math.random() * Math.PI * 2,
      gapWidth: Math.max(0.4, gapWidth),
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 1.1),
      checked: false,
    });
  };

  const reset = () => {
    angle = 0;
    omega = 0;
    targetOmega = 0;
    rings = [];
    spawnT = 0;
    spawnEvery = 1.3;
    shrinkSpeed = maxR * 0.32;
    gapWidth = 0.95;
    score = 0;
    over = false;
    elapsed = 0;
    ctx.onScore(0);
  };

  const normAngle = (a: number) => {
    let x = a % (Math.PI * 2);
    if (x < 0) x += Math.PI * 2;
    return x;
  };

  const setSide = (clientX: number) => {
    const r = ctx.canvas.getBoundingClientRect();
    const left = clientX - r.left < W / 2;
    targetOmega = left ? -OMEGA_MAX : OMEGA_MAX;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    setSide(e.clientX);
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      elapsed += dt;
      spawnEvery = Math.max(0.55, 1.3 - elapsed * 0.02);
      shrinkSpeed = maxR * (0.32 + Math.min(0.5, elapsed * 0.012));
      gapWidth = Math.max(0.42, 0.95 - elapsed * 0.012);

      if (auto) {
        // greedy: steer the wedge toward the gap of the nearest incoming ring
        const nearest = rings.reduce<Ring | null>((acc, ring) => {
          if (ring.r <= orbitR) return acc;
          if (!acc || ring.r < acc.r) return ring;
          return acc;
        }, null);
        if (nearest) {
          const t2 = (nearest.r - orbitR) / shrinkSpeed;
          const futureGap = nearest.gapCenter + nearest.spin * t2;
          const target = normAngle(futureGap + nearest.gapWidth / 2 * 0);
          let diff = normAngle(target - angle);
          if (diff > Math.PI) diff -= Math.PI * 2;
          targetOmega = diff > 0 ? OMEGA_MAX : -OMEGA_MAX;
        }
      }

      // smooth toward target angular velocity
      const accel = OMEGA_MAX * 6;
      if (omega < targetOmega) omega = Math.min(targetOmega, omega + accel * dt);
      else if (omega > targetOmega) omega = Math.max(targetOmega, omega - accel * dt);
      angle = normAngle(angle + omega * dt);

      spawnT += dt;
      if (spawnT >= spawnEvery) {
        spawnT = 0;
        spawnRing();
      }

      for (const ring of rings) {
        ring.r -= shrinkSpeed * dt;
        ring.gapCenter = normAngle(ring.gapCenter + ring.spin * dt);
        if (!ring.checked && ring.r <= orbitR) {
          ring.checked = true;
          let diff = Math.abs(normAngle(angle - ring.gapCenter));
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          if (diff > ring.gapWidth / 2) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          } else {
            score += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
          }
        }
      }
      rings = rings.filter((r) => r.r > -maxR * 0.1);
    }

    // background
    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);

    // faint radial glow
    const glowGrad = g.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    glowGrad.addColorStop(0, shade(pal.glow, 0.1));
    glowGrad.addColorStop(1, shade(pal.deep, -0.6));
    g.fillStyle = glowGrad;
    g.globalAlpha = 0.35;
    g.beginPath();
    g.arc(cx, cy, maxR, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;

    // rings (drawn as arcs with a gap)
    for (const ring of rings) {
      if (ring.r < 4) continue;
      g.strokeStyle = over ? shade(pal.foe, 0.15) : pal.foe;
      g.lineWidth = 6;
      const start = ring.gapCenter + ring.gapWidth / 2;
      const end = ring.gapCenter - ring.gapWidth / 2 + Math.PI * 2;
      g.beginPath();
      g.arc(cx, cy, ring.r, start, end);
      g.stroke();
    }

    // orbit guide
    g.strokeStyle = "rgba(255,255,255,.12)";
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, orbitR, 0, Math.PI * 2);
    g.stroke();

    // center hub — he is what the whole thing spins around
    drawNicHead(g, {
      x: cx,
      y: cy,
      r: 9,
      skin: pal.prize,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      gaze: Math.cos(angle),
    });

    // wedge
    const wx = cx + Math.cos(angle) * orbitR;
    const wy = cy + Math.sin(angle) * orbitR;
    g.save();
    g.translate(wx, wy);
    g.rotate(angle);
    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.moveTo(wedgeSize, 0);
    g.lineTo(-wedgeSize * 0.6, wedgeSize * 0.7);
    g.lineTo(-wedgeSize * 0.6, -wedgeSize * 0.7);
    g.closePath();
    g.fill();
    g.restore();

    if (over) endCard(g, t, W, H, "GAME OVER");
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
