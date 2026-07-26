import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, pick, shade } from "@/games/engine";

const meta = {
  slug: "sphere-chain",
  title: "Nic's Sphere Chain",
  rule: "Aim and fire, match 3 to clear the chain",
  year: 2003,
  description: "Aim, fire, match three. Don't let the chain reach the pit.",
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
  maxScorePerSecond: 40,
} satisfies GameModule["meta"];

interface ChainBall {
  /** arc distance from the pit, in real screen pixels */
  d: number;
  color: number;


}

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
}

/** ball centres sit this far apart along the path */
const PACK = 1.94;
/** how fast a detached tail slides forward to close a gap */
const CATCHUP = 260;
/** the projectile never advances more than this fraction of a radius per step */
const SUBSTEP = 0.5;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const colors = [pal.hero, pal.foe, pal.prize, shade(pal.glow, 0.18)];
  const ballR = Math.min(W * 0.038, H * 0.021);
  const SPACING = ballR * PACK;

  // ── The track ────────────────────────────────────────────────────────────
  // An elliptical spiral that runs edge to edge, so the playfield is the whole
  // screen rather than a band in the middle of it. The launcher sits in the
  // hole at the centre, which is the one place the spiral never reaches.
  const cx = W / 2;
  const cy = H / 2;
  const rx = W * 0.455;
  const ry = H * 0.455;
  const TURNS = 1.8;
  const INNER = 0.34;

  // u = 0 is the tail (outer rim), u = 1 is the pit (inner terminus)
  const spiralAt = (u: number) => {
    const a = -Math.PI / 2 + u * TURNS * Math.PI * 2;
    const k = INNER + (1 - INNER) * (1 - u);
    return { x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k };
  };

  // Arc-length table, pit first. Sampling by u alone would bunch balls up in
  // the tight inner turns and tear gaps open on the long outer ones — which is
  // what made shots sail straight through the chain. Everything downstream
  // (spacing, collision, packing) is measured in real pixels because of this.
  const STEPS = 1400;
  const px: number[] = new Array(STEPS + 1);
  const py: number[] = new Array(STEPS + 1);
  const arc: number[] = new Array(STEPS + 1);
  for (let i = 0; i <= STEPS; i++) {
    const p = spiralAt(1 - i / STEPS);
    px[i] = p.x;
    py[i] = p.y;
    arc[i] =
      i === 0 ? 0 : arc[i - 1] + Math.hypot(p.x - px[i - 1], p.y - py[i - 1]);
  }
  const TRACK = arc[STEPS];

  /** index of the last sample at or before arc distance d */
  const indexAt = (d: number) => {
    let lo = 0;
    let hi = STEPS;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arc[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const pathPoint = (d: number) => {
    const dd = clamp(d, 0, TRACK);
    const i = Math.min(indexAt(dd), STEPS - 1);
    const span = arc[i + 1] - arc[i] || 1;
    const t = (dd - arc[i]) / span;
    return { x: px[i] + (px[i + 1] - px[i]) * t, y: py[i] + (py[i + 1] - py[i]) * t };
  };

  /** unit vector pointing back up the track, i.e. the way d increases */
  const pathTangent = (d: number) => {
    const i = Math.min(indexAt(clamp(d, 0, TRACK)), STEPS - 1);
    const dx = px[i + 1] - px[i];
    const dy = py[i + 1] - py[i];
    const m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  };

  const pit = pathPoint(0);
  const launcher = { x: cx, y: cy };
  const LAUNCH_R = ballR * 1.5;

  // ── State ────────────────────────────────────────────────────────────────
  let chain: ChainBall[] = [];
  let dying: { x: number; y: number; color: number; t: number }[] = [];
  let score = 0;
  let over = false;
  let loaded = 0;
  let queued = 0;
  let shots: Projectile[] = [];
  let aim = -Math.PI / 2;
  let speed = 0;
  let spawnCd = 0;
  let combo = 1;
  let comboCd = 0;
  let shake = 0;

  /** a colour for the tail that doesn't hand the player a free triple */
  const tailColor = () => {
    const n = chain.length;
    if (n >= 2 && chain[n - 1].color === chain[n - 2].color) {
      const bad = chain[n - 1].color;
      const opts = colors.map((_, i) => i).filter((i) => i !== bad);
      return pick(opts);
    }
    return Math.floor(Math.random() * colors.length);
  };

  /** never load a colour that isn't on the board — every shot has a use */
  const liveColor = () => {
    const live = [...new Set(chain.map((b) => b.color))];
    return live.length ? pick(live) : Math.floor(Math.random() * colors.length);
  };

  const reset = () => {
    chain = [];
    dying = [];
    shots = [];
    score = 0;
    over = false;
    combo = 1;
    comboCd = 0;
    shake = 0;
    speed = 34;
    spawnCd = 0.6;
    // a starting run down the outer rim, already on its way in
    let d = TRACK * 0.7;
    for (let i = 0; i < 14 && d <= TRACK; i++) {
      chain.push({ d, color: tailColor() });
      d += SPACING;
    }
    loaded = liveColor();
    queued = liveColor();
    ctx.onScore(0);
  };

  // ── Input ────────────────────────────────────────────────────────────────
  // A tap aims and fires in one motion: on a phone there is no hover, so
  // asking for a drag would fight the feed's swipe-to-leave gesture. Dragging
  // still re-aims while the finger is down, which is what a mouse expects.
  const pointerPos = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  };

  const setAim = (x: number, y: number) => {
    const dx = x - launcher.x;
    const dy = y - launcher.y;
    if (Math.hypot(dx, dy) < 1) return;
    aim = Math.atan2(dy, dx);
  };

  const fire = () => {
    // Two in flight keeps rapid tapping honest — the old single-shot gate
    // silently swallowed the second tap and read as a dropped input.
    if (over || shots.length >= 2) return;
    shots.push({
      x: launcher.x + Math.cos(aim) * LAUNCH_R,
      y: launcher.y + Math.sin(aim) * LAUNCH_R,
      vx: Math.cos(aim) * W * 3.1,
      vy: Math.sin(aim) * W * 3.1,
      color: loaded,
    });
    loaded = queued;
    queued = liveColor();
    ctx.haptic("light");
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const p = pointerPos(e);
    // tapping the launcher itself swaps the loaded ball for the spare
    if (Math.hypot(p.x - launcher.x, p.y - launcher.y) <= LAUNCH_R * 1.4) {
      const t = loaded;
      loaded = queued;
      queued = t;
      ctx.haptic("light");
      return;
    }
    setAim(p.x, p.y);
    fire();
  };
  const onMove = (e: PointerEvent) => {
    if (over) return;
    const p = pointerPos(e);
    if (Math.hypot(p.x - launcher.x, p.y - launcher.y) <= LAUNCH_R) return;
    setAim(p.x, p.y);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);

  // ── Chain physics ────────────────────────────────────────────────────────
  // The front ball is the only one under its own power. Everything behind it
  // is held exactly SPACING back, and a tail left floating by a clear rolls
  // forward until it catches up. That single rule is what keeps the chain
  // gap-free, which in turn is what makes a shot land where you aimed it.
  const packChain = (dt: number) => {
    for (let i = 1; i < chain.length; i++) {
      const target = chain[i - 1].d + SPACING;
      if (chain[i].d < target) chain[i].d = target;
      else if (chain[i].d > target)
        chain[i].d = Math.max(target, chain[i].d - CATCHUP * dt);
    }
  };

  const clearRun = (lo: number, len: number) => {
    for (let i = lo; i < lo + len; i++) {
      const p = pathPoint(chain[i].d);
      dying.push({ x: p.x, y: p.y, color: chain[i].color, t: 1 });
    }
    chain.splice(lo, len);
    score += len * combo;
    ctx.onScore(score);
    ctx.haptic("hit");
    shake = Math.min(9, 3 + len);
    combo = Math.min(6, combo + 1);
    comboCd = 1.2;
  };

  /**
   * Clear any run of 3+ that is actually touching. Runs only ever form from a
   * shot — the spawner refuses to hand out a free triple — so this doubles as
   * the combo engine: when a gap closes and the two ends match, the cascade
   * fires on its own, exactly a beat later.
   */
  const settle = () => {
    for (let i = 0; i < chain.length; ) {
      let j = i + 1;
      while (
        j < chain.length &&
        chain[j].color === chain[i].color &&
        chain[j].d - chain[j - 1].d <= SPACING * 1.06
      )
        j++;
      const len = j - i;
      if (len >= 3) {
        clearRun(i, len);
        return true;
      }
      i = j;
    }
    return false;
  };

  /** slot a fired ball into the chain beside the ball it struck */
  const insertAt = (hit: number, shot: Projectile) => {
    const pos = pathPoint(chain[hit].d);
    const tan = pathTangent(chain[hit].d);
    // positive means the shot came in from behind the ball it hit, so it
    // belongs further from the pit; otherwise it cuts in ahead of it
    const side = (shot.x - pos.x) * tan.x + (shot.y - pos.y) * tan.y;
    const idx = side >= 0 ? hit + 1 : hit;
    const d =
      side >= 0 ? chain[hit].d + SPACING * 0.5 : chain[hit].d - SPACING * 0.5;
    chain.splice(idx, 0, { d, color: shot.color });
    // keep the front of the chain from being shoved into the pit by an insert
    if (chain[0].d < ballR * 0.6) {
      const push = ballR * 0.6 - chain[0].d;
      for (const b of chain) b.d += push;
    }
    ctx.haptic("light");
  };

  /** advance one shot, in steps small enough that it can't skip the chain */
  const stepShot = (shot: Projectile, dt: number): boolean => {
    const dist = Math.hypot(shot.vx, shot.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / (ballR * SUBSTEP)));
    const sx = (shot.vx * dt) / steps;
    const sy = (shot.vy * dt) / steps;
    const reach = ballR * 1.9;
    for (let s = 0; s < steps; s++) {
      shot.x += sx;
      shot.y += sy;
      // nearest hit, not the first one found — picking the first meant a shot
      // grazing two balls resolved against whichever sat lower in the array
      let best = -1;
      let bestDist = reach;
      for (let i = 0; i < chain.length; i++) {
        const p = pathPoint(chain[i].d);
        const dd = Math.hypot(shot.x - p.x, shot.y - p.y);
        if (dd < bestDist) {
          bestDist = dd;
          best = i;
        }
      }
      if (best >= 0) {
        insertAt(best, shot);
        return false;
      }
      if (
        shot.x < -ballR * 2 ||
        shot.x > W + ballR * 2 ||
        shot.y < -ballR * 2 ||
        shot.y > H + ballR * 2
      )
        return false;
    }
    return true;
  };

  reset();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      speed = Math.min(112, 34 + score * 0.5);
      if (chain.length) chain[0].d -= speed * dt;
      packChain(dt);
      settle();

      if (comboCd > 0) {
        comboCd -= dt;
        if (comboCd <= 0) combo = 1;
      }

      if (chain.length && chain[0].d <= 0) {
        over = true;
        shake = 14;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }

      spawnCd -= dt;
      const tailD = chain.length ? chain[chain.length - 1].d : -SPACING;
      if (spawnCd <= 0 && tailD < TRACK - SPACING) {
        chain.push({ d: Math.max(tailD + SPACING, TRACK - SPACING), color: tailColor() });
        spawnCd = Math.max(0.26, 0.8 - score * 0.004);
      }

      shots = shots.filter((s) => stepShot(s, dt));

      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          // shoot at a ball of the loaded colour, preferring one that already
          // has a neighbour of the same colour
          let target = -1;
          for (let i = 0; i < chain.length; i++) {
            if (chain[i].color !== loaded) continue;
            const pairs =
              (i > 0 && chain[i - 1].color === loaded) ||
              (i < chain.length - 1 && chain[i + 1].color === loaded);
            if (pairs) {
              target = i;
              break;
            }
            if (target < 0) target = i;
          }
          if (target >= 0) {
            const p = pathPoint(chain[target].d);
            setAim(p.x, p.y);
            fire();
          } else {
            loaded = liveColor();
          }
          autoCd = 0.45;
        }
      }
    }

    for (const d of dying) d.t -= dt * 3.4;
    dying = dying.filter((d) => d.t > 0);
    shake = Math.max(0, shake - dt * 34);

    // ── Draw ───────────────────────────────────────────────────────────────
    g.save();
    if (shake > 0.2)
      g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    const bg = g.createRadialGradient(cx, cy, ballR, cx, cy, Math.max(W, H) * 0.72);
    bg.addColorStop(0, shade(pal.deep, -0.2));
    bg.addColorStop(1, shade(pal.deep, -0.72));
    g.fillStyle = bg;
    g.fillRect(-W, -H, W * 3, H * 3);

    // the track: a wide dark bed with a bright hairline down the middle
    g.beginPath();
    g.moveTo(px[0], py[0]);
    for (let i = 1; i <= STEPS; i += 6) g.lineTo(px[i], py[i]);
    g.lineTo(px[STEPS], py[STEPS]);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = shade(pal.deep, 0.06);
    g.lineWidth = ballR * 2.5;
    g.stroke();
    g.strokeStyle = shade(pal.deep, 0.2);
    g.lineWidth = 1.5;
    g.stroke();

    // the pit — pulses as the chain closes in on it
    const lead = chain.length ? chain[0].d : TRACK;
    const danger = 1 - clamp(lead / (SPACING * 6), 0, 1);
    g.beginPath();
    g.arc(pit.x, pit.y, ballR * (1.7 + danger * 0.5), 0, Math.PI * 2);
    g.fillStyle = shade(pal.deep, -0.8);
    g.fill();
    g.strokeStyle = danger > 0 ? pal.hero : shade(pal.glow, 0.25);
    g.lineWidth = 2 + danger * 3;
    g.globalAlpha = 0.5 + danger * 0.5;
    g.stroke();
    g.globalAlpha = 1;

    const drawBall = (x: number, y: number, r: number, color: string) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      g.beginPath();
      g.arc(x - r * 0.32, y - r * 0.34, r * 0.3, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,.55)";
      g.fill();
    };

    // tail first so the front of the chain overlaps correctly
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i].d > TRACK + ballR) continue;
      const p = pathPoint(chain[i].d);
      drawBall(p.x, p.y, ballR, colors[chain[i].color]);
    }

    for (const d of dying) {
      g.globalAlpha = d.t;
      drawBall(d.x, d.y, ballR * (0.6 + d.t * 0.8), colors[d.color]);
      g.globalAlpha = 1;
    }

    for (const s of shots) drawBall(s.x, s.y, ballR * 0.92, colors[s.color]);

    // aim guide — dashed, so it reads as intent rather than a wall
    g.save();
    g.setLineDash([5, 7]);
    g.strokeStyle = "rgba(255,255,255,.34)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(launcher.x + Math.cos(aim) * LAUNCH_R, launcher.y + Math.sin(aim) * LAUNCH_R);
    g.lineTo(launcher.x + Math.cos(aim) * W * 1.4, launcher.y + Math.sin(aim) * W * 1.4);
    g.stroke();
    g.restore();

    // launcher: barrel, body, loaded ball, spare
    g.strokeStyle = shade(pal.glow, 0.3);
    g.lineWidth = ballR * 0.62;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(launcher.x, launcher.y);
    g.lineTo(launcher.x + Math.cos(aim) * LAUNCH_R * 1.5, launcher.y + Math.sin(aim) * LAUNCH_R * 1.5);
    g.stroke();
    g.beginPath();
    g.arc(launcher.x, launcher.y, LAUNCH_R, 0, Math.PI * 2);
    g.fillStyle = t.surface;
    g.fill();
    g.strokeStyle = shade(pal.glow, 0.35);
    g.lineWidth = 2;
    g.stroke();
    drawBall(launcher.x, launcher.y, ballR * 0.82, colors[loaded]);
    drawBall(
      launcher.x + LAUNCH_R * 1.5,
      launcher.y + LAUNCH_R * 1.5,
      ballR * 0.46,
      colors[queued]
    );

    if (combo > 1 && !over) {
      g.textAlign = "center";
      g.fillStyle = pal.prize;
      g.font = `800 ${Math.round(ballR * 1.5)}px ${t.fontDisplay}`;
      g.fillText(`x${combo}`, launcher.x, launcher.y - LAUNCH_R * 2.1);
      g.textAlign = "left";
    }

    g.restore();

    if (over) endCard(g, t, W, H, "CHAIN REACHED THE PIT");
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
