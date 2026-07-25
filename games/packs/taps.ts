// Tap pack — one finger, tight windows. Rhythm, gates, rings and panic.

import type { GameModule } from "@/games/types";
import { centred, defineGame, sky } from "@/games/kit";
import { alpha, circle, clamp, mix, pick, rand, roundRect, shade } from "@/games/engine";

// --------------------------------------------------------------- Beat Tap

interface Note {
  lane: number;
  y: number;
  hit: boolean;
}

const beatTap = defineGame<{
  notes: Note[];
  next: number;
  combo: number;
  flash: number[];
  miss: number;
}>(
  {
    slug: "beat-tap",
    title: "Beat Tap",
    rule: "Tap the lane as the note lands",
    year: 2008,
    description: "Three lanes, one song, zero excuses.",
    history:
      "Homage to the 2008 rhythm app that was the first thing anyone downloaded on a new touchscreen phone, and the first thing that made it feel like a console.",
    tags: ["reflex", "precision", "oneTap"],
    palette: {
      hero: "#00f5d4",
      foe: "#f15bb5",
      prize: "#fee440",
      deep: "#1a1035",
      glow: "#9b5de5",
    },
    intensity: 0.75,
    speed: 0.8,
    difficulty: 0.55,
    luck: 0.1,
    nostalgia: 0.8,
    realism: 0.15,
    sessionLength: 0.35,
    scoreUnit: "pts",
    maxScorePerSecond: 12,
  },
  {
    hint: "tap the lane on the line",
    overMsg: "OFF BEAT",
    init: () => ({ notes: [], next: 0.4, combo: 0, flash: [0, 0, 0], miss: 0 }),
    down: (s, x, _y, api) => {
      const lane = clamp(Math.floor((x / api.W) * 3), 0, 2);
      s.flash[lane] = 0.16;
      const line = api.H * 0.82;
      let best: Note | null = null;
      for (const n of s.notes) {
        if (n.hit || n.lane !== lane) continue;
        if (Math.abs(n.y - line) < 46 && (!best || Math.abs(n.y - line) < Math.abs(best.y - line)))
          best = n;
      }
      if (best) {
        best.hit = true;
        s.combo += 1;
        api.add(1 + Math.floor(s.combo / 8));
        api.haptic("hit");
      } else {
        s.combo = 0;
        s.miss += 1;
        api.haptic("fail");
        if (s.miss >= 5) api.end();
      }
    },
    update: (s, dt, api) => {
      const { H } = api;
      const fall = H * (0.55 + api.t * 0.012);
      for (let i = 0; i < 3; i++) s.flash[i] = Math.max(0, s.flash[i] - dt);
      s.next -= dt;
      if (s.next <= 0) {
        s.notes.push({ lane: Math.floor(rand(0, 3)), y: -30, hit: false });
        if (Math.random() < 0.2)
          s.notes.push({ lane: Math.floor(rand(0, 3)), y: -30, hit: false });
        s.next = rand(0.32, 0.6) / api.tune.density;
      }
      for (let i = s.notes.length - 1; i >= 0; i--) {
        const n = s.notes[i];
        n.y += fall * dt;
        if (n.y > H + 40) {
          if (!n.hit) {
            s.combo = 0;
            s.miss += 1;
            if (s.miss >= 5) api.end();
          }
          s.notes.splice(i, 1);
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const line = api.H * 0.82;
      for (const n of s.notes) {
        if (!n.hit && Math.abs(n.y - line) < 24) {
          n.hit = true;
          s.flash[n.lane] = 0.16;
          s.combo += 1;
          api.add(1);
        }
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, 0.2));
      const line = H * 0.82;
      for (let l = 0; l < 3; l++) {
        const x = (l * W) / 3;
        g.fillStyle = alpha(pal.glow, 0.1 + (l % 2) * 0.05);
        g.fillRect(x, 0, W / 3, H);
        if (s.flash[l] > 0) {
          g.fillStyle = alpha(pal.hero, s.flash[l] * 3);
          g.fillRect(x, 0, W / 3, H);
        }
        g.fillStyle = alpha(pal.prize, 0.8);
        g.fillRect(x + 6, line - 3, W / 3 - 12, 6);
      }
      for (const n of s.notes) {
        if (n.hit) continue;
        const cx = (n.lane + 0.5) * (W / 3);
        g.fillStyle = pal.foe;
        circle(g, cx, n.y, 24);
        g.fill();
        g.fillStyle = alpha("#ffffff", 0.28);
        circle(g, cx, n.y - 7, 14);
        g.fill();
      }
      centred(g, `${api.score}`, W / 2, 52, 30, t.ink, t.fontDisplay);
      if (s.combo > 3)
        centred(g, `${s.combo} combo`, W / 2, 78, 16, pal.hero, t.fontBody, 700);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = i < s.miss ? pal.foe : alpha(pal.foe, 0.2);
        g.fillRect(W - 20 - i * 12, 34, 8, 8);
      }
    },
  }
);

// ------------------------------------------------------------- Pulse Jump

const pulseJump = defineGame<{
  y: number;
  vy: number;
  ground: boolean;
  rot: number;
  obs: { x: number; kind: 0 | 1 }[];
  next: number;
  dist: number;
}>(
  {
    slug: "pulse-jump",
    title: "Pulse Jump",
    rule: "One tap, on the beat, forever",
    year: 2013,
    description: "It is a rhythm game pretending to be a platformer. Learn the song.",
    history:
      "Homage to the 2013 one-tap platformer where levels were memorised, not read, and the practice mode was the actual game.",
    tags: ["reflex", "precision", "oneTap", "endurance"],
    palette: {
      hero: "#00e5ff",
      foe: "#ff1f6b",
      prize: "#ffe66d",
      deep: "#12002e",
      glow: "#6a00f4",
    },
    intensity: 0.85,
    speed: 0.9,
    difficulty: 0.8,
    luck: 0.05,
    nostalgia: 0.6,
    realism: 0.1,
    sessionLength: 0.25,
    scoreUnit: "m",
    maxScorePerSecond: 40,
  },
  {
    hint: "tap to jump",
    overMsg: "SMASHED",
    init: () => ({ y: 0, vy: 0, ground: true, rot: 0, obs: [], next: 0.7, dist: 0 }),
    down: (s, _x, _y, api) => {
      if (s.ground) {
        s.vy = -api.H * 0.78;
        s.ground = false;
        api.haptic("light");
      }
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = W * 0.66 + api.t * 6;
      s.dist += v * dt;
      api.set(Math.floor(s.dist / 10));
      if (!s.ground) {
        s.vy += H * 3 * dt;
        s.y += s.vy * dt;
        s.rot += dt * 7;
        if (s.y >= 0) {
          s.y = 0;
          s.vy = 0;
          s.ground = true;
          s.rot = 0;
        }
      }
      s.next -= dt;
      if (s.next <= 0) {
        s.obs.push({ x: W + 30, kind: (Math.random() < 0.35 ? 1 : 0) as 0 | 1 });
        s.next = rand(0.42, 0.8) / api.tune.density;
      }
      const px = W * 0.24;
      for (let i = s.obs.length - 1; i >= 0; i--) {
        const o = s.obs[i];
        o.x -= v * dt;
        if (o.x < -50) {
          s.obs.splice(i, 1);
          continue;
        }
        const h = o.kind === 0 ? 34 : 62;
        if (Math.abs(o.x - px) < 20 && -s.y < h) api.end();
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const px = api.W * 0.24;
      const o = s.obs.find((q) => q.x > px && q.x - px < 130);
      if (o && s.ground && o.x - px < 118) {
        s.vy = -api.H * 0.78;
        s.ground = false;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      const pulse = 0.5 + Math.sin(api.t * 6) * 0.06;
      sky(g, W, H, mix(pal.deep, pal.glow, pulse * 0.4), pal.deep);
      const gy = H * 0.74;
      g.fillStyle = shade(pal.glow, -0.5);
      g.fillRect(0, gy, W, H - gy);
      g.fillStyle = alpha(pal.hero, 0.5);
      g.fillRect(0, gy, W, 3);
      g.strokeStyle = alpha(pal.hero, 0.16);
      g.lineWidth = 2;
      for (let x = -((s.dist * 0.5) % 40); x < W; x += 40) {
        g.beginPath();
        g.moveTo(x, gy);
        g.lineTo(x - 30, H);
        g.stroke();
      }
      for (const o of s.obs) {
        g.fillStyle = pal.foe;
        if (o.kind === 0) {
          g.beginPath();
          g.moveTo(o.x - 17, gy);
          g.lineTo(o.x, gy - 34);
          g.lineTo(o.x + 17, gy);
          g.closePath();
          g.fill();
        } else {
          roundRect(g, o.x - 18, gy - 62, 36, 62, 4);
          g.fill();
          g.fillStyle = alpha("#ffffff", 0.2);
          g.fillRect(o.x - 18, gy - 62, 36, 6);
        }
      }
      const px = W * 0.24;
      g.save();
      g.translate(px, gy - 17 + s.y);
      g.rotate(s.rot);
      g.fillStyle = pal.hero;
      roundRect(g, -17, -17, 34, 34, 6);
      g.fill();
      g.fillStyle = pal.prize;
      roundRect(g, -7, -7, 14, 14, 3);
      g.fill();
      g.restore();
      centred(g, `${api.score}m`, W / 2, 48, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------ Colour Gate

const GATE_COLS = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4"];

/** Which quadrant of a ring sits at its lowest point, given its rotation. */
function sectorAt(rot: number): number {
  const q = Math.PI / 2;
  const rel = (((Math.PI / 2 - rot) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(rel / q) % 4;
}

const colourGate = defineGame<{
  y: number;
  vy: number;
  col: number;
  rings: { y: number; rot: number; spin: number; passed: boolean }[];
  swaps: { y: number; taken: boolean }[];
  climb: number;
}>(
  {
    slug: "colour-gate",
    title: "Colour Gate",
    rule: "Only your colour lets you through",
    year: 2015,
    description: "Read the ring, not the gap. That is the whole trick.",
    history:
      "Homage to the 2015 colour-matcher that got harder purely by making you doubt what you were looking at.",
    tags: ["reflex", "precision", "oneTap"],
    palette: {
      hero: "#ffffff",
      foe: "#22223b",
      prize: "#f2e9e4",
      deep: "#0d0d14",
      glow: "#4a4e69",
    },
    intensity: 0.7,
    speed: 0.6,
    difficulty: 0.65,
    luck: 0.1,
    nostalgia: 0.4,
    realism: 0.05,
    sessionLength: 0.3,
    scoreUnit: "gates",
    maxScorePerSecond: 2,
  },
  {
    hint: "tap to bounce up",
    overMsg: "WRONG COLOUR",
    init: (api) => ({
      y: api.H * 0.7,
      vy: 0,
      col: 0,
      rings: [0, 1, 2].map((i) => ({
        y: api.H * 0.42 - i * 210,
        rot: Math.random() * 6,
        spin: rand(1, 2.2) * (Math.random() < 0.5 ? -1 : 1),
        passed: false,
      })),
      swaps: [0, 1, 2].map((i) => ({ y: api.H * 0.42 - i * 210 - 105, taken: false })),
      climb: 0,
    }),
    down: (s, _x, _y, api) => {
      s.vy = -api.H * 0.52;
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.vy += H * 1.2 * dt;
      s.y += s.vy * dt;
      if (s.y > H - 30) api.end();
      if (s.y < H * 0.45) {
        const lift = H * 0.45 - s.y;
        s.y += lift;
        s.climb += lift;
        for (const r of s.rings) r.y += lift;
        for (const q of s.swaps) q.y += lift;
      }
      const R = W * 0.3;
      for (const r of s.rings) {
        r.rot += r.spin * dt;
        // the ball crosses the ring at its lowest point, so that is the only
        // arc whose colour matters
        if (!r.passed && s.vy < 0 && Math.abs(s.y - (r.y + R)) < 14) {
          if (sectorAt(r.rot) !== s.col) api.end();
          else {
            r.passed = true;
            api.add(1);
            api.haptic("hit");
          }
        }
        if (r.y > H + 120) {
          const top = Math.min(...s.rings.map((q) => q.y));
          r.y = top - 210;
          r.rot = Math.random() * 6;
          r.spin = rand(1, 2.4) * (Math.random() < 0.5 ? -1 : 1);
          r.passed = false;
        }
      }
      for (const q of s.swaps) {
        if (!q.taken && Math.abs(q.y - s.y) < 20) {
          q.taken = true;
          s.col = (s.col + 1 + Math.floor(rand(0, 3))) % 4;
          api.haptic("light");
        }
        if (q.y > H + 120) {
          const top = Math.min(...s.swaps.map((z) => z.y));
          q.y = top - 210;
          q.taken = false;
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const R = api.W * 0.3;
      const next = s.rings
        .filter((r) => !r.passed && r.y + R < s.y)
        .sort((a, b) => b.y - a.y)[0];
      const floor = api.H * 0.72;
      if (!next) {
        if (s.vy > 0 && s.y > floor) s.vy = -api.H * 0.52;
        return;
      }
      const gap = s.y - (next.y + R);
      // hover below the ring until its matching arc swings into the crossing
      const ready = sectorAt(next.rot + next.spin * 0.35) === s.col;
      if (s.vy > 0 && (gap > 150 || !ready ? s.y > floor : true)) s.vy = -api.H * 0.52;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.foe);
      const cx = W / 2;
      for (const q of s.swaps) {
        if (q.taken || q.y < -30 || q.y > H + 30) continue;
        g.fillStyle = pal.prize;
        circle(g, cx, q.y, 9);
        g.fill();
        g.strokeStyle = alpha(pal.prize, 0.5);
        g.lineWidth = 2;
        circle(g, cx, q.y, 15);
        g.stroke();
      }
      for (const r of s.rings) {
        if (r.y < -140 || r.y > H + 140) continue;
        const R = W * 0.3;
        g.lineWidth = 15;
        for (let i = 0; i < 4; i++) {
          g.strokeStyle = GATE_COLS[i];
          g.beginPath();
          g.arc(cx, r.y, R, r.rot + (i * Math.PI) / 2, r.rot + ((i + 1) * Math.PI) / 2);
          g.stroke();
        }
      }
      g.fillStyle = GATE_COLS[s.col];
      circle(g, cx, s.y, 13);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.4);
      circle(g, cx - 4, s.y - 4, 4);
      g.fill();
      centred(g, `${api.score}`, W / 2, 48, 28, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Twin Orbit

const twinOrbit = defineGame<{
  ang: number;
  spin: number;
  blocks: { y: number; x: number; w: number }[];
  next: number;
  dist: number;
}>(
  {
    slug: "twin-orbit",
    title: "Twin Orbit",
    rule: "Hold a side to rotate both orbs",
    year: 2013,
    description: "You are two things at once and both of them can die.",
    history:
      "Homage to the 2013 two-orb dodger whose difficulty came entirely from having to think about the dot you were not looking at.",
    tags: ["reflex", "precision", "hold", "calm"],
    palette: {
      hero: "#00b4d8",
      foe: "#e5e5e5",
      prize: "#ef476f",
      deep: "#14080e",
      glow: "#3c1642",
    },
    intensity: 0.6,
    speed: 0.6,
    difficulty: 0.75,
    luck: 0.05,
    nostalgia: 0.6,
    realism: 0.05,
    sessionLength: 0.35,
    scoreUnit: "m",
    maxScorePerSecond: 25,
  },
  {
    hint: "hold left or right",
    overMsg: "IMPACT",
    autoStart: true,
    init: () => ({ ang: 0, spin: 0, blocks: [], next: 0.5, dist: 0 }),
    down: (s, x, _y, api) => {
      s.spin = x < api.W / 2 ? -1 : 1;
    },
    move: (s, x, _y, api) => {
      if (s.spin !== 0) s.spin = x < api.W / 2 ? -1 : 1;
    },
    up: (s) => {
      s.spin = 0;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = H * 0.34 + api.t * 4;
      s.dist += v * dt;
      api.set(Math.floor(s.dist / 12));
      s.ang += s.spin * 3.4 * dt;
      s.next -= dt;
      if (s.next <= 0) {
        const w = rand(W * 0.2, W * 0.55);
        s.blocks.push({ y: -40, x: rand(0, W - w), w });
        s.next = rand(0.55, 1) / api.tune.density;
      }
      const cy = H * 0.72;
      const R = W * 0.22;
      for (let i = s.blocks.length - 1; i >= 0; i--) {
        const b = s.blocks[i];
        b.y += v * dt;
        if (b.y > H + 60) {
          s.blocks.splice(i, 1);
          continue;
        }
        for (const k of [0, Math.PI]) {
          const ox = W / 2 + Math.cos(s.ang + k) * R;
          const oy = cy + Math.sin(s.ang + k) * R;
          if (Math.abs(oy - b.y) < 16 && ox > b.x && ox < b.x + b.w) api.end();
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const { W, H } = api;
      const cy = H * 0.72;
      const R = W * 0.22;
      const b = s.blocks.filter((q) => q.y < cy - 20).sort((p, q) => q.y - p.y)[0];
      if (!b) {
        s.spin = 0;
        return;
      }
      // find the rotation that puts both orbs outside the incoming block
      const safe = (a: number) =>
        [0, Math.PI].every((k) => {
          const ox = W / 2 + Math.cos(a + k) * R;
          return ox < b.x - 12 || ox > b.x + b.w + 12;
        });
      if (safe(s.ang)) {
        s.spin = 0;
        return;
      }
      s.spin = safe(s.ang + 0.4) ? 1 : -1;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const cy = H * 0.72;
      const R = W * 0.22;
      for (const b of s.blocks) {
        g.fillStyle = pal.foe;
        roundRect(g, b.x, b.y - 14, b.w, 28, 4);
        g.fill();
      }
      g.strokeStyle = alpha(pal.hero, 0.18);
      g.lineWidth = 2;
      circle(g, W / 2, cy, R);
      g.stroke();
      const cols = [pal.hero, pal.prize];
      [0, Math.PI].forEach((k, i) => {
        const ox = W / 2 + Math.cos(s.ang + k) * R;
        const oy = cy + Math.sin(s.ang + k) * R;
        g.fillStyle = alpha(cols[i], 0.25);
        circle(g, ox, oy, 20);
        g.fill();
        g.fillStyle = cols[i];
        circle(g, ox, oy, 12);
        g.fill();
      });
      centred(g, `${api.score}`, W / 2, 48, 26, t.ink, t.fontDisplay);
    },
  }
);

// --------------------------------------------------------------- Ring Gap

const ringGap = defineGame<{
  ang: number;
  spin: number;
  walls: { r: number; gap: number; sides: number }[];
  next: number;
  rot: number;
}>(
  {
    slug: "ring-gap",
    title: "Ring Gap",
    rule: "Hold a side, find the opening",
    year: 2012,
    description: "Six walls closing in. Sixty seconds is a legendary run.",
    history:
      "Homage to the 2012 minimalist that measured your life in seconds and made ten of them feel like an achievement.",
    tags: ["reflex", "precision", "hold", "chaos"],
    palette: {
      hero: "#ffffff",
      foe: "#ff006e",
      prize: "#ffbe0b",
      deep: "#03071e",
      glow: "#370617",
    },
    intensity: 1,
    speed: 1,
    difficulty: 0.95,
    luck: 0.05,
    nostalgia: 0.6,
    realism: 0.05,
    sessionLength: 0.15,
    scoreUnit: "sec",
    maxScorePerSecond: 1.2,
  },
  {
    hint: "hold left or right",
    overMsg: "COLLAPSED",
    autoStart: true,
    init: () => ({ ang: -Math.PI / 2, spin: 0, walls: [], next: 0, rot: 0 }),
    down: (s, x, _y, api) => {
      s.spin = x < api.W / 2 ? -1 : 1;
    },
    move: (s, x, _y, api) => {
      if (s.spin !== 0) s.spin = x < api.W / 2 ? -1 : 1;
    },
    up: (s) => {
      s.spin = 0;
    },
    update: (s, dt, api) => {
      const { W } = api;
      api.set(Math.floor(api.t * 10) / 10);
      s.ang += s.spin * 4.4 * dt;
      s.rot += dt * 0.55;
      s.next -= dt;
      if (s.next <= 0) {
        const sides = 6;
        s.walls.push({ r: W * 0.95, gap: Math.floor(rand(0, sides)), sides });
        s.next = Math.max(0.32, 0.85 - api.t * 0.02) / api.tune.density;
      }
      const speed = W * 0.28 + api.t * 3;
      for (let i = s.walls.length - 1; i >= 0; i--) {
        const w = s.walls[i];
        w.r -= speed * dt;
        if (w.r < 14) {
          s.walls.splice(i, 1);
          continue;
        }
        if (w.r < 42 && w.r > 30) {
          const seg = Math.PI * 2 / w.sides;
          const rel = ((s.ang - s.rot) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const idx = Math.floor(rel / seg);
          if (idx !== w.gap) api.end();
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const w = s.walls.filter((q) => q.r > 44).sort((a, b) => a.r - b.r)[0];
      if (!w) {
        s.spin = 0;
        return;
      }
      const seg = (Math.PI * 2) / w.sides;
      const target = s.rot + (w.gap + 0.5) * seg;
      let d = ((target - s.ang + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      s.spin = Math.abs(d) < 0.12 ? 0 : d > 0 ? 1 : -1;
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      const cx = W / 2;
      const cy = H / 2;
      const beat = 0.5 + Math.sin(api.t * 8) * 0.5;
      sky(g, W, H, mix(pal.deep, pal.glow, beat * 0.6), pal.deep);
      g.save();
      g.translate(cx, cy);
      // background wedges
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 ? alpha(pal.glow, 0.5) : alpha(pal.deep, 0.5);
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, W, s.rot + (i * Math.PI) / 3, s.rot + ((i + 1) * Math.PI) / 3);
        g.closePath();
        g.fill();
      }
      for (const w of s.walls) {
        const seg = (Math.PI * 2) / w.sides;
        g.strokeStyle = pal.foe;
        g.lineWidth = 13;
        for (let i = 0; i < w.sides; i++) {
          if (i === w.gap) continue;
          g.beginPath();
          g.arc(0, 0, w.r, s.rot + i * seg + 0.02, s.rot + (i + 1) * seg - 0.02);
          g.stroke();
        }
      }
      g.fillStyle = pal.prize;
      circle(g, 0, 0, 13);
      g.fill();
      const px = Math.cos(s.ang) * 30;
      const py = Math.sin(s.ang) * 30;
      g.fillStyle = pal.hero;
      g.save();
      g.translate(px, py);
      g.rotate(s.ang + Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(8, 7);
      g.lineTo(-8, 7);
      g.closePath();
      g.fill();
      g.restore();
      g.restore();
      centred(g, `${api.t.toFixed(1)}s`, W / 2, 48, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Helix Drop

const helixDrop = defineGame<{
  rot: number;
  drag: number | null;
  y: number;
  vy: number;
  floors: { y: number; gap: number; bad: number[] }[];
  depth: number;
  streak: number;
}>(
  {
    slug: "helix-drop",
    title: "Helix Drop",
    rule: "Spin the tower, find the hole",
    year: 2018,
    description: "Break enough floors in a row and nothing can stop you.",
    history:
      "Homage to the 2018 hypercasual smash that made a whole genre out of one ball, one tower and one satisfying crunch.",
    tags: ["reflex", "drag", "chaos"],
    palette: {
      hero: "#ffd23f",
      foe: "#ee4266",
      prize: "#0ead69",
      deep: "#540d6e",
      glow: "#3bceac",
    },
    intensity: 0.6,
    speed: 0.6,
    difficulty: 0.45,
    luck: 0.25,
    nostalgia: 0.2,
    realism: 0.1,
    sessionLength: 0.3,
    scoreUnit: "floors",
    maxScorePerSecond: 4,
  },
  {
    hint: "drag to rotate",
    overMsg: "SPLAT",
    autoStart: true,
    init: (api) => {
      const floors = [];
      for (let i = 0; i < 26; i++) {
        const bad: number[] = [];
        const n = i < 3 ? 0 : Math.random() < 0.55 ? 1 : 0;
        for (let k = 0; k < n; k++) bad.push(Math.floor(rand(0, 8)));
        floors.push({ y: api.H * 0.42 + i * 108, gap: Math.floor(rand(0, 8)), bad });
      }
      return { rot: 0, drag: null, y: api.H * 0.2, vy: 0, floors, depth: 0, streak: 0 };
    },
    down: (s, x) => {
      s.drag = x;
    },
    move: (s, x, _y, api) => {
      if (s.drag === null) return;
      s.rot -= ((x - s.drag) / api.W) * 5;
      s.drag = x;
    },
    up: (s) => {
      s.drag = null;
    },
    update: (s, dt, api) => {
      const { H } = api;
      s.vy += H * 2.2 * dt;
      s.y += s.vy * dt;
      const seg = (Math.PI * 2) / 8;
      for (const f of s.floors) {
        if (Math.abs(f.y - s.y) < 16 && s.vy > 0) {
          const rel = ((-s.rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const idx = Math.floor(rel / seg) % 8;
          if (idx === f.gap) {
            // straight through
            s.streak += 1;
            api.add(1 + (s.streak > 3 ? 2 : 0));
            api.haptic("hit");
          } else if (f.bad.includes(idx)) {
            api.end();
          } else if (s.streak > 3) {
            // a hot streak smashes through the plain segments
            api.add(2);
            api.haptic("hit");
          } else {
            s.vy = -H * 0.42;
            s.streak = 0;
          }
        }
      }
      if (s.y > H * 0.42) {
        const push = s.y - H * 0.42;
        s.y -= push;
        s.depth += push;
        for (const f of s.floors) f.y -= push;
      }
      const lowest = Math.max(...s.floors.map((f) => f.y));
      for (const f of s.floors) {
        if (f.y < -60) {
          f.y = lowest + 108;
          f.gap = Math.floor(rand(0, 8));
          f.bad = Math.random() < 0.6 ? [Math.floor(rand(0, 8))] : [];
        }
      }
      if (s.y < -60) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      const next = s.floors.filter((f) => f.y > s.y + 10).sort((a, b) => a.y - b.y)[0];
      if (!next) return;
      const seg = (Math.PI * 2) / 8;
      const target = -(next.gap + 0.5) * seg;
      let d = target - s.rot;
      d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      s.rot += clamp(d, -3 * 0.016, 3 * 0.016) * 3;
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, -0.5));
      const cx = W / 2;
      const R = W * 0.36;
      g.fillStyle = alpha("#000000", 0.35);
      g.fillRect(cx - 16, 0, 32, H);
      const seg = (Math.PI * 2) / 8;
      for (const f of s.floors) {
        if (f.y < -50 || f.y > H + 50) continue;
        // a floor is a solid disc with one wedge punched out for the gap,
        // then the lethal segments painted back on top
        const wedge = (i: number, fill: string, dy: number) => {
          const a0 = s.rot + i * seg;
          g.fillStyle = fill;
          g.beginPath();
          g.moveTo(cx, f.y + dy);
          g.ellipse(cx, f.y + dy, R, R * 0.3, 0, a0, a0 + seg);
          g.closePath();
          g.fill();
        };
        g.fillStyle = alpha("#000000", 0.22);
        g.beginPath();
        g.ellipse(cx, f.y + 9, R, R * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = mix(pal.glow, "#ffffff", 0.12);
        g.beginPath();
        g.ellipse(cx, f.y, R, R * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        wedge(f.gap, shade(pal.deep, -0.5), 0);
        for (const i of f.bad) if (i !== f.gap) wedge(i, pal.foe, 0);
      }
      g.fillStyle = s.streak > 3 ? pal.prize : pal.hero;
      circle(g, cx, s.y, 17);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.45);
      circle(g, cx - 5, s.y - 5, 5);
      g.fill();
      centred(g, `${api.score}`, W / 2, 48, 28, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------ Rise Shield

const riseShield = defineGame<{
  bx: number;
  by: number;
  sx: number;
  obs: { x: number; y: number; vx: number; r: number }[];
  next: number;
  height: number;
}>(
  {
    slug: "rise-shield",
    title: "Rise Shield",
    rule: "Drag the bar, guard the balloon",
    year: 2018,
    description: "You cannot move it. You can only decide what it survives.",
    history:
      "Homage to the 2018 one-finger protector where you never controlled the thing you were trying to save.",
    tags: ["precision", "drag", "calm"],
    palette: {
      hero: "#ff9f1c",
      foe: "#2ec4b6",
      prize: "#ffbf69",
      deep: "#011627",
      glow: "#41ead4",
    },
    intensity: 0.45,
    speed: 0.45,
    difficulty: 0.45,
    luck: 0.3,
    nostalgia: 0.2,
    realism: 0.15,
    sessionLength: 0.35,
    scoreUnit: "m",
    maxScorePerSecond: 20,
  },
  {
    hint: "drag the shield",
    overMsg: "POPPED",
    autoStart: true,
    init: (api) => ({
      bx: api.W / 2,
      by: api.H * 0.62,
      sx: api.W / 2,
      obs: [],
      next: 0.6,
      height: 0,
    }),
    move: (s, x) => {
      s.sx = x;
    },
    down: (s, x) => {
      s.sx = x;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const v = H * 0.2 + api.t * 3;
      s.height += v * dt;
      api.set(Math.floor(s.height / 10));
      s.bx += Math.sin(api.t * 0.8) * 12 * dt;
      s.sx = clamp(s.sx, 46, W - 46);
      s.next -= dt;
      if (s.next <= 0) {
        s.obs.push({
          x: rand(20, W - 20),
          y: -30,
          vx: rand(-40, 40),
          r: rand(11, 22),
        });
        s.next = rand(0.5, 1) / api.tune.density;
      }
      const shieldY = s.by - 62;
      for (let i = s.obs.length - 1; i >= 0; i--) {
        const o = s.obs[i];
        o.y += (v + 60) * dt;
        o.x += o.vx * dt;
        if (o.x < o.r || o.x > W - o.r) o.vx *= -1;
        if (o.y > H + 40) {
          s.obs.splice(i, 1);
          continue;
        }
        // shield is a 92px bar
        if (
          Math.abs(o.y - shieldY) < 10 + o.r * 0.4 &&
          Math.abs(o.x - s.sx) < 46 + o.r * 0.5
        ) {
          o.y = shieldY - 14;
          o.vx += (o.x - s.sx) * 2;
          o.y -= 30;
          s.obs.splice(i, 1);
          api.add(1);
          api.haptic("light");
          continue;
        }
        if (Math.hypot(o.x - s.bx, o.y - s.by) < o.r + 22) api.end();
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const threat = s.obs
        .filter((o) => o.y < s.by - 40)
        .sort((a, b) => b.y - a.y)[0];
      if (threat) s.sx += clamp(threat.x - s.sx, -api.W * 0.03, api.W * 0.03);
      else s.sx += clamp(s.bx - s.sx, -api.W * 0.02, api.W * 0.02);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, mix(pal.deep, pal.glow, 0.35));
      g.fillStyle = alpha("#ffffff", 0.1);
      for (let i = 0; i < 10; i++) {
        const y = (i * 90 + ((s.height * 0.4) % 90)) % (H + 90);
        g.fillRect(0, y, W, 1);
      }
      for (const o of s.obs) {
        g.fillStyle = pal.foe;
        circle(g, o.x, o.y, o.r);
        g.fill();
        g.fillStyle = alpha("#000000", 0.2);
        circle(g, o.x + o.r * 0.3, o.y + o.r * 0.3, o.r * 0.5);
        g.fill();
      }
      // balloon
      g.fillStyle = pal.hero;
      g.beginPath();
      g.ellipse(s.bx, s.by, 21, 25, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.4);
      circle(g, s.bx - 7, s.by - 8, 6);
      g.fill();
      g.strokeStyle = alpha(pal.prize, 0.8);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(s.bx, s.by + 25);
      g.lineTo(s.bx + Math.sin(api.t * 3) * 5, s.by + 48);
      g.stroke();
      // shield
      const shieldY = s.by - 62;
      g.fillStyle = pal.prize;
      roundRect(g, s.sx - 46, shieldY - 6, 92, 12, 6);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.35);
      roundRect(g, s.sx - 42, shieldY - 4, 84, 4, 2);
      g.fill();
      centred(g, `${api.score}m`, W / 2, 46, 24, t.ink, t.fontDisplay);
    },
  }
);

// --------------------------------------------------------------- Idle Tap

const UPGRADES = [
  { name: "Extra Thumb", cost: 20, rate: 1 },
  { name: "Auto Finger", cost: 90, rate: 4 },
  { name: "Tap Farm", cost: 400, rate: 16 },
  { name: "Thumb Factory", cost: 1600, rate: 60 },
  { name: "Orbital Thumb", cost: 7000, rate: 240 },
];

const idleTap = defineGame<{
  n: number;
  rate: number;
  owned: number[];
  pop: number;
  left: number;
  floats: { x: number; y: number; a: number; txt: string }[];
}>(
  {
    slug: "idle-tap",
    title: "Idle Tap",
    rule: "Tap, buy, let it tap for you",
    year: 2013,
    description: "Thirty seconds to build an empire that taps itself.",
    history:
      "Homage to the 2013 browser incremental that accidentally invented a genre by asking what happens after the first thousand clicks.",
    tags: ["calm", "oneTap", "chaos"],
    palette: {
      hero: "#ffb703",
      foe: "#fb8500",
      prize: "#8ecae6",
      deep: "#023047",
      glow: "#219ebd",
    },
    intensity: 0.35,
    speed: 0.35,
    difficulty: 0.2,
    luck: 0.15,
    nostalgia: 0.6,
    realism: 0.1,
    sessionLength: 0.35,
    scoreUnit: "taps",
    maxScorePerSecond: 400,
  },
  {
    hint: "tap the big button",
    overMsg: "TIME UP",
    init: () => ({ n: 0, rate: 0, owned: [0, 0, 0, 0, 0], pop: 0, left: 30, floats: [] }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      // upgrade strip along the bottom
      if (y > H * 0.74) {
        const i = clamp(Math.floor((x / W) * UPGRADES.length), 0, UPGRADES.length - 1);
        const u = UPGRADES[i];
        const cost = Math.round(u.cost * Math.pow(1.5, s.owned[i]));
        if (s.n >= cost) {
          s.n -= cost;
          s.owned[i] += 1;
          s.rate += u.rate;
          api.haptic("hit");
        } else api.haptic("fail");
        return;
      }
      s.n += 1 + Math.floor(s.rate * 0.1);
      s.pop = 0.14;
      s.floats.push({ x: x + rand(-20, 20), y, a: 1, txt: `+${1 + Math.floor(s.rate * 0.1)}` });
      api.haptic("light");
    },
    update: (s, dt, api) => {
      s.n += s.rate * dt;
      s.pop = Math.max(0, s.pop - dt);
      s.left -= dt;
      api.set(Math.floor(s.n));
      for (let i = s.floats.length - 1; i >= 0; i--) {
        const f = s.floats[i];
        f.y -= 60 * dt;
        f.a -= dt * 1.4;
        if (f.a <= 0) s.floats.splice(i, 1);
      }
      if (s.left <= 0) api.end();
    },
    bot: (s, dt, api) => {
      s.n += 6 * dt;
      for (let i = UPGRADES.length - 1; i >= 0; i--) {
        const cost = Math.round(UPGRADES[i].cost * Math.pow(1.5, s.owned[i]));
        if (s.n >= cost) {
          s.n -= cost;
          s.owned[i] += 1;
          s.rate += UPGRADES[i].rate;
          break;
        }
      }
      if (Math.random() < 0.4) s.pop = 0.14;
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const cx = W / 2;
      const cy = H * 0.42;
      const r = 82 * (1 + s.pop * 0.7);
      g.fillStyle = alpha("#000000", 0.3);
      circle(g, cx, cy + 8, r);
      g.fill();
      g.fillStyle = pal.hero;
      circle(g, cx, cy, r);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.3);
      circle(g, cx - r * 0.25, cy - r * 0.3, r * 0.42);
      g.fill();
      centred(g, "TAP", cx, cy + 12, 34, shade(pal.foe, -0.45), t.fontDisplay);
      centred(g, `${Math.floor(s.n)}`, cx, H * 0.16, 40, t.ink, t.fontDisplay);
      centred(g, `${s.rate}/sec · ${Math.max(0, s.left).toFixed(0)}s left`, cx, H * 0.2 + 12, 15, t.inkDim, t.fontBody, 700);
      for (const f of s.floats) {
        g.globalAlpha = Math.max(0, f.a);
        centred(g, f.txt, f.x, f.y, 18, pal.prize, t.fontDisplay);
      }
      g.globalAlpha = 1;
      const bw = W / UPGRADES.length;
      UPGRADES.forEach((u, i) => {
        const cost = Math.round(u.cost * Math.pow(1.5, s.owned[i]));
        const can = s.n >= cost;
        g.fillStyle = can ? alpha(pal.prize, 0.9) : alpha(pal.deep, 0.6);
        roundRect(g, i * bw + 4, H * 0.76, bw - 8, H * 0.16, 10);
        g.fill();
        centred(g, u.name.split(" ")[0], i * bw + bw / 2, H * 0.8, 12, can ? "#052235" : t.inkDim, t.fontBody, 800);
        centred(g, `${cost}`, i * bw + bw / 2, H * 0.84, 14, can ? "#052235" : t.inkDim, t.fontDisplay);
        centred(g, `x${s.owned[i]}`, i * bw + bw / 2, H * 0.88, 11, can ? "#052235" : t.inkDim, t.fontBody, 700);
      });
    },
  }
);

// -------------------------------------------------------------- Bad Ideas

type Order = { text: string; kind: "tap" | "hold" | "left" | "right" | "wait" };

const ORDERS: Order[] = [
  { text: "TAP IT", kind: "tap" },
  { text: "HOLD ON", kind: "hold" },
  { text: "SWIPE LEFT", kind: "left" },
  { text: "SWIPE RIGHT", kind: "right" },
  { text: "DO NOTHING", kind: "wait" },
];

const badIdeas = defineGame<{
  order: Order;
  limit: number;
  left: number;
  startX: number;
  down: number;
  lives: number;
  done: boolean;
  flash: number;
  good: boolean;
}>(
  {
    slug: "bad-ideas",
    title: "Bad Ideas",
    rule: "Do exactly what it says, fast",
    year: 2013,
    description: "A cheerful little gauntlet of extremely poor decisions.",
    history:
      "Homage to the 2013 public-safety micro-game collection that taught a generation the rules by making breaking them funny.",
    tags: ["reflex", "chaos", "memory"],
    palette: {
      hero: "#ffd400",
      foe: "#d62828",
      prize: "#00b2ca",
      deep: "#1b1b1e",
      glow: "#f77f00",
    },
    intensity: 0.9,
    speed: 0.9,
    difficulty: 0.6,
    luck: 0.25,
    nostalgia: 0.6,
    realism: 0.15,
    sessionLength: 0.25,
    scoreUnit: "pts",
    maxScorePerSecond: 3,
  },
  {
    hint: "read fast, react faster",
    overMsg: "PREDICTABLE",
    init: () => ({
      order: pick(ORDERS),
      limit: 2.2,
      left: 2.2,
      startX: 0,
      down: 0,
      lives: 3,
      done: false,
      flash: 0,
      good: true,
    }),
    down: (s, x, _y, api) => {
      s.startX = x;
      s.down = api.t;
      if (s.order.kind === "wait") {
        s.done = true;
        s.good = false;
      }
    },
    up: (s, x, _y, api) => {
      if (s.done) return;
      const held = api.t - s.down;
      const dx = x - s.startX;
      let ok = false;
      if (s.order.kind === "left") ok = dx < -40;
      else if (s.order.kind === "right") ok = dx > 40;
      else if (s.order.kind === "hold") ok = held > 0.6 && Math.abs(dx) < 40;
      else if (s.order.kind === "tap") ok = held < 0.4 && Math.abs(dx) < 30;
      s.done = true;
      s.good = ok;
    },
    update: (s, dt, api) => {
      s.left -= dt;
      s.flash = Math.max(0, s.flash - dt);
      if (!s.done) {
        if (s.left > 0) return;
        // out of time — the only order that is won by waiting is "do nothing"
        s.done = true;
        s.good = s.order.kind === "wait";
      }
      s.flash = 0.2;
      if (s.good) {
        api.add(1);
        api.haptic("hit");
      } else {
        s.lives -= 1;
        api.haptic("fail");
        if (s.lives <= 0) {
          api.end();
          return;
        }
      }
      s.order = pick(ORDERS);
      s.limit = Math.max(0.8, 2.2 - api.score * 0.05);
      s.left = s.limit;
      s.done = false;
      s.good = true;
      s.down = 0;
    },
    bot: (s, dt, api) => {
      void dt;
      if (!s.done && s.left < s.limit * 0.55) {
        s.done = true;
        s.good = Math.random() < 0.85;
      }
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      const tint = s.flash > 0 ? (s.good ? pal.prize : pal.foe) : pal.deep;
      sky(g, W, H, mix(pal.deep, tint, s.flash * 3), pal.deep);
      // silly little blobs, doing something ill-advised
      for (let i = 0; i < 3; i++) {
        const x = W * (0.25 + i * 0.25);
        const y = H * 0.68 + Math.sin(api.t * 3 + i) * 6;
        g.fillStyle = [pal.hero, pal.prize, pal.glow][i];
        circle(g, x, y, 24);
        g.fill();
        g.fillStyle = "#111";
        circle(g, x - 8, y - 5, 3.4);
        g.fill();
        circle(g, x + 8, y - 5, 3.4);
        g.fill();
        g.strokeStyle = "#111";
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(x, y + 6, 8, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
      }
      // the longest order is "DO NOTHING", so size off the card, not a constant
      centred(g, s.order.text, W / 2, H * 0.34, Math.min(40, W * 0.115), t.ink, t.fontDisplay);
      const frac = clamp(s.left / s.limit, 0, 1);
      g.fillStyle = alpha(t.ink, 0.15);
      roundRect(g, W * 0.15, H * 0.42, W * 0.7, 12, 6);
      g.fill();
      g.fillStyle = frac < 0.3 ? pal.foe : pal.prize;
      roundRect(g, W * 0.15, H * 0.42, W * 0.7 * frac, 12, 6);
      g.fill();
      centred(g, `${api.score}`, W / 2, 52, 28, t.ink, t.fontDisplay);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < s.lives ? pal.foe : alpha(pal.foe, 0.2);
        circle(g, W - 24 - i * 18, 40, 6);
        g.fill();
      }
    },
  }
);

// ------------------------------------------------------------ Panic Panel

interface Control {
  label: string;
  kind: "switch" | "dial" | "button";
  on: boolean;
}

const PANEL_WORDS = [
  "FLUX", "GRAVY", "BILGE", "ZORK", "PHASE", "TURBO", "KRELL", "VENT",
];

const panicPanel = defineGame<{
  ctrls: Control[];
  target: number;
  left: number;
  limit: number;
  lives: number;
  flash: number;
  ok: boolean;
}>(
  {
    slug: "panic-panel",
    title: "Panic Panel",
    rule: "Hit the control it shouts for",
    year: 2012,
    description: "The ship is fine. The ship is definitely fine. FLUX THE BILGE.",
    history:
      "Homage to the 2012 co-op shouting game where everyone had the instructions for somebody else's console.",
    tags: ["reflex", "chaos", "memory"],
    palette: {
      hero: "#00fddc",
      foe: "#ff5964",
      prize: "#ffe74c",
      deep: "#0f0f17",
      glow: "#35a7ff",
    },
    intensity: 0.9,
    speed: 0.85,
    difficulty: 0.65,
    luck: 0.2,
    nostalgia: 0.6,
    realism: 0.2,
    sessionLength: 0.3,
    scoreUnit: "orders",
    maxScorePerSecond: 3,
  },
  {
    hint: "hit what it shouts",
    overMsg: "SHIP LOST",
    init: () => {
      const words = [...PANEL_WORDS].sort(() => Math.random() - 0.5).slice(0, 6);
      const ctrls: Control[] = words.map((w, i) => ({
        label: w,
        kind: (["switch", "dial", "button"] as const)[i % 3],
        on: false,
      }));
      return {
        ctrls,
        target: Math.floor(rand(0, 6)),
        left: 3,
        limit: 3,
        lives: 3,
        flash: 0,
        ok: true,
      };
    },
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y < H * 0.42) return;
      const col = clamp(Math.floor((x / W) * 2), 0, 1);
      const row = clamp(Math.floor(((y - H * 0.42) / (H * 0.5)) * 3), 0, 2);
      const idx = row * 2 + col;
      s.ctrls[idx].on = !s.ctrls[idx].on;
      if (idx === s.target) {
        api.add(1);
        api.haptic("hit");
        s.flash = 0.18;
        s.ok = true;
        s.target = Math.floor(rand(0, s.ctrls.length));
        s.limit = Math.max(1.1, 3 - api.score * 0.09);
        s.left = s.limit;
      } else {
        s.lives -= 1;
        s.flash = 0.18;
        s.ok = false;
        api.haptic("fail");
        if (s.lives <= 0) api.end();
      }
    },
    update: (s, dt, api) => {
      s.left -= dt;
      s.flash = Math.max(0, s.flash - dt);
      if (s.left <= 0) {
        s.lives -= 1;
        s.ok = false;
        s.flash = 0.18;
        if (s.lives <= 0) {
          api.end();
          return;
        }
        s.target = Math.floor(rand(0, s.ctrls.length));
        s.left = s.limit;
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.left < s.limit * 0.6) {
        s.ctrls[s.target].on = !s.ctrls[s.target].on;
        api.add(1);
        s.flash = 0.18;
        s.ok = true;
        s.target = Math.floor(rand(0, s.ctrls.length));
        s.left = s.limit;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, 0.25));
      const alarm = s.flash > 0 && !s.ok;
      if (alarm) {
        g.fillStyle = alpha(pal.foe, s.flash * 1.6);
        g.fillRect(0, 0, W, H);
      }
      const c = s.ctrls[s.target];
      centred(
        g,
        `${c.kind === "dial" ? "SPIN" : c.kind === "switch" ? "FLIP" : "MASH"} THE`,
        W / 2,
        H * 0.19,
        18,
        t.inkDim,
        t.fontBody,
        800
      );
      centred(g, c.label, W / 2, H * 0.28, 44, pal.hero, t.fontDisplay);
      const frac = clamp(s.left / s.limit, 0, 1);
      g.fillStyle = alpha(t.ink, 0.14);
      roundRect(g, W * 0.14, H * 0.33, W * 0.72, 10, 5);
      g.fill();
      g.fillStyle = frac < 0.35 ? pal.foe : pal.prize;
      roundRect(g, W * 0.14, H * 0.33, W * 0.72 * frac, 10, 5);
      g.fill();
      const cw = W / 2;
      const ch = (H * 0.5) / 3;
      s.ctrls.forEach((ct, i) => {
        const cx = (i % 2) * cw;
        const cy = H * 0.42 + Math.floor(i / 2) * ch;
        g.fillStyle = alpha(pal.glow, 0.18);
        roundRect(g, cx + 8, cy + 6, cw - 16, ch - 12, 12);
        g.fill();
        centred(g, ct.label, cx + cw / 2, cy + 24, 15, t.ink, t.fontBody, 800);
        const mx = cx + cw / 2;
        const my = cy + ch * 0.62;
        if (ct.kind === "switch") {
          g.fillStyle = ct.on ? pal.prize : alpha(t.ink, 0.25);
          roundRect(g, mx - 26, my - 11, 52, 22, 11);
          g.fill();
          g.fillStyle = "#fff";
          circle(g, mx + (ct.on ? 13 : -13), my, 8);
          g.fill();
        } else if (ct.kind === "dial") {
          g.strokeStyle = alpha(t.ink, 0.35);
          g.lineWidth = 4;
          circle(g, mx, my, 15);
          g.stroke();
          g.strokeStyle = ct.on ? pal.prize : t.ink;
          g.beginPath();
          g.moveTo(mx, my);
          const a = ct.on ? -0.6 : -2.4;
          g.lineTo(mx + Math.cos(a) * 14, my + Math.sin(a) * 14);
          g.stroke();
        } else {
          g.fillStyle = ct.on ? pal.foe : shade(pal.foe, -0.45);
          circle(g, mx, my, 16);
          g.fill();
          g.fillStyle = alpha("#ffffff", 0.3);
          circle(g, mx - 5, my - 5, 5);
          g.fill();
        }
      });
      centred(g, `${api.score}`, W / 2, 44, 24, t.ink, t.fontDisplay);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < s.lives ? pal.foe : alpha(pal.foe, 0.2);
        circle(g, W - 22 - i * 17, 38, 6);
        g.fill();
      }
    },
  }
);

export const tapPack: GameModule[] = [
  beatTap,
  pulseJump,
  colourGate,
  twinOrbit,
  ringGap,
  helixDrop,
  riseShield,
  idleTap,
  badIdeas,
  panicPanel,
];
