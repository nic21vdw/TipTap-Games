import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, pick, rand, shade } from "@/games/engine";

const meta = {
  slug: "sphere-chain",
  title: "Sphere Chain",
  rule: "Aim and fire, match 3 to clear the chain",
  year: 2003,
  description: "Aim, fire, match three. Don't let the chain reach the gate.",
  history:
    "Homage to the 2003 winding-path marble popper that turned color-matching into a slow-burn panic as the line crept toward the gate.",
  tags: ["precision", "chaos", "retro"],
  palette: {
    hero: "#f72585",
    foe: "#4361ee",
    prize: "#ffd60a",
    deep: "#240046",
    glow: "#7209b7",
  },
  intensity: 0.6,
  luck: 0.2,
  nostalgia: 0.8,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

interface ChainBall {
  d: number; // distance-to-goal along the path
  color: string;
}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  active: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const colors = [pal.hero, pal.foe, pal.prize, shade(pal.glow, -0.1)];
  const ballR = W * 0.032;
  const SPACING = ballR * 2.05;
  const PATH_LEN = SPACING * 24;
  const topY = H * 0.1;
  const goalY = H * 0.86;
  const launcher = { x: W / 2, y: H * 0.9 };

  const pathPoint = (d: number) => {
    const t = clamp(d / PATH_LEN, 0, 1.15);
    const y = goalY - t * (goalY - topY);
    const x = W / 2 + Math.sin(t * Math.PI * 2.6) * W * 0.32;
    return { x, y };
  };

  let chain: ChainBall[] = [];
  let score = 0;
  let over = false;
  let currentColor = colors[0];
  let nextColor = colors[0];
  let proj: Projectile = { x: 0, y: 0, vx: 0, vy: 0, color: colors[0], active: false };
  let aimAngle = -Math.PI / 2;
  let chainSpeed = 12;
  let spawnCd = 1;

  const reset = () => {
    chain = [];
    for (let i = 0; i < 9; i++) {
      chain.push({ d: SPACING * (3 + i), color: pick(colors) });
    }
    score = 0;
    over = false;
    currentColor = pick(colors);
    nextColor = pick(colors);
    proj.active = false;
    chainSpeed = 12;
    spawnCd = 1;
    ctx.onScore(0);
  };
  reset();

  const fire = () => {
    if (proj.active || over) return;
    const dx = Math.cos(aimAngle);
    const dy = Math.sin(aimAngle);
    proj = {
      x: launcher.x,
      y: launcher.y,
      vx: dx * W * 1.35,
      vy: dy * W * 1.35,
      color: currentColor,
      active: true,
    };
    ctx.haptic("light");
    currentColor = nextColor;
    nextColor = pick(colors);
  };

  const setAim = (px: number, py: number) => {
    let dx = px - launcher.x;
    let dy = py - launcher.y;
    if (dy > -20) dy = -Math.abs(dy) - 20; // always aim up into the field
    aimAngle = Math.atan2(dy, dx);
  };

  const pointerPos = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const p = pointerPos(e);
    setAim(p.x, p.y);
    fire();
  };
  const onMove = (e: PointerEvent) => {
    if (over) return;
    const p = pointerPos(e);
    setAim(p.x, p.y);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);

  const resolveHit = (idx: number) => {
    const hitD = chain[idx].d;
    const newD = hitD + SPACING / 2;
    for (let k = idx + 1; k < chain.length; k++) chain[k].d += SPACING;
    chain.splice(idx + 1, 0, { d: newD, color: proj.color });
    const insertIdx = idx + 1;

    let lo = insertIdx;
    while (lo > 0 && chain[lo - 1].color === proj.color) lo--;
    let hi = insertIdx;
    while (hi < chain.length - 1 && chain[hi + 1].color === proj.color) hi++;
    const runLen = hi - lo + 1;

    if (runLen >= 3) {
      const removed = chain.splice(lo, runLen);
      score += removed.length;
      ctx.onScore(score);
      ctx.haptic("hit");
      const shrink = removed.length * SPACING;
      for (let k = lo; k < chain.length; k++) chain[k].d -= shrink;
    }
    proj.active = false;
  };

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      chainSpeed = Math.min(46, 12 + score * 0.25);
      for (const b of chain) b.d -= chainSpeed * dt;
      if (chain.length && chain[0].d <= 0) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }

      spawnCd -= dt;
      if (spawnCd <= 0 && chain.length < 40) {
        const tailD = chain.length ? chain[chain.length - 1].d + SPACING : PATH_LEN * 0.95;
        chain.push({ d: tailD, color: pick(colors) });
        spawnCd = Math.max(0.35, 0.9 - score * 0.01);
      }

      if (proj.active) {
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
        if (proj.x < -20 || proj.x > W + 20 || proj.y < -20 || proj.y > H + 20) {
          proj.active = false;
        } else {
          for (let i = 0; i < chain.length; i++) {
            const pos = pathPoint(chain[i].d);
            if (Math.hypot(proj.x - pos.x, proj.y - pos.y) < ballR * 1.85) {
              resolveHit(i);
              break;
            }
          }
        }
      }

      if (auto) {
        let targetPos: { x: number; y: number } | null = null;
        for (let i = 0; i < chain.length - 1; i++) {
          if (chain[i].color === chain[i + 1].color) {
            targetPos = pathPoint(chain[i].d);
            break;
          }
        }
        if (!targetPos && chain.length) targetPos = pathPoint(chain[0].d);
        if (targetPos) setAim(targetPos.x, targetPos.y);
        autoCd -= dt;
        if (autoCd <= 0) {
          fire();
          autoCd = rand(0.6, 1.1);
        }
      }
    }

    // background
    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    // winding track
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const p = pathPoint((i / 40) * PATH_LEN);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.strokeStyle = shade(pal.deep, -0.15);
    g.lineWidth = ballR * 2.6;
    g.lineCap = "round";
    g.stroke();

    // goal gate
    const gate = pathPoint(0);
    g.beginPath();
    g.arc(gate.x, gate.y, ballR * 1.5, 0, Math.PI * 2);
    g.fillStyle = shade(pal.foe, -0.1);
    g.fill();
    g.strokeStyle = pal.glow;
    g.lineWidth = 3;
    g.stroke();

    // chain balls, tail-first so front overlaps correctly
    for (let i = chain.length - 1; i >= 0; i--) {
      const p = pathPoint(chain[i].d);
      g.beginPath();
      g.arc(p.x, p.y, ballR, 0, Math.PI * 2);
      g.fillStyle = chain[i].color;
      g.fill();
      g.beginPath();
      g.arc(p.x - ballR * 0.3, p.y - ballR * 0.3, ballR * 0.28, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,.5)";
      g.fill();
    }

    // projectile
    if (proj.active) {
      g.beginPath();
      g.arc(proj.x, proj.y, ballR * 0.9, 0, Math.PI * 2);
      g.fillStyle = proj.color;
      g.fill();
    }

    // launcher + aim + loaded ball
    g.strokeStyle = shade(pal.hero, -0.1);
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(launcher.x, launcher.y);
    g.lineTo(
      launcher.x + Math.cos(aimAngle) * ballR * 3,
      launcher.y + Math.sin(aimAngle) * ballR * 3
    );
    g.stroke();
    g.beginPath();
    g.arc(launcher.x, launcher.y, ballR * 1.1, 0, Math.PI * 2);
    g.fillStyle = t.surface;
    g.fill();
    g.beginPath();
    g.arc(launcher.x, launcher.y, ballR * 0.75, 0, Math.PI * 2);
    g.fillStyle = currentColor;
    g.fill();
    g.beginPath();
    g.arc(launcher.x + ballR * 2, launcher.y + ballR * 0.4, ballR * 0.5, 0, Math.PI * 2);
    g.fillStyle = nextColor;
    g.fill();

    if (over) endCard(g, t, W, H, "CHAIN REACHED THE GATE");
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
      autoCd = 0;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
