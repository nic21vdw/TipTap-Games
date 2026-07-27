import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "coil-arena",
  title: "Nic's Coil",
  rule: "Drag to steer. Don't cross any trail.",
  year: 2016,
  description: "Grow your coil, cut off the bots, don't cross a line.",
  history:
    "Homage to the 2016 free-roam multiplayer arena craze that turned the classic growing-line game into a browser sensation — steer freely, trap rivals, never touch a trail.",
  tags: ["drag", "chaos", "reflex"],
  palette: {
    hero: "#3ddc97",
    foe: "#ff477e",
    prize: "#ffd23f",
    deep: "#0b1d3a",
    glow: "#7bf1ff",
  },
  intensity: 0.6,
  luck: 0.1,
  nostalgia: 0.4,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Pt {
  x: number;
  y: number;
  brk?: boolean;
}

interface Orb {
  x: number;
  y: number;
}

interface Bot {
  x: number;
  y: number;
  angle: number;
  trail: Pt[];
  maxLen: number;
  target: { x: number; y: number };
  retimer: number;
  hue: number;
}

const HEAD_R = 5;
const TRAIL_W = 6;
const SPACING = 5;
const PLAYER_SPEED = 96;
const PLAYER_TURN_RATE = 3.4;
const BOT_SPEED = 78;
const BOT_TURN_RATE = 2.1;
const SAFETY_SKIP = 11;
const COLLIDE_R = HEAD_R + TRAIL_W / 2;
const BOT_COUNT = 4;
const TARGET_ORBS = 18;
const ORB_R = 4;
const START_MAX_LEN = 40;
const ORB_GROWTH = 6;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let px = W / 2;
  let py = H / 2;
  let pAngle = 0;
  let pTrail: Pt[] = [];
  let pMaxLen = START_MAX_LEN;
  let score = 0;
  let over = false;
  let dist = 0; // distance since last stored point

  let steering = false;
  let pointerX = px;
  let pointerY = py;

  let bots: Bot[] = [];
  let orbs: Orb[] = [];
  let orbTimer = 0;

  const wrap = (v: number, max: number) =>
    v < 0 ? v + max : v >= max ? v - max : v;

  const pushPoint = (trail: Pt[], x: number, y: number, brk: boolean, maxLen: number) => {
    trail.push({ x, y, brk });
    while (trail.length > maxLen) trail.shift();
  };

  const spawnOrb = () => {
    orbs.push({ x: rand(W * 0.05, W * 0.95), y: rand(H * 0.05, H * 0.95) });
  };

  const dropOrbs = (x: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) {
      orbs.push({
        x: clamp(x + rand(-18, 18), 2, W - 2),
        y: clamp(y + rand(-18, 18), 2, H - 2),
      });
    }
  };

  const spawnBot = (): Bot => {
    const x = rand(W * 0.1, W * 0.9);
    const y = rand(H * 0.1, H * 0.9);
    return {
      x,
      y,
      angle: rand(0, Math.PI * 2),
      trail: [],
      maxLen: Math.floor(rand(24, 48)),
      target: { x: rand(0, W), y: rand(0, H) },
      retimer: rand(1, 2.5),
      hue: rand(-0.28, 0.22),
    };
  };

  const reset = () => {
    px = W / 2;
    py = H / 2;
    pAngle = rand(0, Math.PI * 2);
    pTrail = [];
    pMaxLen = START_MAX_LEN;
    score = 0;
    over = false;
    dist = 0;
    steering = false;
    pointerX = px;
    pointerY = py;
    bots = [];
    for (let i = 0; i < BOT_COUNT; i++) bots.push(spawnBot());
    orbs = [];
    for (let i = 0; i < TARGET_ORBS; i++) spawnOrb();
    ctx.onScore(0);
  };

  const turnToward = (angle: number, targetAngle: number, rate: number, dt: number) => {
    let diff = targetAngle - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxStep = rate * dt;
    return angle + clamp(diff, -maxStep, maxStep);
  };

  const nearestObstacleDist = (
    x: number,
    y: number,
    trails: Pt[][]
  ): number => {
    let best = Infinity;
    for (const trail of trails) {
      for (const p of trail) {
        const dx = p.x - x;
        const dy = p.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
    }
    return Math.sqrt(best);
  };

  const hitsAny = (x: number, y: number, trails: Pt[][], r: number): boolean => {
    const r2 = r * r;
    for (const trail of trails) {
      for (const p of trail) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx * dx + dy * dy < r2) return true;
      }
    }
    return false;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    steering = true;
    const r = ctx.canvas.getBoundingClientRect();
    pointerX = e.clientX - r.left;
    pointerY = e.clientY - r.top;
  };
  const onMove = (e: PointerEvent) => {
    if (!steering) return;
    const r = ctx.canvas.getBoundingClientRect();
    pointerX = e.clientX - r.left;
    pointerY = e.clientY - r.top;
  };
  const onUp = () => {
    steering = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);
  ctx.canvas.addEventListener("pointerleave", onUp);

  reset();

  let auto = false;
  let autoTarget = { x: rand(0, W), y: rand(0, H) };
  let autoTimer = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      // ---- player steering ----
      let desiredAngle = pAngle;
      if (auto) {
        autoTimer -= dt;
        const otherTrails = bots.map((b) => b.trail);
        const clearance = nearestObstacleDist(
          px + Math.cos(pAngle) * 26,
          py + Math.sin(pAngle) * 26,
          [pTrail.slice(0, Math.max(0, pTrail.length - SAFETY_SKIP)), ...otherTrails]
        );
        if (autoTimer <= 0 || clearance < 22) {
          // pick the safest heading among a few candidates, biased toward nearest orb
          let bestAngle = pAngle;
          let bestScore = -Infinity;
          for (let k = -3; k <= 3; k++) {
            const cand = pAngle + k * 0.45;
            const lx = px + Math.cos(cand) * 30;
            const ly = py + Math.sin(cand) * 30;
            const cl = nearestObstacleDist(lx, ly, [
              pTrail.slice(0, Math.max(0, pTrail.length - SAFETY_SKIP)),
              ...otherTrails,
            ]);
            let orbBonus = 0;
            if (orbs.length) {
              const o = orbs.reduce((a, b) =>
                (a.x - lx) ** 2 + (a.y - ly) ** 2 < (b.x - lx) ** 2 + (b.y - ly) ** 2 ? a : b
              );
              orbBonus = -Math.hypot(o.x - lx, o.y - ly) * 0.05;
            }
            const s = Math.min(cl, 80) + orbBonus;
            if (s > bestScore) {
              bestScore = s;
              bestAngle = cand;
            }
          }
          autoTarget = {
            x: px + Math.cos(bestAngle) * 60,
            y: py + Math.sin(bestAngle) * 60,
          };
          autoTimer = rand(0.4, 0.9);
        }
        desiredAngle = Math.atan2(autoTarget.y - py, autoTarget.x - px);
      } else if (steering) {
        desiredAngle = Math.atan2(pointerY - py, pointerX - px);
      }
      pAngle = turnToward(pAngle, desiredAngle, PLAYER_TURN_RATE, dt);

      const prevX = px;
      const prevY = py;
      px += Math.cos(pAngle) * PLAYER_SPEED * dt;
      py += Math.sin(pAngle) * PLAYER_SPEED * dt;
      let wrapped = false;
      if (px < 0 || px >= W || py < 0 || py >= H) {
        px = wrap(px, W);
        py = wrap(py, H);
        wrapped = true;
      }
      dist += Math.hypot(px - prevX, py - prevY);
      if (dist >= SPACING || wrapped) {
        pushPoint(pTrail, px, py, wrapped, pMaxLen);
        dist = 0;
      }

      // player vs everything (skip own recent segment)
      const dangerTrails = [
        pTrail.slice(0, Math.max(0, pTrail.length - SAFETY_SKIP)),
        ...bots.map((b) => b.trail),
      ];
      if (hitsAny(px, py, dangerTrails, COLLIDE_R)) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }

      // orb pickup
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        if (Math.hypot(o.x - px, o.y - py) < HEAD_R + ORB_R) {
          orbs.splice(i, 1);
          score += 1;
          pMaxLen += ORB_GROWTH;
          ctx.onScore(score);
          ctx.haptic("hit");
        }
      }
      orbTimer -= dt;
      if (orbs.length < TARGET_ORBS && orbTimer <= 0) {
        spawnOrb();
        orbTimer = 0.35;
      }

      // ---- bots ----
      for (let bi = bots.length - 1; bi >= 0; bi--) {
        const b = bots[bi];
        b.retimer -= dt;
        if (
          b.retimer <= 0 ||
          Math.hypot(b.target.x - b.x, b.target.y - b.y) < 20
        ) {
          b.target = { x: rand(0, W), y: rand(0, H) };
          b.retimer = rand(1, 2.6);
        }
        const desired = Math.atan2(b.target.y - b.y, b.target.x - b.x);
        b.angle = turnToward(b.angle, desired, BOT_TURN_RATE, dt);
        const bprevX = b.x;
        const bprevY = b.y;
        b.x += Math.cos(b.angle) * BOT_SPEED * dt;
        b.y += Math.sin(b.angle) * BOT_SPEED * dt;
        let bwrapped = false;
        if (b.x < 0 || b.x >= W || b.y < 0 || b.y >= H) {
          b.x = wrap(b.x, W);
          b.y = wrap(b.y, H);
          bwrapped = true;
        }
        const bd = Math.hypot(b.x - bprevX, b.y - bprevY);
        if (bd >= SPACING || bwrapped) {
          pushPoint(b.trail, b.x, b.y, bwrapped, b.maxLen);
        }

        const otherBotTrails = bots
          .filter((o) => o !== b)
          .map((o) => o.trail);
        const selfTrailSafe = b.trail.slice(
          0,
          Math.max(0, b.trail.length - SAFETY_SKIP)
        );
        const botDanger = [pTrail, selfTrailSafe, ...otherBotTrails];
        if (hitsAny(b.x, b.y, botDanger, COLLIDE_R)) {
          dropOrbs(b.x, b.y, Math.floor(rand(4, 7)));
          bots[bi] = spawnBot();
        }
      }
    }

    // ---- draw ----
    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,.04)";
    g.lineWidth = 1;
    const grid = 32;
    for (let x = 0; x < W; x += grid) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let y = 0; y < H; y += grid) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }

    // orbs
    for (const o of orbs) {
      g.beginPath();
      g.arc(o.x, o.y, ORB_R, 0, Math.PI * 2);
      g.fillStyle = pal.prize;
      g.fill();
    }

    const drawTrail = (trail: Pt[], color: string, headR: number) => {
      if (trail.length < 2) return;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.lineWidth = TRAIL_W;
      g.strokeStyle = color;
      g.beginPath();
      let started = false;
      for (const p of trail) {
        if (!started || p.brk) {
          g.moveTo(p.x, p.y);
          started = true;
        } else {
          g.lineTo(p.x, p.y);
        }
      }
      g.stroke();
    };

    // every coil in the arena is headed by him, yours included
    for (const b of bots) {
      drawTrail(b.trail, shade(pal.foe, b.hue), HEAD_R);
      drawNicHead(g, {
        x: b.x,
        y: b.y,
        r: HEAD_R,
        skin: shade(pal.foe, b.hue + 0.2),
        hair: shade(pal.deep, -0.4),
        eye: t.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: t.ink,
        scowl: 1,
      });
    }

    drawTrail(pTrail, over ? shade(pal.foe, -0.1) : pal.hero, HEAD_R);
    drawNicHead(g, {
      x: px,
      y: py,
      r: HEAD_R + 1.5,
      skin: over ? pal.foe : pal.glow,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      gape: over ? 0.9 : 0,
    });

    if (over) endCard(g, t, W, H, "TANGLED UP");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
      ctx.canvas.removeEventListener("pointerleave", onUp);
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
