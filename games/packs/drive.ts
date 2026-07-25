// Drive pack — steering, tilting and throttle. The 2008 accelerometer era,
// rebuilt for a thumb instead of a whole wrist.

import type { GameModule } from "@/games/types";
import { centred, defineGame, sky } from "@/games/kit";
import { alpha, circle, clamp, rand, roundRect, shade } from "@/games/engine";

// -------------------------------------------------------------- Tilt Maze

const TM = 9;

const tiltMaze = defineGame<{
  walls: boolean[][];
  holes: [number, number][];
  goal: [number, number];
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  level: number;
}>(
  {
    slug: "tilt-maze",
    title: "Tilt Maze",
    rule: "Tilt the tray, dodge the holes",
    year: 2008,
    description: "Wooden tray, steel ball, no undo.",
    history:
      "Homage to the 2008 launch-day tilt game that existed mainly to prove the phone knew which way up it was.",
    tags: ["precision", "drag", "calm"],
    palette: {
      hero: "#adb5bd",
      foe: "#3d2b1f",
      prize: "#2a9d8f",
      deep: "#c9a227",
      glow: "#e9c46a",
    },
    intensity: 0.45,
    speed: 0.4,
    difficulty: 0.55,
    luck: 0.15,
    nostalgia: 0.8,
    realism: 0.55,
    sessionLength: 0.45,
    scoreUnit: "mazes",
    maxScorePerSecond: 1.5,
  },
  {
    hint: "drag to tilt",
    overMsg: "DOWN A HOLE",
    autoStart: true,
    init: () => makeMaze(1),
    move: (s, x, y, api) => {
      s.tx = clamp((x - api.W / 2) / (api.W * 0.4), -1, 1);
      s.ty = clamp((y - api.H * 0.54) / (api.H * 0.3), -1, 1);
    },
    down: (s, x, y, api) => {
      s.tx = clamp((x - api.W / 2) / (api.W * 0.4), -1, 1);
      s.ty = clamp((y - api.H * 0.54) / (api.H * 0.3), -1, 1);
    },
    up: (s) => {
      s.tx = 0;
      s.ty = 0;
    },
    update: (s, dt, api) => {
      s.vx += s.tx * 9 * dt;
      s.vy += s.ty * 9 * dt;
      s.vx *= Math.pow(0.2, dt);
      s.vy *= Math.pow(0.2, dt);
      const nx = s.x + s.vx * dt;
      const ny = s.y + s.vy * dt;
      const blocked = (px: number, py: number) => {
        const c = Math.floor(px);
        const r = Math.floor(py);
        return c < 0 || c >= TM || r < 0 || r >= TM || s.walls[r][c];
      };
      if (!blocked(nx, s.y)) s.x = nx;
      else s.vx = -s.vx * 0.3;
      if (!blocked(s.x, ny)) s.y = ny;
      else s.vy = -s.vy * 0.3;
      for (const [hr, hc] of s.holes)
        if (Math.hypot(s.x - (hc + 0.5), s.y - (hr + 0.5)) < 0.36) api.end();
      if (Math.hypot(s.x - (s.goal[1] + 0.5), s.y - (s.goal[0] + 0.5)) < 0.42) {
        api.add(1);
        api.haptic("hit");
        Object.assign(s, makeMaze(s.level + 1));
      }
    },
    bot: (s, dt, api) => {
      void dt;
      void api;
      s.tx = clamp(s.goal[1] + 0.5 - s.x, -1, 1);
      s.ty = clamp(s.goal[0] + 0.5 - s.y, -1, 1);
      for (const [hr, hc] of s.holes) {
        const d = Math.hypot(s.x - (hc + 0.5), s.y - (hr + 0.5));
        if (d < 1.6) {
          s.tx += (s.x - (hc + 0.5)) / d;
          s.ty += (s.y - (hr + 0.5)) / d;
        }
      }
      s.tx = clamp(s.tx, -1, 1);
      s.ty = clamp(s.ty, -1, 1);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, shade(pal.foe, 0.3), shade(pal.foe, -0.2));
      const cell = Math.min((W * 0.92) / TM, (H * 0.66) / TM);
      const ox = (W - cell * TM) / 2;
      const oy = H * 0.2;
      g.save();
      g.translate(ox + (cell * TM) / 2, oy + (cell * TM) / 2);
      g.rotate(s.tx * 0.035);
      g.translate(-(ox + (cell * TM) / 2), -(oy + (cell * TM) / 2));
      g.fillStyle = pal.deep;
      roundRect(g, ox - 8, oy - 8, cell * TM + 16, cell * TM + 16, 10);
      g.fill();
      g.fillStyle = shade(pal.deep, 0.25);
      g.fillRect(ox, oy, cell * TM, cell * TM);
      for (let r = 0; r < TM; r++)
        for (let c = 0; c < TM; c++)
          if (s.walls[r][c]) {
            g.fillStyle = pal.foe;
            roundRect(g, ox + c * cell, oy + r * cell, cell, cell, 3);
            g.fill();
            g.fillStyle = alpha("#ffffff", 0.14);
            g.fillRect(ox + c * cell + 2, oy + r * cell + 2, cell - 4, 4);
          }
      for (const [hr, hc] of s.holes) {
        g.fillStyle = "#141210";
        circle(g, ox + (hc + 0.5) * cell, oy + (hr + 0.5) * cell, cell * 0.34);
        g.fill();
      }
      g.fillStyle = pal.prize;
      circle(g, ox + (s.goal[1] + 0.5) * cell, oy + (s.goal[0] + 0.5) * cell, cell * 0.3);
      g.fill();
      g.fillStyle = alpha("#000000", 0.35);
      circle(g, ox + s.x * cell + 2, oy + s.y * cell + 3, cell * 0.28);
      g.fill();
      g.fillStyle = pal.hero;
      circle(g, ox + s.x * cell, oy + s.y * cell, cell * 0.28);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.6);
      circle(g, ox + s.x * cell - cell * 0.09, oy + s.y * cell - cell * 0.1, cell * 0.09);
      g.fill();
      g.restore();
      centred(g, `${api.score} solved`, W / 2, 44, 22, t.ink, t.fontDisplay);
      centred(g, `maze ${s.level}`, W / 2, 68, 13, t.inkDim, t.fontBody, 700);
    },
  }
);

function makeMaze(level: number) {
  const walls: boolean[][] = Array.from({ length: TM }, (_, r) =>
    Array.from({ length: TM }, (_, c) => r === 0 || c === 0 || r === TM - 1 || c === TM - 1)
  );
  for (let k = 0; k < 6 + level; k++) {
    const r = Math.floor(rand(2, TM - 2));
    const c = Math.floor(rand(2, TM - 2));
    walls[r][c] = true;
  }
  const holes: [number, number][] = [];
  for (let k = 0; k < 3 + level; k++) {
    const r = Math.floor(rand(2, TM - 2));
    const c = Math.floor(rand(2, TM - 2));
    if (!walls[r][c] && !(r < 3 && c < 3)) holes.push([r, c]);
  }
  const goal: [number, number] = [TM - 2, TM - 2];
  walls[goal[0]][goal[1]] = false;
  walls[1][1] = false;
  return { walls, holes, goal, x: 1.5, y: 1.5, vx: 0, vy: 0, tx: 0, ty: 0, level };
}

// ------------------------------------------------------------- Cube Field

const cubeField = defineGame<{
  x: number;
  cubes: { z: number; x: number }[];
  next: number;
  dist: number;
}>(
  {
    slug: "cube-field",
    title: "Cube Field",
    rule: "Steer between the blocks",
    year: 2008,
    description: "No jump, no brake, no end. Only left and right.",
    history:
      "Homage to the 2008 tilt dodger that was among the first things anyone sideloaded, and still one of the purest.",
    tags: ["reflex", "drag", "endurance"],
    palette: {
      hero: "#f72585",
      foe: "#4cc9f0",
      prize: "#ffffff",
      deep: "#10002b",
      glow: "#3a0ca3",
    },
    intensity: 0.8,
    speed: 0.9,
    difficulty: 0.6,
    luck: 0.15,
    nostalgia: 0.8,
    realism: 0.2,
    sessionLength: 0.3,
    scoreUnit: "m",
    maxScorePerSecond: 50,
  },
  {
    hint: "drag to steer",
    overMsg: "CRASHED",
    autoStart: true,
    init: () => ({ x: 0.5, cubes: [], next: 0, dist: 0 }),
    move: (s, x, _y, api) => {
      s.x = clamp(x / api.W, 0.08, 0.92);
    },
    down: (s, x, _y, api) => {
      s.x = clamp(x / api.W, 0.08, 0.92);
    },
    update: (s, dt, api) => {
      const v = 0.55 + api.t * 0.02;
      s.dist += v * dt * 60;
      api.set(Math.floor(s.dist));
      s.next -= dt;
      if (s.next <= 0) {
        s.cubes.push({ z: 1, x: rand(0.06, 0.94) });
        s.next = 0.16 / api.tune.density;
      }
      for (let i = s.cubes.length - 1; i >= 0; i--) {
        const c = s.cubes[i];
        c.z -= v * dt;
        if (c.z < -0.05) {
          s.cubes.splice(i, 1);
          continue;
        }
        if (c.z < 0.05 && Math.abs(c.x - s.x) < 0.075) api.end();
      }
    },
    bot: (s, dt, api) => {
      void dt;
      void api;
      const soon = s.cubes.filter((c) => c.z > 0.02 && c.z < 0.35);
      let best = s.x;
      let bestGap = -1;
      for (let cand = 0.1; cand <= 0.9; cand += 0.04) {
        const gap = Math.min(
          ...soon.map((c) => Math.abs(c.x - cand)),
          1
        );
        const score = gap - Math.abs(cand - s.x) * 0.25;
        if (score > bestGap) {
          bestGap = score;
          best = cand;
        }
      }
      s.x += clamp(best - s.x, -0.035, 0.035);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, "#02000a");
      const hz = H * 0.36;
      const proj = (x: number, z: number) => {
        const p = Math.max(0.001, z) ** 1.8;
        return {
          sx: W / 2 + (x - 0.5) * (W * 0.16 + W * 2.1 * p),
          sy: hz + (H - hz) * p,
          sc: 0.08 + p * 1.5,
        };
      };
      g.fillStyle = shade(pal.glow, -0.6);
      g.beginPath();
      g.moveTo(proj(0, 0).sx, hz);
      g.lineTo(proj(1, 0).sx, hz);
      g.lineTo(proj(1, 1).sx, H);
      g.lineTo(proj(0, 1).sx, H);
      g.closePath();
      g.fill();
      g.strokeStyle = alpha(pal.foe, 0.3);
      g.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const z = ((i / 14 + (1 - ((s.dist * 0.02) % 1))) % 1) ** 1.8;
        const y = hz + (H - hz) * z;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      for (const c of [...s.cubes].sort((a, b) => b.z - a.z)) {
        const p = proj(c.x, Math.max(0, c.z));
        const size = 46 * p.sc;
        g.fillStyle = pal.foe;
        g.fillRect(p.sx - size / 2, p.sy - size, size, size);
        g.fillStyle = alpha("#ffffff", 0.25);
        g.fillRect(p.sx - size / 2, p.sy - size, size, size * 0.24);
        g.fillStyle = alpha("#000000", 0.3);
        g.fillRect(p.sx - size / 2, p.sy - size * 0.2, size, size * 0.2);
      }
      const pp = proj(s.x, 0.03);
      g.fillStyle = pal.hero;
      g.beginPath();
      g.moveTo(pp.sx, pp.sy - 34);
      g.lineTo(pp.sx - 20, pp.sy);
      g.lineTo(pp.sx + 20, pp.sy);
      g.closePath();
      g.fill();
      g.fillStyle = alpha(pal.prize, 0.8);
      g.fillRect(pp.sx - 5, pp.sy - 12, 10, 12);
      centred(g, `${Math.floor(s.dist)}`, W / 2, 44, 26, t.ink, t.fontDisplay);
    },
  }
);

// -------------------------------------------------------------- Roll Crew

const rollCrew = defineGame<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number;
  crew: { x: number; got: boolean }[];
  exit: number;
  seed: number;
  level: number;
}>(
  {
    slug: "roll-crew",
    title: "Roll Crew",
    rule: "Roll everyone to the exit",
    year: 2008,
    description: "Round, cheerful, and only slightly in danger.",
    history:
      "Homage to the 2008 tilt-roll platformer that gave a physics toy a personality and a soundtrack people still hum.",
    tags: ["calm", "drag", "precision"],
    palette: {
      hero: "#ffb703",
      foe: "#023047",
      prize: "#8ecae6",
      deep: "#219ebd",
      glow: "#ffd6a5",
    },
    intensity: 0.4,
    speed: 0.4,
    difficulty: 0.4,
    luck: 0.15,
    nostalgia: 0.8,
    realism: 0.4,
    sessionLength: 0.5,
    scoreUnit: "crew",
    maxScorePerSecond: 3,
  },
  {
    hint: "hold a side to roll",
    overMsg: "LOST THE CREW",
    autoStart: true,
    init: (api) => makeRollLevel(api.W, 1),
    down: (s, x, _y, api) => {
      s.dir = x < api.W / 2 ? -1 : 1;
    },
    move: (s, x, _y, api) => {
      if (s.dir !== 0) s.dir = x < api.W / 2 ? -1 : 1;
    },
    up: (s) => {
      s.dir = 0;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.vx += s.dir * 420 * dt;
      s.vx *= Math.pow(0.42, dt);
      s.x += s.vx * dt;
      s.x = clamp(s.x, 16, W * 3);
      const ground = rollY(s.x, H, s.seed);
      s.vy += H * 1.6 * dt;
      s.y += s.vy * dt;
      if (s.y > ground) {
        s.y = ground;
        s.vy = -Math.abs(s.vy) * 0.24;
        // rolling downhill adds speed, uphill costs it
        const slope = (rollY(s.x + 6, H, s.seed) - rollY(s.x - 6, H, s.seed)) / 12;
        s.vx += -slope * 260 * dt;
      }
      for (const c of s.crew)
        if (!c.got && Math.abs(c.x - s.x) < 26) {
          c.got = true;
          api.add(1);
          api.haptic("hit");
        }
      if (Math.abs(s.exit - s.x) < 30) {
        if (s.crew.every((c) => c.got)) {
          api.add(5);
          api.haptic("hit");
          Object.assign(s, makeRollLevel(W, s.level + 1));
        }
      }
      if (api.t > 45) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      void api;
      const next = s.crew.find((c) => !c.got);
      const target = next ? next.x : s.exit;
      s.dir = target > s.x + 8 ? 1 : target < s.x - 8 ? -1 : 0;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const cam = clamp(s.x - W * 0.4, 0, W * 2);
      g.save();
      g.translate(-cam, 0);
      g.fillStyle = pal.foe;
      g.beginPath();
      g.moveTo(cam, H);
      for (let x = cam; x <= cam + W; x += 8) g.lineTo(x, rollY(x, H, s.seed));
      g.lineTo(cam + W, H);
      g.closePath();
      g.fill();
      g.fillStyle = shade(pal.foe, 0.35);
      for (let x = cam; x <= cam + W; x += 8) g.fillRect(x, rollY(x, H, s.seed) - 4, 8, 5);
      for (const c of s.crew) {
        if (c.got) continue;
        const cy = rollY(c.x, H, s.seed) - 16;
        g.fillStyle = pal.prize;
        circle(g, c.x, cy, 13);
        g.fill();
        g.fillStyle = "#0b2b3a";
        circle(g, c.x - 4, cy - 3, 2.6);
        g.fill();
        circle(g, c.x + 4, cy - 3, 2.6);
        g.fill();
      }
      const ey = rollY(s.exit, H, s.seed);
      g.fillStyle = alpha("#ffffff", 0.85);
      roundRect(g, s.exit - 22, ey - 60, 44, 60, 10);
      g.fill();
      g.fillStyle = pal.deep;
      roundRect(g, s.exit - 14, ey - 46, 28, 46, 6);
      g.fill();
      g.save();
      g.translate(s.x, s.y - 16);
      g.rotate(s.x / 16);
      g.fillStyle = pal.hero;
      circle(g, 0, 0, 16);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.35);
      g.fillRect(-16, -3, 32, 6);
      g.restore();
      g.fillStyle = "#0b2b3a";
      circle(g, s.x - 5, s.y - 20, 3);
      g.fill();
      circle(g, s.x + 5, s.y - 20, 3);
      g.fill();
      g.restore();
      centred(g, `${api.score}`, W / 2, 42, 24, t.ink, t.fontDisplay);
      centred(
        g,
        `${s.crew.filter((c) => !c.got).length} left · ${Math.max(0, 45 - api.t).toFixed(0)}s`,
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

function rollY(x: number, H: number, seed: number) {
  return H * 0.68 + Math.sin(x * 0.008 + seed) * H * 0.1 + Math.sin(x * 0.023 + seed) * H * 0.04;
}

function makeRollLevel(W: number, level: number) {
  const seed = Math.random() * 10;
  return {
    x: 40,
    y: 0,
    vx: 0,
    vy: 0,
    dir: 0,
    crew: Array.from({ length: 2 + Math.min(3, level) }, () => ({
      x: rand(W * 0.35, W * 2.2),
      got: false,
    })),
    exit: W * 2.5,
    seed,
    level,
  };
}

// ------------------------------------------------------------ Powder Line

const powderLine = defineGame<{
  x: number;
  y: number;
  vy: number;
  spin: number;
  spinning: boolean;
  air: boolean;
  dist: number;
  seed: number;
  combo: number;
  msg: string;
  msgT: number;
}>(
  {
    slug: "powder-line",
    title: "Powder Line",
    rule: "Hold in the air to flip",
    year: 2015,
    description: "Chase the sunset. Land the flip. Do not think about it.",
    history:
      "Homage to the 2015 endless snowboarder whose real feature was the weather and a soundtrack you kept playing after you stopped.",
    tags: ["calm", "precision", "hold", "endurance"],
    palette: {
      hero: "#e07a5f",
      foe: "#3d405b",
      prize: "#f2cc8f",
      deep: "#81b29a",
      glow: "#f4f1de",
    },
    intensity: 0.4,
    speed: 0.6,
    difficulty: 0.45,
    luck: 0.15,
    nostalgia: 0.4,
    realism: 0.45,
    sessionLength: 0.5,
    scoreUnit: "pts",
    maxScorePerSecond: 20,
  },
  {
    hint: "hold in the air",
    overMsg: "FACE FIRST",
    autoStart: true,
    init: () => ({
      x: 0,
      y: 0,
      vy: 0,
      spin: 0,
      spinning: false,
      air: false,
      dist: 0,
      seed: Math.random() * 10,
      combo: 0,
      msg: "",
      msgT: 0,
    }),
    down: (s) => {
      s.spinning = true;
    },
    up: (s) => {
      s.spinning = false;
    },
    update: (s, dt, api) => {
      const { H } = api;
      const speed = 210 + api.t * 4;
      s.dist += speed * dt;
      s.msgT = Math.max(0, s.msgT - dt);
      const ground = slopeY(s.dist, H, s.seed);
      s.vy += H * 1.5 * dt;
      s.y += s.vy * dt;
      if (s.spinning && s.air) s.spin += 7 * dt;
      if (s.y >= ground) {
        if (s.air) {
          // landing: within a quarter turn of upright, or you eat it
          const off = Math.abs(((s.spin % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
          const upright = off < 0.7 || off > Math.PI * 2 - 0.7;
          const flips = Math.floor(s.spin / (Math.PI * 2));
          if (!upright && flips > 0) {
            api.end();
            return;
          }
          if (flips > 0) {
            s.combo += flips;
            api.add(flips * 10 + s.combo * 2);
            s.msg = `${flips} flip${flips > 1 ? "s" : ""}!`;
            s.msgT = 1.2;
            api.haptic("hit");
          }
          s.spin = 0;
          s.air = false;
        }
        s.y = ground;
        const slope = (slopeY(s.dist + 8, H, s.seed) - slopeY(s.dist - 8, H, s.seed)) / 16;
        s.vy = slope * speed;
        // a steep lip launches you
        if (slope < -0.5) {
          s.vy = -H * 0.55;
          s.air = true;
        }
      } else s.air = true;
      api.add(0);
      api.set(Math.max(api.score, Math.floor(s.dist / 30)));
    },
    bot: (s, dt, api) => {
      void dt;
      void api;
      s.spinning = s.air && s.vy < 0;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.foe, pal.hero);
      g.fillStyle = pal.prize;
      circle(g, W * 0.72, H * 0.24, 34);
      g.fill();
      const px = W * 0.34;
      for (const [k, col] of [
        [0.35, alpha(pal.deep, 0.45)],
        [0.7, alpha(pal.deep, 0.75)],
        [1, pal.glow],
      ] as const) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, H);
        for (let x = 0; x <= W; x += 8)
          g.lineTo(x, slopeY(s.dist * k + (x - px), H, s.seed) + (1 - k) * 60);
        g.lineTo(W, H);
        g.closePath();
        g.fill();
      }
      g.save();
      g.translate(px, s.y - 14);
      g.rotate(s.spin + Math.atan2(s.vy, 230) * 0.5);
      g.fillStyle = pal.deep;
      roundRect(g, -18, 8, 36, 5, 3);
      g.fill();
      g.fillStyle = pal.hero;
      roundRect(g, -8, -18, 16, 26, 6);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.4);
      circle(g, 0, -22, 7);
      g.fill();
      g.restore();
      centred(g, `${api.score}`, W / 2, 42, 26, t.ink, t.fontDisplay);
      if (s.msgT > 0) {
        g.globalAlpha = clamp(s.msgT, 0, 1);
        centred(g, s.msg, W / 2, H * 0.24, 24, pal.prize, t.fontDisplay);
        g.globalAlpha = 1;
      }
    },
  }
);

function slopeY(d: number, H: number, seed: number) {
  return (
    H * 0.66 +
    Math.sin(d * 0.006 + seed) * H * 0.14 +
    Math.sin(d * 0.019 + seed * 3) * H * 0.05
  );
}

// ------------------------------------------------------------ Hill Hauler

const hillHauler = defineGame<{
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  av: number;
  gas: number; // -1 brake, 0 coast, 1 gas
  fuel: number;
  seed: number;
  cans: { x: number; got: boolean }[];
}>(
  {
    slug: "hill-hauler",
    title: "Hill Hauler",
    rule: "Right to go, left to brake",
    year: 2012,
    description: "The fuel runs out. The hill does not.",
    history:
      "Homage to the 2012 two-pedal physics driver whose whole tension was a fuel gauge and a suspension you could not trust.",
    tags: ["chaos", "endurance", "precision", "hold"],
    palette: {
      hero: "#e63946",
      foe: "#606c38",
      prize: "#fca311",
      deep: "#a2d2ff",
      glow: "#bde0fe",
    },
    intensity: 0.6,
    speed: 0.55,
    difficulty: 0.55,
    luck: 0.2,
    nostalgia: 0.6,
    realism: 0.55,
    sessionLength: 0.5,
    scoreUnit: "m",
    maxScorePerSecond: 25,
  },
  {
    hint: "hold right to accelerate",
    overMsg: "ROLLED IT",
    autoStart: true,
    init: () => ({
      x: 60,
      y: 0,
      vx: 0,
      vy: 0,
      ang: 0,
      av: 0,
      gas: 0,
      fuel: 1,
      seed: Math.random() * 10,
      cans: Array.from({ length: 40 }, (_, i) => ({
        x: 400 + i * rand(280, 460),
        got: false,
      })),
    }),
    down: (s, x, _y, api) => {
      s.gas = x > api.W / 2 ? 1 : -1;
    },
    move: (s, x, _y, api) => {
      if (s.gas !== 0) s.gas = x > api.W / 2 ? 1 : -1;
    },
    up: (s) => {
      s.gas = 0;
    },
    update: (s, dt, api) => {
      const { H } = api;
      if (s.fuel <= 0) s.gas = Math.min(0, s.gas);
      const ground = hillY(s.x, H, s.seed);
      const slope = Math.atan2(
        hillY(s.x + 10, H, s.seed) - hillY(s.x - 10, H, s.seed),
        20
      );
      s.vx += (s.gas === 1 ? 220 : s.gas === -1 ? -180 : 0) * dt;
      s.vx -= Math.sin(slope) * 280 * dt;
      s.vx *= Math.pow(0.62, dt);
      s.x += s.vx * dt;
      s.vy += H * 1.7 * dt;
      s.y += s.vy * dt;
      const onGround = s.y >= ground - 2;
      if (onGround) {
        s.y = ground;
        s.vy = 0;
        s.ang += (slope - s.ang) * Math.min(1, dt * 9);
        s.av *= 0.7;
      } else {
        s.av += s.gas * 1.6 * dt;
        s.ang += s.av * dt;
      }
      if (s.gas === 1) s.fuel = Math.max(0, s.fuel - dt * 0.045);
      for (const c of s.cans)
        if (!c.got && Math.abs(c.x - s.x) < 26) {
          c.got = true;
          s.fuel = Math.min(1, s.fuel + 0.4);
          api.add(10);
          api.haptic("hit");
        }
      api.set(Math.max(api.score, Math.floor(s.x / 12)));
      if (Math.abs(s.ang) > 1.5 && onGround) api.end();
      if (s.fuel <= 0 && Math.abs(s.vx) < 8) api.end();
      if (s.x < 0) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      void api;
      s.fuel = Math.max(s.fuel, 0.4);
      const slope = hillY(s.x + 40, api.H, s.seed) - hillY(s.x, api.H, s.seed);
      s.gas = Math.abs(s.ang) > 0.9 ? (s.ang > 0 ? -1 : 1) : slope > 6 ? 0 : 1;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const cam = s.x - W * 0.32;
      g.save();
      g.translate(-cam, 0);
      g.fillStyle = shade(pal.foe, 0.35);
      g.beginPath();
      g.moveTo(cam, H);
      for (let x = cam; x <= cam + W; x += 8) g.lineTo(x, hillY(x, H, s.seed) + 30);
      g.lineTo(cam + W, H);
      g.closePath();
      g.fill();
      g.fillStyle = pal.foe;
      g.beginPath();
      g.moveTo(cam, H);
      for (let x = cam; x <= cam + W; x += 8) g.lineTo(x, hillY(x, H, s.seed));
      g.lineTo(cam + W, H);
      g.closePath();
      g.fill();
      for (const c of s.cans) {
        if (c.got || c.x < cam - 40 || c.x > cam + W + 40) continue;
        const cy = hillY(c.x, H, s.seed) - 18;
        g.fillStyle = pal.prize;
        roundRect(g, c.x - 8, cy - 14, 16, 20, 3);
        g.fill();
        g.fillStyle = shade(pal.prize, -0.4);
        g.fillRect(c.x - 4, cy - 18, 8, 5);
      }
      g.save();
      g.translate(s.x, s.y - 14);
      g.rotate(s.ang);
      g.fillStyle = pal.hero;
      roundRect(g, -26, -16, 52, 20, 5);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.3);
      roundRect(g, -12, -28, 24, 14, 4);
      g.fill();
      g.fillStyle = "#1b1b1e";
      circle(g, -16, 8, 11);
      g.fill();
      circle(g, 16, 8, 11);
      g.fill();
      g.fillStyle = "#6b6b70";
      circle(g, -16, 8, 5);
      g.fill();
      circle(g, 16, 8, 5);
      g.fill();
      g.restore();
      g.restore();
      centred(g, `${api.score}m`, W / 2, 42, 24, t.ink, t.fontDisplay);
      g.fillStyle = alpha(t.ink, 0.12);
      roundRect(g, W * 0.25, 64, W * 0.5, 10, 5);
      g.fill();
      g.fillStyle = s.fuel < 0.25 ? "#e5383b" : pal.prize;
      roundRect(g, W * 0.25, 64, W * 0.5 * s.fuel, 10, 5);
      g.fill();
    },
  }
);

function hillY(x: number, H: number, seed: number) {
  return (
    H * 0.7 +
    Math.sin(x * 0.007 + seed) * H * 0.11 +
    Math.sin(x * 0.021 + seed * 2) * H * 0.045
  );
}

// ---------------------------------------------------------------- Circuit

interface Racer {
  t: number; // progress along the track, in laps
  lane: number;
  speed: number;
}

const circuit = defineGame<{
  me: Racer;
  rivals: Racer[];
  steer: number;
  laps: number;
}>(
  {
    slug: "circuit",
    title: "Circuit",
    rule: "Hug the inside, hold the line",
    year: 2009,
    description: "Three laps. The inside line is free speed and free crashes.",
    history:
      "Homage to the 2009 circuit racer that showed a phone could render a real track, then asked you to steer it by leaning.",
    tags: ["reflex", "precision", "drag", "endurance"],
    palette: {
      hero: "#e63946",
      foe: "#457b9d",
      prize: "#f1faee",
      deep: "#1d3557",
      glow: "#a8dadc",
    },
    intensity: 0.65,
    speed: 0.7,
    difficulty: 0.5,
    luck: 0.2,
    nostalgia: 0.8,
    realism: 0.6,
    sessionLength: 0.5,
    scoreUnit: "places",
    maxScorePerSecond: 2,
  },
  {
    hint: "drag to pick your line",
    overMsg: "RACE OVER",
    autoStart: true,
    init: () => ({
      me: { t: 0, lane: 0.5, speed: 0 },
      rivals: [0, 1, 2].map((i) => ({ t: 0.02 + i * 0.02, lane: 0.3 + i * 0.2, speed: 0 })),
      steer: 0.5,
      laps: 3,
    }),
    move: (s, x, _y, api) => {
      s.steer = clamp(x / api.W, 0, 1);
    },
    down: (s, x, _y, api) => {
      s.steer = clamp(x / api.W, 0, 1);
    },
    update: (s, dt, api) => {
      s.me.lane += (s.steer - s.me.lane) * Math.min(1, dt * 5);
      // inside line is quicker but the corner grip runs out
      const curve = Math.abs(Math.sin(s.me.t * Math.PI * 4));
      const grip = 1 - curve * (1 - s.me.lane) * 0.85;
      s.me.speed = 0.11 * (1 + (1 - s.me.lane) * 0.28) * clamp(grip, 0, 1.2);
      if (grip < 0.18) {
        api.haptic("fail");
        s.me.speed *= 0.35;
      }
      s.me.t += s.me.speed * dt;
      for (const r of s.rivals) {
        r.lane += Math.sin(api.t * 1.4 + r.lane * 9) * 0.2 * dt;
        r.lane = clamp(r.lane, 0.15, 0.9);
        r.speed = 0.108 * (1 + (1 - r.lane) * 0.22);
        r.t += r.speed * dt;
      }
      const place =
        1 + s.rivals.filter((r) => r.t > s.me.t).length;
      api.set(Math.max(0, 4 - place) * 5 + Math.floor(s.me.t * 10));
      if (s.me.t >= s.laps) {
        api.add(place === 1 ? 50 : place === 2 ? 25 : 10);
        api.end();
      }
    },
    bot: (s, dt, api) => {
      void dt;
      void api;
      const curve = Math.abs(Math.sin(s.me.t * Math.PI * 4));
      s.steer = clamp(0.28 + curve * 0.45, 0, 1);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, 0.3));
      const cx = W / 2;
      const cy = H * 0.52;
      const rx = W * 0.36;
      const ry = H * 0.3;
      // track as an oval band
      g.strokeStyle = shade(pal.foe, -0.45);
      g.lineWidth = 62;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = alpha(pal.prize, 0.4);
      g.lineWidth = 2;
      g.setLineDash([10, 12]);
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = pal.prize;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx + rx - 31, cy);
      g.lineTo(cx + rx + 31, cy);
      g.stroke();
      const place = (r: Racer, col: string, big: boolean) => {
        const a = (r.t % 1) * Math.PI * 2;
        const rr = rx + (r.lane - 0.5) * 46;
        const ry2 = ry + (r.lane - 0.5) * 38;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * ry2;
        g.save();
        g.translate(x, y);
        g.rotate(a + Math.PI / 2);
        g.fillStyle = col;
        roundRect(g, -8, -13, 16, 26, 4);
        g.fill();
        g.fillStyle = alpha("#000000", 0.35);
        g.fillRect(-8, -4, 16, 7);
        g.restore();
        if (big) {
          g.strokeStyle = alpha(col, 0.6);
          g.lineWidth = 2;
          circle(g, x, y, 18);
          g.stroke();
        }
      };
      s.rivals.forEach((r, i) => place(r, [pal.foe, pal.glow, "#ffd166"][i], false));
      place(s.me, pal.hero, true);
      const pos = 1 + s.rivals.filter((r) => r.t > s.me.t).length;
      centred(g, `P${pos}`, W / 2, H * 0.5, 44, t.ink, t.fontDisplay);
      centred(
        g,
        `lap ${Math.min(s.laps, Math.floor(s.me.t) + 1)}/${s.laps}`,
        W / 2,
        H * 0.55,
        15,
        t.inkDim,
        t.fontBody,
        700
      );
      centred(g, `${api.score}`, W / 2, 42, 22, t.ink, t.fontDisplay);
    },
  }
);

// ---------------------------------------------------------------- Redline

const redline = defineGame<{
  rpm: number;
  gear: number;
  speed: number;
  dist: number;
  blown: boolean;
  zone: [number, number];
  runs: number;
}>(
  {
    slug: "redline",
    title: "Redline",
    rule: "Shift inside the green",
    year: 2009,
    description: "Four hundred metres. Six shifts. One correct rhythm.",
    history:
      "Homage to the 2009 drag racer that stripped driving down to a rev counter and the exact moment you touch it.",
    tags: ["precision", "reflex", "oneTap"],
    palette: {
      hero: "#ff006e",
      foe: "#8338ec",
      prize: "#3a86ff",
      deep: "#0a0a12",
      glow: "#ffbe0b",
    },
    intensity: 0.7,
    speed: 0.6,
    difficulty: 0.55,
    luck: 0.15,
    nostalgia: 0.8,
    realism: 0.5,
    sessionLength: 0.25,
    scoreUnit: "m/s",
    maxScorePerSecond: 20,
  },
  {
    hint: "tap when the needle is green",
    overMsg: "ENGINE BLOWN",
    autoStart: true,
    init: () => ({
      rpm: 0,
      gear: 1,
      speed: 0,
      dist: 0,
      blown: false,
      zone: [0.7, 0.86] as [number, number],
      runs: 1,
    }),
    down: (s, _x, _y, api) => {
      if (s.rpm >= s.zone[0] && s.rpm <= s.zone[1]) {
        s.gear += 1;
        s.speed += 26 - s.gear * 1.5;
        s.rpm = 0.28;
        api.add(6);
        api.haptic("hit");
      } else if (s.rpm > s.zone[1]) {
        s.blown = true;
        api.end();
      } else {
        s.gear += 1;
        s.speed += 6;
        s.rpm = 0.2;
        api.haptic("fail");
      }
      s.zone = [rand(0.6, 0.76), 0] as [number, number];
      s.zone[1] = s.zone[0] + rand(0.09, 0.15);
    },
    update: (s, dt, api) => {
      s.rpm += (0.55 - s.gear * 0.035) * dt;
      s.speed += (2 - s.gear * 0.1) * dt;
      s.dist += s.speed * dt;
      api.set(Math.max(api.score, Math.floor(s.speed)));
      if (s.rpm > 1) {
        s.blown = true;
        api.end();
        return;
      }
      if (s.dist >= 400) {
        api.add(Math.max(0, Math.floor(60 - api.t * 6)));
        api.haptic("hit");
        s.runs += 1;
        s.dist = 0;
        s.gear = 1;
        s.rpm = 0;
        s.speed = 0;
      }
      if (s.gear > 6) {
        s.gear = 6;
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.rpm >= s.zone[0] + 0.03 && s.rpm <= s.zone[1]) {
        s.gear = Math.min(6, s.gear + 1);
        s.speed += 22;
        s.rpm = 0.28;
        s.zone = [rand(0.6, 0.76), 0] as [number, number];
        s.zone[1] = s.zone[0] + rand(0.09, 0.15);
        api.add(6);
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.foe, -0.6));
      // road rushing under
      g.fillStyle = shade(pal.deep, 0.25);
      g.fillRect(W * 0.18, H * 0.5, W * 0.64, H * 0.5);
      g.fillStyle = alpha(pal.glow, 0.55);
      for (let i = 0; i < 7; i++) {
        const y = H * 0.52 + ((i * 60 + ((s.dist * 6) % 60)) % (H * 0.48));
        g.fillRect(W / 2 - 4, y, 8, 26);
      }
      // the car, from behind
      g.fillStyle = pal.hero;
      roundRect(g, W / 2 - 46, H * 0.68, 92, 58, 12);
      g.fill();
      g.fillStyle = alpha("#000000", 0.45);
      roundRect(g, W / 2 - 34, H * 0.7, 68, 22, 7);
      g.fill();
      g.fillStyle = pal.glow;
      roundRect(g, W / 2 - 42, H * 0.72 + 26, 18, 9, 4);
      g.fill();
      roundRect(g, W / 2 + 24, H * 0.72 + 26, 18, 9, 4);
      g.fill();
      // tacho
      const cx = W / 2;
      const cy = H * 0.34;
      const R = Math.min(W * 0.34, H * 0.19);
      g.strokeStyle = alpha("#ffffff", 0.16);
      g.lineWidth = 18;
      g.beginPath();
      g.arc(cx, cy, R, Math.PI * 0.8, Math.PI * 2.2);
      g.stroke();
      g.strokeStyle = "#2fd36c";
      g.beginPath();
      g.arc(
        cx,
        cy,
        R,
        Math.PI * 0.8 + s.zone[0] * Math.PI * 1.4,
        Math.PI * 0.8 + s.zone[1] * Math.PI * 1.4
      );
      g.stroke();
      g.strokeStyle = "#ff3b5c";
      g.beginPath();
      g.arc(cx, cy, R, Math.PI * 0.8 + 0.9 * Math.PI * 1.4, Math.PI * 2.2);
      g.stroke();
      const a = Math.PI * 0.8 + clamp(s.rpm, 0, 1) * Math.PI * 1.4;
      g.strokeStyle = pal.glow;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      g.stroke();
      centred(g, `${s.gear}`, cx, cy + 12, 34, t.ink, t.fontDisplay);
      centred(g, `${Math.floor(s.dist)} / 400 m`, W / 2, H * 0.14, 20, t.ink, t.fontDisplay);
      centred(g, `${Math.floor(s.speed)} m/s`, W / 2, H * 0.18, 14, t.inkDim, t.fontBody, 700);
    },
  }
);

// ---------------------------------------------------------- Ghost Traffic

interface Ghost {
  path: { x: number; y: number }[];
}

const ghostTraffic = defineGame<{
  x: number;
  y: number;
  ang: number;
  steer: number;
  path: { x: number; y: number }[];
  ghosts: Ghost[];
  goal: { x: number; y: number };
  runNo: number;
  time: number;
}>(
  {
    slug: "ghost-traffic",
    title: "Ghost Traffic",
    rule: "Every run adds your last one",
    year: 2015,
    description: "The traffic is you. All of you. At once.",
    history:
      "Homage to the 2015 driver whose brilliant, cruel idea was that every car on the road was a recording of you.",
    tags: ["precision", "memory", "drag", "chaos"],
    palette: {
      hero: "#ffd166",
      foe: "#ef476f",
      prize: "#06d6a0",
      deep: "#073b4c",
      glow: "#118ab2",
    },
    intensity: 0.6,
    speed: 0.5,
    difficulty: 0.65,
    luck: 0.15,
    nostalgia: 0.4,
    realism: 0.5,
    sessionLength: 0.5,
    scoreUnit: "runs",
    maxScorePerSecond: 1.5,
  },
  {
    hint: "hold a side to steer",
    overMsg: "REAR-ENDED",
    autoStart: true,
    init: (api) => ({
      x: api.W / 2,
      y: api.H * 0.82,
      ang: -Math.PI / 2,
      steer: 0,
      path: [],
      ghosts: [],
      goal: { x: rand(api.W * 0.2, api.W * 0.8), y: api.H * 0.16 },
      runNo: 1,
      time: 0,
    }),
    down: (s, x, _y, api) => {
      s.steer = x < api.W / 2 ? -1 : 1;
    },
    move: (s, x, _y, api) => {
      if (s.steer !== 0) s.steer = x < api.W / 2 ? -1 : 1;
    },
    up: (s) => {
      s.steer = 0;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.time += dt;
      s.ang += s.steer * 2.6 * dt;
      const v = H * 0.36;
      s.x += Math.cos(s.ang) * v * dt;
      s.y += Math.sin(s.ang) * v * dt;
      if (s.x < 12 || s.x > W - 12 || s.y < 6 || s.y > H - 6) {
        api.end();
        return;
      }
      if (Math.floor(s.time * 30) > s.path.length) s.path.push({ x: s.x, y: s.y });
      const step = Math.floor(s.time * 30);
      for (const gh of s.ghosts) {
        const p = gh.path[Math.min(step, gh.path.length - 1)];
        if (p && Math.hypot(p.x - s.x, p.y - s.y) < 20) {
          api.end();
          return;
        }
      }
      if (Math.hypot(s.goal.x - s.x, s.goal.y - s.y) < 26) {
        api.add(1);
        api.haptic("hit");
        s.ghosts.push({ path: s.path });
        if (s.ghosts.length > 6) s.ghosts.shift();
        s.path = [];
        s.time = 0;
        s.runNo += 1;
        s.x = W / 2;
        s.y = H * 0.82;
        s.ang = -Math.PI / 2;
        s.goal = { x: rand(W * 0.2, W * 0.8), y: H * 0.16 };
      }
    },
    bot: (s, dt, api) => {
      void dt;
      void api;
      const want = Math.atan2(s.goal.y - s.y, s.goal.x - s.x);
      let d = ((want - s.ang + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      s.steer = Math.abs(d) < 0.08 ? 0 : d > 0 ? 1 : -1;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.deep, 0.2));
      g.fillStyle = alpha("#ffffff", 0.05);
      for (let i = 1; i < 4; i++) {
        g.fillRect((W / 4) * i - 1, 0, 2, H);
        g.fillRect(0, (H / 4) * i - 1, W, 2);
      }
      g.fillStyle = pal.prize;
      circle(g, s.goal.x, s.goal.y, 20);
      g.fill();
      g.fillStyle = alpha(pal.prize, 0.25);
      circle(g, s.goal.x, s.goal.y, 30 + Math.sin(api.t * 4) * 4);
      g.fill();
      const step = Math.floor(s.time * 30);
      const car = (x: number, y: number, ang: number, col: string, ghost: boolean) => {
        g.save();
        g.translate(x, y);
        g.rotate(ang + Math.PI / 2);
        g.globalAlpha = ghost ? 0.55 : 1;
        g.fillStyle = col;
        roundRect(g, -9, -15, 18, 30, 5);
        g.fill();
        g.fillStyle = alpha("#000000", 0.4);
        roundRect(g, -7, -9, 14, 10, 3);
        g.fill();
        g.globalAlpha = 1;
        g.restore();
      };
      s.ghosts.forEach((gh, i) => {
        const idx = Math.min(step, gh.path.length - 1);
        const p = gh.path[idx];
        if (!p) return;
        const prev = gh.path[Math.max(0, idx - 2)];
        car(p.x, p.y, Math.atan2(p.y - prev.y, p.x - prev.x), i % 2 ? pal.foe : pal.glow, true);
      });
      car(s.x, s.y, s.ang, pal.hero, false);
      centred(g, `${api.score} delivered`, W / 2, 40, 20, t.ink, t.fontDisplay);
      centred(g, `${s.ghosts.length} ghosts`, W / 2, 64, 13, t.inkDim, t.fontBody, 700);
    },
  }
);

export const drivePack: GameModule[] = [
  tiltMaze,
  cubeField,
  rollCrew,
  powderLine,
  hillHauler,
  circuit,
  redline,
  ghostTraffic,
];
