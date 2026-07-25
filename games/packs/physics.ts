// Physics pack — ropes, water, drawn lines and one very silly pair of legs.

import type { GameModule } from "@/games/types";
import {
  burst,
  centred,
  defineGame,
  drawSparks,
  sky,
  stepSparks,
  type Spark,
} from "@/games/kit";
import { alpha, circle, clamp, rand, roundRect, shade } from "@/games/engine";

// -------------------------------------------------------------- Snip Drop

interface Rope {
  ax: number;
  ay: number;
  len: number;
  cut: boolean;
}

const snipDrop = defineGame<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  ropes: Rope[];
  stars: { x: number; y: number; got: boolean }[];
  mouth: { x: number; y: number };
  level: number;
  sparks: Spark[];
}>(
  {
    slug: "snip-drop",
    title: "Snip Drop",
    rule: "Cut the ropes in the right order",
    year: 2010,
    description: "Everything is solvable. Not everything is solvable by you, yet.",
    history:
      "Homage to the 2010 rope-cutting physics puzzler whose three-star scoring turned every level into two levels.",
    tags: ["precision", "calm", "drag"],
    palette: {
      hero: "#e63946",
      foe: "#6a994e",
      prize: "#ffd60a",
      deep: "#a7c957",
      glow: "#f2e8cf",
    },
    intensity: 0.3,
    speed: 0.3,
    difficulty: 0.45,
    luck: 0.2,
    nostalgia: 0.8,
    realism: 0.45,
    sessionLength: 0.5,
    scoreUnit: "stars",
    maxScorePerSecond: 3,
  },
  {
    hint: "swipe across a rope",
    overMsg: "DROPPED IT",
    autoStart: true,
    init: (api) => makeSnipLevel(api.W, api.H, 1),
    down: (s, x, y, api) => {
      cutNear(s, x, y, api.haptic);
    },
    move: (s, x, y, api) => {
      cutNear(s, x, y, api.haptic);
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      stepSparks(s.sparks, dt);
      s.vy += H * 1.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      // each intact rope is a stiff distance constraint
      for (const r of s.ropes) {
        if (r.cut) continue;
        const dx = s.x - r.ax;
        const dy = s.y - r.ay;
        const d = Math.hypot(dx, dy);
        if (d > r.len) {
          const nx = dx / d;
          const ny = dy / d;
          s.x = r.ax + nx * r.len;
          s.y = r.ay + ny * r.len;
          const radial = s.vx * nx + s.vy * ny;
          s.vx = (s.vx - radial * nx) * 0.995;
          s.vy = (s.vy - radial * ny) * 0.995;
        }
      }
      for (const st of s.stars) {
        if (!st.got && Math.hypot(st.x - s.x, st.y - s.y) < 24) {
          st.got = true;
          api.add(1);
          burst(s.sparks, st.x, st.y, api.pal.prize, 8, 120);
          api.haptic("hit");
        }
      }
      if (Math.hypot(s.mouth.x - s.x, s.mouth.y - s.y) < 30) {
        api.add(3);
        api.haptic("hit");
        const next = makeSnipLevel(W, H, s.level + 1);
        Object.assign(s, next, { sparks: s.sparks });
        return;
      }
      if (s.y > H + 40 || s.x < -40 || s.x > W + 40) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      const live = s.ropes.filter((r) => !r.cut);
      if (live.length > 1 && api.t % 1.6 < 0.02) live[0].cut = true;
      else if (live.length === 1 && api.t % 2.6 < 0.02) live[0].cut = true;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.foe, shade(pal.foe, -0.3));
      for (const r of s.ropes) {
        if (r.cut) continue;
        g.strokeStyle = "#7f5539";
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(r.ax, r.ay);
        g.lineTo(s.x, s.y);
        g.stroke();
        g.fillStyle = "#c9ada7";
        circle(g, r.ax, r.ay, 7);
        g.fill();
      }
      for (const st of s.stars) {
        if (st.got) continue;
        g.fillStyle = pal.prize;
        star(g, st.x, st.y, 12, 5);
        g.fill();
      }
      // the hungry thing
      g.fillStyle = pal.deep;
      circle(g, s.mouth.x, s.mouth.y, 30);
      g.fill();
      g.fillStyle = "#3d2c2e";
      g.beginPath();
      g.ellipse(s.mouth.x, s.mouth.y + 6, 16, 11, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      circle(g, s.mouth.x - 11, s.mouth.y - 12, 7);
      g.fill();
      circle(g, s.mouth.x + 11, s.mouth.y - 12, 7);
      g.fill();
      g.fillStyle = "#111";
      circle(g, s.mouth.x - 10, s.mouth.y - 12, 3.4);
      g.fill();
      circle(g, s.mouth.x + 12, s.mouth.y - 12, 3.4);
      g.fill();
      g.fillStyle = pal.hero;
      circle(g, s.x, s.y, 15);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.4);
      circle(g, s.x - 5, s.y - 5, 4);
      g.fill();
      drawSparks(g, s.sparks, 5);
      centred(g, `${api.score}`, W / 2, 42, 24, t.ink, t.fontDisplay);
      centred(g, `level ${s.level}`, W / 2, 66, 13, t.inkDim, t.fontBody, 700);
    },
  }
);

function makeSnipLevel(W: number, H: number, level: number) {
  const n = clamp(1 + Math.floor(level / 2), 1, 3);
  const ropes: Rope[] = [];
  const x = W / 2;
  const y = H * 0.34;
  for (let i = 0; i < n; i++) {
    const ax = W * (0.24 + (i / Math.max(1, n - 1 || 1)) * 0.52) + (n === 1 ? 0 : 0);
    const ay = H * 0.14 + rand(-14, 14);
    ropes.push({ ax, ay, len: Math.hypot(x - ax, y - ay) + 8, cut: false });
  }
  return {
    x,
    y,
    vx: rand(-40, 40),
    vy: 0,
    ropes,
    stars: [0, 1, 2].map((i) => ({
      x: W * (0.28 + i * 0.22),
      y: H * (0.5 + (i % 2) * 0.1),
      got: false,
    })),
    mouth: { x: rand(W * 0.25, W * 0.75), y: H * 0.84 },
    level,
    sparks: [] as Spark[],
  };
}

function cutNear(
  s: { ropes: Rope[]; x: number; y: number },
  px: number,
  py: number,
  haptic: (k: "light" | "hit" | "fail") => void
) {
  for (const r of s.ropes) {
    if (r.cut) continue;
    // distance from the touch to the rope segment
    const dx = s.x - r.ax;
    const dy = s.y - r.ay;
    const len2 = dx * dx + dy * dy || 1;
    const tt = clamp(((px - r.ax) * dx + (py - r.ay) * dy) / len2, 0, 1);
    const cx = r.ax + dx * tt;
    const cy = r.ay + dy * tt;
    if (Math.hypot(px - cx, py - cy) < 18) {
      r.cut = true;
      haptic("light");
    }
  }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, n: number) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

// --------------------------------------------------------------- Dig Flow

const DGW = 16;
const DGH = 26;

const digFlow = defineGame<{
  cells: Uint8Array; // 0 empty, 1 dirt, 2 water, 3 rock
  goal: number;
  target: number;
  tick: number;
  level: number;
  left: number;
}>(
  {
    slug: "dig-flow",
    title: "Dig Flow",
    rule: "Dig a channel, send the water",
    year: 2011,
    description: "The water is patient. The alligator is not.",
    history:
      "Homage to the 2011 dirt-digging physics puzzler that made a fluid sim into a children's game about plumbing.",
    tags: ["calm", "precision", "drag"],
    palette: {
      hero: "#48cae4",
      foe: "#8d6e63",
      prize: "#95d5b2",
      deep: "#3e2723",
      glow: "#6d4c41",
    },
    intensity: 0.25,
    speed: 0.3,
    difficulty: 0.45,
    luck: 0.2,
    nostalgia: 0.6,
    realism: 0.4,
    sessionLength: 0.5,
    scoreUnit: "drops",
    maxScorePerSecond: 6,
  },
  {
    hint: "drag to dig",
    overMsg: "RAN DRY",
    autoStart: true,
    init: () => makeDig(1),
    down: (s, x, y, api) => dig(s, x, y, api.W, api.H),
    move: (s, x, y, api) => dig(s, x, y, api.W, api.H),
    update: (s, dt, api) => {
      s.left -= dt;
      s.tick += dt;
      if (s.tick < 0.045) return;
      s.tick = 0;
      // bottom-up so a drop only moves once per step
      for (let r = DGH - 2; r >= 0; r--)
        for (let c = 0; c < DGW; c++) {
          const i = r * DGW + c;
          if (s.cells[i] !== 2) continue;
          const below = i + DGW;
          if (s.cells[below] === 0) {
            s.cells[below] = 2;
            s.cells[i] = 0;
            continue;
          }
          const dir = Math.random() < 0.5 ? -1 : 1;
          for (const d of [dir, -dir]) {
            const c2 = c + d;
            if (c2 < 0 || c2 >= DGW) continue;
            const side = below + d;
            if (s.cells[side] === 0 && s.cells[r * DGW + c2] === 0) {
              s.cells[side] = 2;
              s.cells[i] = 0;
              break;
            }
          }
        }
      // drops reaching the drain row are banked
      const drainRow = (DGH - 1) * DGW;
      for (let c = 0; c < DGW; c++) {
        if (s.cells[drainRow + c] === 2 && c >= s.goal && c < s.goal + 4) {
          s.cells[drainRow + c] = 0;
          s.target -= 1;
          api.add(1);
          api.haptic("light");
        }
      }
      if (s.target <= 0) {
        api.add(10);
        api.haptic("hit");
        Object.assign(s, makeDig(s.level + 1));
        return;
      }
      // top up the source so a slow player still has water
      if (s.cells[DGW + 2] === 0 && Math.random() < 0.5) s.cells[DGW + 2] = 2;
      if (s.left <= 0) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      // carve straight down from the source toward the drain
      for (let r = 2; r < DGH - 1; r++) {
        const c = Math.round(2 + ((s.goal + 2 - 2) * (r - 2)) / (DGH - 3));
        const i = r * DGW + c;
        if (s.cells[i] === 1) {
          s.cells[i] = 0;
          return;
        }
      }
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, -0.3));
      const cw = W / DGW;
      const chh = (H * 0.76) / DGH;
      const oy = H * 0.16;
      for (let r = 0; r < DGH; r++)
        for (let c = 0; c < DGW; c++) {
          const v = s.cells[r * DGW + c];
          if (!v) continue;
          g.fillStyle =
            v === 1 ? pal.foe : v === 2 ? pal.hero : shade(pal.glow, -0.4);
          g.fillRect(c * cw, oy + r * chh, cw + 0.5, chh + 0.5);
          if (v === 2) {
            g.fillStyle = alpha("#ffffff", 0.22);
            g.fillRect(c * cw, oy + r * chh, cw + 0.5, chh * 0.35);
          }
        }
      g.fillStyle = alpha(pal.prize, 0.5);
      g.fillRect(s.goal * cw, oy + (DGH - 1) * chh, cw * 4, chh);
      centred(g, `${api.score}`, W / 2, 40, 24, t.ink, t.fontDisplay);
      centred(
        g,
        `${s.target} more · ${Math.max(0, s.left).toFixed(0)}s`,
        W / 2,
        64,
        13,
        t.inkDim,
        t.fontBody,
        700
      );
    },
  }
);

function makeDig(level: number) {
  const cells = new Uint8Array(DGW * DGH);
  for (let r = 2; r < DGH; r++)
    for (let c = 0; c < DGW; c++) cells[r * DGW + c] = 1;
  // a couple of rock seams you have to route around
  for (let k = 0; k < level + 1; k++) {
    const rr = Math.floor(rand(6, DGH - 4));
    const cc = Math.floor(rand(0, DGW - 5));
    for (let i = 0; i < 5; i++) cells[rr * DGW + cc + i] = 3;
  }
  for (let r = 0; r < 2; r++) for (let c = 0; c < DGW; c++) cells[r * DGW + c] = 0;
  cells[DGW + 2] = 2;
  return {
    cells,
    goal: Math.floor(rand(4, DGW - 6)),
    target: 12,
    tick: 0,
    level,
    left: 60,
  };
}

function dig(
  s: { cells: Uint8Array },
  x: number,
  y: number,
  W: number,
  H: number
) {
  const cw = W / DGW;
  const chh = (H * 0.76) / DGH;
  const c = Math.floor(x / cw);
  const r = Math.floor((y - H * 0.16) / chh);
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= DGH || cc < 0 || cc >= DGW) continue;
      if (s.cells[rr * DGW + cc] === 1) s.cells[rr * DGW + cc] = 0;
    }
}

// -------------------------------------------------------------- Sled Line

const sledLine = defineGame<{
  line: { x: number; y: number }[];
  drawing: boolean;
  sled: { x: number; y: number; vx: number; vy: number } | null;
  ink: number;
  dist: number;
  goal: number;
}>(
  {
    slug: "sled-line",
    title: "Sled Line",
    rule: "Draw the hill, then ride it",
    year: 2006,
    description: "You are not playing the sled. You are playing the pencil.",
    history:
      "Homage to the 2006 draw-a-track toy that had no score, no goal and about ten million players anyway.",
    tags: ["calm", "drag", "precision"],
    palette: {
      hero: "#e63946",
      foe: "#1d3557",
      prize: "#f1faee",
      deep: "#a8dadc",
      glow: "#457b9d",
    },
    intensity: 0.3,
    speed: 0.35,
    difficulty: 0.4,
    luck: 0.2,
    nostalgia: 0.8,
    realism: 0.5,
    sessionLength: 0.5,
    scoreUnit: "m",
    maxScorePerSecond: 25,
  },
  {
    hint: "draw a line, then tap to ride",
    overMsg: "WIPEOUT",
    init: (api) => ({
      line: [{ x: 0, y: api.H * 0.4 }],
      drawing: false,
      sled: null,
      ink: 900,
      dist: 0,
      goal: api.W * 0.9,
    }),
    down: (s, x, y) => {
      if (s.sled) return;
      s.drawing = true;
      s.line.push({ x, y });
    },
    move: (s, x, y) => {
      if (!s.drawing || s.ink <= 0) return;
      const last = s.line[s.line.length - 1];
      const d = Math.hypot(x - last.x, y - last.y);
      if (d < 8) return;
      s.ink -= d;
      s.line.push({ x, y });
    },
    up: (s, _x, _y, api) => {
      if (!s.drawing) return;
      s.drawing = false;
      s.sled = { x: 10, y: api.H * 0.36, vx: 0, vy: 0 };
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      if (!s.sled) return;
      const b = s.sled;
      b.vy += H * 1.1 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // ride the nearest segment underfoot
      for (let i = 1; i < s.line.length; i++) {
        const a = s.line[i - 1];
        const c = s.line[i];
        if (b.x < Math.min(a.x, c.x) - 6 || b.x > Math.max(a.x, c.x) + 6) continue;
        const tt = clamp((b.x - a.x) / (c.x - a.x || 1), 0, 1);
        const sy = a.y + (c.y - a.y) * tt;
        if (b.y > sy - 8 && b.y < sy + 26) {
          b.y = sy - 8;
          const ang = Math.atan2(c.y - a.y, c.x - a.x);
          const speed = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(ang) * Math.max(speed * 0.99, 120);
          b.vy = Math.sin(ang) * Math.max(speed * 0.99, 120);
        }
      }
      s.dist = Math.max(s.dist, b.x);
      api.set(Math.floor(s.dist / 4));
      if (b.x > s.goal) {
        api.add(20);
        api.haptic("hit");
        // fresh sheet, longer run
        s.line = [{ x: 0, y: H * 0.4 }];
        s.ink = 900;
        s.sled = null;
        s.goal = Math.min(W * 0.95, s.goal + 40);
        s.dist = 0;
      }
      if (b.y > H + 30 || b.x < -30) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.sled) return;
      if (s.line.length < 12) {
        const last = s.line[s.line.length - 1];
        s.line.push({
          x: last.x + api.W * 0.09,
          y: clamp(last.y + rand(-20, 46), api.H * 0.3, api.H * 0.8),
        });
        return;
      }
      s.sled = { x: 10, y: api.H * 0.36, vx: 0, vy: 0 };
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.prize);
      // notebook rules
      g.strokeStyle = alpha(pal.glow, 0.25);
      g.lineWidth = 1;
      for (let y = H * 0.14; y < H; y += 26) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      g.strokeStyle = pal.foe;
      g.lineWidth = 4;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      s.line.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
      g.strokeStyle = alpha(pal.hero, 0.55);
      g.lineWidth = 2;
      g.setLineDash([4, 6]);
      g.beginPath();
      g.moveTo(s.goal, 0);
      g.lineTo(s.goal, H);
      g.stroke();
      g.setLineDash([]);
      if (s.sled) {
        g.save();
        g.translate(s.sled.x, s.sled.y);
        g.rotate(Math.atan2(s.sled.vy, s.sled.vx));
        g.fillStyle = pal.hero;
        roundRect(g, -12, -12, 24, 16, 5);
        g.fill();
        g.fillStyle = pal.foe;
        g.fillRect(-14, 4, 28, 3);
        g.restore();
      }
      centred(g, `${api.score}m`, W / 2, 40, 24, t.ink, t.fontDisplay);
      g.fillStyle = alpha(t.ink, 0.12);
      roundRect(g, W * 0.25, 56, W * 0.5, 8, 4);
      g.fill();
      g.fillStyle = pal.foe;
      roundRect(g, W * 0.25, 56, W * 0.5 * clamp(s.ink / 900, 0, 1), 8, 4);
      g.fill();
    },
  }
);

// ---------------------------------------------------------- Landing Lines

interface Plane {
  x: number;
  y: number;
  ang: number;
  path: { x: number; y: number }[];
  kind: 0 | 1;
  landed: boolean;
}

const landingLines = defineGame<{
  planes: Plane[];
  drawing: number | null;
  next: number;
}>(
  {
    slug: "landing-lines",
    title: "Landing Lines",
    rule: "Draw each one to its own strip",
    year: 2009,
    description: "It is calm for ninety seconds and then it is absolutely not.",
    history:
      "Homage to the 2009 traffic-control game that proved a touchscreen could do something a mouse never could.",
    tags: ["precision", "drag", "endurance", "calm"],
    palette: {
      hero: "#f4a261",
      foe: "#e76f51",
      prize: "#2a9d8f",
      deep: "#264653",
      glow: "#5b8a72",
    },
    intensity: 0.55,
    speed: 0.4,
    difficulty: 0.6,
    luck: 0.2,
    nostalgia: 0.8,
    realism: 0.5,
    sessionLength: 0.6,
    scoreUnit: "landings",
    maxScorePerSecond: 2,
  },
  {
    hint: "drag from a plane to its pad",
    overMsg: "COLLISION",
    autoStart: true,
    init: () => ({ planes: [], drawing: null, next: 0.6 }),
    down: (s, x, y) => {
      const i = s.planes.findIndex((p) => Math.hypot(p.x - x, p.y - y) < 32);
      if (i < 0) return;
      s.drawing = i;
      s.planes[i].path = [{ x, y }];
    },
    move: (s, x, y) => {
      if (s.drawing === null) return;
      const p = s.planes[s.drawing];
      const last = p.path[p.path.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) > 12) p.path.push({ x, y });
    },
    up: (s) => {
      s.drawing = null;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const pads: { x: number; y: number; kind: 0 | 1 }[] = [
        { x: W * 0.22, y: H * 0.86, kind: 0 },
        { x: W * 0.78, y: H * 0.86, kind: 1 },
      ];
      s.next -= dt;
      if (s.next <= 0) {
        const edge = Math.floor(rand(0, 3));
        const kind = (Math.random() < 0.5 ? 0 : 1) as 0 | 1;
        s.planes.push({
          x: edge === 0 ? -20 : edge === 1 ? W + 20 : rand(30, W - 30),
          y: edge === 2 ? -20 : rand(H * 0.2, H * 0.6),
          ang: 0,
          path: [],
          kind,
          landed: false,
        });
        s.next = Math.max(1.6, 4 - api.t * 0.05) / api.tune.density;
      }
      for (let i = s.planes.length - 1; i >= 0; i--) {
        const p = s.planes[i];
        const speed = 74;
        if (p.path.length) {
          const tgt = p.path[0];
          const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
          p.ang = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          if (d < 8) p.path.shift();
        } else {
          // drift toward the middle when it has no instructions
          p.ang = Math.atan2(H * 0.45 - p.y, W / 2 - p.x);
        }
        p.x += Math.cos(p.ang) * speed * dt;
        p.y += Math.sin(p.ang) * speed * dt;
        for (const pad of pads)
          if (pad.kind === p.kind && Math.hypot(pad.x - p.x, pad.y - p.y) < 26) {
            s.planes.splice(i, 1);
            api.add(1);
            api.haptic("hit");
            break;
          }
      }
      for (let i = 0; i < s.planes.length; i++)
        for (let j = i + 1; j < s.planes.length; j++)
          if (
            Math.hypot(
              s.planes[i].x - s.planes[j].x,
              s.planes[i].y - s.planes[j].y
            ) < 22
          )
            api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      const { W, H } = api;
      const pads = [
        { x: W * 0.22, y: H * 0.86, kind: 0 },
        { x: W * 0.78, y: H * 0.86, kind: 1 },
      ];
      for (const p of s.planes) {
        if (p.path.length) continue;
        const pad = pads.find((q) => q.kind === p.kind)!;
        p.path = [
          { x: pad.x, y: H * 0.7 - p.kind * 40 },
          { x: pad.x, y: pad.y },
        ];
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.glow, -0.35));
      const pads = [
        { x: W * 0.22, y: H * 0.86, kind: 0 as const },
        { x: W * 0.78, y: H * 0.86, kind: 1 as const },
      ];
      for (const pad of pads) {
        g.fillStyle = pad.kind === 0 ? pal.hero : pal.prize;
        roundRect(g, pad.x - 34, pad.y - 12, 68, 24, 8);
        g.fill();
        g.fillStyle = alpha("#000000", 0.3);
        for (let i = -2; i <= 2; i++) g.fillRect(pad.x + i * 12 - 2, pad.y - 3, 6, 6);
      }
      for (const p of s.planes) {
        if (p.path.length) {
          g.strokeStyle = alpha("#ffffff", 0.35);
          g.lineWidth = 2;
          g.setLineDash([4, 6]);
          g.beginPath();
          g.moveTo(p.x, p.y);
          p.path.forEach((q) => g.lineTo(q.x, q.y));
          g.stroke();
          g.setLineDash([]);
        }
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.ang);
        g.fillStyle = p.kind === 0 ? pal.hero : pal.prize;
        g.beginPath();
        g.moveTo(14, 0);
        g.lineTo(-8, -9);
        g.lineTo(-4, 0);
        g.lineTo(-8, 9);
        g.closePath();
        g.fill();
        g.restore();
      }
      centred(g, `${api.score} landed`, W / 2, 42, 22, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Guess Draw

const DRAW_SUBJECTS: { word: string; strokes: [number, number][][] }[] = [
  {
    word: "HOUSE",
    strokes: [
      [[0.3, 0.7], [0.3, 0.45], [0.7, 0.45], [0.7, 0.7], [0.3, 0.7]],
      [[0.25, 0.45], [0.5, 0.26], [0.75, 0.45]],
      [[0.45, 0.7], [0.45, 0.56], [0.56, 0.56], [0.56, 0.7]],
    ],
  },
  {
    word: "BOAT",
    strokes: [
      [[0.25, 0.62], [0.75, 0.62], [0.66, 0.74], [0.34, 0.74], [0.25, 0.62]],
      [[0.5, 0.62], [0.5, 0.28]],
      [[0.5, 0.3], [0.72, 0.55], [0.5, 0.55]],
    ],
  },
  {
    word: "STAR",
    strokes: [
      [[0.5, 0.24], [0.58, 0.46], [0.8, 0.46], [0.62, 0.6], [0.69, 0.8], [0.5, 0.67], [0.31, 0.8], [0.38, 0.6], [0.2, 0.46], [0.42, 0.46], [0.5, 0.24]],
    ],
  },
  {
    word: "FISH",
    strokes: [
      [[0.3, 0.5], [0.5, 0.38], [0.68, 0.5], [0.5, 0.62], [0.3, 0.5]],
      [[0.68, 0.5], [0.82, 0.38], [0.82, 0.62], [0.68, 0.5]],
      [[0.4, 0.47], [0.42, 0.47]],
    ],
  },
  {
    word: "TREE",
    strokes: [
      [[0.46, 0.78], [0.46, 0.54], [0.54, 0.54], [0.54, 0.78]],
      [[0.5, 0.22], [0.3, 0.56], [0.7, 0.56], [0.5, 0.22]],
    ],
  },
  {
    word: "CLOCK",
    strokes: [
      [[0.5, 0.26], [0.72, 0.4], [0.72, 0.66], [0.5, 0.8], [0.28, 0.66], [0.28, 0.4], [0.5, 0.26]],
      [[0.5, 0.36], [0.5, 0.53], [0.62, 0.6]],
    ],
  },
];

const guessDraw = defineGame<{
  idx: number;
  reveal: number;
  opts: string[];
  left: number;
  streak: number;
  flash: number;
  right: boolean;
}>(
  {
    slug: "guess-draw",
    title: "Guess Draw",
    rule: "Name it before it finishes",
    year: 2012,
    description: "Guess early for more points. Guess wrong for none.",
    history:
      "Homage to the 2012 draw-and-guess game that briefly made everyone in your contacts an amateur illustrator.",
    tags: ["memory", "calm", "precision"],
    palette: {
      hero: "#2ec4b6",
      foe: "#e71d36",
      prize: "#ff9f1c",
      deep: "#fdfffc",
      glow: "#e8ecef",
    },
    intensity: 0.4,
    speed: 0.4,
    difficulty: 0.35,
    luck: 0.25,
    nostalgia: 0.6,
    realism: 0.15,
    sessionLength: 0.4,
    scoreUnit: "pts",
    maxScorePerSecond: 6,
  },
  {
    hint: "tap the answer",
    overMsg: "OUT OF TIME",
    autoStart: true,
    init: () => newDrawRound(0),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y < H * 0.76) return;
      const i = clamp(Math.floor((x / W) * 2) + (y > H * 0.86 ? 2 : 0), 0, 3);
      const right = s.opts[i] === DRAW_SUBJECTS[s.idx].word;
      s.flash = 0.3;
      s.right = right;
      if (right) {
        const early = Math.max(0, 1 - s.reveal);
        api.add(2 + Math.round(early * 6));
        s.streak += 1;
        api.haptic("hit");
      } else {
        s.streak = 0;
        api.haptic("fail");
        s.left -= 4;
      }
      Object.assign(s, newDrawRound(s.streak), {
        left: s.left,
        streak: s.streak,
        flash: s.flash,
        right: s.right,
      });
    },
    update: (s, dt, api) => {
      s.reveal += dt * 0.34;
      s.left -= dt;
      s.flash = Math.max(0, s.flash - dt);
      if (s.reveal > 1.6) {
        s.streak = 0;
        Object.assign(s, newDrawRound(0), { left: s.left - 3, streak: 0 });
      }
      if (s.left <= 0) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      s.left = Math.max(12, s.left);
      if (s.reveal > 0.75) {
        api.add(3);
        s.streak += 1;
        s.flash = 0.3;
        s.right = true;
        Object.assign(s, newDrawRound(s.streak), {
          left: s.left,
          streak: s.streak,
          flash: 0.3,
          right: true,
        });
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const subject = DRAW_SUBJECTS[s.idx];
      // strokes appear in order, the last one partially drawn
      const total = subject.strokes.reduce((n, st) => n + st.length - 1, 0);
      let budget = clamp(s.reveal, 0, 1) * total;
      g.strokeStyle = "#1b1b1f";
      g.lineWidth = 5;
      g.lineCap = "round";
      g.lineJoin = "round";
      const bx = W * 0.5;
      const by = H * 0.42;
      const sc = Math.min(W * 0.8, H * 0.44);
      for (const st of subject.strokes) {
        if (budget <= 0) break;
        g.beginPath();
        for (let i = 0; i < st.length; i++) {
          const px = bx + (st[i][0] - 0.5) * sc;
          const py = by + (st[i][1] - 0.5) * sc;
          if (i === 0) {
            g.moveTo(px, py);
            continue;
          }
          if (budget <= 0) break;
          if (budget < 1) {
            const prev = st[i - 1];
            const qx = bx + (prev[0] + (st[i][0] - prev[0]) * budget - 0.5) * sc;
            const qy = by + (prev[1] + (st[i][1] - prev[1]) * budget - 0.5) * sc;
            g.lineTo(qx, qy);
          } else g.lineTo(px, py);
          budget -= 1;
        }
        g.stroke();
      }
      centred(g, `${api.score}`, W / 2, 40, 26, t.ink, t.fontDisplay);
      centred(
        g,
        `${Math.max(0, s.left).toFixed(0)}s${s.streak > 1 ? ` · ${s.streak} streak` : ""}`,
        W / 2,
        64,
        13,
        t.inkDim,
        t.fontBody,
        700
      );
      s.opts.forEach((w, i) => {
        const x = (i % 2) * (W / 2);
        const y = H * 0.76 + Math.floor(i / 2) * (H * 0.1);
        g.fillStyle = alpha(pal.hero, 0.16);
        roundRect(g, x + 8, y + 5, W / 2 - 16, H * 0.09 - 10, 12);
        g.fill();
        centred(g, w, x + W / 4, y + H * 0.055, 19, t.ink, t.fontDisplay);
      });
      if (s.flash > 0) {
        g.fillStyle = alpha(s.right ? pal.hero : pal.foe, s.flash);
        g.fillRect(0, 0, W, H * 0.06);
      }
    },
  }
);

function newDrawRound(streak: number) {
  const idx = Math.floor(rand(0, DRAW_SUBJECTS.length));
  const word = DRAW_SUBJECTS[idx].word;
  const others = DRAW_SUBJECTS.map((d) => d.word).filter((w) => w !== word);
  others.sort(() => Math.random() - 0.5);
  const opts = [word, ...others.slice(0, 3)].sort(() => Math.random() - 0.5);
  return { idx, reveal: 0, opts, left: 45, streak, flash: 0, right: true };
}

// --------------------------------------------------------------- Junk Rig

const RIG_PARTS = [
  { name: "Wheels", drive: 130, lift: 0, cost: 1 },
  { name: "Rocket", drive: 260, lift: 40, cost: 2 },
  { name: "Balloon", drive: 40, lift: 190, cost: 2 },
  { name: "Spring", drive: 90, lift: 120, cost: 1 },
];

const junkRig = defineGame<{
  build: number[];
  running: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  budget: number;
  level: number;
  seed: number;
}>(
  {
    slug: "junk-rig",
    title: "Junk Rig",
    rule: "Bolt it together, then hope",
    year: 2012,
    description: "Half engineering, half nonsense. Mostly nonsense.",
    history:
      "Homage to the 2012 contraption builder that replaced aiming with assembly and made failure the funniest outcome.",
    tags: ["chaos", "calm", "luck"],
    palette: {
      hero: "#90a959",
      foe: "#6b705c",
      prize: "#ee964b",
      deep: "#87c5e8",
      glow: "#cfd8b6",
    },
    intensity: 0.4,
    speed: 0.35,
    difficulty: 0.45,
    luck: 0.5,
    nostalgia: 0.6,
    realism: 0.4,
    sessionLength: 0.5,
    scoreUnit: "runs",
    maxScorePerSecond: 2,
  },
  {
    hint: "tap parts, then tap GO",
    overMsg: "SCRAPPED",
    init: () => ({
      build: [],
      running: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      budget: 3,
      level: 1,
      seed: Math.random() * 10,
    }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (s.running) return;
      if (y > H * 0.84) {
        if (!s.build.length) return;
        s.running = true;
        s.x = W * 0.12;
        s.y = H * 0.62;
        s.vx = 0;
        s.vy = 0;
        api.haptic("hit");
        return;
      }
      if (y < H * 0.66) return;
      const i = clamp(Math.floor((x / W) * RIG_PARTS.length), 0, RIG_PARTS.length - 1);
      const cost = RIG_PARTS[i].cost;
      if (s.budget >= cost) {
        s.build.push(i);
        s.budget -= cost;
        api.haptic("light");
      } else api.haptic("fail");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      if (!s.running) return;
      const drive = s.build.reduce((n, i) => n + RIG_PARTS[i].drive, 0);
      const lift = s.build.reduce((n, i) => n + RIG_PARTS[i].lift, 0);
      s.vx += (drive - s.vx * 1.4) * dt;
      s.vy += (H * 1.2 - lift * 1.5) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const ground = terrainY(s.x, H, s.seed);
      if (s.y > ground) {
        s.y = ground;
        s.vy = -Math.abs(s.vy) * 0.25;
        s.vx *= 0.94;
      }
      if (s.x > W * 0.86) {
        api.add(1);
        api.haptic("hit");
        s.level += 1;
        s.budget = 3 + Math.floor(s.level / 2);
        s.build = [];
        s.running = false;
        s.seed = Math.random() * 10;
        return;
      }
      if (s.vx < 6 && s.y >= ground - 1 && api.t > 1) {
        // stalled out: one rebuild, then it's over
        s.running = false;
        s.build = [];
        s.budget -= 1;
        if (s.budget <= 0) api.end();
        else s.budget = 3;
      }
      if (s.y < -80) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.running) return;
      if (s.build.length < 2) {
        s.build.push(Math.floor(rand(0, RIG_PARTS.length)));
        return;
      }
      s.running = true;
      s.x = api.W * 0.12;
      s.y = api.H * 0.62;
      s.vx = 0;
      s.vy = 0;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.fillStyle = pal.foe;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, terrainY(x, H, s.seed));
      g.lineTo(W, H);
      g.closePath();
      g.fill();
      g.fillStyle = pal.prize;
      g.fillRect(W * 0.86, terrainY(W * 0.86, H, s.seed) - 46, 4, 46);
      g.beginPath();
      g.moveTo(W * 0.86 + 4, terrainY(W * 0.86, H, s.seed) - 46);
      g.lineTo(W * 0.86 + 30, terrainY(W * 0.86, H, s.seed) - 38);
      g.lineTo(W * 0.86 + 4, terrainY(W * 0.86, H, s.seed) - 30);
      g.closePath();
      g.fill();
      const rx = s.running ? s.x : W * 0.12;
      const ry = s.running ? s.y : terrainY(W * 0.12, H, s.seed);
      g.fillStyle = "#8d6e63";
      roundRect(g, rx - 18, ry - 22, 36, 20, 4);
      g.fill();
      s.build.forEach((i, k) => {
        const px = rx - 14 + k * 13;
        g.fillStyle = [pal.hero, "#e63946", "#ff8fab", "#4cc9f0"][i];
        if (i === 2) {
          circle(g, px, ry - 46, 12);
          g.fill();
          g.strokeStyle = alpha("#000000", 0.3);
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(px, ry - 34);
          g.lineTo(px, ry - 22);
          g.stroke();
        } else {
          roundRect(g, px - 6, ry - 34, 12, 12, 3);
          g.fill();
        }
      });
      g.fillStyle = "#33302e";
      circle(g, rx - 11, ry, 7);
      g.fill();
      circle(g, rx + 11, ry, 7);
      g.fill();
      if (!s.running) {
        const bw = W / RIG_PARTS.length;
        RIG_PARTS.forEach((p, i) => {
          const can = s.budget >= p.cost;
          g.fillStyle = can ? alpha(pal.hero, 0.85) : alpha(pal.foe, 0.4);
          roundRect(g, i * bw + 5, H * 0.68, bw - 10, H * 0.11, 10);
          g.fill();
          centred(g, p.name, i * bw + bw / 2, H * 0.72, 14, "#20240f", t.fontBody, 800);
          centred(g, `${p.cost}`, i * bw + bw / 2, H * 0.762, 16, "#20240f", t.fontDisplay);
        });
        g.fillStyle = s.build.length ? pal.prize : alpha(pal.prize, 0.3);
        roundRect(g, W * 0.3, H * 0.855, W * 0.4, H * 0.07, 14);
        g.fill();
        centred(g, "GO", W / 2, H * 0.855 + H * 0.048, 24, "#2b1a06", t.fontDisplay);
      }
      centred(g, `${api.score} runs · ${s.budget} bolts`, W / 2, 40, 18, t.ink, t.fontDisplay);
    },
  }
);

function terrainY(x: number, H: number, seed: number): number {
  return (
    H * 0.72 + Math.sin(x * 0.011 + seed) * H * 0.07 + Math.sin(x * 0.031 + seed * 2) * H * 0.03
  );
}

// ----------------------------------------------------------- Hammer Climb

const hammerClimb = defineGame<{
  x: number;
  /** world y — smaller is higher up the mountain */
  y: number;
  vx: number;
  vy: number;
  hx: number;
  hy: number;
  anchored: boolean;
  best: number;
  /** world y of the top of the viewport */
  cam: number;
  seed: number;
}>(
  {
    slug: "hammer-climb",
    title: "Hammer Climb",
    rule: "Drag the hammer, drag yourself",
    year: 2017,
    description: "Every metre is earned. Every metre is also refundable.",
    history:
      "Homage to the 2017 rage-climbing game that made losing an hour of progress a legitimate design choice.",
    tags: ["precision", "drag", "chaos", "endurance"],
    palette: {
      hero: "#e5989b",
      foe: "#6d6875",
      prize: "#ffcdb2",
      deep: "#22223b",
      glow: "#4a4e69",
    },
    intensity: 0.55,
    speed: 0.4,
    difficulty: 0.95,
    luck: 0.15,
    nostalgia: 0.2,
    realism: 0.4,
    sessionLength: 0.5,
    scoreUnit: "m",
    maxScorePerSecond: 8,
  },
  {
    hint: "drag to swing the hammer",
    overMsg: "BACK DOWN",
    autoStart: true,
    init: (api) => ({
      x: api.W / 2,
      y: api.H * 0.7,
      vx: 0,
      vy: 0,
      hx: api.W / 2 + 50,
      hy: api.H * 0.7,
      anchored: false,
      best: 0,
      cam: 0,
      seed: Math.random() * 10,
    }),
    down: (s, x, y) => {
      s.hx = x;
      s.hy = y + s.cam;
    },
    move: (s, x, y) => {
      s.hx = x;
      s.hy = y + s.cam;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      // hammer head is tethered to the climber
      const dx = s.hx - s.x;
      const dy = s.hy - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const maxLen = 78;
      if (d > maxLen) {
        s.hx = s.x + (dx / d) * maxLen;
        s.hy = s.y + (dy / d) * maxLen;
      }
      const rock = slabAt(s.hx, s.hy, W, H, s.seed);
      s.anchored = rock;
      if (rock) {
        // pull the body toward the planted head
        s.vx += (s.hx - s.x) * 6 * dt;
        s.vy += (s.hy - s.y) * 6 * dt - H * 0.2 * dt;
        s.vx *= 0.86;
        s.vy *= 0.86;
      } else {
        s.vy += H * 1.5 * dt;
        s.vx *= 0.99;
      }
      s.x = clamp(s.x + s.vx * dt, 20, W - 20);
      s.y += s.vy * dt;
      // the body cannot pass through rock either
      let guard = 0;
      while (slabAt(s.x, s.y + 16, W, H, s.seed) && guard++ < 40) {
        s.y -= 2;
        s.vy = Math.min(s.vy, 0);
      }
      const floor = H * 0.95;
      if (s.y > floor) {
        s.y = floor;
        s.vy = 0;
      }
      // the camera trails the climber so the mountain scrolls under them
      s.cam += (s.y - H * 0.62 - s.cam) * Math.min(1, dt * 4);
      const climbed = Math.max(0, (H * 0.7 - s.y) / 6);
      s.best = Math.max(s.best, climbed);
      api.set(Math.floor(s.best));
      // sliding all the way back to the bottom ends it — that is the joke
      if (s.best > 25 && climbed <= 0) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      // hunt for rock above and haul upward
      const { W, H } = api;
      for (let a = -2.2; a < -0.9; a += 0.1) {
        const tx = s.x + Math.cos(a) * 70;
        const ty = s.y + Math.sin(a) * 70;
        if (slabAt(tx, ty, W, H, s.seed)) {
          s.hx = tx;
          s.hy = ty;
          return;
        }
      }
      s.hx = s.x + Math.sin(api.t * 2) * 60;
      s.hy = s.y - 60;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      // the mountain, as an endless stack of slabs in world space.
      // screen y = slabTop(i) - cam, so the visible band of i falls out of that
      const first = Math.floor((-0.05 * H - s.cam) / SLAB_STEP(H)) - 1;
      const span = Math.ceil(H / SLAB_STEP(H)) + 3;
      for (let i = first; i < first + span; i++) {
        const y = slabTop(i, H) - s.cam;
        if (y < -60 || y > H + 60) continue;
        const off = Math.sin(i * 1.7 + s.seed) * W * 0.16;
        g.fillStyle = i % 2 ? shade(pal.foe, -0.15) : pal.foe;
        roundRect(g, W / 2 - SLAB_W(W) / 2 + off, y, SLAB_W(W), H * 0.07, 8);
        g.fill();
      }
      const sy = s.y - s.cam;
      const hy = s.hy - s.cam;
      g.strokeStyle = shade(pal.prize, -0.4);
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(s.x, sy);
      g.lineTo(s.hx, hy);
      g.stroke();
      g.fillStyle = s.anchored ? pal.prize : pal.hero;
      roundRect(g, s.hx - 13, hy - 7, 26, 14, 4);
      g.fill();
      g.fillStyle = pal.hero;
      circle(g, s.x, sy, 15);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.4);
      roundRect(g, s.x - 16, sy + 8, 32, 22, 9);
      g.fill();
      centred(g, `${api.score}m`, W / 2, 42, 26, t.ink, t.fontDisplay);
    },
  }
);

const SLAB_STEP = (H: number) => H * 0.085;
const SLAB_W = (W: number) => W * 0.62;
/** World y of slab i's top face. i grows upward from the base. */
const slabTop = (i: number, H: number) => H * 0.95 - i * SLAB_STEP(H);

function slabAt(x: number, y: number, W: number, H: number, seed: number): boolean {
  const i = Math.round((H * 0.95 - y) / SLAB_STEP(H));
  for (const k of [i - 1, i, i + 1]) {
    const top = slabTop(k, H);
    const off = Math.sin(k * 1.7 + seed) * W * 0.16;
    const left = W / 2 - SLAB_W(W) / 2 + off;
    if (x > left && x < left + SLAB_W(W) && y > top && y < top + H * 0.07) return true;
  }
  return false;
}

// ---------------------------------------------------------- Grapple Swing

const grappleSwing = defineGame<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  anchor: { x: number; y: number } | null;
  len: number;
  pins: { x: number; y: number }[];
  dist: number;
}>(
  {
    slug: "grapple-swing",
    title: "Grapple Swing",
    rule: "Hold to hook, let go to fly",
    year: 2019,
    description: "Momentum is free. Timing is not.",
    history:
      "Homage to the 2019 one-button swinger whose whole physics engine was a rope, a pin and a very good release window.",
    tags: ["reflex", "precision", "hold", "endurance"],
    palette: {
      hero: "#f8f9fa",
      foe: "#ff4d6d",
      prize: "#ffd166",
      deep: "#390099",
      glow: "#9e0059",
    },
    intensity: 0.7,
    speed: 0.7,
    difficulty: 0.55,
    luck: 0.15,
    nostalgia: 0.2,
    realism: 0.3,
    sessionLength: 0.35,
    scoreUnit: "m",
    maxScorePerSecond: 40,
  },
  {
    hint: "hold to grab a pin",
    overMsg: "SPLAT",
    autoStart: true,
    init: (api) => ({
      x: api.W * 0.2,
      y: api.H * 0.5,
      vx: api.W * 0.35,
      vy: 0,
      anchor: null,
      len: 0,
      pins: Array.from({ length: 8 }, (_, i) => ({
        x: api.W * 0.5 + i * api.W * 0.55,
        y: rand(api.H * 0.14, api.H * 0.4),
      })),
      dist: 0,
    }),
    down: (s, _x, _y, api) => {
      const near = s.pins
        .filter((p) => p.x > s.x - 40)
        .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      if (!near) return;
      s.anchor = near;
      s.len = Math.hypot(near.x - s.x, near.y - s.y);
      api.haptic("light");
    },
    up: (s) => {
      s.anchor = null;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.vy += H * 1.5 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.anchor) {
        const dx = s.x - s.anchor.x;
        const dy = s.y - s.anchor.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > s.len) {
          const nx = dx / d;
          const ny = dy / d;
          s.x = s.anchor.x + nx * s.len;
          s.y = s.anchor.y + ny * s.len;
          const radial = s.vx * nx + s.vy * ny;
          s.vx -= radial * nx;
          s.vy -= radial * ny;
        }
      }
      // the world scrolls so the swinger stays left of centre
      if (s.x > W * 0.4) {
        const shift = s.x - W * 0.4;
        s.x -= shift;
        s.dist += shift;
        for (const p of s.pins) p.x -= shift;
        if (s.anchor) s.anchor.x -= shift;
      }
      api.set(Math.floor(s.dist / 10));
      const last = s.pins[s.pins.length - 1];
      if (last.x < W * 1.6)
        s.pins.push({ x: last.x + rand(W * 0.42, W * 0.7), y: rand(H * 0.12, H * 0.44) });
      s.pins = s.pins.filter((p) => p.x > -W * 0.4 || p === s.anchor);
      if (s.y > H - 16 || s.y < -H * 0.5) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      if (!s.anchor) {
        const near = s.pins.find((p) => p.x > s.x + 20 && p.x < s.x + api.W * 0.4);
        if (near && s.vy > 0) {
          s.anchor = near;
          s.len = Math.hypot(near.x - s.x, near.y - s.y);
        }
      } else if (s.x > s.anchor.x + 10 && s.vy < 0) s.anchor = null;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.fillStyle = alpha("#000000", 0.35);
      g.fillRect(0, H - 12, W, 12);
      for (const p of s.pins) {
        g.fillStyle = pal.prize;
        circle(g, p.x, p.y, 8);
        g.fill();
        g.fillStyle = alpha(pal.prize, 0.25);
        circle(g, p.x, p.y, 16);
        g.fill();
      }
      if (s.anchor) {
        g.strokeStyle = pal.hero;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(s.anchor.x, s.anchor.y);
        g.lineTo(s.x, s.y);
        g.stroke();
      }
      const ang = Math.atan2(s.vy, s.vx);
      g.save();
      g.translate(s.x, s.y);
      g.rotate(ang - Math.PI / 2);
      g.fillStyle = pal.hero;
      circle(g, 0, -10, 7);
      g.fill();
      g.fillRect(-2.5, -4, 5, 18);
      g.strokeStyle = pal.hero;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 14);
      g.lineTo(-8, 26);
      g.moveTo(0, 14);
      g.lineTo(8, 26);
      g.moveTo(0, 0);
      g.lineTo(-10, -8);
      g.moveTo(0, 0);
      g.lineTo(10, -8);
      g.stroke();
      g.restore();
      centred(g, `${api.score}m`, W / 2, 42, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------------- Legs

const legs = defineGame<{
  phase: 0 | 1;
  dist: number;
  lean: number;
  thigh: number;
  cadence: number;
  wrong: number;
}>(
  {
    slug: "legs",
    title: "Legs",
    rule: "Alternate sides. Do not fall over.",
    year: 2008,
    description: "Walking, taught the hard way, one thigh at a time.",
    history:
      "Homage to the 2008 browser athletics joke that made independent limb control into the least playable and most watched game of its year.",
    tags: ["precision", "chaos", "memory"],
    palette: {
      hero: "#ffd166",
      foe: "#ef476f",
      prize: "#06d6a0",
      deep: "#118ab2",
      glow: "#073b4c",
    },
    intensity: 0.6,
    speed: 0.4,
    difficulty: 0.85,
    luck: 0.1,
    nostalgia: 0.8,
    realism: 0.45,
    sessionLength: 0.3,
    scoreUnit: "m",
    maxScorePerSecond: 6,
  },
  {
    hint: "tap the lit side",
    overMsg: "FACE PLANT",
    init: () => ({ phase: 0 as 0 | 1, dist: 0, lean: 0, thigh: 0, cadence: 0, wrong: 0 }),
    down: (s, x, _y, api) => {
      const side = x < api.W / 2 ? 0 : 1;
      if (side === s.phase) {
        s.phase = (1 - s.phase) as 0 | 1;
        s.dist += 1.4;
        s.cadence = 0.28;
        s.lean *= 0.55;
        s.thigh = 0;
        api.set(Math.floor(s.dist));
        api.haptic("light");
      } else {
        s.lean += 0.42;
        s.wrong += 1;
        api.haptic("fail");
      }
    },
    update: (s, dt, api) => {
      s.cadence = Math.max(0, s.cadence - dt);
      s.thigh += dt;
      // standing still is its own kind of falling
      s.lean += (0.1 + s.thigh * 0.42) * dt;
      if (s.lean > 1.5) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.cadence <= 0) {
        s.phase = (1 - s.phase) as 0 | 1;
        s.dist += 1.4;
        s.cadence = 0.3;
        s.lean *= 0.5;
        s.thigh = 0;
        api.set(Math.floor(s.dist));
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const gy = H * 0.78;
      g.fillStyle = shade(pal.glow, -0.3);
      g.fillRect(0, gy, W, H - gy);
      g.fillStyle = alpha("#ffffff", 0.4);
      for (let x = -((s.dist * 26) % 60); x < W; x += 60) g.fillRect(x, gy + 14, 30, 3);
      const cx = W / 2;
      g.save();
      g.translate(cx, gy);
      g.rotate(-s.lean * 0.5);
      g.strokeStyle = pal.hero;
      g.lineWidth = 7;
      g.lineCap = "round";
      const swing = s.cadence > 0 ? Math.sin((1 - s.cadence / 0.28) * Math.PI) : 0;
      const l = s.phase === 0 ? swing : -swing;
      g.beginPath();
      g.moveTo(0, -76);
      g.lineTo(0, -34);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -34);
      g.lineTo(-16 + l * 22, -2);
      g.moveTo(0, -34);
      g.lineTo(16 - l * 22, -2);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -66);
      g.lineTo(-20 - l * 14, -44);
      g.moveTo(0, -66);
      g.lineTo(20 + l * 14, -44);
      g.stroke();
      g.fillStyle = pal.hero;
      circle(g, 0, -88, 13);
      g.fill();
      g.restore();
      const lit = s.phase === 0 ? 0 : 1;
      for (let i = 0; i < 2; i++) {
        g.fillStyle = i === lit ? alpha(pal.prize, 0.85) : alpha(pal.glow, 0.3);
        roundRect(g, i * (W / 2) + 10, H * 0.86, W / 2 - 20, H * 0.1, 14);
        g.fill();
        centred(
          g,
          i === 0 ? "LEFT" : "RIGHT",
          i * (W / 2) + W / 4,
          H * 0.86 + H * 0.062,
          20,
          i === lit ? "#053b2c" : t.inkDim,
          t.fontDisplay
        );
      }
      centred(g, `${Math.floor(s.dist)}m`, W / 2, 44, 28, t.ink, t.fontDisplay);
      g.fillStyle = alpha(t.ink, 0.12);
      roundRect(g, W * 0.25, 66, W * 0.5, 8, 4);
      g.fill();
      g.fillStyle = s.lean > 1 ? pal.foe : pal.prize;
      roundRect(g, W * 0.25, 66, W * 0.5 * clamp(s.lean / 1.5, 0, 1), 8, 4);
      g.fill();
    },
  }
);

// ------------------------------------------------------------------- Pour

const pour = defineGame<{
  tilt: number;
  inGlass: number;
  poured: number;
  target: number;
  spill: number;
  level: number;
  wobble: number;
}>(
  {
    slug: "pour",
    title: "Pour",
    rule: "Tilt to the line, not past it",
    year: 2008,
    description: "A novelty app that is, annoyingly, a real precision game.",
    history:
      "Homage to the 2008 tilt gag app that sold a million copies by simulating one liquid and absolutely nothing else.",
    tags: ["precision", "drag", "calm"],
    palette: {
      hero: "#f4a259",
      foe: "#bc4749",
      prize: "#f2e8cf",
      deep: "#386641",
      glow: "#6a994e",
    },
    intensity: 0.3,
    speed: 0.3,
    difficulty: 0.45,
    luck: 0.15,
    nostalgia: 0.8,
    realism: 0.55,
    sessionLength: 0.4,
    scoreUnit: "pours",
    maxScorePerSecond: 2,
  },
  {
    hint: "drag right to tilt",
    overMsg: "SPILLED IT",
    autoStart: true,
    init: () => ({
      tilt: 0,
      inGlass: 1,
      poured: 0,
      target: rand(0.35, 0.8),
      spill: 0,
      level: 1,
      wobble: 0,
    }),
    move: (s, x, _y, api) => {
      s.tilt = clamp((x - api.W * 0.3) / (api.W * 0.5), 0, 1);
    },
    down: (s, x, _y, api) => {
      s.tilt = clamp((x - api.W * 0.3) / (api.W * 0.5), 0, 1);
    },
    up: (s, _x, _y, api) => {
      if (s.poured < s.target * 0.92) {
        api.haptic("fail");
        s.spill += 1;
        if (s.spill >= 3) api.end();
        s.poured = 0;
        s.inGlass = 1;
        s.target = rand(0.35, 0.8);
        return;
      }
      const err = Math.abs(s.poured - s.target);
      const pts = err < 0.03 ? 5 : err < 0.08 ? 3 : 1;
      api.add(pts);
      api.haptic("hit");
      s.level += 1;
      s.poured = 0;
      s.inGlass = 1;
      s.tilt = 0;
      s.target = rand(0.3, 0.85);
    },
    update: (s, dt, api) => {
      s.wobble += dt * 3;
      if (s.tilt > 0.25 && s.inGlass > 0) {
        const rate = (s.tilt - 0.25) * 0.75 * (1 + s.level * 0.06);
        const flow = Math.min(s.inGlass, rate * dt);
        s.inGlass -= flow;
        s.poured += flow;
      }
      if (s.poured > s.target + 0.12) {
        s.spill += 1;
        api.haptic("fail");
        if (s.spill >= 3) {
          api.end();
          return;
        }
        s.poured = 0;
        s.inGlass = 1;
        s.tilt = 0;
        s.target = rand(0.35, 0.8);
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.poured < s.target - 0.02) s.tilt = 0.42;
      else {
        s.tilt = 0;
        if (s.poured > s.target - 0.05) {
          api.add(3);
          s.poured = 0;
          s.inGlass = 1;
          s.target = rand(0.3, 0.85);
          s.level += 1;
        }
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      // pouring glass, tilted
      g.save();
      g.translate(W * 0.28, H * 0.36);
      g.rotate(s.tilt * 1.1);
      g.fillStyle = alpha(pal.prize, 0.25);
      roundRect(g, -34, -60, 68, 120, 8);
      g.fill();
      g.fillStyle = pal.hero;
      const fh = 116 * s.inGlass;
      roundRect(g, -31, 57 - fh, 62, fh, 6);
      g.fill();
      g.strokeStyle = alpha(pal.prize, 0.85);
      g.lineWidth = 3;
      roundRect(g, -34, -60, 68, 120, 8);
      g.stroke();
      g.restore();
      // stream
      if (s.tilt > 0.25 && s.inGlass > 0) {
        g.fillStyle = pal.hero;
        g.beginPath();
        g.moveTo(W * 0.28 + 26, H * 0.36 + 6);
        g.quadraticCurveTo(W * 0.5, H * 0.5, W * 0.68, H * 0.66);
        g.lineTo(W * 0.72, H * 0.66);
        g.quadraticCurveTo(W * 0.54, H * 0.5, W * 0.32 + 26, H * 0.36 + 6);
        g.closePath();
        g.fill();
      }
      // receiving glass with the target line
      const gx = W * 0.7;
      const gy = H * 0.62;
      const gh = H * 0.28;
      g.fillStyle = alpha(pal.prize, 0.2);
      roundRect(g, gx - 42, gy, 84, gh, 8);
      g.fill();
      const lvl = clamp(s.poured, 0, 1) * (gh - 8);
      g.fillStyle = pal.hero;
      roundRect(g, gx - 39, gy + gh - 4 - lvl, 78, lvl, 5);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.4);
      g.fillRect(gx - 39, gy + gh - 4 - lvl, 78, 3 + Math.sin(s.wobble) * 2);
      const ty = gy + gh - 4 - s.target * (gh - 8);
      g.strokeStyle = pal.foe;
      g.lineWidth = 3;
      g.setLineDash([7, 5]);
      g.beginPath();
      g.moveTo(gx - 52, ty);
      g.lineTo(gx + 52, ty);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = alpha(pal.prize, 0.9);
      g.lineWidth = 3;
      roundRect(g, gx - 42, gy, 84, gh, 8);
      g.stroke();
      centred(g, `${api.score}`, W / 2, 42, 26, t.ink, t.fontDisplay);
      centred(g, "let go when you hit the line", W / 2, 66, 13, t.inkDim, t.fontBody, 700);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < s.spill ? pal.foe : alpha(pal.foe, 0.2);
        circle(g, W - 22 - i * 17, 40, 6);
        g.fill();
      }
    },
  }
);

export const physicsPack: GameModule[] = [
  snipDrop,
  digFlow,
  sledLine,
  landingLines,
  guessDraw,
  junkRig,
  hammerClimb,
  grappleSwing,
  legs,
  pour,
];
