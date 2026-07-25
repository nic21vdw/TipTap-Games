// Arena pack — open boards with other things moving in them. The .io years,
// plus the two swipe games that defined a touchscreen.

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
import { alpha, circle, clamp, pick, rand, roundRect, shade } from "@/games/engine";

const BOT_NAMES = [
  "pixelpete", "swipequeen", "thumbwizard", "nervebank", "combo_carl",
  "latenightlena", "greenzone", "tap_god_77", "onemorego", "feedrider",
];

// ------------------------------------------------------------------ Coil

interface Worm {
  pts: { x: number; y: number }[];
  ang: number;
  len: number;
  col: string;
  name: string;
  dead: boolean;
}

const coil = defineGame<{
  me: Worm;
  bots: Worm[];
  target: number;
  pellets: { x: number; y: number; col: string }[];
  cam: { x: number; y: number };
}>(
  {
    slug: "coil",
    title: "Coil",
    rule: "Cut them off, eat what drops",
    year: 2016,
    description: "Everyone here is bigger than you and none of them are real.",
    history:
      "Homage to the 2016 browser snake arena whose lobby of strangers turned out to be, for most people, mostly bots.",
    tags: ["reflex", "endurance", "drag", "chaos"],
    palette: {
      hero: "#8ac926",
      foe: "#ff595e",
      prize: "#ffca3a",
      deep: "#101820",
      glow: "#1982c4",
    },
    intensity: 0.65,
    speed: 0.6,
    difficulty: 0.55,
    luck: 0.3,
    nostalgia: 0.4,
    realism: 0.2,
    sessionLength: 0.6,
    scoreUnit: "mass",
    maxScorePerSecond: 25,
  },
  {
    hint: "drag to steer",
    overMsg: "CUT OFF",
    autoStart: true,
    init: (api) => {
      const mk = (x: number, y: number, col: string, name: string, len: number): Worm => ({
        pts: Array.from({ length: len }, () => ({ x, y })),
        ang: rand(0, 6.28),
        len,
        col,
        name,
        dead: false,
      });
      const W = api.W;
      const H = api.H;
      return {
        me: mk(W / 2, H / 2, api.pal.hero, "you", 22),
        bots: Array.from({ length: 5 }, (_, i) =>
          mk(rand(0, W * 2), rand(0, H * 2), ["#ff595e", "#1982c4", "#ffca3a", "#6a4c93", "#ff8fab"][i], BOT_NAMES[i], 24 + i * 8)
        ),
        target: 0,
        pellets: Array.from({ length: 90 }, () => ({
          x: rand(0, W * 2),
          y: rand(0, H * 2),
          col: pick(["#ffca3a", "#8ac926", "#ff8fab", "#4cc9f0"]),
        })),
        cam: { x: 0, y: 0 },
      };
    },
    move: (s, x, y, api) => {
      s.target = Math.atan2(y - api.H / 2, x - api.W / 2);
    },
    down: (s, x, y, api) => {
      s.target = Math.atan2(y - api.H / 2, x - api.W / 2);
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const world = { w: W * 2, h: H * 2 };
      const step = (w: Worm, speed: number) => {
        const head = w.pts[0];
        const nx = clamp(head.x + Math.cos(w.ang) * speed * dt, 6, world.w - 6);
        const ny = clamp(head.y + Math.sin(w.ang) * speed * dt, 6, world.h - 6);
        w.pts.unshift({ x: nx, y: ny });
        while (w.pts.length > w.len) w.pts.pop();
      };
      // steer me toward the drag angle
      let d = ((s.target - s.me.ang + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      s.me.ang += clamp(d, -4 * dt, 4 * dt);
      step(s.me, 190);
      for (const b of s.bots) {
        if (b.dead) continue;
        // bots chase the nearest pellet and mostly avoid walls
        const head = b.pts[0];
        const p = s.pellets.reduce(
          (best, q) =>
            Math.hypot(q.x - head.x, q.y - head.y) <
            Math.hypot(best.x - head.x, best.y - head.y)
              ? q
              : best,
          s.pellets[0]
        );
        const want = Math.atan2(p.y - head.y, p.x - head.x);
        let bd = ((want - b.ang + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        b.ang += clamp(bd, -2.4 * dt, 2.4 * dt);
        step(b, 160);
      }
      const head = s.me.pts[0];
      for (const p of s.pellets) {
        if (Math.hypot(p.x - head.x, p.y - head.y) < 16) {
          p.x = rand(0, world.w);
          p.y = rand(0, world.h);
          s.me.len += 2;
          api.set(s.me.len - 22);
          api.haptic("light");
        }
      }
      // heads into bodies
      for (const b of s.bots) {
        if (b.dead) continue;
        for (let i = 6; i < b.pts.length; i += 3)
          if (Math.hypot(b.pts[i].x - head.x, b.pts[i].y - head.y) < 12) {
            api.end();
            return;
          }
        const bh = b.pts[0];
        for (let i = 6; i < s.me.pts.length; i += 3)
          if (Math.hypot(s.me.pts[i].x - bh.x, s.me.pts[i].y - bh.y) < 12) {
            b.dead = true;
            api.add(20);
            api.haptic("hit");
            // the dead worm becomes food
            for (let k = 0; k < b.pts.length; k += 4)
              s.pellets.push({ x: b.pts[k].x, y: b.pts[k].y, col: b.col });
            break;
          }
      }
      if (s.bots.every((b) => b.dead)) {
        api.add(60);
        for (const b of s.bots) {
          b.dead = false;
          b.pts = Array.from({ length: 26 }, () => ({
            x: rand(0, world.w),
            y: rand(0, world.h),
          }));
          b.len = 26;
        }
      }
      s.cam.x = clamp(head.x - W / 2, 0, world.w - W);
      s.cam.y = clamp(head.y - H / 2, 0, world.h - H);
    },
    bot: (s, dt, api) => {
      void dt;
      const head = s.me.pts[0];
      const p = s.pellets.reduce(
        (best, q) =>
          Math.hypot(q.x - head.x, q.y - head.y) < Math.hypot(best.x - head.x, best.y - head.y)
            ? q
            : best,
        s.pellets[0]
      );
      s.target = Math.atan2(p.y - head.y, p.x - head.x);
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, 0.2));
      g.save();
      g.translate(-s.cam.x, -s.cam.y);
      g.strokeStyle = alpha(pal.glow, 0.15);
      g.lineWidth = 1;
      for (let x = 0; x <= W * 2; x += 60) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H * 2);
        g.stroke();
      }
      for (let y = 0; y <= H * 2; y += 60) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W * 2, y);
        g.stroke();
      }
      g.strokeStyle = alpha(pal.foe, 0.6);
      g.lineWidth = 4;
      g.strokeRect(0, 0, W * 2, H * 2);
      for (const p of s.pellets) {
        g.fillStyle = p.col;
        circle(g, p.x, p.y, 5);
        g.fill();
      }
      const drawWorm = (w: Worm, r: number) => {
        if (w.dead) return;
        g.strokeStyle = w.col;
        g.lineWidth = r * 2;
        g.lineCap = "round";
        g.lineJoin = "round";
        g.beginPath();
        w.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.stroke();
        const h = w.pts[0];
        g.fillStyle = "#fff";
        circle(g, h.x + Math.cos(w.ang + 0.6) * r * 0.6, h.y + Math.sin(w.ang + 0.6) * r * 0.6, r * 0.32);
        g.fill();
        circle(g, h.x + Math.cos(w.ang - 0.6) * r * 0.6, h.y + Math.sin(w.ang - 0.6) * r * 0.6, r * 0.32);
        g.fill();
      };
      for (const b of s.bots) {
        drawWorm(b, 9);
        if (!b.dead)
          centred(g, b.name, b.pts[0].x, b.pts[0].y - 18, 11, alpha("#ffffff", 0.6), t.fontBody, 700);
      }
      drawWorm(s.me, 10);
      g.restore();
      centred(g, `${api.score}`, W / 2, 42, 26, t.ink, t.fontDisplay);
      centred(
        g,
        `${s.bots.filter((b) => !b.dead).length} alive`,
        W / 2,
        66,
        13,
        t.inkDim,
        t.fontBody,
        700
      );
    },
  }
);

// -------------------------------------------------------------- Blob Feed

interface Blob {
  x: number;
  y: number;
  r: number;
  col: string;
  vx: number;
  vy: number;
}

const blobFeed = defineGame<{
  me: Blob;
  others: Blob[];
  food: { x: number; y: number; col: string }[];
  cam: { x: number; y: number };
}>(
  {
    slug: "blob-feed",
    title: "Blob Feed",
    rule: "Eat smaller, outrun bigger",
    year: 2015,
    description: "The entire food chain, rendered as circles.",
    history:
      "Homage to the 2015 browser arena that put a whole ecosystem into one rule about who is bigger.",
    tags: ["calm", "drag", "chaos", "endurance"],
    palette: {
      hero: "#4cc9f0",
      foe: "#f72585",
      prize: "#b5e48c",
      deep: "#f8f9fa",
      glow: "#e9ecef",
    },
    intensity: 0.4,
    speed: 0.35,
    difficulty: 0.4,
    luck: 0.35,
    nostalgia: 0.4,
    realism: 0.15,
    sessionLength: 0.6,
    scoreUnit: "mass",
    maxScorePerSecond: 20,
  },
  {
    hint: "drag to move",
    overMsg: "EATEN",
    autoStart: true,
    init: (api) => {
      const W = api.W * 2;
      const H = api.H * 2;
      return {
        me: { x: W / 2, y: H / 2, r: 18, col: api.pal.hero, vx: 0, vy: 0 },
        others: Array.from({ length: 14 }, () => ({
          x: rand(0, W),
          y: rand(0, H),
          r: rand(10, 40),
          col: pick(["#f72585", "#7209b7", "#3a0ca3", "#4361ee", "#f4a261"]),
          vx: rand(-40, 40),
          vy: rand(-40, 40),
        })),
        food: Array.from({ length: 130 }, () => ({
          x: rand(0, W),
          y: rand(0, H),
          col: pick(["#b5e48c", "#99d98c", "#76c893", "#52b69a"]),
        })),
        cam: { x: 0, y: 0 },
      };
    },
    move: (s, x, y, api) => {
      const dx = x - api.W / 2;
      const dy = y - api.H / 2;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(1, d / 90) * (220 - s.me.r);
      s.me.vx = (dx / d) * sp;
      s.me.vy = (dy / d) * sp;
    },
    down: (s, x, y, api) => {
      const dx = x - api.W / 2;
      const dy = y - api.H / 2;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(1, d / 90) * (220 - s.me.r);
      s.me.vx = (dx / d) * sp;
      s.me.vy = (dy / d) * sp;
    },
    update: (s, dt, api) => {
      const W = api.W * 2;
      const H = api.H * 2;
      s.me.x = clamp(s.me.x + s.me.vx * dt, s.me.r, W - s.me.r);
      s.me.y = clamp(s.me.y + s.me.vy * dt, s.me.r, H - s.me.r);
      for (const o of s.others) {
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        if (o.x < o.r || o.x > W - o.r) o.vx *= -1;
        if (o.y < o.r || o.y > H - o.r) o.vy *= -1;
        // bigger blobs drift toward smaller ones
        if (o.r > s.me.r + 3 && Math.hypot(o.x - s.me.x, o.y - s.me.y) < 320) {
          o.vx += (s.me.x - o.x) * 0.3 * dt;
          o.vy += (s.me.y - o.y) * 0.3 * dt;
          const sp = Math.hypot(o.vx, o.vy);
          const cap = 190 - o.r;
          if (sp > cap) {
            o.vx = (o.vx / sp) * cap;
            o.vy = (o.vy / sp) * cap;
          }
        }
      }
      for (const f of s.food)
        if (Math.hypot(f.x - s.me.x, f.y - s.me.y) < s.me.r) {
          f.x = rand(0, W);
          f.y = rand(0, H);
          s.me.r += 0.45;
          api.set(Math.floor(s.me.r * 10) - 180);
          api.haptic("light");
        }
      for (let i = s.others.length - 1; i >= 0; i--) {
        const o = s.others[i];
        const d = Math.hypot(o.x - s.me.x, o.y - s.me.y);
        if (d > Math.max(o.r, s.me.r)) continue;
        if (s.me.r > o.r * 1.12) {
          s.me.r = Math.sqrt(s.me.r ** 2 + o.r ** 2);
          api.set(Math.floor(s.me.r * 10) - 180);
          api.haptic("hit");
          s.others.splice(i, 1);
          s.others.push({
            x: rand(0, W),
            y: rand(0, H),
            r: rand(10, Math.max(14, s.me.r * 0.9)),
            col: pick(["#f72585", "#7209b7", "#3a0ca3", "#4361ee"]),
            vx: rand(-40, 40),
            vy: rand(-40, 40),
          });
        } else if (o.r > s.me.r * 1.12) {
          api.end();
          return;
        }
      }
      s.cam.x = clamp(s.me.x - api.W / 2, 0, W - api.W);
      s.cam.y = clamp(s.me.y - api.H / 2, 0, H - api.H);
    },
    bot: (s, dt, api) => {
      void dt;
      const threat = s.others.find(
        (o) => o.r > s.me.r * 1.12 && Math.hypot(o.x - s.me.x, o.y - s.me.y) < 220
      );
      let tx: number;
      let ty: number;
      if (threat) {
        tx = s.me.x - (threat.x - s.me.x);
        ty = s.me.y - (threat.y - s.me.y);
      } else {
        const f = s.food.reduce(
          (best, q) =>
            Math.hypot(q.x - s.me.x, q.y - s.me.y) <
            Math.hypot(best.x - s.me.x, best.y - s.me.y)
              ? q
              : best,
          s.food[0]
        );
        tx = f.x;
        ty = f.y;
      }
      const dx = tx - s.me.x;
      const dy = ty - s.me.y;
      const d = Math.hypot(dx, dy) || 1;
      s.me.vx = (dx / d) * (200 - s.me.r);
      s.me.vy = (dy / d) * (200 - s.me.r);
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.save();
      g.translate(-s.cam.x, -s.cam.y);
      g.strokeStyle = alpha("#8d99ae", 0.25);
      g.lineWidth = 1;
      for (let x = 0; x <= W * 2; x += 50) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H * 2);
        g.stroke();
      }
      for (let y = 0; y <= H * 2; y += 50) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W * 2, y);
        g.stroke();
      }
      for (const f of s.food) {
        g.fillStyle = f.col;
        circle(g, f.x, f.y, 6);
        g.fill();
      }
      const blob = (b: Blob, label?: string) => {
        g.fillStyle = alpha(b.col, 0.85);
        circle(g, b.x, b.y, b.r);
        g.fill();
        g.strokeStyle = shade(b.col, -0.3);
        g.lineWidth = 3;
        circle(g, b.x, b.y, b.r);
        g.stroke();
        if (label)
          centred(g, label, b.x, b.y + 5, Math.max(10, b.r * 0.5), "#ffffff", t.fontDisplay);
      };
      for (const o of s.others) blob(o, `${Math.floor(o.r)}`);
      blob(s.me, `${Math.floor(s.me.r)}`);
      g.restore();
      centred(g, `${api.score}`, W / 2, 42, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------------ Claim

const CLW = 22;
const CLH = 34;

const claim = defineGame<{
  owned: Uint8Array; // 0 empty, 1 you, 2..n rivals
  trail: [number, number][];
  x: number;
  y: number;
  dir: [number, number];
  want: [number, number];
  rivals: { x: number; y: number; d: [number, number]; id: number }[];
  pct: number;
}>(
  {
    slug: "claim",
    title: "Claim",
    rule: "Loop out and back to keep it",
    year: 2018,
    description: "Territory only counts once you get home.",
    history:
      "Homage to the 2018 territory game whose whole risk model was how far you dared to go before turning back.",
    tags: ["reflex", "drag", "chaos", "endurance"],
    palette: {
      hero: "#00b4d8",
      foe: "#f77f00",
      prize: "#ffffff",
      deep: "#0d1321",
      glow: "#1d2d44",
    },
    intensity: 0.6,
    speed: 0.55,
    difficulty: 0.5,
    luck: 0.25,
    nostalgia: 0.2,
    realism: 0.1,
    sessionLength: 0.5,
    scoreUnit: "%",
    maxScorePerSecond: 6,
  },
  {
    hint: "swipe a direction",
    overMsg: "CUT OFF",
    autoStart: true,
    init: () => {
      const owned = new Uint8Array(CLW * CLH);
      const mark = (cx: number, cy: number, id: number) => {
        for (let r = cy - 2; r <= cy + 2; r++)
          for (let c = cx - 2; c <= cx + 2; c++)
            if (r >= 0 && r < CLH && c >= 0 && c < CLW) owned[r * CLW + c] = id;
      };
      mark(4, 5, 1);
      mark(CLW - 5, CLH - 6, 2);
      mark(CLW - 5, 5, 3);
      return {
        owned,
        trail: [],
        x: 4,
        y: 5,
        dir: [1, 0] as [number, number],
        want: [1, 0] as [number, number],
        rivals: [
          { x: CLW - 5, y: CLH - 6, d: [-1, 0] as [number, number], id: 2 },
          { x: CLW - 5, y: 5, d: [0, 1] as [number, number], id: 3 },
        ],
        pct: 0,
      };
    },
    down: (s, x, y, api) => {
      const dx = x - api.W / 2;
      const dy = y - api.H / 2;
      s.want =
        Math.abs(dx) > Math.abs(dy)
          ? [Math.sign(dx) || 1, 0]
          : [0, Math.sign(dy) || 1];
    },
    move: (s, x, y, api) => {
      const dx = x - api.W / 2;
      const dy = y - api.H / 2;
      s.want =
        Math.abs(dx) > Math.abs(dy)
          ? [Math.sign(dx) || 1, 0]
          : [0, Math.sign(dy) || 1];
    },
    update: (s, dt, api) => {
      s.pct += dt * 11;
      if (s.pct < 1) return;
      s.pct = 0;
      // no instant reversals
      if (!(s.want[0] === -s.dir[0] && s.want[1] === -s.dir[1])) s.dir = s.want;
      s.x = clamp(s.x + s.dir[0], 0, CLW - 1);
      s.y = clamp(s.y + s.dir[1], 0, CLH - 1);
      const i = s.y * CLW + s.x;
      if (s.trail.some(([tx, ty]) => tx === s.x && ty === s.y)) {
        api.end();
        return;
      }
      if (s.owned[i] === 1) {
        if (s.trail.length) {
          for (const [tx, ty] of s.trail) s.owned[ty * CLW + tx] = 1;
          fillEnclosed(s.owned, 1);
          s.trail = [];
          api.haptic("hit");
          const mine = s.owned.reduce((n, v) => n + (v === 1 ? 1 : 0), 0);
          api.set(Math.round((mine / (CLW * CLH)) * 100));
        }
      } else s.trail.push([s.x, s.y]);
      for (const r of s.rivals) {
        if (Math.random() < 0.22) {
          const opts: [number, number][] = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          r.d = pick(opts.filter((o) => !(o[0] === -r.d[0] && o[1] === -r.d[1])));
        }
        r.x = clamp(r.x + r.d[0], 0, CLW - 1);
        r.y = clamp(r.y + r.d[1], 0, CLH - 1);
        const ri = r.y * CLW + r.x;
        if (s.owned[ri] !== r.id) s.owned[ri] = r.id;
        // running over your unfinished trail kills you
        if (s.trail.some(([tx, ty]) => tx === r.x && ty === r.y)) {
          api.end();
          return;
        }
      }
      const mine = s.owned.reduce((n, v) => n + (v === 1 ? 1 : 0), 0);
      if (mine > CLW * CLH * 0.6) {
        api.add(50);
        api.end();
      }
    },
    bot: (s, dt, api) => {
      void dt;
      void api;
      // loop out three, then come home
      if (s.trail.length > 7) {
        const home = { x: 4, y: 5 };
        s.want =
          Math.abs(home.x - s.x) > Math.abs(home.y - s.y)
            ? [Math.sign(home.x - s.x) || 1, 0]
            : [0, Math.sign(home.y - s.y) || 1];
      } else if (Math.random() < 0.1) {
        s.want = pick([
          [1, 0],
          [0, 1],
          [0, -1],
        ] as [number, number][]);
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, 0.2));
      const cw = W / CLW;
      const ch = (H * 0.82) / CLH;
      const oy = H * 0.12;
      const cols = ["", pal.hero, pal.foe, "#c77dff"];
      for (let r = 0; r < CLH; r++)
        for (let c = 0; c < CLW; c++) {
          const v = s.owned[r * CLW + c];
          if (!v) continue;
          g.fillStyle = alpha(cols[v], 0.65);
          g.fillRect(c * cw, oy + r * ch, cw + 0.5, ch + 0.5);
        }
      for (const [tx, ty] of s.trail) {
        g.fillStyle = alpha(pal.prize, 0.75);
        g.fillRect(tx * cw, oy + ty * ch, cw + 0.5, ch + 0.5);
      }
      for (const r of s.rivals) {
        g.fillStyle = cols[r.id];
        g.fillRect(r.x * cw - 1, oy + r.y * ch - 1, cw + 2, ch + 2);
      }
      g.fillStyle = pal.prize;
      g.fillRect(s.x * cw - 2, oy + s.y * ch - 2, cw + 4, ch + 4);
      centred(g, `${api.score}%`, W / 2, 42, 26, t.ink, t.fontDisplay);
    },
  }
);

/** Flood from the edges; anything the flood never reaches belongs to `id`. */
function fillEnclosed(owned: Uint8Array, id: number) {
  const seen = new Uint8Array(owned.length);
  const stack: number[] = [];
  for (let c = 0; c < CLW; c++) {
    stack.push(c, (CLH - 1) * CLW + c);
  }
  for (let r = 0; r < CLH; r++) stack.push(r * CLW, r * CLW + CLW - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (i < 0 || i >= owned.length || seen[i]) continue;
    if (owned[i] === id) continue;
    seen[i] = 1;
    const r = Math.floor(i / CLW);
    const c = i % CLW;
    if (c > 0) stack.push(i - 1);
    if (c < CLW - 1) stack.push(i + 1);
    if (r > 0) stack.push(i - CLW);
    if (r < CLH - 1) stack.push(i + CLW);
  }
  for (let i = 0; i < owned.length; i++) if (!seen[i]) owned[i] = id;
}

// ------------------------------------------------------------------- Mote

const mote = defineGame<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  motes: { x: number; y: number; vx: number; vy: number; r: number }[];
  puffs: Spark[];
}>(
  {
    slug: "mote",
    title: "Mote",
    rule: "Push mass away to move",
    year: 2009,
    description: "Every move costs you size. Choose fewer, better moves.",
    history:
      "Homage to the 2009 ambient physics game where propulsion and health were the same resource.",
    tags: ["calm", "precision", "drag"],
    palette: {
      hero: "#90e0ef",
      foe: "#f07167",
      prize: "#caffbf",
      deep: "#03045e",
      glow: "#0077b6",
    },
    intensity: 0.25,
    speed: 0.25,
    difficulty: 0.55,
    luck: 0.25,
    nostalgia: 0.8,
    realism: 0.3,
    sessionLength: 0.6,
    scoreUnit: "mass",
    maxScorePerSecond: 8,
  },
  {
    hint: "tap opposite the way you want to go",
    overMsg: "DISSOLVED",
    autoStart: true,
    init: (api) => ({
      x: api.W / 2,
      y: api.H / 2,
      vx: 0,
      vy: 0,
      r: 22,
      motes: Array.from({ length: 26 }, () => ({
        x: rand(20, api.W - 20),
        y: rand(20, api.H - 20),
        vx: rand(-20, 20),
        vy: rand(-20, 20),
        r: rand(7, 34),
      })),
      puffs: [],
    }),
    down: (s, x, y, api) => {
      const dx = s.x - x;
      const dy = s.y - y;
      const d = Math.hypot(dx, dy) || 1;
      const push = 60;
      s.vx += (dx / d) * push;
      s.vy += (dy / d) * push;
      s.r = Math.max(3, s.r - 0.55);
      burst(s.puffs, s.x - (dx / d) * s.r, s.y - (dy / d) * s.r, api.pal.hero, 4, 60);
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      stepSparks(s.puffs, dt, 0);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < s.r || s.x > W - s.r) s.vx *= -0.8;
      if (s.y < s.r || s.y > H - s.r) s.vy *= -0.8;
      s.x = clamp(s.x, s.r, W - s.r);
      s.y = clamp(s.y, s.r, H - s.r);
      for (const m of s.motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.x < m.r || m.x > W - m.r) m.vx *= -1;
        if (m.y < m.r || m.y > H - m.r) m.vy *= -1;
      }
      for (let i = s.motes.length - 1; i >= 0; i--) {
        const m = s.motes[i];
        const d = Math.hypot(m.x - s.x, m.y - s.y);
        if (d > s.r + m.r) continue;
        if (s.r > m.r) {
          const take = Math.min(m.r, 0.9);
          m.r -= take;
          s.r += take * 0.62;
          api.set(Math.floor(s.r * 4) - 88);
          if (m.r < 2) s.motes.splice(i, 1);
        } else {
          const take = Math.min(s.r, 0.9);
          s.r -= take;
          m.r += take * 0.62;
          if (s.r < 4) {
            api.end();
            return;
          }
        }
      }
      if (s.motes.every((m) => m.r < s.r)) {
        api.add(40);
        for (let k = 0; k < 10; k++)
          s.motes.push({
            x: rand(20, W - 20),
            y: rand(20, H - 20),
            vx: rand(-25, 25),
            vy: rand(-25, 25),
            r: rand(6, s.r * 1.4),
          });
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const target = s.motes
        .filter((m) => m.r < s.r)
        .sort(
          (a, b) =>
            Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)
        )[0];
      if (!target) return;
      const dx = target.x - s.x;
      const dy = target.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      if (Math.hypot(s.vx, s.vy) < 60) {
        s.vx += (dx / d) * 30;
        s.vy += (dy / d) * 30;
        s.r = Math.max(4, s.r - 0.25);
      }
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.glow, -0.4));
      for (let i = 0; i < 40; i++) {
        g.fillStyle = alpha("#ffffff", 0.16);
        g.fillRect(((i * 97) % W), ((i * 173) % H), 2, 2);
      }
      for (const m of s.motes) {
        const bigger = m.r > s.r;
        g.fillStyle = alpha(bigger ? pal.foe : pal.prize, 0.35);
        circle(g, m.x, m.y, m.r);
        g.fill();
        g.strokeStyle = bigger ? pal.foe : pal.prize;
        g.lineWidth = 2;
        circle(g, m.x, m.y, m.r);
        g.stroke();
      }
      drawSparks(g, s.puffs, 3);
      g.fillStyle = alpha(pal.hero, 0.5);
      circle(g, s.x, s.y, s.r);
      g.fill();
      g.strokeStyle = pal.hero;
      g.lineWidth = 3;
      circle(g, s.x, s.y, s.r);
      g.stroke();
      centred(g, `${api.score}`, W / 2, 42, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Parry Duel

type DuelPhase = "wind" | "strike" | "recover";

const parryDuel = defineGame<{
  phase: DuelPhase;
  timer: number;
  dir: -1 | 0 | 1; // incoming swing direction
  swipe: -1 | 0 | 1;
  startX: number;
  hp: number;
  foeHp: number;
  foeMax: number;
  round: number;
  flash: number;
  sparks: Spark[];
}>(
  {
    slug: "parry-duel",
    title: "Parry Duel",
    rule: "Swipe against the incoming line",
    year: 2010,
    description: "Read the wind-up. Answer it. Repeat until one of you stops.",
    history:
      "Homage to the 2010 duelling game that proved a phone could carry console-grade spectacle, one swipe at a time.",
    tags: ["reflex", "precision", "memory"],
    palette: {
      hero: "#ffd60a",
      foe: "#8b0000",
      prize: "#e0e1dd",
      deep: "#0b090a",
      glow: "#41292c",
    },
    intensity: 0.75,
    speed: 0.6,
    difficulty: 0.6,
    luck: 0.2,
    nostalgia: 0.8,
    realism: 0.6,
    sessionLength: 0.4,
    scoreUnit: "hits",
    maxScorePerSecond: 3,
  },
  {
    hint: "swipe to parry",
    overMsg: "RUN THROUGH",
    autoStart: true,
    init: () => ({
      phase: "wind" as DuelPhase,
      timer: 1,
      dir: 0 as -1 | 0 | 1,
      swipe: 0 as -1 | 0 | 1,
      startX: 0,
      hp: 3,
      foeHp: 3,
      foeMax: 3,
      round: 1,
      flash: 0,
      sparks: [],
    }),
    down: (s, x) => {
      s.startX = x;
    },
    up: (s, x, _y, api) => {
      const dx = x - s.startX;
      if (Math.abs(dx) < 26) return;
      s.swipe = dx > 0 ? 1 : -1;
      if (s.phase !== "strike") return;
      resolveParry(s, api);
    },
    update: (s, dt, api) => {
      s.timer -= dt;
      s.flash = Math.max(0, s.flash - dt);
      stepSparks(s.sparks, dt, 60);
      if (s.timer > 0) return;
      if (s.phase === "wind") {
        s.dir = Math.random() < 0.5 ? -1 : 1;
        s.phase = "strike";
        s.swipe = 0;
        s.timer = Math.max(0.32, 0.85 - s.round * 0.03);
      } else if (s.phase === "strike") {
        // never answered — take the hit
        s.hp -= 1;
        s.flash = 0.22;
        api.haptic("fail");
        if (s.hp <= 0) {
          api.end();
          return;
        }
        s.phase = "recover";
        s.timer = 0.45;
      } else {
        s.phase = "wind";
        s.timer = rand(0.4, 0.9);
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.phase === "strike" && s.timer < 0.3 && s.swipe === 0) {
        s.swipe = (Math.random() < 0.85 ? -s.dir : s.dir) as -1 | 1;
        resolveParry(s, api);
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.glow, pal.deep);
      if (s.flash > 0) {
        g.fillStyle = alpha(pal.foe, s.flash * 2);
        g.fillRect(0, 0, W, H);
      }
      // the opponent, looming
      const lunge = s.phase === "strike" ? 1 - clamp(s.timer / 0.85, 0, 1) : 0;
      const cy = H * 0.46 + lunge * 40;
      g.fillStyle = shade(pal.foe, -0.3);
      roundRect(g, W / 2 - 62, cy - 90, 124, 180, 26);
      g.fill();
      g.fillStyle = pal.foe;
      circle(g, W / 2, cy - 96, 34);
      g.fill();
      g.fillStyle = pal.prize;
      circle(g, W / 2 - 13, cy - 100, 5);
      g.fill();
      circle(g, W / 2 + 13, cy - 100, 5);
      g.fill();
      if (s.phase === "strike" || s.phase === "wind") {
        const a = s.phase === "wind" ? 0 : s.dir * (0.6 + lunge * 1.6);
        g.save();
        g.translate(W / 2, cy - 40);
        g.rotate(a);
        g.fillStyle = pal.prize;
        roundRect(g, -6, -150, 12, 150, 5);
        g.fill();
        g.restore();
      }
      if (s.phase === "strike")
        centred(
          g,
          s.dir < 0 ? "swipe →" : "swipe ←",
          W / 2,
          H * 0.2,
          30,
          pal.hero,
          t.fontDisplay
        );
      drawSparks(g, s.sparks, 5);
      // health pips
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < s.hp ? pal.hero : alpha(pal.hero, 0.2);
        roundRect(g, 16 + i * 22, H - 34, 16, 16, 4);
        g.fill();
      }
      for (let i = 0; i < s.foeMax; i++) {
        g.fillStyle = i < s.foeHp ? pal.foe : alpha(pal.foe, 0.2);
        roundRect(g, W - 32 - i * 22, 30, 16, 16, 4);
        g.fill();
      }
      centred(g, `${api.score}`, W / 2, 44, 24, t.ink, t.fontDisplay);
    },
  }
);

function resolveParry(
  s: {
    phase: DuelPhase;
    timer: number;
    dir: -1 | 0 | 1;
    swipe: -1 | 0 | 1;
    hp: number;
    foeHp: number;
    foeMax: number;
    round: number;
    flash: number;
    sparks: Spark[];
  },
  api: { add: (n: number) => void; haptic: (k: "light" | "hit" | "fail") => void; end: () => void; W: number; H: number; pal: { prize: string } }
) {
  // a parry is a swipe against the swing
  const good = s.swipe === -s.dir;
  s.flash = 0.2;
  if (good) {
    s.foeHp -= 1;
    api.add(1);
    api.haptic("hit");
    burst(s.sparks, api.W / 2, api.H * 0.36, api.pal.prize, 12, 190);
    if (s.foeHp <= 0) {
      s.round += 1;
      s.foeMax = Math.min(7, 3 + Math.floor(s.round / 2));
      s.foeHp = s.foeMax;
      s.hp = Math.min(3, s.hp + 1);
      api.add(10);
    }
  } else {
    s.hp -= 1;
    api.haptic("fail");
    if (s.hp <= 0) {
      api.end();
      return;
    }
  }
  s.phase = "recover";
  s.timer = 0.4;
}

// -------------------------------------------------------------- Slice Run

interface Flying {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  col: string;
  bomb: boolean;
  cut: boolean;
  spin: number;
}

const sliceRun = defineGame<{
  items: Flying[];
  next: number;
  blade: { x: number; y: number; t: number }[];
  combo: number;
  comboT: number;
  lives: number;
  sparks: Spark[];
}>(
  {
    slug: "slice-run",
    title: "Slice Run",
    rule: "Swipe the fruit, never the bomb",
    year: 2010,
    description: "The most satisfying verb ever put on a touchscreen.",
    history:
      "Homage to the 2010 swipe game that turned a phone into a blade and sold the gesture better than any tutorial could.",
    tags: ["reflex", "drag", "chaos"],
    palette: {
      hero: "#f9c74f",
      foe: "#2b2d42",
      prize: "#f94144",
      deep: "#432818",
      glow: "#99582a",
    },
    intensity: 0.85,
    speed: 0.8,
    difficulty: 0.5,
    luck: 0.25,
    nostalgia: 0.8,
    realism: 0.35,
    sessionLength: 0.35,
    scoreUnit: "pts",
    maxScorePerSecond: 20,
  },
  {
    hint: "swipe across the fruit",
    overMsg: "THREE GONE",
    autoStart: true,
    init: () => ({
      items: [],
      next: 0.4,
      blade: [],
      combo: 0,
      comboT: 0,
      lives: 3,
      sparks: [],
    }),
    down: (s, x, y, api) => {
      s.blade.push({ x, y, t: api.t });
    },
    move: (s, x, y, api) => {
      s.blade.push({ x, y, t: api.t });
      const prev = s.blade[s.blade.length - 2];
      if (!prev) return;
      for (const it of s.items) {
        if (it.cut) continue;
        if (segNear(prev.x, prev.y, x, y, it.x, it.y, it.r + 6)) {
          it.cut = true;
          if (it.bomb) {
            s.lives -= 1;
            api.haptic("fail");
            burst(s.sparks, it.x, it.y, "#2b2d42", 18, 260);
            if (s.lives <= 0) api.end();
          } else {
            s.combo += 1;
            s.comboT = 0.6;
            api.add(1 + (s.combo > 2 ? s.combo - 2 : 0));
            burst(s.sparks, it.x, it.y, it.col, 12, 190);
            api.haptic("hit");
          }
        }
      }
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.blade = s.blade.filter((p) => api.t - p.t < 0.18);
      s.comboT = Math.max(0, s.comboT - dt);
      if (s.comboT <= 0) s.combo = 0;
      stepSparks(s.sparks, dt, 420);
      s.next -= dt;
      if (s.next <= 0) {
        const n = Math.random() < 0.35 ? 3 : Math.random() < 0.6 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const bomb = Math.random() < 0.16;
          s.items.push({
            x: rand(W * 0.18, W * 0.82),
            y: H + 30,
            vx: rand(-70, 70),
            vy: -rand(H * 0.75, H * 0.95),
            r: bomb ? 22 : rand(20, 30),
            col: pick(["#f94144", "#f9c74f", "#90be6d", "#f8961e", "#c77dff"]),
            bomb,
            cut: false,
            spin: rand(-4, 4),
          });
        }
        s.next = rand(0.7, 1.3) / api.tune.density;
      }
      for (let i = s.items.length - 1; i >= 0; i--) {
        const it = s.items[i];
        it.vy += H * 0.95 * dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        if (it.y > H + 60) {
          if (!it.cut && !it.bomb) {
            s.lives -= 1;
            api.haptic("fail");
            if (s.lives <= 0) {
              api.end();
              return;
            }
          }
          s.items.splice(i, 1);
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const it = s.items.find((q) => !q.cut && !q.bomb && q.vy > -api.H * 0.3);
      if (!it) return;
      s.blade.push({ x: it.x - 30, y: it.y, t: api.t });
      s.blade.push({ x: it.x + 30, y: it.y, t: api.t });
      it.cut = true;
      s.combo += 1;
      s.comboT = 0.6;
      api.add(1);
      burst(s.sparks, it.x, it.y, it.col, 10, 170);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.fillStyle = alpha("#000000", 0.2);
      for (let i = 0; i < 8; i++) g.fillRect(0, (i * H) / 8, W, 2);
      for (const it of s.items) {
        g.save();
        g.translate(it.x, it.y);
        g.rotate(it.spin * api.t);
        if (it.bomb) {
          g.fillStyle = "#1b1b1f";
          circle(g, 0, 0, it.r);
          g.fill();
          g.strokeStyle = pal.prize;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(0, -it.r);
          g.quadraticCurveTo(10, -it.r - 14, 18, -it.r - 8);
          g.stroke();
          g.fillStyle = alpha("#ffffff", 0.3);
          circle(g, -it.r * 0.3, -it.r * 0.35, it.r * 0.22);
          g.fill();
        } else if (it.cut) {
          g.fillStyle = it.col;
          g.beginPath();
          g.arc(0, 0, it.r, 0.3, Math.PI + 0.3);
          g.fill();
        } else {
          g.fillStyle = it.col;
          circle(g, 0, 0, it.r);
          g.fill();
          g.fillStyle = alpha("#ffffff", 0.3);
          circle(g, -it.r * 0.3, -it.r * 0.3, it.r * 0.28);
          g.fill();
          g.fillStyle = "#4a7c26";
          g.fillRect(-3, -it.r - 7, 6, 8);
        }
        g.restore();
      }
      drawSparks(g, s.sparks, 5);
      if (s.blade.length > 1) {
        g.strokeStyle = alpha("#ffffff", 0.8);
        g.lineWidth = 5;
        g.lineCap = "round";
        g.beginPath();
        s.blade.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.stroke();
      }
      centred(g, `${api.score}`, W / 2, 44, 28, t.ink, t.fontDisplay);
      if (s.combo > 2)
        centred(g, `${s.combo} combo`, W / 2, 70, 16, pal.hero, t.fontBody, 800);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < s.lives ? pal.prize : alpha(pal.prize, 0.2);
        circle(g, W - 22 - i * 18, 40, 6);
        g.fill();
      }
    },
  }
);

function segNear(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
  r: number
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const tt = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + dx * tt), py - (ay + dy * tt)) < r;
}

// ----------------------------------------------------------- Street Catch

const CREATURES = ["🌱", "🔥", "💧", "⚡", "🍃", "❄"];

const streetCatch = defineGame<{
  spots: { x: number; y: number; kind: number; rare: boolean; taken: boolean }[];
  px: number;
  py: number;
  target: { x: number; y: number };
  active: number | null;
  ball: { x: number; y: number; vx: number; vy: number } | null;
  wobble: number;
  caught: number;
}>(
  {
    slug: "street-catch",
    title: "Street Catch",
    rule: "Walk over it, flick to catch",
    year: 2016,
    description: "The map is fake. The walking is real. So is the missing.",
    history:
      "Homage to the 2016 location game that briefly rearranged where entire cities chose to stand.",
    tags: ["calm", "drag", "luck"],
    palette: {
      hero: "#ef476f",
      foe: "#118ab2",
      prize: "#ffd166",
      deep: "#d8f3dc",
      glow: "#95d5b2",
    },
    intensity: 0.35,
    speed: 0.35,
    difficulty: 0.4,
    luck: 0.55,
    nostalgia: 0.4,
    realism: 0.4,
    sessionLength: 0.5,
    scoreUnit: "caught",
    maxScorePerSecond: 2,
  },
  {
    hint: "tap the map to walk",
    overMsg: "OUT OF BALLS",
    autoStart: true,
    init: (api) => ({
      spots: Array.from({ length: 7 }, () => ({
        x: rand(30, api.W - 30),
        y: rand(api.H * 0.2, api.H * 0.7),
        kind: Math.floor(rand(0, CREATURES.length)),
        rare: Math.random() < 0.22,
        taken: false,
      })),
      px: api.W / 2,
      py: api.H * 0.5,
      target: { x: api.W / 2, y: api.H * 0.5 },
      active: null,
      ball: null,
      wobble: 0,
      caught: 0,
    }),
    down: (s, x, y, api) => {
      if (s.active !== null) {
        // flick the ball at the creature
        s.ball = { x: api.W / 2, y: api.H * 0.86, vx: (x - api.W / 2) * 1.5, vy: -api.H * 0.95 };
        api.haptic("light");
        return;
      }
      s.target = { x, y };
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.wobble += dt;
      if (s.active === null) {
        const dx = s.target.x - s.px;
        const dy = s.target.y - s.py;
        const d = Math.hypot(dx, dy);
        if (d > 2) {
          const sp = Math.min(d, 150 * dt);
          s.px += (dx / d) * sp;
          s.py += (dy / d) * sp;
        }
        for (let i = 0; i < s.spots.length; i++) {
          const sp = s.spots[i];
          if (sp.taken) continue;
          if (Math.hypot(sp.x - s.px, sp.y - s.py) < 26) {
            s.active = i;
            api.haptic("hit");
            break;
          }
        }
        return;
      }
      if (!s.ball) return;
      const b = s.ball;
      b.vy += H * 1.1 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const sp = s.spots[s.active];
      const tx = W / 2 + Math.sin(s.wobble * 2) * W * 0.18;
      const ty = H * 0.38;
      if (Math.hypot(b.x - tx, b.y - ty) < 34) {
        s.ball = null;
        sp.taken = true;
        s.caught += 1;
        api.add(sp.rare ? 5 : 1);
        api.haptic("hit");
        s.active = null;
        if (s.spots.every((q) => q.taken))
          s.spots = s.spots.map(() => ({
            x: rand(30, W - 30),
            y: rand(H * 0.2, H * 0.7),
            kind: Math.floor(rand(0, CREATURES.length)),
            rare: Math.random() < 0.22,
            taken: false,
          }));
        return;
      }
      if (b.y > H + 30 || b.x < -30 || b.x > W + 30) {
        s.ball = null;
        api.haptic("fail");
        // creatures flee after a miss
        if (Math.random() < 0.4) {
          sp.taken = true;
          s.active = null;
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const { W, H } = api;
      if (s.active === null) {
        const sp = s.spots.find((q) => !q.taken);
        if (sp) s.target = { x: sp.x, y: sp.y };
        return;
      }
      if (!s.ball) {
        const tx = W / 2 + Math.sin(s.wobble * 2) * W * 0.18;
        s.ball = { x: W / 2, y: H * 0.86, vx: (tx - W / 2) * 1.9, vy: -H * 0.95 };
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      if (s.active !== null) {
        // encounter view
        sky(g, W, H, pal.glow, shade(pal.foe, 0.2));
        const sp = s.spots[s.active];
        const tx = W / 2 + Math.sin(s.wobble * 2) * W * 0.18;
        const ty = H * 0.38;
        g.fillStyle = alpha("#000000", 0.18);
        g.beginPath();
        g.ellipse(tx, ty + 42, 44, 12, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = sp.rare ? pal.prize : pal.foe;
        circle(g, tx, ty, 32);
        g.fill();
        g.fillStyle = "#fff";
        circle(g, tx - 11, ty - 8, 7);
        g.fill();
        circle(g, tx + 11, ty - 8, 7);
        g.fill();
        g.fillStyle = "#111";
        circle(g, tx - 10, ty - 7, 3.2);
        g.fill();
        circle(g, tx + 12, ty - 7, 3.2);
        g.fill();
        centred(g, CREATURES[sp.kind], tx, ty + 58, 22, t.ink, t.fontBody, 700);
        if (s.ball) {
          g.fillStyle = pal.hero;
          circle(g, s.ball.x, s.ball.y, 13);
          g.fill();
          g.fillStyle = "#fff";
          g.fillRect(s.ball.x - 13, s.ball.y - 2, 26, 4);
        } else {
          g.fillStyle = pal.hero;
          circle(g, W / 2, H * 0.86, 15);
          g.fill();
          g.fillStyle = "#fff";
          g.fillRect(W / 2 - 15, H * 0.86 - 2, 30, 4);
        }
        centred(g, "flick a ball at it", W / 2, H * 0.72, 15, t.inkDim, t.fontBody, 700);
      } else {
        sky(g, W, H, pal.deep, pal.glow);
        // fake street map
        g.strokeStyle = alpha("#ffffff", 0.75);
        g.lineWidth = 12;
        for (let i = 1; i < 4; i++) {
          g.beginPath();
          g.moveTo((W / 4) * i, 0);
          g.lineTo((W / 4) * i + 20, H);
          g.stroke();
          g.beginPath();
          g.moveTo(0, (H / 5) * i + 40);
          g.lineTo(W, (H / 5) * i);
          g.stroke();
        }
        for (const sp of s.spots) {
          if (sp.taken) continue;
          const bob = Math.sin(s.wobble * 3 + sp.x) * 3;
          g.fillStyle = alpha(sp.rare ? pal.prize : pal.foe, 0.3);
          circle(g, sp.x, sp.y + bob, 24);
          g.fill();
          g.fillStyle = sp.rare ? pal.prize : pal.foe;
          circle(g, sp.x, sp.y + bob, 13);
          g.fill();
        }
        g.fillStyle = pal.hero;
        circle(g, s.px, s.py, 12);
        g.fill();
        g.fillStyle = "#fff";
        circle(g, s.px, s.py - 4, 5);
        g.fill();
      }
      centred(g, `${api.score}`, W / 2, 42, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Turn Tower

const turnTower = defineGame<{
  rot: number;
  targetRot: number;
  step: number;
  path: number;
  level: number;
  moving: boolean;
  drag: number | null;
}>(
  {
    slug: "turn-tower",
    title: "Turn Tower",
    rule: "Rotate until the path lines up",
    year: 2014,
    description: "The staircase is wrong until you look at it correctly.",
    history:
      "Homage to the 2014 impossible-geometry puzzler that sold a generation on the idea that a game could be an art object.",
    tags: ["calm", "precision", "memory", "drag"],
    palette: {
      hero: "#ffb4a2",
      foe: "#6d6875",
      prize: "#ffcdb2",
      deep: "#b5838d",
      glow: "#e5989b",
    },
    intensity: 0.15,
    speed: 0.2,
    difficulty: 0.4,
    luck: 0.1,
    nostalgia: 0.4,
    realism: 0.2,
    sessionLength: 0.6,
    scoreUnit: "floors",
    maxScorePerSecond: 1.5,
  },
  {
    hint: "drag to rotate the tower",
    overMsg: "TOWER DONE",
    autoStart: true,
    init: () => ({
      rot: 0,
      targetRot: Math.floor(rand(0, 4)) * (Math.PI / 2),
      step: 0,
      path: Math.floor(rand(0, 4)),
      level: 1,
      moving: false,
      drag: null,
    }),
    down: (s, x) => {
      s.drag = x;
    },
    move: (s, x, _y, api) => {
      if (s.drag === null) return;
      s.rot -= ((x - s.drag) / api.W) * 3.2;
      s.drag = x;
    },
    up: (s, _x, _y, api) => {
      s.drag = null;
      // snap to the nearest quarter turn
      const q = Math.PI / 2;
      s.rot = Math.round(s.rot / q) * q;
      const facing = ((Math.round(s.rot / q) % 4) + 4) % 4;
      if (facing === s.path) {
        s.moving = true;
        api.haptic("hit");
      }
    },
    update: (s, dt, api) => {
      if (!s.moving) return;
      s.step += dt * 1.6;
      if (s.step < 1) return;
      s.step = 0;
      s.moving = false;
      api.add(1);
      s.level += 1;
      s.path = Math.floor(rand(0, 4));
      if (s.level > 40) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.moving) return;
      const q = Math.PI / 2;
      const want = s.path * q;
      let d = ((want - s.rot + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (Math.abs(d) < 0.05) {
        s.rot = want;
        s.moving = true;
      } else s.rot += clamp(d, -0.05, 0.05);
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const cx = W / 2;
      const cy = H * 0.58;
      const iso = (x: number, y: number, z: number) => {
        const c = Math.cos(s.rot);
        const sn = Math.sin(s.rot);
        const rx = x * c - y * sn;
        const ry = x * sn + y * c;
        return { x: cx + (rx - ry) * 30, y: cy + (rx + ry) * 16 - z * 26 };
      };
      const box = (x: number, y: number, z: number, col: string) => {
        const top = [iso(x, y, z), iso(x + 1, y, z), iso(x + 1, y + 1, z), iso(x, y + 1, z)];
        g.fillStyle = col;
        g.beginPath();
        top.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.closePath();
        g.fill();
        const b1 = iso(x + 1, y, z - 1);
        const b2 = iso(x + 1, y + 1, z - 1);
        g.fillStyle = shade(col, -0.2);
        g.beginPath();
        g.moveTo(top[1].x, top[1].y);
        g.lineTo(b1.x, b1.y);
        g.lineTo(b2.x, b2.y);
        g.lineTo(top[2].x, top[2].y);
        g.closePath();
        g.fill();
        const b3 = iso(x, y + 1, z - 1);
        g.fillStyle = shade(col, -0.35);
        g.beginPath();
        g.moveTo(top[3].x, top[3].y);
        g.lineTo(top[2].x, top[2].y);
        g.lineTo(b2.x, b2.y);
        g.lineTo(b3.x, b3.y);
        g.closePath();
        g.fill();
      };
      // a small plinth and four spurs, one of which is the way on
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) box(x, y, 0, pal.prize);
      const dirs: [number, number][] = [
        [3, 0],
        [0, 3],
        [-3, 0],
        [0, -3],
      ];
      dirs.forEach(([dx, dy], i) => {
        const live = i === s.path;
        for (let k = 2; k <= 3; k++)
          box(
            Math.round((dx * k) / 3),
            Math.round((dy * k) / 3),
            live ? k - 2 : 0,
            live ? pal.hero : pal.foe
          );
      });
      const walkT = s.moving ? s.step : 0;
      const [wx, wy] = dirs[s.path];
      const p = iso((wx / 3) * walkT * 2, (wy / 3) * walkT * 2, 1 + walkT);
      g.fillStyle = "#fdfcf7";
      roundRect(g, p.x - 7, p.y - 30, 14, 24, 6);
      g.fill();
      circle(g, p.x, p.y - 34, 7);
      g.fill();
      centred(g, `${api.score} floors`, W / 2, 44, 22, t.ink, t.fontDisplay);
      centred(g, "line up the lit path", W / 2, 68, 13, t.inkDim, t.fontBody, 700);
    },
  }
);

export const arenaPack: GameModule[] = [
  coil,
  blobFeed,
  claim,
  mote,
  parryDuel,
  sliceRun,
  streetCatch,
  turnTower,
];
