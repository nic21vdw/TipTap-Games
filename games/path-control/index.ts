import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "path-control",
  title: "Flight Path",
  rule: "Drag to reroute planes. Avoid collisions.",
  year: 2009,
  description: "Draw the sky lanes. Land every plane. One clash ends it.",
  history:
    "Homage to the 2009 wave of tap-and-drag air-traffic puzzles that turned reroute lines and near-misses into a pocket-sized stress test.",
  tags: ["precision", "drag", "chaos"],
  palette: {
    hero: "#5eead4",
    foe: "#ff477e",
    prize: "#f2b705",
    deep: "#0b132b",
    glow: "#7de2d1",
  },
  intensity: 0.6,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

type Vec = { x: number; y: number };

interface Craft {
  id: number;
  pos: Vec;
  path: Vec[]; // upcoming waypoints, NOT including current pos
  exit: Vec;
  speed: number;
  angle: number;
  color: string;
}

const HIT_RADIUS = 30;
const COLLISION_DIST = 26;
const WARN_DIST = 60;
const MAX_CRAFT = 7;

function edgePoint(edge: number, W: number, H: number): Vec {
  if (edge === 0) return { x: rand(W * 0.1, W * 0.9), y: 0 };
  if (edge === 1) return { x: W, y: rand(H * 0.1, H * 0.9) };
  if (edge === 2) return { x: rand(W * 0.1, W * 0.9), y: H };
  return { x: 0, y: rand(H * 0.1, H * 0.9) };
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let crafts: Craft[] = [];
  let nextId = 0;
  let score = 0;
  let over = false;
  let elapsed = 0;
  let spawnTimer = 0;

  let selected: Craft | null = null;
  let drawing: Vec[] = [];

  let auto = false;
  let avoidTimer = 0;

  const spawnCraft = () => {
    if (crafts.length >= MAX_CRAFT) return;
    const spawnEdge = Math.floor(rand(0, 4));
    let exitEdge = Math.floor(rand(0, 4));
    while (exitEdge === spawnEdge) exitEdge = Math.floor(rand(0, 4));
    const pos = edgePoint(spawnEdge, W, H);
    const exit = edgePoint(exitEdge, W, H);
    const id = nextId++;
    const craft: Craft = {
      id,
      pos,
      exit,
      path: [exit],
      speed: rand(70, 105),
      angle: Math.atan2(exit.y - pos.y, exit.x - pos.x),
      color: shade(pal.hero, ((id % 5) - 2) * 0.09),
    };
    crafts.push(craft);
  };

  const reset = () => {
    crafts = [];
    nextId = 0;
    score = 0;
    over = false;
    elapsed = 0;
    spawnTimer = 0;
    selected = null;
    drawing = [];
    ctx.onScore(0);
    spawnCraft();
    spawnCraft();
  };

  const nearestCraft = (p: Vec): Craft | null => {
    let best: Craft | null = null;
    let bestD = HIT_RADIUS;
    for (const c of crafts) {
      const d = Math.hypot(c.pos.x - p.x, c.pos.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };

  const pointerPos = (e: PointerEvent): Vec => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const p = pointerPos(e);
    const c = nearestCraft(p);
    if (!c) return;
    selected = c;
    drawing = [{ x: c.pos.x, y: c.pos.y }];
    ctx.haptic("light");
  };
  const onMove = (e: PointerEvent) => {
    if (!selected) return;
    const p = pointerPos(e);
    const last = drawing[drawing.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 10) drawing.push(p);
  };
  const onUp = () => {
    if (!selected) return;
    if (drawing.length >= 2 && crafts.includes(selected)) {
      selected.path = [...drawing.slice(1), selected.exit];
    }
    selected = null;
    drawing = [];
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  // attract-mode collision avoidance: predicted-position lookahead, reroute
  // the trailing craft around the near one with a sideways waypoint
  const autoAvoid = () => {
    for (let i = 0; i < crafts.length; i++) {
      for (let j = i + 1; j < crafts.length; j++) {
        const a = crafts[i];
        const b = crafts[j];
        const ta = a.path[0] ?? a.exit;
        const tb = b.path[0] ?? b.exit;
        const da = Math.hypot(ta.x - a.pos.x, ta.y - a.pos.y) || 1;
        const db = Math.hypot(tb.x - b.pos.x, tb.y - b.pos.y) || 1;
        const dirA = { x: (ta.x - a.pos.x) / da, y: (ta.y - a.pos.y) / da };
        const dirB = { x: (tb.x - b.pos.x) / db, y: (tb.y - b.pos.y) / db };
        let willClash = false;
        for (let step = 1; step <= 12; step++) {
          const tsec = step * 0.15;
          const pax = a.pos.x + dirA.x * a.speed * tsec;
          const pay = a.pos.y + dirA.y * a.speed * tsec;
          const pbx = b.pos.x + dirB.x * b.speed * tsec;
          const pby = b.pos.y + dirB.y * b.speed * tsec;
          if (Math.hypot(pax - pbx, pay - pby) < COLLISION_DIST * 1.6) {
            willClash = true;
            break;
          }
        }
        if (willClash && b.path.length <= 1) {
          const perp = { x: -dirB.y, y: dirB.x };
          const side = rand(0, 1) > 0.5 ? 1 : -1;
          const waypoint = {
            x: clamp(b.pos.x + dirB.x * 40 + perp.x * 50 * side, 8, W - 8),
            y: clamp(b.pos.y + dirB.y * 40 + perp.y * 50 * side, 8, H - 8),
          };
          b.path = [waypoint, b.exit];
        }
      }
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      elapsed += dt;
      spawnTimer += dt;
      const spawnEvery = clamp(1.7 - elapsed * 0.018, 0.55, 1.7);
      if (spawnTimer >= spawnEvery) {
        spawnTimer = 0;
        spawnCraft();
      }

      if (auto) {
        avoidTimer -= dt;
        if (avoidTimer <= 0) {
          autoAvoid();
          avoidTimer = 0.35;
        }
      }

      for (const c of crafts) {
        const target = c.path[0];
        if (!target) continue;
        const dx = target.x - c.pos.x;
        const dy = target.y - c.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.001) c.angle = Math.atan2(dy, dx);
        const step = c.speed * dt;
        if (step >= dist) {
          c.pos = { x: target.x, y: target.y };
          c.path.shift();
        } else {
          c.pos = { x: c.pos.x + (dx / dist) * step, y: c.pos.y + (dy / dist) * step };
        }
      }

      // landings
      crafts = crafts.filter((c) => {
        if (c.path.length === 0) {
          score += 1;
          ctx.onScore(score);
          ctx.haptic("hit");
          return false;
        }
        return true;
      });

      // collisions
      outer: for (let i = 0; i < crafts.length; i++) {
        for (let j = i + 1; j < crafts.length; j++) {
          const d = Math.hypot(
            crafts[i].pos.x - crafts[j].pos.x,
            crafts[i].pos.y - crafts[j].pos.y
          );
          if (d < COLLISION_DIST) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
            break outer;
          }
        }
      }
    }

    // sky
    g.fillStyle = shade(pal.deep, -0.3);
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,.05)";
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo(0, (H / 4) * i);
      g.lineTo(W, (H / 4) * i);
      g.stroke();
    }

    // exit zones
    for (const c of crafts) {
      g.beginPath();
      g.arc(c.exit.x, c.exit.y, 10, 0, Math.PI * 2);
      g.fillStyle = shade(pal.prize, -0.1);
      g.globalAlpha = 0.55;
      g.fill();
      g.globalAlpha = 1;
    }

    // in-progress drawn path
    if (selected && drawing.length > 1) {
      g.strokeStyle = pal.glow;
      g.lineWidth = 3;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(drawing[0].x, drawing[0].y);
      for (let i = 1; i < drawing.length; i++) g.lineTo(drawing[i].x, drawing[i].y);
      g.stroke();
      g.setLineDash([]);
    }

    // committed future paths (faint)
    for (const c of crafts) {
      if (c.path.length === 0) continue;
      g.strokeStyle = "rgba(255,255,255,.14)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(c.pos.x, c.pos.y);
      for (const wp of c.path) g.lineTo(wp.x, wp.y);
      g.stroke();
    }

    // crafts as triangles pointed along heading
    for (const c of crafts) {
      g.save();
      g.translate(c.pos.x, c.pos.y);
      g.rotate(c.angle);
      g.fillStyle = c === selected ? pal.glow : c.color;
      g.beginPath();
      g.moveTo(12, 0);
      g.lineTo(-8, 7);
      g.lineTo(-8, -7);
      g.closePath();
      g.fill();
      g.restore();
    }

    g.fillStyle = t.ink;
    g.font = `700 16px ${t.fontDisplay}`;
    g.textAlign = "left";
    g.fillText(`landed ${score}`, 14, H - 18);
    g.textAlign = "left";

    if (over) endCard(g, t, W, H, "MID-AIR COLLISION");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
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
