// Flyer pack — gravity is the antagonist. Hold, tap or flip to stay up.

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
import { alpha, circle, clamp, hashed, rand, roundRect, shade } from "@/games/engine";

// ---------------------------------------------------------------- Updraft

interface Pad {
  x: number;
  y: number;
  moving: number; // 0 = static, else px/s drift
  used: boolean;
}

const updraft = defineGame<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  pads: Pad[];
  cam: number;
  best: number;
}>(
  {
    slug: "updraft",
    title: "Updraft",
    rule: "Drag to steer, never come down",
    year: 2009,
    description: "Down is a choice you make by accident.",
    history:
      "Homage to the 2009 doodle-on-graph-paper climber that turned every phone sideways and every commute into a high-score attempt.",
    tags: ["reflex", "precision", "drag", "endurance"],
    palette: {
      hero: "#43aa8b",
      foe: "#f94144",
      prize: "#f9c74f",
      deep: "#f8f9fa",
      glow: "#dee2e6",
    },
    intensity: 0.5,
    speed: 0.5,
    difficulty: 0.45,
    luck: 0.2,
    nostalgia: 0.8,
    realism: 0.15,
    sessionLength: 0.5,
    scoreUnit: "m",
    maxScorePerSecond: 20,
  },
  {
    hint: "drag left and right",
    overMsg: "CAME DOWN",
    autoStart: true,
    init: (api) => {
      const pads: Pad[] = [{ x: api.W / 2, y: api.H - 60, moving: 0, used: false }];
      for (let i = 1; i < 24; i++)
        pads.push({
          x: rand(46, api.W - 46),
          y: api.H - 60 - i * 78,
          moving: i > 6 && Math.random() < 0.25 ? rand(-60, 60) : 0,
          used: false,
        });
      return { x: api.W / 2, y: api.H - 100, vx: 0, vy: -api.H * 0.62, pads, cam: 0, best: 0 };
    },
    move: (s, x, _y, api) => {
      s.vx = clamp((x - s.x) * 6, -api.W * 1.4, api.W * 1.4);
    },
    down: (s, x, _y, api) => {
      s.vx = clamp((x - s.x) * 6, -api.W * 1.4, api.W * 1.4);
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.vy += H * 1.35 * dt;
      s.y += s.vy * dt;
      s.x += s.vx * dt;
      s.vx *= 0.9;
      if (s.x < 0) s.x += W;
      if (s.x > W) s.x -= W;
      for (const p of s.pads) {
        if (p.moving) {
          p.x += p.moving * dt;
          if (p.x < 44 || p.x > W - 44) p.moving *= -1;
        }
        const py = p.y - s.cam;
        if (
          s.vy > 0 &&
          Math.abs(s.x - p.x) < 42 &&
          s.y > py - 6 &&
          s.y < py + 22
        ) {
          s.vy = -H * 0.66;
          api.haptic("light");
        }
      }
      // the camera only ever pulls up, so falling is always visible
      if (s.y < H * 0.42) {
        const lift = H * 0.42 - s.y;
        s.cam += lift;
        s.y += lift;
      }
      s.best = Math.max(s.best, s.cam);
      api.set(Math.floor(s.best / 10));
      // recycle pads that fell below the view
      for (const p of s.pads) {
        if (p.y - s.cam > H + 40) {
          const top = Math.min(...s.pads.map((q) => q.y));
          p.y = top - rand(64, 96);
          p.x = rand(46, W - 46);
          p.moving = Math.random() < 0.3 ? rand(-90, 90) : 0;
        }
      }
      if (s.y > H + 40) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      const below = s.pads
        .map((p) => ({ p, y: p.y - s.cam }))
        .filter((q) => q.y > s.y + 10 && q.y < s.y + 260)
        .sort((a, b) => a.y - b.y)[0];
      if (below) s.vx = clamp((below.p.x - s.x) * 5, -api.W, api.W);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      // graph paper
      g.strokeStyle = alpha("#3a86ff", 0.16);
      g.lineWidth = 1;
      const off = s.cam % 32;
      for (let y = off; y < H; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      for (let x = 0; x < W; x += 32) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      for (const p of s.pads) {
        const py = p.y - s.cam;
        if (py < -30 || py > H + 30) continue;
        g.fillStyle = p.moving ? pal.prize : pal.hero;
        roundRect(g, p.x - 40, py, 80, 13, 6);
        g.fill();
        g.fillStyle = alpha("#000000", 0.16);
        g.fillRect(p.x - 40, py + 9, 80, 4);
      }
      // the doodle
      g.fillStyle = pal.hero;
      circle(g, s.x, s.y - 16, 17);
      g.fill();
      g.fillStyle = "#fff";
      circle(g, s.x - 6, s.y - 21, 5);
      g.fill();
      circle(g, s.x + 6, s.y - 21, 5);
      g.fill();
      g.fillStyle = "#111";
      circle(g, s.x - 5, s.y - 21, 2.2);
      g.fill();
      circle(g, s.x + 7, s.y - 21, 2.2);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.3);
      g.fillRect(s.x - 12, s.y - 2, 9, 8);
      g.fillRect(s.x + 4, s.y - 2, 9, 8);
      centred(g, `${Math.floor(s.best / 10)}m`, W / 2, 46, 24, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Thrust Lab

const thrustLab = defineGame<{
  y: number;
  vy: number;
  on: boolean;
  zaps: { x: number; y: number; h: number; ang: number }[];
  coins: { x: number; y: number; got: boolean }[];
  next: number;
  dist: number;
  puff: Spark[];
}>(
  {
    slug: "thrust-lab",
    title: "Thrust Lab",
    rule: "Hold to rise, let go to drop",
    year: 2011,
    description: "You stole the prototype. Nobody said stop.",
    history:
      "Homage to the 2011 lab-escape scroller that made one held finger the entire control scheme and still found room for a mech suit.",
    tags: ["reflex", "hold", "endurance"],
    palette: {
      hero: "#f77f00",
      foe: "#e63946",
      prize: "#fcbf49",
      deep: "#1d3557",
      glow: "#457b9d",
    },
    intensity: 0.7,
    speed: 0.7,
    difficulty: 0.55,
    luck: 0.2,
    nostalgia: 0.6,
    realism: 0.35,
    sessionLength: 0.4,
    scoreUnit: "m",
    maxScorePerSecond: 30,
  },
  {
    hint: "hold anywhere",
    overMsg: "ZAPPED",
    init: (api) => ({
      y: api.H * 0.6,
      vy: 0,
      on: false,
      zaps: [],
      coins: [],
      next: 1,
      dist: 0,
      puff: [],
    }),
    down: (s) => {
      s.on = true;
    },
    up: (s) => {
      s.on = false;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = W * 0.5 + api.t * 5;
      s.dist += v * dt;
      api.set(Math.floor(s.dist / 10));
      s.vy += (s.on ? -H * 2.6 : H * 1.9) * dt;
      s.vy = clamp(s.vy, -H * 0.75, H * 0.9);
      s.y += s.vy * dt;
      if (s.y < 24) {
        s.y = 24;
        s.vy = 0;
      }
      if (s.y > H * 0.86) {
        s.y = H * 0.86;
        s.vy = 0;
      }
      if (s.on && Math.random() < 0.6)
        burst(s.puff, W * 0.24, s.y + 14, api.pal.prize, 2, 60);
      stepSparks(s.puff, dt, -60);
      s.next -= dt;
      if (s.next <= 0) {
        const y = rand(H * 0.15, H * 0.7);
        s.zaps.push({ x: W + 60, y, h: rand(70, 150), ang: rand(-0.5, 0.5) });
        for (let i = 0; i < 5; i++)
          s.coins.push({ x: W + 160 + i * 26, y: rand(H * 0.2, H * 0.75), got: false });
        s.next = rand(0.9, 1.5) / api.tune.density;
      }
      const px = W * 0.24;
      for (let i = s.zaps.length - 1; i >= 0; i--) {
        const z = s.zaps[i];
        z.x -= v * dt;
        if (z.x < -80) {
          s.zaps.splice(i, 1);
          continue;
        }
        if (Math.abs(z.x - px) < 16 && Math.abs(z.y - s.y) < z.h / 2 + 14) api.end();
      }
      for (const c of s.coins) {
        c.x -= v * dt;
        if (!c.got && Math.abs(c.x - px) < 20 && Math.abs(c.y - s.y) < 22) {
          c.got = true;
          api.add(2);
          api.haptic("hit");
        }
      }
      s.coins = s.coins.filter((c) => c.x > -40);
    },
    bot: (s, dt, api) => {
      void dt;
      const px = api.W * 0.24;
      const threat = s.zaps.find((z) => z.x > px && z.x - px < 190);
      if (threat) {
        const above = threat.y - threat.h / 2 - 40;
        s.on = s.y > above - 10;
      } else {
        const c = s.coins.find((q) => !q.got && q.x > px);
        s.on = c ? s.y > c.y : s.y > api.H * 0.55;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.fillStyle = alpha("#000000", 0.2);
      for (let i = 0; i < 8; i++) {
        const x = ((i * 120 - s.dist * 0.4) % (W + 200)) - 100;
        g.fillRect(x, 0, 26, H);
      }
      g.fillStyle = shade(pal.deep, -0.4);
      g.fillRect(0, H * 0.9, W, H * 0.1);
      for (const z of s.zaps) {
        g.save();
        g.translate(z.x, z.y);
        g.rotate(z.ang);
        g.fillStyle = shade(pal.foe, -0.3);
        g.fillRect(-9, -z.h / 2 - 10, 18, 12);
        g.fillRect(-9, z.h / 2 - 2, 18, 12);
        g.strokeStyle = pal.foe;
        g.lineWidth = 4;
        g.beginPath();
        for (let y = -z.h / 2; y < z.h / 2; y += 12)
          g.lineTo(Math.sin(y * 0.6 + s.dist * 0.1) * 6, y);
        g.stroke();
        g.restore();
      }
      for (const c of s.coins) {
        if (c.got) continue;
        g.fillStyle = pal.prize;
        circle(g, c.x, c.y, 9);
        g.fill();
        g.fillStyle = alpha("#ffffff", 0.6);
        circle(g, c.x - 3, c.y - 3, 3);
        g.fill();
      }
      drawSparks(g, s.puff, 6);
      const px = W * 0.24;
      g.fillStyle = pal.hero;
      roundRect(g, px - 13, s.y - 24, 26, 44, 9);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.35);
      roundRect(g, px - 20, s.y - 16, 9, 26, 4);
      g.fill();
      centred(g, `${api.score}`, W / 2, 46, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Dune Glide

const duneGlide = defineGame<{
  x: number;
  y: number;
  vy: number;
  diving: boolean;
  dist: number;
  seed: number;
}>(
  {
    slug: "dune-glide",
    title: "Dune Glide",
    rule: "Hold on the way down",
    year: 2011,
    description: "Momentum is the whole game. Be patient, then be fast.",
    history:
      "Homage to the 2011 slope-rider whose one-finger rhythm — press downhill, release uphill — remains the softest skill ceiling on any phone.",
    tags: ["calm", "precision", "hold"],
    palette: {
      hero: "#ffd166",
      foe: "#ef476f",
      prize: "#06d6a0",
      deep: "#3a86ff",
      glow: "#ffd6a5",
    },
    intensity: 0.35,
    speed: 0.55,
    difficulty: 0.35,
    luck: 0.1,
    nostalgia: 0.6,
    realism: 0.3,
    sessionLength: 0.5,
    scoreUnit: "m",
    maxScorePerSecond: 40,
  },
  {
    hint: "hold going downhill",
    overMsg: "STALLED",
    autoStart: true,
    init: () => ({ x: 0, y: 0, vy: 0, diving: false, dist: 0, seed: Math.random() * 100 }),
    down: (s) => {
      s.diving = true;
    },
    up: (s) => {
      s.diving = false;
    },
    update: (s, dt, api) => {
      const { H } = api;
      const hill = (d: number) =>
        H * 0.62 +
        Math.sin(d * 0.006 + s.seed) * H * 0.16 +
        Math.sin(d * 0.0021 + s.seed * 2) * H * 0.1;
      const slope = (hill(s.dist + 6) - hill(s.dist - 6)) / 12;
      const speed = 140 + api.t * 6;
      s.dist += (speed + Math.max(0, -s.vy) * 0.4) * dt;
      const ground = hill(s.dist);
      s.vy += (s.diving ? H * 2.2 : H * 1.1) * dt;
      s.y += s.vy * dt;
      if (s.y > ground) {
        s.y = ground;
        // riding the slope converts descent into launch
        const boost = s.diving ? -slope * speed * 2.4 : -slope * speed * 1.1;
        s.vy = Math.min(s.vy * -0.15 + boost, 0);
        if (slope < -0.05) api.haptic("light");
      }
      api.set(Math.floor(s.dist / 10));
      if (s.dist > 1e7) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      const H = api.H;
      const hill = (d: number) =>
        H * 0.62 +
        Math.sin(d * 0.006 + s.seed) * H * 0.16 +
        Math.sin(d * 0.0021 + s.seed * 2) * H * 0.1;
      s.diving = hill(s.dist + 40) > hill(s.dist);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.fillStyle = alpha("#ffffff", 0.85);
      circle(g, W * 0.78, H * 0.16, 26);
      g.fill();
      const hill = (d: number) =>
        H * 0.62 +
        Math.sin(d * 0.006 + s.seed) * H * 0.16 +
        Math.sin(d * 0.0021 + s.seed * 2) * H * 0.1;
      const px = W * 0.32;
      // two parallax hill layers
      for (const [k, col] of [
        [0.5, alpha(shade(pal.prize, -0.4), 0.5)],
        [1, pal.prize],
      ] as const) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) {
          const d = s.dist * k + (x - px);
          g.lineTo(x, hill(d) + (1 - k) * 40);
        }
        g.lineTo(W, H);
        g.closePath();
        g.fill();
      }
      const ang = Math.atan2(s.vy, 220);
      g.save();
      g.translate(px, s.y - 12);
      g.rotate(ang);
      g.fillStyle = pal.hero;
      g.beginPath();
      g.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.3);
      g.beginPath();
      g.moveTo(-4, 0);
      g.lineTo(-18, s.diving ? 8 : -8);
      g.lineTo(2, 4);
      g.closePath();
      g.fill();
      g.fillStyle = "#f4802f";
      g.beginPath();
      g.moveTo(16, 0);
      g.lineTo(26, 3);
      g.lineTo(16, 6);
      g.closePath();
      g.fill();
      g.restore();
      centred(g, `${Math.floor(s.dist / 10)}m`, W / 2, 46, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------ Flip Thrust

const flipThrust = defineGame<{
  x: number;
  y: number;
  dir: number;
  vx: number;
  vy: number;
  gates: { y: number; phase: number; passed: boolean }[];
  climb: number;
}>(
  {
    slug: "flip-thrust",
    title: "Flip Thrust",
    rule: "Tap to reverse, climb the tower",
    year: 2014,
    description: "The sequel nobody could beat. Two gates is a career.",
    history:
      "Homage to the 2014 follow-up whose difficulty was so aggressive it became the joke and then the badge.",
    tags: ["reflex", "oneTap", "chaos"],
    palette: {
      hero: "#ffe066",
      foe: "#495057",
      prize: "#ff6b6b",
      deep: "#4dabf7",
      glow: "#a5d8ff",
    },
    intensity: 0.85,
    speed: 0.7,
    difficulty: 0.9,
    luck: 0.1,
    nostalgia: 0.4,
    realism: 0.2,
    sessionLength: 0.2,
    scoreUnit: "gates",
    maxScorePerSecond: 1.5,
  },
  {
    hint: "tap to flip direction",
    overMsg: "CLIPPED",
    init: (api) => ({
      x: api.W / 2,
      y: api.H * 0.8,
      dir: 1,
      vx: 0,
      vy: 0,
      gates: [0, 1, 2, 3].map((i) => ({
        y: api.H * 0.55 - i * 190,
        phase: Math.random() * Math.PI * 2,
        passed: false,
      })),
      climb: 0,
    }),
    down: (s, _x, _y, api) => {
      s.dir *= -1;
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.vx += s.dir * W * 0.9 * dt;
      s.vx = clamp(s.vx, -W * 0.5, W * 0.5);
      s.x += s.vx * dt;
      s.vy = -H * 0.24;
      s.y += s.vy * dt;
      if (s.x < 18 || s.x > W - 18) api.end();
      // scroll the world down as the copter rises
      if (s.y < H * 0.55) {
        const lift = H * 0.55 - s.y;
        s.y += lift;
        s.climb += lift;
        for (const gt of s.gates) gt.y += lift;
      }
      api.set(Math.floor(s.climb / 190));
      for (const gt of s.gates) {
        const sway = Math.sin(api.t * 1.6 + gt.phase) * W * 0.16;
        const cx = W / 2 + sway;
        const halfGap = 46;
        if (Math.abs(gt.y - s.y) < 16) {
          if (Math.abs(s.x - cx) > halfGap) api.end();
          else if (!gt.passed) {
            gt.passed = true;
            api.haptic("hit");
          }
        }
        if (gt.y > H + 60) {
          const top = Math.min(...s.gates.map((q) => q.y));
          gt.y = top - 190;
          gt.phase = Math.random() * Math.PI * 2;
          gt.passed = false;
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const next = s.gates
        .filter((gt) => gt.y < s.y + 10)
        .sort((a, b) => b.y - a.y)[0];
      if (!next) return;
      const cx = api.W / 2 + Math.sin(api.t * 1.6 + next.phase) * api.W * 0.16;
      const wantRight = cx > s.x + 6;
      if (wantRight && s.vx < 0) s.dir = 1;
      else if (!wantRight && s.vx > 0) s.dir = -1;
      else if (Math.abs(cx - s.x) < 14) s.dir = s.vx > 0 ? -1 : 1;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.fillStyle = shade(pal.foe, 0.15);
      g.fillRect(0, 0, 18, H);
      g.fillRect(W - 18, 0, 18, H);
      for (const gt of s.gates) {
        const cx = W / 2 + Math.sin(api.t * 1.6 + gt.phase) * W * 0.16;
        g.fillStyle = pal.foe;
        roundRect(g, 18, gt.y - 9, cx - 46 - 18, 18, 4);
        g.fill();
        roundRect(g, cx + 46, gt.y - 9, W - 18 - (cx + 46), 18, 4);
        g.fill();
        g.fillStyle = pal.prize;
        g.fillRect(cx - 46, gt.y - 11, 6, 22);
        g.fillRect(cx + 40, gt.y - 11, 6, 22);
      }
      g.save();
      g.translate(s.x, s.y);
      g.rotate(clamp(s.vx / (W * 0.5), -1, 1) * 0.4);
      g.fillStyle = pal.hero;
      roundRect(g, -13, -12, 26, 24, 8);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.4);
      g.fillRect(-22, -18, 44, 4);
      g.fillRect(-2, -22, 4, 8);
      g.restore();
      centred(g, `${api.score}`, W / 2, 46, 28, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Fog Flight

const fogFlight = defineGame<{
  y: number;
  vy: number;
  r: number;
  obs: { x: number; top: number; bot: number; spin: number }[];
  orbs: { x: number; y: number; grow: boolean; got: boolean }[];
  next: number;
  dist: number;
}>(
  {
    slug: "fog-flight",
    title: "Fog Flight",
    rule: "Tap to flap through the silhouettes",
    year: 2013,
    description: "Beautiful, hostile, and entirely made of shadows.",
    history:
      "Homage to the 2013 side-scroller that hid a physics gauntlet inside a silhouette painting and let you get fatter or thinner mid-flight.",
    tags: ["reflex", "precision", "oneTap", "calm"],
    palette: {
      hero: "#f4a261",
      foe: "#14213d",
      prize: "#e9c46a",
      deep: "#fca311",
      glow: "#ffd7a0",
    },
    intensity: 0.55,
    speed: 0.6,
    difficulty: 0.6,
    luck: 0.25,
    nostalgia: 0.6,
    realism: 0.4,
    sessionLength: 0.35,
    scoreUnit: "m",
    maxScorePerSecond: 25,
  },
  {
    hint: "tap to stay up",
    overMsg: "SWALLOWED",
    init: (api) => ({ y: api.H * 0.5, vy: 0, r: 20, obs: [], orbs: [], next: 0.7, dist: 0 }),
    down: (s, _x, _y, api) => {
      s.vy = -api.H * 0.42;
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = W * 0.42 + api.t * 3;
      s.dist += v * dt;
      api.set(Math.floor(s.dist / 12));
      s.vy += H * 1.5 * dt;
      s.y += s.vy * dt;
      if (s.y < s.r || s.y > H - s.r) api.end();
      s.next -= dt;
      if (s.next <= 0) {
        const gap = rand(H * 0.3, H * 0.44);
        const top = rand(30, H - gap - 30);
        s.obs.push({ x: W + 50, top, bot: top + gap, spin: rand(-2, 2) });
        if (Math.random() < 0.5)
          s.orbs.push({
            x: W + 130,
            y: top + gap / 2,
            grow: Math.random() < 0.5,
            got: false,
          });
        s.next = rand(0.75, 1.2) / api.tune.density;
      }
      const px = W * 0.28;
      for (let i = s.obs.length - 1; i >= 0; i--) {
        const o = s.obs[i];
        o.x -= v * dt;
        if (o.x < -80) {
          s.obs.splice(i, 1);
          continue;
        }
        if (Math.abs(o.x - px) < 30 + s.r && (s.y - s.r < o.top || s.y + s.r > o.bot))
          api.end();
      }
      for (const o of s.orbs) {
        o.x -= v * dt;
        if (!o.got && Math.abs(o.x - px) < s.r + 14 && Math.abs(o.y - s.y) < s.r + 14) {
          o.got = true;
          s.r = clamp(s.r + (o.grow ? 9 : -7), 11, 40);
          api.add(3);
          api.haptic("hit");
        }
      }
      s.orbs = s.orbs.filter((o) => o.x > -40);
    },
    bot: (s, dt, api) => {
      void dt;
      const px = api.W * 0.28;
      const o = s.obs.find((q) => q.x + 40 > px);
      const aim = o ? (o.top + o.bot) / 2 : api.H / 2;
      if (s.y > aim && s.vy > -api.H * 0.1) s.vy = -api.H * 0.42;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.fillStyle = alpha(pal.foe, 0.25);
      for (let i = 0; i < 6; i++) {
        const x = ((i * 150 - s.dist * 0.25) % (W + 300)) - 150;
        g.beginPath();
        g.moveTo(x, H);
        g.lineTo(x + 60, H * (0.4 + hashed(i) * 0.3));
        g.lineTo(x + 130, H);
        g.closePath();
        g.fill();
      }
      for (const o of s.obs) {
        g.fillStyle = pal.foe;
        g.save();
        g.translate(o.x, o.top);
        g.rotate(Math.sin(api.t + o.spin) * 0.05);
        roundRect(g, -30, -o.top - 20, 60, o.top + 20, 14);
        g.fill();
        g.restore();
        g.save();
        g.translate(o.x, o.bot);
        g.rotate(Math.sin(api.t + o.spin) * -0.05);
        roundRect(g, -30, 0, 60, H - o.bot + 20, 14);
        g.fill();
        g.restore();
      }
      for (const o of s.orbs) {
        if (o.got) continue;
        g.fillStyle = o.grow ? pal.prize : alpha(pal.hero, 0.85);
        circle(g, o.x, o.y, 11);
        g.fill();
        g.fillStyle = pal.foe;
        centred(g, o.grow ? "+" : "−", o.x, o.y + 5, 15, pal.foe, t.fontDisplay);
      }
      const px = W * 0.28;
      g.fillStyle = pal.foe;
      circle(g, px, s.y, s.r);
      g.fill();
      g.fillStyle = alpha(pal.glow, 0.9);
      circle(g, px + s.r * 0.3, s.y - s.r * 0.2, s.r * 0.22);
      g.fill();
      centred(g, `${api.score}`, W / 2, 46, 26, t.ink, t.fontDisplay);
    },
  }
);

// -------------------------------------------------------------- Sky Whale

const skyWhale = defineGame<{
  y: number;
  vy: number;
  up: boolean;
  bubbles: { x: number; y: number; got: boolean; bad: boolean }[];
  trail: { x: number; y: number }[];
  next: number;
  dist: number;
  combo: number;
}>(
  {
    slug: "sky-whale",
    title: "Sky Whale",
    rule: "Hold to rise, ride the trail",
    year: 2011,
    description: "A whale, in the sky, eating bubbles. Nobody explained it either.",
    history:
      "Homage to the 2011 trail-collector whose whole appeal was a long unbroken chain and a soundtrack that rewarded you for it.",
    tags: ["calm", "hold", "endurance"],
    palette: {
      hero: "#7bdff2",
      foe: "#b388eb",
      prize: "#ffd6ff",
      deep: "#4361ee",
      glow: "#b8e0ff",
    },
    intensity: 0.4,
    speed: 0.5,
    difficulty: 0.35,
    luck: 0.25,
    nostalgia: 0.6,
    realism: 0.1,
    sessionLength: 0.45,
    scoreUnit: "pts",
    maxScorePerSecond: 12,
  },
  {
    hint: "hold to fly up",
    overMsg: "BEACHED",
    init: (api) => ({
      y: api.H * 0.5,
      vy: 0,
      up: false,
      bubbles: [],
      trail: [],
      next: 0.4,
      dist: 0,
      combo: 0,
    }),
    down: (s) => {
      s.up = true;
    },
    up: (s) => {
      s.up = false;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = W * 0.46;
      s.dist += v * dt;
      s.vy += (s.up ? -H * 1.9 : H * 1.5) * dt;
      s.vy = clamp(s.vy, -H * 0.6, H * 0.7);
      s.y += s.vy * dt;
      if (s.y < 20 || s.y > H - 20) {
        s.y = clamp(s.y, 20, H - 20);
        s.vy = 0;
      }
      s.trail.unshift({ x: W * 0.3, y: s.y });
      if (s.trail.length > 26) s.trail.pop();
      for (const p of s.trail) p.x -= v * dt;
      s.next -= dt;
      if (s.next <= 0) {
        const base = rand(H * 0.2, H * 0.8);
        for (let i = 0; i < 6; i++)
          s.bubbles.push({
            x: W + 30 + i * 30,
            y: clamp(base + Math.sin(i * 0.9) * 46, 34, H - 34),
            got: false,
            bad: false,
          });
        if (Math.random() < 0.5)
          s.bubbles.push({ x: W + 120, y: rand(40, H - 40), got: false, bad: true });
        s.next = rand(1.1, 1.7) / api.tune.density;
      }
      const px = W * 0.3;
      for (const b of s.bubbles) {
        b.x -= v * dt;
        if (!b.got && Math.abs(b.x - px) < 26 && Math.abs(b.y - s.y) < 26) {
          b.got = true;
          if (b.bad) {
            s.combo = 0;
            api.haptic("fail");
            api.add(-4);
          } else {
            s.combo += 1;
            api.add(1 + Math.floor(s.combo / 6));
            api.haptic("hit");
          }
        }
      }
      s.bubbles = s.bubbles.filter((b) => b.x > -40);
      if (api.score < -12) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      const px = api.W * 0.3;
      const b = s.bubbles.find((q) => !q.got && !q.bad && q.x > px - 10);
      s.up = b ? s.y > b.y : s.y > api.H * 0.5;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.fillStyle = alpha("#ffffff", 0.2);
      for (let i = 0; i < 18; i++) {
        const x = ((i * 71 - s.dist * 0.2) % (W + 60)) - 30;
        g.fillRect(x, hashed(i) * H, 3, 3);
      }
      g.lineWidth = 9;
      g.lineCap = "round";
      for (let i = 1; i < s.trail.length; i++) {
        g.strokeStyle = `hsla(${(i * 12 + s.dist * 0.4) % 360},90%,72%,${1 - i / s.trail.length})`;
        g.beginPath();
        g.moveTo(s.trail[i - 1].x, s.trail[i - 1].y);
        g.lineTo(s.trail[i].x, s.trail[i].y);
        g.stroke();
      }
      for (const b of s.bubbles) {
        if (b.got) continue;
        g.fillStyle = b.bad ? pal.foe : pal.prize;
        circle(g, b.x, b.y, b.bad ? 13 : 10);
        g.fill();
        g.fillStyle = alpha("#ffffff", 0.65);
        circle(g, b.x - 3, b.y - 3, 3.4);
        g.fill();
      }
      const px = W * 0.3;
      g.save();
      g.translate(px, s.y);
      g.rotate(clamp(s.vy / (H * 0.7), -1, 1) * 0.4);
      g.fillStyle = pal.hero;
      g.beginPath();
      g.ellipse(0, 0, 28, 17, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.25);
      g.beginPath();
      g.moveTo(-24, 0);
      g.lineTo(-40, -12);
      g.lineTo(-38, 12);
      g.closePath();
      g.fill();
      g.fillStyle = "#111";
      circle(g, 14, -4, 3);
      g.fill();
      g.restore();
      centred(g, `${api.score}`, W / 2, 46, 26, t.ink, t.fontDisplay);
      if (s.combo > 4)
        centred(g, `chain ${s.combo}`, W / 2, 72, 15, pal.prize, t.fontBody, 700);
    },
  }
);

// -------------------------------------------------------------- Sky Climb

const skyClimb = defineGame<{
  x: number;
  y: number;
  vy: number;
  cam: number;
  boosts: { x: number; y: number; kind: 0 | 1 | 2; used: boolean }[];
  best: number;
}>(
  {
    slug: "sky-climb",
    title: "Sky Climb",
    rule: "Steer into the boosters",
    year: 2010,
    description: "No platforms. Just fuel, and how long you can keep finding it.",
    history:
      "Homage to the 2010 vertical climber that removed the floor entirely and made the whole ascent one long chain of pickups.",
    tags: ["reflex", "drag", "endurance", "chaos"],
    palette: {
      hero: "#ff70a6",
      foe: "#241023",
      prize: "#70d6ff",
      deep: "#4c1d95",
      glow: "#ff9770",
    },
    intensity: 0.65,
    speed: 0.7,
    difficulty: 0.5,
    luck: 0.35,
    nostalgia: 0.8,
    realism: 0.1,
    sessionLength: 0.35,
    scoreUnit: "m",
    maxScorePerSecond: 45,
  },
  {
    hint: "drag to steer",
    overMsg: "OUT OF LIFT",
    autoStart: true,
    init: (api) => {
      const boosts: { x: number; y: number; kind: 0 | 1 | 2; used: boolean }[] = [];
      for (let i = 0; i < 40; i++)
        boosts.push({
          x: rand(36, api.W - 36),
          y: -i * 96 + api.H * 0.5,
          kind: (Math.random() < 0.12 ? 2 : Math.random() < 0.3 ? 1 : 0) as 0 | 1 | 2,
          used: false,
        });
      return { x: api.W / 2, y: api.H * 0.72, vy: -api.H * 0.5, cam: 0, boosts, best: 0 };
    },
    move: (s, x) => {
      s.x = x;
    },
    down: (s, x) => {
      s.x = x;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.vy += H * 1.05 * dt;
      s.y += s.vy * dt;
      s.x = clamp(s.x, 16, W - 16);
      if (s.y < H * 0.4) {
        const lift = H * 0.4 - s.y;
        s.y += lift;
        s.cam += lift;
      }
      s.best = Math.max(s.best, s.cam);
      api.set(Math.floor(s.best / 8));
      for (const b of s.boosts) {
        const by = b.y + s.cam;
        if (!b.used && Math.abs(b.x - s.x) < 24 && Math.abs(by - s.y) < 24) {
          b.used = true;
          if (b.kind === 2) {
            api.haptic("fail");
            s.vy = H * 0.5;
          } else {
            api.haptic("hit");
            s.vy = -H * (b.kind === 1 ? 1.05 : 0.7);
          }
        }
        if (by > H + 120) {
          const top = Math.min(...s.boosts.map((q) => q.y));
          b.y = top - rand(70, 120);
          b.x = rand(36, W - 36);
          b.kind = (Math.random() < 0.14 ? 2 : Math.random() < 0.3 ? 1 : 0) as 0 | 1 | 2;
          b.used = false;
        }
      }
      if (s.y > H + 40) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      const target = s.boosts
        .map((b) => ({ b, y: b.y + s.cam }))
        .filter((q) => !q.b.used && q.b.kind !== 2 && q.y < s.y && q.y > s.y - 300)
        .sort((a, b) => b.y - a.y)[0];
      if (target) s.x += clamp(target.b.x - s.x, -api.W * 0.02, api.W * 0.02);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.foe);
      for (let i = 0; i < 26; i++) {
        const y = (hashed(i) * H * 3 + s.cam * 0.3) % (H + 40);
        g.fillStyle = alpha(pal.glow, 0.35);
        g.fillRect(hashed(i + 40) * W, y, 3, 3);
      }
      for (const b of s.boosts) {
        const by = b.y + s.cam;
        if (b.used || by < -30 || by > H + 30) continue;
        if (b.kind === 2) {
          g.fillStyle = pal.foe;
          g.strokeStyle = pal.hero;
          g.lineWidth = 3;
          circle(g, b.x, by, 15);
          g.fill();
          g.stroke();
        } else {
          g.fillStyle = b.kind === 1 ? pal.prize : pal.glow;
          circle(g, b.x, by, b.kind === 1 ? 16 : 12);
          g.fill();
          g.fillStyle = alpha("#ffffff", 0.55);
          circle(g, b.x - 4, by - 4, 4);
          g.fill();
        }
      }
      g.save();
      g.translate(s.x, s.y);
      g.rotate(clamp(s.vy / (H * 0.9), -1, 1) * 0.35);
      g.fillStyle = pal.hero;
      circle(g, 0, 0, 16);
      g.fill();
      g.fillStyle = "#fff";
      circle(g, -5, -4, 4);
      g.fill();
      circle(g, 6, -4, 4);
      g.fill();
      if (s.vy < 0) {
        g.fillStyle = alpha(pal.prize, 0.8);
        g.beginPath();
        g.moveTo(-8, 14);
        g.lineTo(0, 30 + Math.sin(api.t * 40) * 6);
        g.lineTo(8, 14);
        g.closePath();
        g.fill();
      }
      g.restore();
      centred(g, `${Math.floor(s.best / 8)}m`, W / 2, 46, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------ Wall Switch

const wallSwitch = defineGame<{
  side: -1 | 1;
  y: number;
  haz: { y: number; side: -1 | 1; kind: 0 | 1 }[];
  climb: number;
  next: number;
}>(
  {
    slug: "wall-switch",
    title: "Wall Switch",
    rule: "Tap to jump to the other wall",
    year: 2010,
    description: "Two walls. One decision, over and over, faster and faster.",
    history:
      "Homage to the 2010 wall-climber that got an entire genre out of a single binary choice made under time pressure.",
    tags: ["reflex", "oneTap", "precision"],
    palette: {
      hero: "#212529",
      foe: "#c1121f",
      prize: "#fdf0d5",
      deep: "#003049",
      glow: "#669bbc",
    },
    intensity: 0.75,
    speed: 0.8,
    difficulty: 0.6,
    luck: 0.15,
    nostalgia: 0.8,
    realism: 0.2,
    sessionLength: 0.3,
    scoreUnit: "m",
    maxScorePerSecond: 30,
  },
  {
    hint: "tap to switch walls",
    overMsg: "SLICED",
    init: () => ({ side: -1 as -1 | 1, y: 0, haz: [], climb: 0, next: 0.5 }),
    down: (s, _x, _y, api) => {
      s.side = (s.side * -1) as -1 | 1;
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { H } = api;
      const v = H * 0.34 + api.t * 5;
      s.climb += v * dt;
      api.set(Math.floor(s.climb / 12));
      s.next -= dt;
      if (s.next <= 0) {
        s.haz.push({
          y: -40,
          side: (Math.random() < 0.5 ? -1 : 1) as -1 | 1,
          kind: (Math.random() < 0.25 ? 1 : 0) as 0 | 1,
        });
        s.next = rand(0.45, 0.85) / api.tune.density;
      }
      const py = H * 0.66;
      for (let i = s.haz.length - 1; i >= 0; i--) {
        const h = s.haz[i];
        h.y += v * dt;
        if (h.y > H + 60) {
          s.haz.splice(i, 1);
          continue;
        }
        if (Math.abs(h.y - py) < 26 && h.side === s.side) {
          if (h.kind === 0) api.end();
          else {
            s.haz.splice(i, 1);
            api.add(5);
            api.haptic("hit");
          }
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const py = api.H * 0.66;
      const danger = s.haz.find(
        (h) => h.kind === 0 && h.side === s.side && py - h.y < 130 && py - h.y > 0
      );
      if (danger) {
        const other = (s.side * -1) as -1 | 1;
        const alsoBad = s.haz.some(
          (h) => h.kind === 0 && h.side === other && py - h.y < 90 && py - h.y > -20
        );
        if (!alsoBad) s.side = other;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, -0.3));
      const wallW = 42;
      for (const side of [-1, 1] as const) {
        const x = side === -1 ? 0 : W - wallW;
        g.fillStyle = shade(pal.glow, -0.4);
        g.fillRect(x, 0, wallW, H);
        g.fillStyle = alpha("#000000", 0.25);
        for (let y = -((s.climb * 0.8) % 40); y < H; y += 40)
          g.fillRect(x, y, wallW, 3);
      }
      for (const h of s.haz) {
        const x = h.side === -1 ? wallW : W - wallW;
        g.fillStyle = h.kind === 0 ? pal.foe : pal.prize;
        g.beginPath();
        g.moveTo(x, h.y - 16);
        g.lineTo(x + h.side * 30, h.y);
        g.lineTo(x, h.y + 16);
        g.closePath();
        g.fill();
      }
      const py = H * 0.66;
      const px = s.side === -1 ? wallW + 15 : W - wallW - 15;
      g.fillStyle = pal.hero;
      roundRect(g, px - 13, py - 20, 26, 40, 9);
      g.fill();
      g.fillStyle = pal.prize;
      g.fillRect(px - 13, py - 10, 26, 6);
      centred(g, `${api.score}m`, W / 2, 46, 26, t.ink, t.fontDisplay);
    },
  }
);

// -------------------------------------------------------------- Void Wing

const voidWing = defineGame<{
  x: number;
  y: number;
  shots: { x: number; y: number }[];
  foes: { x: number; y: number; hp: number; phase: number }[];
  cool: number;
  next: number;
  sparks: Spark[];
}>(
  {
    slug: "void-wing",
    title: "Void Wing",
    rule: "Drag to fly, it fires for you",
    year: 1999,
    description: "Monochrome dogfight. Your thumb was the joystick.",
    history:
      "Homage to the 1999 feature-phone shooter that lived in the same menu as the snake and got half as much credit.",
    tags: ["reflex", "chaos", "retro"],
    palette: {
      hero: "#c7f9cc",
      foe: "#ff477e",
      prize: "#ffd60a",
      deep: "#0b132b",
      glow: "#3a506b",
    },
    intensity: 0.8,
    speed: 0.75,
    difficulty: 0.55,
    luck: 0.2,
    nostalgia: 1,
    realism: 0.25,
    sessionLength: 0.4,
    scoreUnit: "pts",
    maxScorePerSecond: 8,
  },
  {
    hint: "drag to fly",
    overMsg: "SHOT DOWN",
    autoStart: true,
    init: (api) => ({
      x: api.W * 0.25,
      y: api.H * 0.5,
      shots: [],
      foes: [],
      cool: 0,
      next: 0.6,
      sparks: [],
    }),
    move: (s, x, y) => {
      s.x = x;
      s.y = y;
    },
    down: (s, x, y) => {
      s.x = x;
      s.y = y;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.x = clamp(s.x, 20, W * 0.7);
      s.y = clamp(s.y, 20, H - 20);
      s.cool -= dt;
      if (s.cool <= 0) {
        s.shots.push({ x: s.x + 20, y: s.y });
        s.cool = 0.16;
      }
      for (let i = s.shots.length - 1; i >= 0; i--) {
        s.shots[i].x += W * 1.2 * dt;
        if (s.shots[i].x > W + 20) s.shots.splice(i, 1);
      }
      s.next -= dt;
      if (s.next <= 0) {
        s.foes.push({
          x: W + 30,
          y: rand(30, H - 30),
          hp: Math.random() < 0.25 ? 3 : 1,
          phase: Math.random() * 6,
        });
        s.next = rand(0.4, 0.85) / api.tune.density;
      }
      stepSparks(s.sparks, dt, 0);
      for (let i = s.foes.length - 1; i >= 0; i--) {
        const f = s.foes[i];
        f.x -= (W * 0.3 + api.t * 3) * dt;
        f.y += Math.sin(api.t * 2.4 + f.phase) * 60 * dt;
        if (f.x < -40) {
          s.foes.splice(i, 1);
          continue;
        }
        if (Math.hypot(f.x - s.x, f.y - s.y) < 24) api.end();
        for (let j = s.shots.length - 1; j >= 0; j--) {
          const sh = s.shots[j];
          if (Math.hypot(f.x - sh.x, f.y - sh.y) < 20) {
            s.shots.splice(j, 1);
            f.hp -= 1;
            burst(s.sparks, f.x, f.y, api.pal.prize, 5, 110);
            if (f.hp <= 0) {
              s.foes.splice(i, 1);
              api.add(2);
              api.haptic("hit");
            }
            break;
          }
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const f = s.foes.filter((q) => q.x > s.x).sort((a, b) => a.x - b.x)[0];
      if (f) {
        s.y += clamp(f.y - s.y, -api.H * 0.02, api.H * 0.02);
        if (f.x - s.x < 90) s.y += (s.y < api.H / 2 ? 1 : -1) * api.H * 0.01;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      for (let i = 0; i < 34; i++) {
        const x = ((i * 47 - api.t * 90 * (1 + (i % 3))) % (W + 20) + W + 20) % (W + 20);
        g.fillStyle = alpha("#ffffff", 0.15 + (i % 3) * 0.1);
        g.fillRect(x, hashed(i) * H, 2, 2);
      }
      g.fillStyle = pal.prize;
      for (const sh of s.shots) g.fillRect(sh.x, sh.y - 2, 14, 4);
      for (const f of s.foes) {
        g.fillStyle = f.hp > 1 ? shade(pal.foe, -0.2) : pal.foe;
        g.beginPath();
        g.moveTo(f.x - 16, f.y - 13);
        g.lineTo(f.x - 16, f.y + 13);
        g.lineTo(f.x + 16, f.y);
        g.closePath();
        g.fill();
      }
      drawSparks(g, s.sparks, 4);
      g.fillStyle = pal.hero;
      g.beginPath();
      g.moveTo(s.x + 22, s.y);
      g.lineTo(s.x - 16, s.y - 14);
      g.lineTo(s.x - 8, s.y);
      g.lineTo(s.x - 16, s.y + 14);
      g.closePath();
      g.fill();
      centred(g, `${api.score}`, W / 2, 46, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Down Shaft

const downShaft = defineGame<{
  x: number;
  y: number;
  vy: number;
  ammo: number;
  shots: { x: number; y: number }[];
  blocks: { x: number; y: number; w: number; foe: boolean }[];
  cam: number;
  next: number;
  sparks: Spark[];
}>(
  {
    slug: "down-shaft",
    title: "Down Shaft",
    rule: "Shoot down to slow your fall",
    year: 2015,
    description: "The only way out is further in, and you are out of bullets.",
    history:
      "Homage to the 2015 vertical descent that turned your gun into your brakes and made every reload a landing.",
    tags: ["reflex", "precision", "chaos"],
    palette: {
      hero: "#e0fbfc",
      foe: "#ee6c4d",
      prize: "#98c1d9",
      deep: "#0b0c10",
      glow: "#3d5a80",
    },
    intensity: 0.85,
    speed: 0.8,
    difficulty: 0.75,
    luck: 0.2,
    nostalgia: 0.4,
    realism: 0.25,
    sessionLength: 0.3,
    scoreUnit: "m",
    maxScorePerSecond: 30,
  },
  {
    hint: "tap to fire downward",
    overMsg: "CRUSHED",
    autoStart: true,
    init: (api) => ({
      x: api.W / 2,
      y: api.H * 0.3,
      vy: 0,
      ammo: 8,
      shots: [],
      blocks: [],
      cam: 0,
      next: 0,
      sparks: [],
    }),
    move: (s, x) => {
      s.x = x;
    },
    down: (s, x, _y, api) => {
      s.x = x;
      if (s.ammo > 0) {
        s.ammo -= 1;
        s.shots.push({ x: s.x, y: s.y + 16 });
        s.vy = Math.min(s.vy, -api.H * 0.22);
        api.haptic("light");
      }
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.x = clamp(s.x, 30, W - 30);
      s.vy += H * 1.5 * dt;
      s.vy = Math.min(s.vy, H * 0.85);
      s.y += s.vy * dt;
      if (s.y > H * 0.42) {
        const push = s.y - H * 0.42;
        s.y -= push;
        s.cam += push;
        for (const b of s.blocks) b.y -= push;
        for (const sh of s.shots) sh.y -= push;
      }
      api.set(Math.floor(s.cam / 10));
      for (let i = s.shots.length - 1; i >= 0; i--) {
        s.shots[i].y += H * 0.9 * dt;
        if (s.shots[i].y > H + 20) s.shots.splice(i, 1);
      }
      s.next -= dt;
      if (s.next <= 0) {
        const foe = Math.random() < 0.42;
        s.blocks.push({
          x: rand(40, W - 40),
          y: H + 40,
          w: foe ? 34 : rand(60, 120),
          foe,
        });
        s.next = rand(0.35, 0.7) / api.tune.density;
      }
      stepSparks(s.sparks, dt, 120);
      for (let i = s.blocks.length - 1; i >= 0; i--) {
        const b = s.blocks[i];
        if (b.y < -60) {
          s.blocks.splice(i, 1);
          continue;
        }
        const hit =
          Math.abs(b.x - s.x) < b.w / 2 + 12 && Math.abs(b.y - s.y) < 24;
        if (hit) {
          if (b.foe && s.vy > 0) {
            // stomping a foe is a bounce and a reload
            s.blocks.splice(i, 1);
            s.vy = -api.H * 0.4;
            s.ammo = Math.min(8, s.ammo + 3);
            api.add(3);
            burst(s.sparks, b.x, b.y, api.pal.foe, 8, 130);
            api.haptic("hit");
            continue;
          }
          if (!b.foe) {
            if (s.vy > 0) {
              s.y = b.y - 24;
              s.vy = 0;
              s.ammo = 8;
            }
          } else {
            api.end();
          }
        }
        for (let j = s.shots.length - 1; j >= 0; j--) {
          const sh = s.shots[j];
          if (b.foe && Math.abs(b.x - sh.x) < 20 && Math.abs(b.y - sh.y) < 20) {
            s.blocks.splice(i, 1);
            s.shots.splice(j, 1);
            api.add(2);
            burst(s.sparks, b.x, b.y, api.pal.foe, 7, 120);
            break;
          }
        }
      }
      if (s.y < -50) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      const below = s.blocks
        .filter((b) => b.y > s.y + 20 && b.y < s.y + 220)
        .sort((a, b) => a.y - b.y)[0];
      if (below) {
        if (below.foe) s.x += clamp(below.x - s.x, -api.W * 0.02, api.W * 0.02);
        else s.x += clamp(below.x + below.w - s.x, -api.W * 0.02, api.W * 0.02);
      }
      if (s.vy > api.H * 0.55 && s.ammo > 0) {
        s.ammo -= 1;
        s.shots.push({ x: s.x, y: s.y + 16 });
        s.vy = -api.H * 0.22;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.glow, -0.5));
      g.fillStyle = shade(pal.glow, -0.3);
      g.fillRect(0, 0, 26, H);
      g.fillRect(W - 26, 0, 26, H);
      g.fillStyle = alpha("#000000", 0.3);
      for (let y = -((s.cam * 0.9) % 46); y < H; y += 46) {
        g.fillRect(0, y, 26, 5);
        g.fillRect(W - 26, y, 26, 5);
      }
      for (const b of s.blocks) {
        if (b.foe) {
          g.fillStyle = pal.foe;
          circle(g, b.x, b.y, 16);
          g.fill();
          g.fillStyle = "#000";
          g.fillRect(b.x - 7, b.y - 4, 4, 4);
          g.fillRect(b.x + 3, b.y - 4, 4, 4);
        } else {
          g.fillStyle = pal.prize;
          roundRect(g, b.x - b.w / 2, b.y - 12, b.w, 24, 5);
          g.fill();
        }
      }
      g.fillStyle = pal.hero;
      for (const sh of s.shots) g.fillRect(sh.x - 2, sh.y, 4, 12);
      drawSparks(g, s.sparks, 4);
      g.fillStyle = pal.hero;
      roundRect(g, s.x - 11, s.y - 16, 22, 32, 7);
      g.fill();
      g.fillStyle = pal.foe;
      g.fillRect(s.x - 5, s.y + 12, 10, 8);
      centred(g, `${api.score}m`, W / 2, 44, 24, t.ink, t.fontDisplay);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i < s.ammo ? pal.prize : alpha(pal.prize, 0.2);
        g.fillRect(W / 2 - 40 + i * 10, 58, 6, 12);
      }
    },
  }
);

export const flyerPack: GameModule[] = [
  updraft,
  thrustLab,
  duneGlide,
  flipThrust,
  fogFlight,
  skyWhale,
  skyClimb,
  wallSwitch,
  voidWing,
  downShaft,
];
