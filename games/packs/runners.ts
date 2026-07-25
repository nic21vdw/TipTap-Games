// Runner pack — the screen moves whether you do anything or not.
// Homages to the endless-runner lineage: temple chases, rooftop leaps,
// unicorn dashes, growing hordes, punch gauntlets, rubber balls, beat lanes.

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
import {
  alpha,
  circle,
  clamp,
  hashed,
  mix,
  rand,
  roundRect,
  shade,
} from "@/games/engine";

// ---------------------------------------------------------------- Ruin Run

interface RuinObs {
  z: number;
  lane: number;
  low: boolean; // low barrier — jump it instead of dodging
}

const ruinRun = defineGame<{
  lane: number;
  x: number;
  air: number;
  vy: number;
  obs: RuinObs[];
  next: number;
  dist: number;
}>(
  {
    slug: "ruin-run",
    title: "Ruin Run",
    rule: "Sides to swerve, middle to vault",
    year: 2011,
    description: "Something is behind you. Do not look, just pick a lane.",
    history:
      "Homage to the 2011 chase runner that taught a whole platform what a swipe was for — the game everyone's older sister had on her iPod touch.",
    tags: ["reflex", "endurance", "chaos"],
    palette: {
      hero: "#ffd6a5",
      foe: "#4a3728",
      prize: "#ffd166",
      deep: "#2b4a3f",
      glow: "#a8dadc",
    },
    intensity: 0.75,
    speed: 0.8,
    difficulty: 0.6,
    luck: 0.1,
    nostalgia: 0.6,
    realism: 0.45,
    sessionLength: 0.4,
    scoreUnit: "m",
    maxScorePerSecond: 30,
  },
  {
    hint: "tap a side to swerve",
    overMsg: "CAUGHT",
    init: () => ({ lane: 1, x: 1, air: 0, vy: 0, obs: [], next: 0.6, dist: 0 }),
    down: (s, x, _y, api) => {
      if (x < api.W * 0.33) s.lane = clamp(s.lane - 1, 0, 2);
      else if (x > api.W * 0.67) s.lane = clamp(s.lane + 1, 0, 2);
      else if (s.air <= 0) {
        s.vy = -1;
        s.air = 0.01;
      }
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const v = 9 + api.t * 0.35;
      s.dist += v * dt;
      api.set(Math.floor(s.dist));
      s.x += (s.lane - s.x) * Math.min(1, dt * 12);
      if (s.air > 0) {
        s.air += dt;
        s.vy += 4.5 * dt;
        if (s.air > 0.62) {
          s.air = 0;
          s.vy = 0;
        }
      }
      s.next -= dt;
      if (s.next <= 0) {
        const low = Math.random() < 0.35;
        s.obs.push({ z: 1, lane: Math.floor(rand(0, 3)), low });
        s.next = rand(0.45, 0.95) / api.tune.density;
      }
      for (let i = s.obs.length - 1; i >= 0; i--) {
        const o = s.obs[i];
        o.z -= (v / 34) * dt;
        if (o.z < -0.05) {
          s.obs.splice(i, 1);
          continue;
        }
        if (o.z < 0.07 && o.z > -0.02 && Math.abs(s.x - o.lane) < 0.55) {
          const vaulted = o.low && s.air > 0.12 && s.air < 0.5;
          if (!vaulted) api.end();
        }
      }
    },
    bot: (s, dt) => {
      void dt;
      const soon = s.obs.filter((o) => o.z > 0.05 && o.z < 0.42);
      const blocked = soon.find((o) => Math.abs(o.lane - s.lane) < 0.6);
      if (!blocked) return;
      if (blocked.low && s.air <= 0) {
        if (blocked.z < 0.18) {
          s.vy = -1;
          s.air = 0.01;
        }
        return;
      }
      const free = [0, 1, 2].filter(
        (l) => !soon.some((o) => o.lane === l && !o.low)
      );
      if (free.length) s.lane = free[0];
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, mix(pal.deep, pal.glow, 0.6));
      const hz = H * 0.34; // horizon
      // ground plane
      g.fillStyle = shade(pal.foe, 0.25);
      g.beginPath();
      g.moveTo(W * 0.5 - 26, hz);
      g.lineTo(W * 0.5 + 26, hz);
      g.lineTo(W * 1.55, H);
      g.lineTo(-W * 0.55, H);
      g.closePath();
      g.fill();
      // lane seams, scrolling toward the camera
      g.strokeStyle = alpha(pal.prize, 0.28);
      g.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const z = ((i / 12 + (1 - ((s.dist * 0.12) % 1))) % 1);
        const y = hz + (H - hz) * (z * z);
        const w = (W * 0.06 + (W * 1.5) * (z * z)) / 2;
        g.beginPath();
        g.moveTo(W / 2 - w, y);
        g.lineTo(W / 2 + w, y);
        g.stroke();
      }
      const project = (lane: number, z: number) => {
        const p = z * z;
        const spread = W * 0.06 + W * 1.1 * p;
        return {
          x: W / 2 + (lane - 1) * spread * 0.33,
          y: hz + (H - hz) * p,
          s: 0.18 + p * 1.5,
        };
      };
      for (const o of [...s.obs].sort((a, b) => b.z - a.z)) {
        const p = project(o.lane, Math.max(0, o.z));
        const w = 62 * p.s;
        const h = (o.low ? 26 : 92) * p.s;
        g.fillStyle = o.low ? pal.prize : shade(pal.foe, -0.2);
        roundRect(g, p.x - w / 2, p.y - h, w, h, 4 * p.s);
        g.fill();
        g.fillStyle = alpha("#000000", 0.22);
        g.fillRect(p.x - w / 2, p.y - h * 0.18, w, h * 0.18);
      }
      // runner
      const hop = s.air > 0 ? Math.sin((s.air / 0.62) * Math.PI) * H * 0.13 : 0;
      const rp = project(s.x, 0.05);
      const bob = s.air > 0 ? 0 : Math.sin(s.dist * 1.6) * 3;
      g.fillStyle = alpha("#000000", 0.3);
      g.beginPath();
      g.ellipse(rp.x, H * 0.9, 26, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pal.hero;
      roundRect(g, rp.x - 17, H * 0.9 - 62 - hop + bob, 34, 58, 12);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.35);
      roundRect(g, rp.x - 13, H * 0.9 - 58 - hop + bob, 26, 18, 8);
      g.fill();
      centred(g, `${Math.floor(s.dist)}m`, W / 2, 46, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------ Rooftop Dash

interface Roof {
  x: number;
  w: number;
  y: number;
}

const rooftopDash = defineGame<{
  x: number;
  y: number;
  vy: number;
  held: boolean;
  hold: number;
  roofs: Roof[];
  dist: number;
  dead: boolean;
}>(
  {
    slug: "rooftop-dash",
    title: "Rooftop Dash",
    rule: "Hold longer to jump further",
    year: 2009,
    description: "The building behind you is already gone. Keep moving.",
    history:
      "Homage to the 2009 browser one-button runner that invented the whole genre in a single afternoon and a single key.",
    tags: ["reflex", "oneTap", "endurance"],
    palette: {
      hero: "#f8f9fa",
      foe: "#1d2731",
      prize: "#ffb703",
      deep: "#2f4858",
      glow: "#d9e4ec",
    },
    intensity: 0.7,
    speed: 0.85,
    difficulty: 0.6,
    luck: 0.05,
    nostalgia: 0.8,
    realism: 0.4,
    sessionLength: 0.3,
    scoreUnit: "m",
    maxScorePerSecond: 40,
  },
  {
    hint: "hold to jump",
    overMsg: "DROPPED",
    init: (api) => ({
      x: api.W * 0.28,
      y: api.H * 0.62,
      vy: 0,
      held: false,
      hold: 0,
      roofs: [
        { x: -40, w: api.W * 0.9, y: api.H * 0.62 },
        { x: api.W * 1.05, w: api.W * 0.6, y: api.H * 0.58 },
      ],
      dist: 0,
      dead: false,
    }),
    down: (s, _x, _y, api) => {
      const onRoof = s.roofs.some(
        (r) => s.x > r.x && s.x < r.x + r.w && Math.abs(s.y - r.y) < 6
      );
      if (onRoof) {
        s.vy = -api.H * 0.72;
        s.held = true;
        s.hold = 0;
        api.haptic("light");
      }
    },
    up: (s) => {
      s.held = false;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = W * 0.5 + api.t * 6;
      s.dist += v * dt;
      api.set(Math.floor(s.dist / 12));
      if (s.held) {
        s.hold += dt;
        if (s.hold > 0.22) s.held = false;
        else s.vy -= H * 1.1 * dt;
      }
      s.vy += H * 2.5 * dt;
      s.y += s.vy * dt;
      for (const r of s.roofs) r.x -= v * dt;
      // land
      for (const r of s.roofs) {
        if (s.x > r.x - 8 && s.x < r.x + r.w && s.vy > 0 && s.y > r.y && s.y < r.y + 40) {
          s.y = r.y;
          s.vy = 0;
        }
      }
      if (s.y > H + 60) api.end();
      // recycle
      while (s.roofs.length && s.roofs[0].x + s.roofs[0].w < -80) s.roofs.shift();
      const last = s.roofs[s.roofs.length - 1];
      if (last.x + last.w < W * 1.4) {
        const gap = rand(70, 150) * api.tune.density;
        s.roofs.push({
          x: last.x + last.w + gap,
          w: rand(W * 0.34, W * 0.85),
          y: clamp(last.y + rand(-H * 0.12, H * 0.12), H * 0.34, H * 0.78),
        });
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const cur = s.roofs.find((r) => s.x > r.x && s.x < r.x + r.w);
      if (cur && Math.abs(s.y - cur.y) < 6) {
        const edge = cur.x + cur.w - s.x;
        if (edge < 110 && !s.held) {
          s.vy = -api.H * 0.72;
          s.held = true;
          s.hold = 0;
        }
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      // far skyline parallax
      g.fillStyle = alpha(pal.foe, 0.3);
      for (let i = 0; i < 16; i++) {
        const bw = 44 + hashed(i) * 40;
        const bx = ((i * 78 - s.dist * 0.18) % (W + 200)) - 100;
        const bh = H * (0.18 + hashed(i + 90) * 0.26);
        g.fillRect(bx, H - bh, bw, bh);
      }
      for (const r of s.roofs) {
        g.fillStyle = pal.foe;
        g.fillRect(r.x, r.y, r.w, H - r.y);
        g.fillStyle = shade(pal.foe, 0.3);
        g.fillRect(r.x, r.y, r.w, 6);
        g.fillStyle = alpha(pal.prize, 0.35);
        for (let wx = r.x + 14; wx < r.x + r.w - 12; wx += 26) {
          for (let wy = r.y + 22; wy < H - 10; wy += 34) {
            if (hashed(wx * 3 + wy) > 0.55) g.fillRect(wx, wy, 10, 14);
          }
        }
      }
      // runner
      const run = Math.sin(s.dist * 0.22) * 5;
      g.fillStyle = pal.hero;
      roundRect(g, s.x - 9, s.y - 34, 18, 34, 6);
      g.fill();
      g.fillRect(s.x - 3, s.y - 6, 5, 8 + run);
      g.fillRect(s.x + 1, s.y - 6, 5, 8 - run);
      centred(g, `${Math.floor(s.dist / 12)}`, W / 2, 52, 30, t.ink, t.fontDisplay);
    },
  }
);

// -------------------------------------------------------------- Dream Dash

interface Plat {
  x: number;
  y: number;
  w: number;
}

const dreamDash = defineGame<{
  x: number;
  y: number;
  vy: number;
  jumps: number;
  dash: number;
  plats: Plat[];
  gates: { x: number; y: number; hit: boolean }[];
  dist: number;
  trail: { x: number; y: number; a: number }[];
}>(
  {
    slug: "dream-dash",
    title: "Dream Dash",
    rule: "Double jump, dash the gates",
    year: 2010,
    description: "Absurdly sincere. Full glitter. Do not question the horse.",
    history:
      "Homage to the 2010 flash runner whose power ballad and rainbow trail made failing feel like a cutscene.",
    tags: ["reflex", "chaos", "endurance"],
    palette: {
      hero: "#ffffff",
      foe: "#7209b7",
      prize: "#ff70a6",
      deep: "#3a0ca3",
      glow: "#70d6ff",
    },
    intensity: 0.8,
    speed: 0.85,
    difficulty: 0.55,
    luck: 0.1,
    nostalgia: 0.8,
    realism: 0.1,
    sessionLength: 0.3,
    scoreUnit: "pts",
    maxScorePerSecond: 6,
  },
  {
    hint: "tap to jump, tap again to dash",
    overMsg: "WOKE UP",
    init: (api) => ({
      x: api.W * 0.26,
      y: api.H * 0.55,
      vy: 0,
      jumps: 0,
      dash: 0,
      plats: [{ x: -50, y: api.H * 0.7, w: api.W * 1.2 }],
      gates: [],
      dist: 0,
      trail: [],
    }),
    down: (s, _x, _y, api) => {
      if (s.jumps < 2) {
        s.vy = -api.H * 0.78;
        s.jumps += 1;
        api.haptic("light");
      } else if (s.dash <= 0) {
        s.dash = 0.34;
        api.haptic("hit");
      }
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = W * 0.62 + api.t * 5;
      s.dist += v * dt;
      s.dash = Math.max(0, s.dash - dt);
      s.vy += H * 2.4 * dt;
      s.y += s.vy * dt;
      s.trail.unshift({ x: s.x, y: s.y - 14, a: 1 });
      if (s.trail.length > 22) s.trail.pop();
      for (const p of s.trail) p.a *= 0.93;
      for (const p of s.plats) p.x -= v * dt;
      for (const q of s.gates) q.x -= v * dt;
      for (const p of s.plats) {
        if (s.x > p.x && s.x < p.x + p.w && s.vy > 0 && s.y > p.y && s.y < p.y + 44) {
          s.y = p.y;
          s.vy = 0;
          s.jumps = 0;
        }
      }
      if (s.y > H + 60) api.end();
      while (s.plats.length && s.plats[0].x + s.plats[0].w < -100) s.plats.shift();
      const last = s.plats[s.plats.length - 1];
      if (last.x + last.w < W * 1.5) {
        s.plats.push({
          x: last.x + last.w + rand(60, 140) / api.tune.density,
          y: clamp(last.y + rand(-H * 0.14, H * 0.14), H * 0.32, H * 0.8),
          w: rand(W * 0.3, W * 0.7),
        });
        if (Math.random() < 0.6)
          s.gates.push({ x: last.x + last.w + 40, y: rand(H * 0.28, H * 0.66), hit: false });
      }
      for (const q of s.gates) {
        if (!q.hit && Math.abs(q.x - s.x) < 26 && Math.abs(q.y - s.y + 16) < 46) {
          if (s.dash > 0) {
            q.hit = true;
            api.add(1);
            api.haptic("hit");
          } else {
            api.end();
          }
        }
      }
      s.gates = s.gates.filter((q) => q.x > -60);
    },
    bot: (s, dt, api) => {
      void dt;
      const gate = s.gates.find((q) => !q.hit && q.x > s.x && q.x - s.x < 130);
      if (gate) {
        if (Math.abs(gate.y - s.y + 16) > 40 && s.jumps < 2 && gate.y < s.y) {
          s.vy = -api.H * 0.78;
          s.jumps += 1;
        } else if (gate.x - s.x < 80 && s.dash <= 0) s.dash = 0.34;
      }
      const ahead = s.plats.find((p) => p.x > s.x);
      if (ahead && ahead.x - s.x < 90 && s.jumps === 0) {
        s.vy = -api.H * 0.78;
        s.jumps = 1;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.foe);
      g.fillStyle = alpha(pal.glow, 0.25);
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 61 - s.dist * 0.1) % (W + 40)) - 20;
        g.fillRect(sx, (hashed(i) * H) | 0, 3, 3);
      }
      for (const p of s.plats) {
        g.fillStyle = shade(pal.deep, -0.35);
        roundRect(g, p.x, p.y, p.w, H - p.y, 10);
        g.fill();
        g.fillStyle = pal.prize;
        g.fillRect(p.x, p.y, p.w, 5);
      }
      for (const q of s.gates) {
        if (q.hit) continue;
        g.strokeStyle = pal.glow;
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(q.x, q.y - 34);
        g.lineTo(q.x, q.y + 34);
        g.stroke();
      }
      // rainbow trail
      for (let i = 0; i < s.trail.length; i++) {
        const p = s.trail[i];
        g.globalAlpha = p.a * 0.7;
        g.fillStyle = `hsl(${(i * 18 + s.dist) % 360},90%,62%)`;
        g.fillRect(p.x - 8, p.y - 4, 12, 9);
      }
      g.globalAlpha = 1;
      g.fillStyle = s.dash > 0 ? pal.glow : pal.hero;
      roundRect(g, s.x - 14, s.y - 30, 28, 30, 10);
      g.fill();
      g.fillStyle = pal.prize;
      g.fillRect(s.x + 4, s.y - 34, 5, 12);
      centred(g, `${api.score}`, W / 2, 52, 30, t.ink, t.fontDisplay);
    },
  }
);

// -------------------------------------------------------------- Horde Run

const hordeRun = defineGame<{
  n: number;
  y: number;
  vy: number;
  grounded: boolean;
  items: { x: number; kind: "add" | "pit" | "wall"; w: number }[];
  next: number;
  dist: number;
}>(
  {
    slug: "horde-run",
    title: "Horde Run",
    rule: "Jump the whole crowd at once",
    year: 2012,
    description: "You are not one runner. You are a growing problem.",
    history:
      "Homage to the 2012 runner where the crowd was the health bar — every rescued stranger was one more hit you could take.",
    tags: ["reflex", "oneTap", "chaos", "endurance"],
    palette: {
      hero: "#8ac926",
      foe: "#d00000",
      prize: "#fdc500",
      deep: "#1b263b",
      glow: "#415a77",
    },
    intensity: 0.7,
    speed: 0.7,
    difficulty: 0.45,
    luck: 0.2,
    nostalgia: 0.6,
    realism: 0.25,
    sessionLength: 0.4,
    scoreUnit: "m",
    maxScorePerSecond: 30,
  },
  {
    hint: "tap to jump the horde",
    overMsg: "HORDE GONE",
    init: () => ({ n: 3, y: 0, vy: 0, grounded: true, items: [], next: 0.8, dist: 0 }),
    down: (s, _x, _y, api) => {
      if (s.grounded) {
        s.vy = -api.H * 0.72;
        s.grounded = false;
        api.haptic("light");
      }
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = W * 0.48 + api.t * 4;
      s.dist += v * dt;
      api.set(Math.floor(s.dist / 10));
      if (!s.grounded) {
        s.vy += H * 2.2 * dt;
        s.y += s.vy * dt;
        if (s.y >= 0) {
          s.y = 0;
          s.vy = 0;
          s.grounded = true;
        }
      }
      s.next -= dt;
      if (s.next <= 0) {
        const roll = Math.random();
        s.items.push({
          x: W + 40,
          kind: roll < 0.4 ? "add" : roll < 0.72 ? "wall" : "pit",
          w: roll < 0.4 ? 26 : rand(34, 62),
        });
        s.next = rand(0.6, 1.2) / api.tune.density;
      }
      const px = W * 0.24;
      for (let i = s.items.length - 1; i >= 0; i--) {
        const it = s.items[i];
        it.x -= v * dt;
        if (it.x < -80) {
          s.items.splice(i, 1);
          continue;
        }
        const near = Math.abs(it.x - px) < it.w / 2 + 16;
        if (!near) continue;
        const airborne = s.y < -30;
        if (it.kind === "add") {
          if (!airborne) {
            s.n = Math.min(24, s.n + 1);
            api.haptic("hit");
            s.items.splice(i, 1);
          }
        } else if (!airborne) {
          s.n -= it.kind === "pit" ? 3 : 1;
          api.haptic("fail");
          s.items.splice(i, 1);
          if (s.n <= 0) api.end();
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const px = api.W * 0.24;
      const threat = s.items.find(
        (it) => it.kind !== "add" && it.x > px && it.x - px < 120
      );
      if (threat && s.grounded) {
        s.vy = -api.H * 0.72;
        s.grounded = false;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const gy = H * 0.74;
      g.fillStyle = shade(pal.deep, -0.4);
      g.fillRect(0, gy, W, H - gy);
      g.fillStyle = alpha(pal.glow, 0.4);
      for (let x = -((s.dist * 0.6) % 50); x < W; x += 50) g.fillRect(x, gy, 26, 4);
      for (const it of s.items) {
        if (it.kind === "add") {
          g.fillStyle = pal.prize;
          roundRect(g, it.x - 9, gy - 34, 18, 34, 6);
          g.fill();
        } else if (it.kind === "wall") {
          g.fillStyle = pal.foe;
          roundRect(g, it.x - it.w / 2, gy - 46, it.w, 46, 4);
          g.fill();
        } else {
          g.fillStyle = "#05070c";
          g.fillRect(it.x - it.w / 2, gy, it.w, H - gy);
        }
      }
      const px = W * 0.24;
      for (let i = 0; i < s.n; i++) {
        const off = i * 9;
        const bob = Math.sin(s.dist * 0.3 - i * 0.6) * 3;
        g.fillStyle = i === 0 ? pal.hero : mix(pal.hero, pal.deep, Math.min(0.6, i * 0.06));
        roundRect(g, px - off - 8, gy - 30 + s.y + bob, 16, 30, 5);
        g.fill();
      }
      centred(g, `x${s.n}`, W / 2, 50, 26, t.ink, t.fontDisplay);
    },
  }
);

// -------------------------------------------------------------- Punch Run

const punchRun = defineGame<{
  y: number;
  vy: number;
  ground: boolean;
  punch: number;
  foes: { x: number; hp: number; high: boolean }[];
  next: number;
  dist: number;
  sparks: Spark[];
}>(
  {
    slug: "punch-run",
    title: "Punch Run",
    rule: "Tap to punch, hold to uppercut",
    year: 2012,
    description: "Runs itself. You just decide what gets hit and how hard.",
    history:
      "Homage to the 2012 auto-runner that swapped jumping for combos and let the run become a brawl.",
    tags: ["reflex", "chaos", "endurance", "oneTap"],
    palette: {
      hero: "#ffca3a",
      foe: "#6a4c93",
      prize: "#ff595e",
      deep: "#1a181b",
      glow: "#8ac4ff",
    },
    intensity: 0.85,
    speed: 0.8,
    difficulty: 0.55,
    luck: 0.15,
    nostalgia: 0.6,
    realism: 0.3,
    sessionLength: 0.35,
    scoreUnit: "KOs",
    maxScorePerSecond: 5,
  },
  {
    hint: "tap to punch",
    overMsg: "FLATTENED",
    init: () => ({ y: 0, vy: 0, ground: true, punch: 0, foes: [], next: 0.7, dist: 0, sparks: [] }),
    down: (s, _x, y, api) => {
      // top half = uppercut (a hop that clears high foes), bottom = jab
      if (y < api.H * 0.5 && s.ground) {
        s.vy = -api.H * 0.62;
        s.ground = false;
      }
      s.punch = 0.16;
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = W * 0.42 + api.t * 4;
      s.dist += v * dt;
      s.punch = Math.max(0, s.punch - dt);
      if (!s.ground) {
        s.vy += H * 2.1 * dt;
        s.y += s.vy * dt;
        if (s.y >= 0) {
          s.y = 0;
          s.vy = 0;
          s.ground = true;
        }
      }
      s.next -= dt;
      if (s.next <= 0) {
        s.foes.push({ x: W + 40, hp: Math.random() < 0.25 ? 2 : 1, high: Math.random() < 0.35 });
        s.next = rand(0.5, 1.1) / api.tune.density;
      }
      const px = W * 0.26;
      stepSparks(s.sparks, dt, 200);
      for (let i = s.foes.length - 1; i >= 0; i--) {
        const f = s.foes[i];
        f.x -= v * dt;
        if (f.x < -60) {
          s.foes.splice(i, 1);
          continue;
        }
        const reach = s.punch > 0 ? 62 : 22;
        const levelOk = f.high ? s.y < -24 : s.y > -40;
        if (f.x - px < reach && f.x > px - 30) {
          if (s.punch > 0 && levelOk) {
            f.hp -= 1;
            burst(s.sparks, f.x, H * 0.72 - 24, api.pal.prize, 8, 150);
            if (f.hp <= 0) {
              s.foes.splice(i, 1);
              api.add(1);
              api.haptic("hit");
            }
          } else if (f.x - px < 18) {
            api.end();
          }
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const px = api.W * 0.26;
      const f = s.foes.find((x) => x.x > px - 10);
      if (f && f.x - px < 70) {
        if (f.high && s.ground) {
          s.vy = -api.H * 0.62;
          s.ground = false;
        }
        if (s.punch <= 0) s.punch = 0.16;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, 0.25));
      const gy = H * 0.72;
      g.fillStyle = alpha(pal.glow, 0.14);
      for (let i = 0; i < 10; i++) {
        const bx = ((i * 96 - s.dist * 0.3) % (W + 160)) - 80;
        g.fillRect(bx, gy - 120 - hashed(i) * 80, 66, 200);
      }
      g.fillStyle = shade(pal.deep, 0.4);
      g.fillRect(0, gy, W, H - gy);
      for (const f of s.foes) {
        const fy = f.high ? gy - 96 : gy;
        g.fillStyle = f.hp > 1 ? shade(pal.foe, -0.25) : pal.foe;
        roundRect(g, f.x - 15, fy - 48, 30, 48, 8);
        g.fill();
        g.fillStyle = "#fff";
        g.fillRect(f.x - 8, fy - 36, 5, 5);
        g.fillRect(f.x + 3, fy - 36, 5, 5);
      }
      const px = W * 0.26;
      const py = gy + s.y;
      g.fillStyle = pal.hero;
      roundRect(g, px - 15, py - 50, 30, 50, 9);
      g.fill();
      if (s.punch > 0) {
        g.fillStyle = pal.prize;
        roundRect(g, px + 12, py - 36, 44, 14, 7);
        g.fill();
      }
      drawSparks(g, s.sparks, 5);
      centred(g, `${api.score} KO`, W / 2, 48, 24, t.ink, t.fontDisplay);
    },
  }
);

// ----------------------------------------------------------- Sprint Party

const sprintParty = defineGame<{
  lane: number;
  y: number;
  vy: number;
  ground: boolean;
  rivals: { lane: number; x: number; hop: number }[];
  obs: { x: number; lane: number }[];
  next: number;
  dist: number;
  passes: number;
}>(
  {
    slug: "sprint-party",
    title: "Sprint Party",
    rule: "Hurdle everything, pass everyone",
    year: 2013,
    description: "Four friends enter. Three of them are furious.",
    history:
      "Homage to the 2013 multiplayer sprint where the power-ups existed purely to ruin a friendship in under ninety seconds.",
    tags: ["reflex", "chaos", "endurance"],
    palette: {
      hero: "#00b4d8",
      foe: "#e63946",
      prize: "#ffd60a",
      deep: "#023047",
      glow: "#8ecae6",
    },
    intensity: 0.75,
    speed: 0.75,
    difficulty: 0.5,
    luck: 0.3,
    nostalgia: 0.6,
    realism: 0.25,
    sessionLength: 0.4,
    scoreUnit: "passes",
    maxScorePerSecond: 3,
  },
  {
    hint: "tap to hurdle",
    overMsg: "TRIPPED",
    init: (api) => ({
      lane: 1,
      y: 0,
      vy: 0,
      ground: true,
      rivals: [0, 1, 2].map((i) => ({ lane: i === 1 ? 2 : i, x: api.W * (0.5 + i * 0.16), hop: 0 })),
      obs: [],
      next: 0.7,
      dist: 0,
      passes: 0,
    }),
    down: (s, x, _y, api) => {
      if (x < api.W * 0.3) s.lane = clamp(s.lane - 1, 0, 2);
      else if (x > api.W * 0.7) s.lane = clamp(s.lane + 1, 0, 2);
      else if (s.ground) {
        s.vy = -api.H * 0.62;
        s.ground = false;
        api.haptic("light");
      }
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = W * 0.5 + api.t * 3;
      s.dist += v * dt;
      if (!s.ground) {
        s.vy += H * 2.3 * dt;
        s.y += s.vy * dt;
        if (s.y >= 0) {
          s.y = 0;
          s.vy = 0;
          s.ground = true;
        }
      }
      s.next -= dt;
      if (s.next <= 0) {
        s.obs.push({ x: W + 30, lane: Math.floor(rand(0, 3)) });
        s.next = rand(0.45, 0.9) / api.tune.density;
      }
      const px = W * 0.22;
      for (let i = s.obs.length - 1; i >= 0; i--) {
        const o = s.obs[i];
        o.x -= v * dt;
        if (o.x < -40) {
          s.obs.splice(i, 1);
          continue;
        }
        if (Math.abs(o.x - px) < 20 && o.lane === s.lane && s.y > -34) api.end();
      }
      for (const r of s.rivals) {
        r.x -= (v - (W * 0.44 + Math.sin(api.t * 1.3 + r.lane) * 30)) * dt;
        r.hop = Math.max(0, r.hop - dt);
        if (r.x < px && r.x > px - 6) {
          s.passes += 1;
          api.set(s.passes);
          api.haptic("hit");
        }
        if (r.x < -60) r.x = W + rand(40, 220);
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const px = api.W * 0.22;
      const o = s.obs.find((q) => q.x > px && q.x - px < 110 && q.lane === s.lane);
      if (o && s.ground) {
        s.vy = -api.H * 0.62;
        s.ground = false;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, mix(pal.deep, pal.glow, 0.5));
      const laneY = (l: number) => H * (0.5 + l * 0.14);
      for (let l = 0; l < 3; l++) {
        g.fillStyle = l % 2 ? alpha(pal.glow, 0.14) : alpha(pal.glow, 0.08);
        g.fillRect(0, laneY(l) - 26, W, 52);
        g.fillStyle = alpha("#ffffff", 0.35);
        for (let x = -((s.dist * 0.7) % 60); x < W; x += 60)
          g.fillRect(x, laneY(l) + 22, 28, 3);
      }
      for (const o of s.obs) {
        g.fillStyle = pal.foe;
        roundRect(g, o.x - 12, laneY(o.lane) - 4, 24, 22, 4);
        g.fill();
      }
      for (const r of s.rivals) {
        g.fillStyle = shade(pal.prize, -0.15);
        roundRect(g, r.x - 10, laneY(r.lane) - 34, 20, 34, 7);
        g.fill();
      }
      const px = W * 0.22;
      g.fillStyle = pal.hero;
      roundRect(g, px - 11, laneY(s.lane) - 36 + s.y, 22, 36, 8);
      g.fill();
      centred(g, `${s.passes} passed`, W / 2, 48, 22, t.ink, t.fontDisplay);
    },
  }
);

// -------------------------------------------------------------- Rubber Run

const rubberRun = defineGame<{
  x: number;
  y: number;
  vy: number;
  charge: number;
  charging: boolean;
  spikes: { x: number }[];
  rings: { x: number; y: number; got: boolean }[];
  next: number;
  dist: number;
}>(
  {
    slug: "rubber-run",
    title: "Rubber Run",
    rule: "Hold to charge, release to bounce",
    year: 2001,
    description: "One red ball, one hostile world, one green screen.",
    history:
      "Homage to the 2001 monochrome physics platformer that shipped on a phone with a torch and a month of battery.",
    tags: ["precision", "hold", "retro"],
    palette: {
      hero: "#e63946",
      foe: "#2b2d42",
      prize: "#06d6a0",
      deep: "#8d99ae",
      glow: "#edf2f4",
    },
    intensity: 0.5,
    speed: 0.45,
    difficulty: 0.5,
    luck: 0.05,
    nostalgia: 1,
    realism: 0.2,
    sessionLength: 0.4,
    scoreUnit: "rings",
    maxScorePerSecond: 3,
  },
  {
    hint: "hold, then let go",
    overMsg: "POPPED",
    init: (api) => ({
      x: api.W * 0.25,
      y: api.H * 0.7,
      vy: 0,
      charge: 0,
      charging: false,
      spikes: [],
      rings: [],
      next: 1,
      dist: 0,
    }),
    down: (s) => {
      s.charging = true;
      s.charge = 0;
    },
    up: (s, _x, _y, api) => {
      if (!s.charging) return;
      s.charging = false;
      s.vy = -api.H * (0.4 + Math.min(0.55, s.charge * 1.4));
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const gy = H * 0.78;
      const v = W * 0.34;
      s.dist += v * dt;
      if (s.charging) s.charge = Math.min(0.5, s.charge + dt);
      s.vy += H * 2 * dt;
      s.y += s.vy * dt;
      if (s.y > gy) {
        s.y = gy;
        s.vy = -s.vy * 0.42;
        if (Math.abs(s.vy) < H * 0.06) s.vy = 0;
      }
      s.next -= dt;
      if (s.next <= 0) {
        if (Math.random() < 0.55) s.spikes.push({ x: W + 30 });
        else s.rings.push({ x: W + 30, y: rand(H * 0.34, H * 0.64), got: false });
        s.next = rand(0.8, 1.5) / api.tune.density;
      }
      for (let i = s.spikes.length - 1; i >= 0; i--) {
        const sp = s.spikes[i];
        sp.x -= v * dt;
        if (sp.x < -40) s.spikes.splice(i, 1);
        else if (Math.abs(sp.x - s.x) < 20 && s.y > gy - 28) api.end();
      }
      for (const r of s.rings) {
        r.x -= v * dt;
        if (!r.got && Math.abs(r.x - s.x) < 24 && Math.abs(r.y - s.y) < 26) {
          r.got = true;
          api.add(1);
          api.haptic("hit");
        }
      }
      s.rings = s.rings.filter((r) => r.x > -40);
    },
    bot: (s, dt, api) => {
      void dt;
      const target = s.rings.find((r) => !r.got && r.x > s.x && r.x - s.x < 170);
      const spike = s.spikes.find((sp) => sp.x > s.x && sp.x - s.x < 120);
      const gy = api.H * 0.78;
      const grounded = s.y > gy - 4;
      if (grounded && (target || spike)) {
        s.vy = -api.H * (target ? 0.72 : 0.55);
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.glow, pal.deep);
      const gy = H * 0.78;
      g.fillStyle = pal.foe;
      g.fillRect(0, gy + 12, W, H - gy);
      g.strokeStyle = alpha(pal.foe, 0.3);
      g.lineWidth = 3;
      for (let x = -((s.dist * 0.9) % 44); x < W; x += 44) {
        g.beginPath();
        g.moveTo(x, gy + 12);
        g.lineTo(x + 22, gy + 12);
        g.stroke();
      }
      for (const sp of s.spikes) {
        g.fillStyle = pal.foe;
        g.beginPath();
        g.moveTo(sp.x - 14, gy + 12);
        g.lineTo(sp.x, gy - 24);
        g.lineTo(sp.x + 14, gy + 12);
        g.closePath();
        g.fill();
      }
      for (const r of s.rings) {
        if (r.got) continue;
        g.strokeStyle = pal.prize;
        g.lineWidth = 5;
        circle(g, r.x, r.y, 17);
        g.stroke();
      }
      const squash = s.charging ? 1 + s.charge * 0.7 : 1;
      g.fillStyle = pal.hero;
      g.beginPath();
      g.ellipse(s.x, s.y - 16 / squash, 17 * squash, 17 / squash, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.5);
      circle(g, s.x - 5, s.y - 22, 5);
      g.fill();
      centred(g, `${api.score}`, W / 2, 48, 28, t.ink, t.fontDisplay);
    },
  }
);

// --------------------------------------------------------------- Beat Lane

const beatLane = defineGame<{
  x: number;
  tiles: { z: number; lane: number; hole: boolean }[];
  next: number;
  dist: number;
}>(
  {
    slug: "beat-lane",
    title: "Beat Lane",
    rule: "Slide the ball off the beat",
    year: 2016,
    description: "The track is the song. Miss a bar, miss the floor.",
    history:
      "Homage to the 2016 rhythm-dodger where the level was cut to the music and every death was, annoyingly, on time.",
    tags: ["reflex", "precision", "drag"],
    palette: {
      hero: "#ffffff",
      foe: "#ef476f",
      prize: "#06d6a0",
      deep: "#073b4c",
      glow: "#118ab2",
    },
    intensity: 0.8,
    speed: 0.85,
    difficulty: 0.7,
    luck: 0.05,
    nostalgia: 0.4,
    realism: 0.15,
    sessionLength: 0.3,
    scoreUnit: "m",
    maxScorePerSecond: 35,
  },
  {
    hint: "drag to steer",
    overMsg: "OFF BEAT",
    autoStart: false,
    init: () => ({ x: 0.5, tiles: [], next: 0, dist: 0 }),
    move: (s, x, _y, api) => {
      s.x = clamp(x / api.W, 0.12, 0.88);
    },
    down: (s, x, _y, api) => {
      s.x = clamp(x / api.W, 0.12, 0.88);
    },
    update: (s, dt, api) => {
      const v = 1.4 + api.t * 0.05;
      s.dist += v * dt * 30;
      api.set(Math.floor(s.dist));
      s.next -= dt;
      if (s.next <= 0) {
        const lane = Math.floor(rand(0, 3));
        s.tiles.push({ z: 1, lane, hole: Math.random() < 0.4 });
        s.next = 0.34 / api.tune.density;
      }
      for (let i = s.tiles.length - 1; i >= 0; i--) {
        const tl = s.tiles[i];
        tl.z -= v * dt * 0.55;
        if (tl.z < -0.1) {
          s.tiles.splice(i, 1);
          continue;
        }
        if (tl.z < 0.06 && tl.z > -0.04) {
          const laneX = 0.2 + tl.lane * 0.3;
          if (Math.abs(laneX - s.x) < 0.14) {
            if (!tl.hole) api.end();
          } else if (tl.hole) {
            // sliding past a hole is fine; a hole under you is not
          }
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const soon = s.tiles.filter((tl) => tl.z > 0.05 && tl.z < 0.4 && !tl.hole);
      const busy = new Set(soon.map((tl) => tl.lane));
      const free = [0, 1, 2].find((l) => !busy.has(l));
      if (free !== undefined) {
        const target = 0.2 + free * 0.3;
        s.x += clamp(target - s.x, -0.03, 0.03);
      }
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, "#000308");
      const hz = H * 0.3;
      const proj = (lx: number, z: number) => {
        const p = Math.max(0, z) ** 1.7;
        const spread = W * 0.1 + W * 1.05 * p;
        return { x: W / 2 + (lx - 0.5) * spread, y: hz + (H - hz) * p, s: 0.1 + p * 1.4 };
      };
      // road
      const a = proj(0.08, 0);
      const b = proj(0.92, 0);
      const c = proj(0.92, 1);
      const d = proj(0.08, 1);
      g.fillStyle = alpha(pal.glow, 0.25);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(c.x, c.y);
      g.lineTo(d.x, d.y);
      g.closePath();
      g.fill();
      for (const tl of [...s.tiles].sort((p, q) => q.z - p.z)) {
        const lx = 0.2 + tl.lane * 0.3;
        const p = proj(lx, Math.max(0, tl.z));
        const w = 74 * p.s;
        g.fillStyle = tl.hole ? "#000308" : pal.foe;
        g.fillRect(p.x - w / 2, p.y - 16 * p.s, w, 30 * p.s);
        if (!tl.hole) {
          g.fillStyle = alpha("#ffffff", 0.25);
          g.fillRect(p.x - w / 2, p.y - 16 * p.s, w, 5 * p.s);
        }
      }
      const bp = proj(s.x, 0.045);
      g.fillStyle = alpha("#000000", 0.4);
      g.beginPath();
      g.ellipse(bp.x, bp.y + 4, 22, 7, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pal.hero;
      circle(g, bp.x, bp.y - 16, 18);
      g.fill();
      g.fillStyle = alpha(pal.prize, 0.7);
      circle(g, bp.x - 6, bp.y - 22, 6);
      g.fill();
      centred(g, `${Math.floor(s.dist)}`, W / 2, 46, 26, t.ink, t.fontDisplay);
    },
  }
);

export const runnerPack: GameModule[] = [
  ruinRun,
  rooftopDash,
  dreamDash,
  hordeRun,
  punchRun,
  sprintParty,
  rubberRun,
  beatLane,
];
