import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "snip-swing",
  title: "Snip Swing",
  rule: "Cut ropes to swing the ball into the zone",
  year: 2010,
  description: "Snip the right rope. Swing it home.",
  history:
    "Homage to the 2010 rope-slicing physics puzzle that turned gravity, momentum, and a well-timed cut into a mobile obsession.",
  tags: ["precision", "calm", "reflex"],
  palette: {
    hero: "#ff9f43",
    foe: "#ee5253",
    prize: "#10ac84",
    deep: "#0b132b",
    glow: "#54a0ff",
  },
  intensity: 0.4,
  luck: 0.1,
  nostalgia: 0.8,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

interface Rope {
  anchor: { x: number; y: number };
  length: number;
  cut: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const BALL_R = Math.min(W, H) * 0.032;
  const GRAVITY = H * 1.5;

  let ropes: Rope[] = [];
  let pos = { x: 0, y: 0 };
  let prev = { x: 0, y: 0 };
  let target = { x: 0, y: 0, w: 0, h: 0 };
  let level = 1;
  let score = 0;
  let over = false;
  let failMsg = "MISSED";

  const newLevel = () => {
    const ropeCount = level <= 2 ? 1 : level <= 5 ? 2 : Math.random() < 0.5 ? 2 : 3;
    const ballX = rand(W * 0.3, W * 0.7);
    const ballY = H * rand(0.28, 0.38);
    ropes = [];
    for (let i = 0; i < ropeCount; i++) {
      const ax = clampAnchor(ballX + rand(-W * 0.32, W * 0.32), i, ropeCount);
      const ay = rand(H * 0.04, H * 0.12);
      const len = Math.hypot(ax - ballX, ay - ballY);
      ropes.push({ anchor: { x: ax, y: ay }, length: len, cut: false });
    }
    pos = { x: ballX, y: ballY };
    prev = { x: ballX, y: ballY };
    const tw = Math.max(W * 0.16, W * 0.32 - level * W * 0.012);
    target = {
      x: rand(tw / 2 + 8, W - tw / 2 - 8),
      y: H - H * 0.09,
      w: tw,
      h: H * 0.055,
    };
  };

  function clampAnchor(x: number, i: number, count: number): number {
    const slot = W / (count + 1);
    const lo = slot * (i + 0.15);
    const hi = slot * (i + 1.85);
    return Math.max(lo, Math.min(hi, x));
  }

  const reset = () => {
    level = 1;
    score = 0;
    over = false;
    ctx.onScore(0);
    newLevel();
  };

  const cutNearestRope = (px: number, py: number) => {
    let bestIdx = -1;
    let bestDist = 22;
    for (let i = 0; i < ropes.length; i++) {
      const r = ropes[i];
      if (r.cut) continue;
      const ax = r.anchor.x;
      const ay = r.anchor.y;
      const dx = pos.x - ax;
      const dy = pos.y - ay;
      const lenSq = dx * dx + dy * dy || 1;
      let tt = ((px - ax) * dx + (py - ay) * dy) / lenSq;
      tt = Math.max(0, Math.min(1, tt));
      const cx = ax + dx * tt;
      const cy = ay + dy * tt;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      ropes[bestIdx].cut = true;
      ctx.haptic("light");
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    cutNearestRope(e.clientX - r.left, e.clientY - r.top);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0;

  const physicsStep = (dt: number) => {
    const vx = (pos.x - prev.x) * 0.998;
    const vy = (pos.y - prev.y) * 0.998;
    const next = { x: pos.x + vx, y: pos.y + vy + GRAVITY * dt * dt };
    prev = pos;
    pos = next;
    for (let iter = 0; iter < 3; iter++) {
      for (const r of ropes) {
        if (r.cut) continue;
        const dx = pos.x - r.anchor.x;
        const dy = pos.y - r.anchor.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const diff = (dist - r.length) / dist;
        pos.x -= dx * diff;
        pos.y -= dy * diff;
      }
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0 && ropes.some((r) => !r.cut)) {
          let farIdx = -1;
          let farDist = -1;
          for (let i = 0; i < ropes.length; i++) {
            if (ropes[i].cut) continue;
            const d = Math.abs(ropes[i].anchor.x - target.x);
            if (d > farDist) {
              farDist = d;
              farIdx = i;
            }
          }
          if (farIdx >= 0 && pos.y > H * 0.35) {
            ropes[farIdx].cut = true;
          }
          autoCd = 0.5;
        }
      }

      const sub = 4;
      for (let i = 0; i < sub; i++) physicsStep(dt / sub);

      const inZoneX = pos.x > target.x - target.w / 2 && pos.x < target.x + target.w / 2;
      const inZoneY = pos.y + BALL_R > target.y && pos.y - BALL_R < target.y + target.h;
      if (inZoneX && inZoneY) {
        score += 1;
        ctx.onScore(score);
        ctx.haptic("hit");
        level += 1;
        newLevel();
      } else if (pos.y - BALL_R > H || pos.x < -40 || pos.x > W + 40) {
        over = true;
        failMsg = pos.y - BALL_R > H ? "FELL SHORT" : "SWUNG WIDE";
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, shade(pal.deep, 0.08));
    bg.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // target zone
    g.fillStyle = pal.prize;
    g.globalAlpha = 0.85;
    roundRect(g, target.x - target.w / 2, target.y, target.w, target.h, 10);
    g.fill();
    g.globalAlpha = 1;

    // ropes
    for (const r of ropes) {
      if (r.cut) continue;
      g.strokeStyle = pal.glow;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(r.anchor.x, r.anchor.y);
      g.lineTo(pos.x, pos.y);
      g.stroke();
      g.fillStyle = pal.glow;
      g.beginPath();
      g.arc(r.anchor.x, r.anchor.y, 6, 0, Math.PI * 2);
      g.fill();
    }

    // ball
    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(pos.x, pos.y, BALL_R, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.4)";
    g.beginPath();
    g.arc(pos.x - BALL_R * 0.3, pos.y - BALL_R * 0.3, BALL_R * 0.32, 0, Math.PI * 2);
    g.fill();

    if (over) endCard(g, t, W, H, failMsg);
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
      autoCd = 0.6;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
