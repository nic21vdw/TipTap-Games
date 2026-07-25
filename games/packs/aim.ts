// Aim pack — everything here is about a line you draw and then let go of.

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
import { alpha, circle, clamp, mix, rand, roundRect, shade } from "@/games/engine";

// ------------------------------------------------------------- Fling Fort

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  target: boolean;
  dead: boolean;
}

function buildFort(W: number, H: number): Brick[] {
  const out: Brick[] = [];
  const bx = W * 0.68;
  const gy = H * 0.8;
  for (let i = 0; i < 3; i++) {
    out.push({ x: bx - 40, y: gy - 26 - i * 26, w: 16, h: 26, vy: 0, target: false, dead: false });
    out.push({ x: bx + 40, y: gy - 26 - i * 26, w: 16, h: 26, vy: 0, target: false, dead: false });
  }
  out.push({ x: bx, y: gy - 84, w: 112, h: 14, vy: 0, target: false, dead: false });
  out.push({ x: bx, y: gy - 16, w: 22, h: 22, vy: 0, target: true, dead: false });
  out.push({ x: bx, y: gy - 108, w: 22, h: 22, vy: 0, target: true, dead: false });
  return out;
}

const flingFort = defineGame<{
  bricks: Brick[];
  shots: number;
  ball: { x: number; y: number; vx: number; vy: number } | null;
  aim: { x: number; y: number } | null;
  sparks: Spark[];
  wave: number;
}>(
  {
    slug: "fling-fort",
    title: "Fling Fort",
    rule: "Pull back, let go, knock it down",
    year: 2009,
    description: "Three shots. One tower. Physics does the rest.",
    history:
      "Homage to the 2009 slingshot smash that became the first phone game your parents also played, and then a film.",
    tags: ["precision", "drag", "chaos"],
    palette: {
      hero: "#e63946",
      foe: "#588157",
      prize: "#ffbe0b",
      deep: "#a8dadc",
      glow: "#f1faee",
    },
    intensity: 0.4,
    speed: 0.35,
    difficulty: 0.5,
    luck: 0.3,
    nostalgia: 0.8,
    realism: 0.5,
    sessionLength: 0.5,
    scoreUnit: "pts",
    maxScorePerSecond: 25,
  },
  {
    hint: "drag back from the sling",
    overMsg: "OUT OF BIRDS",
    init: (api) => ({
      bricks: buildFort(api.W, api.H),
      shots: 3,
      ball: null,
      aim: null,
      sparks: [],
      wave: 1,
    }),
    down: (s, x, y) => {
      if (s.ball) return;
      s.aim = { x, y };
    },
    move: (s, x, y) => {
      if (s.aim) s.aim = { x, y };
    },
    up: (s, x, y, api) => {
      if (!s.aim || s.ball) return;
      const sx = api.W * 0.16;
      const sy = api.H * 0.62;
      const dx = sx - x;
      const dy = sy - y;
      s.aim = null;
      if (Math.hypot(dx, dy) < 18) return;
      s.ball = { x: sx, y: sy, vx: dx * 3.2, vy: dy * 3.2 };
      s.shots -= 1;
      api.haptic("hit");
      void y;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const gy = H * 0.8;
      stepSparks(s.sparks, dt);
      if (s.ball) {
        const b = s.ball;
        b.vy += H * 1.5 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        for (const k of s.bricks) {
          if (k.dead) continue;
          if (
            Math.abs(b.x - k.x) < k.w / 2 + 9 &&
            Math.abs(b.y - k.y + k.h / 2) < k.h / 2 + 9
          ) {
            k.dead = true;
            burst(s.sparks, k.x, k.y, k.target ? api.pal.foe : api.pal.prize, 10, 160);
            api.add(k.target ? 30 : 8);
            api.haptic("hit");
            b.vx *= 0.6;
            b.vy *= 0.5;
          }
        }
        if (b.y > gy || b.x > W + 60 || b.x < -60) s.ball = null;
      }
      // unsupported bricks fall
      for (const k of s.bricks) {
        if (k.dead) continue;
        const supported = s.bricks.some(
          (o) =>
            !o.dead &&
            o !== k &&
            Math.abs(o.x - k.x) < (o.w + k.w) / 2 &&
            Math.abs(o.y - o.h - k.y) < 6
        );
        const onGround = Math.abs(k.y - gy) < 4;
        if (!supported && !onGround) {
          k.vy += H * 1.4 * dt;
          k.y += k.vy * dt;
          if (k.y >= gy) {
            k.y = gy;
            k.vy = 0;
          }
        }
      }
      if (s.bricks.every((k) => k.dead || !k.target)) {
        s.wave += 1;
        s.shots += 3;
        api.add(40);
        s.bricks = buildFort(W, H);
      }
      if (s.shots <= 0 && !s.ball) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.ball) return;
      const t2 = s.bricks.find((k) => !k.dead && k.target);
      if (!t2) return;
      const sx = api.W * 0.16;
      const sy = api.H * 0.62;
      s.ball = {
        x: sx,
        y: sy,
        vx: (t2.x - sx) * 1.6 + rand(-30, 30),
        vy: -api.H * rand(0.55, 0.8),
      };
      s.shots = Math.max(1, s.shots);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const gy = H * 0.8;
      g.fillStyle = pal.foe;
      g.fillRect(0, gy, W, H - gy);
      g.fillStyle = shade(pal.foe, 0.2);
      g.fillRect(0, gy, W, 6);
      // sling
      const sx = W * 0.16;
      const sy = H * 0.62;
      g.strokeStyle = shade(pal.prize, -0.55);
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(sx, gy);
      g.lineTo(sx, sy);
      g.stroke();
      if (s.aim) {
        g.strokeStyle = alpha("#ffffff", 0.6);
        g.lineWidth = 3;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(s.aim.x, s.aim.y);
        g.stroke();
        g.setLineDash([]);
      }
      for (const k of s.bricks) {
        if (k.dead) continue;
        if (k.target) {
          g.fillStyle = pal.hero;
          circle(g, k.x, k.y - k.h / 2, k.w / 2 + 2);
          g.fill();
          g.fillStyle = "#fff";
          circle(g, k.x - 4, k.y - k.h / 2 - 3, 3.4);
          g.fill();
          circle(g, k.x + 4, k.y - k.h / 2 - 3, 3.4);
          g.fill();
        } else {
          g.fillStyle = shade(pal.prize, -0.15);
          roundRect(g, k.x - k.w / 2, k.y - k.h, k.w, k.h, 3);
          g.fill();
          g.fillStyle = alpha("#000000", 0.15);
          g.fillRect(k.x - k.w / 2, k.y - 4, k.w, 4);
        }
      }
      if (s.ball) {
        g.fillStyle = pal.hero;
        circle(g, s.ball.x, s.ball.y, 10);
        g.fill();
      }
      drawSparks(g, s.sparks, 5);
      centred(g, `${api.score}`, W / 2, 44, 26, t.ink, t.fontDisplay);
      for (let i = 0; i < s.shots; i++) {
        g.fillStyle = pal.hero;
        circle(g, 22 + i * 20, H - 26, 8);
        g.fill();
      }
    },
  }
);

// -------------------------------------------------------------- Desk Toss

const deskToss = defineGame<{
  ball: { x: number; y: number; vx: number; vy: number; z: number } | null;
  wind: number;
  streak: number;
  misses: number;
  start: { x: number; y: number; t: number } | null;
  msg: string;
  msgT: number;
}>(
  {
    slug: "desk-toss",
    title: "Desk Toss",
    rule: "Flick it in, mind the fan",
    year: 2009,
    description: "The whole office game, in one flick, against one fan.",
    history:
      "Homage to the 2009 free-to-play flick game that was on every phone in every meeting for about eighteen months.",
    tags: ["precision", "drag", "calm"],
    palette: {
      hero: "#f8f9fa",
      foe: "#495057",
      prize: "#2b9348",
      deep: "#dee2e6",
      glow: "#adb5bd",
    },
    intensity: 0.3,
    speed: 0.3,
    difficulty: 0.5,
    luck: 0.4,
    nostalgia: 0.8,
    realism: 0.55,
    sessionLength: 0.4,
    scoreUnit: "in",
    maxScorePerSecond: 1.5,
  },
  {
    hint: "flick upward",
    overMsg: "THREE MISSES",
    init: () => ({
      ball: null,
      wind: rand(-1, 1),
      streak: 0,
      misses: 0,
      start: null,
      msg: "",
      msgT: 0,
    }),
    down: (s, x, y, api) => {
      if (s.ball) return;
      s.start = { x, y, t: api.t };
    },
    up: (s, x, y, api) => {
      if (!s.start || s.ball) return;
      const dt = Math.max(0.05, api.t - s.start.t);
      const vx = (x - s.start.x) / dt;
      const vy = (y - s.start.y) / dt;
      s.start = null;
      if (vy > -80) return;
      s.ball = { x: api.W / 2, y: api.H * 0.86, vx: vx * 0.55, vy: vy * 0.55, z: 0 };
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.msgT = Math.max(0, s.msgT - dt);
      if (!s.ball) return;
      const b = s.ball;
      b.vy += H * 0.95 * dt;
      b.vx += s.wind * 120 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += dt;
      const binX = W / 2;
      const binY = H * 0.36;
      // the rim is a small window the ball must be falling through
      if (b.vy > 0 && b.y > binY - 6 && b.y < binY + 22) {
        if (Math.abs(b.x - binX) < 30) {
          s.streak += 1;
          api.add(1 + (s.streak > 2 ? 1 : 0));
          s.msg = s.streak > 2 ? `${s.streak} in a row!` : "in";
          s.msgT = 1.1;
          api.haptic("hit");
          s.ball = null;
          s.wind = rand(-1.4, 1.4);
          return;
        }
      }
      if (b.y > H + 40 || b.x < -40 || b.x > W + 40) {
        s.ball = null;
        s.streak = 0;
        s.misses += 1;
        s.msg = "miss";
        s.msgT = 1;
        api.haptic("fail");
        s.wind = rand(-1.4, 1.4);
        if (s.misses >= 3) api.end();
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.ball) return;
      const { W, H } = api;
      s.ball = {
        x: W / 2,
        y: H * 0.86,
        vx: -s.wind * 118 * 0.63 + rand(-14, 14),
        vy: -H * 0.86,
        z: 0,
      };
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      // cubicle wall + carpet
      g.fillStyle = shade(pal.glow, -0.15);
      g.fillRect(0, H * 0.52, W, H * 0.48);
      g.fillStyle = alpha("#000000", 0.06);
      for (let y = H * 0.52; y < H; y += 9) g.fillRect(0, y, W, 3);
      // fan
      const fanX = s.wind > 0 ? 26 : W - 26;
      g.fillStyle = pal.foe;
      circle(g, fanX, H * 0.6, 20);
      g.fill();
      g.strokeStyle = pal.glow;
      g.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const a = api.t * 12 + (i * Math.PI * 2) / 3;
        g.beginPath();
        g.moveTo(fanX, H * 0.6);
        g.lineTo(fanX + Math.cos(a) * 15, H * 0.6 + Math.sin(a) * 15);
        g.stroke();
      }
      g.fillStyle = alpha(pal.hero, 0.35);
      for (let i = 0; i < 4; i++) {
        const off = ((api.t * 90 + i * 30) % 90) * Math.sign(s.wind || 1);
        g.fillRect(fanX + off * (s.wind > 0 ? 1 : -1), H * 0.55 + i * 7, 12, 2);
      }
      // bin
      const binX = W / 2;
      const binY = H * 0.36;
      g.fillStyle = shade(pal.foe, 0.2);
      g.beginPath();
      g.moveTo(binX - 32, binY);
      g.lineTo(binX + 32, binY);
      g.lineTo(binX + 25, binY + 68);
      g.lineTo(binX - 25, binY + 68);
      g.closePath();
      g.fill();
      g.fillStyle = shade(pal.foe, -0.25);
      g.beginPath();
      g.ellipse(binX, binY, 32, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#12151a";
      g.beginPath();
      g.ellipse(binX, binY, 27, 6, 0, 0, Math.PI * 2);
      g.fill();
      if (s.ball) {
        g.fillStyle = pal.hero;
        circle(g, s.ball.x, s.ball.y, 12);
        g.fill();
        g.strokeStyle = alpha("#000000", 0.2);
        g.lineWidth = 2;
        circle(g, s.ball.x, s.ball.y, 12);
        g.stroke();
      } else {
        g.fillStyle = pal.hero;
        circle(g, W / 2, H * 0.86, 13);
        g.fill();
      }
      centred(g, `${api.score}`, W / 2, 44, 28, t.ink, t.fontDisplay);
      centred(
        g,
        `wind ${s.wind > 0 ? "→" : "←"} ${Math.abs(s.wind).toFixed(1)}`,
        W / 2,
        68,
        14,
        t.inkDim,
        t.fontBody,
        700
      );
      if (s.msgT > 0) {
        g.globalAlpha = clamp(s.msgT, 0, 1);
        centred(g, s.msg, W / 2, H * 0.24, 26, pal.prize, t.fontDisplay);
        g.globalAlpha = 1;
      }
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < s.misses ? "#e5383b" : alpha("#e5383b", 0.2);
        circle(g, W - 22 - i * 17, 40, 6);
        g.fill();
      }
    },
  }
);

// --------------------------------------------------------------- Arc Duel

const arcDuel = defineGame<{
  turn: 0 | 1;
  hp: [number, number];
  shot: { x: number; y: number; vx: number; vy: number } | null;
  aim: { x: number; y: number } | null;
  wind: number;
  cool: number;
  sparks: Spark[];
}>(
  {
    slug: "arc-duel",
    title: "Arc Duel",
    rule: "Angle and power, one throw each",
    year: 2016,
    description: "Two idiots, one canyon, unlimited confidence.",
    history:
      "Homage to the 2016 turn-based lob duel whose entire comedy came from ragdolls and slightly wrong angles.",
    tags: ["precision", "drag", "luck", "chaos"],
    palette: {
      hero: "#00b4d8",
      foe: "#e63946",
      prize: "#ffd166",
      deep: "#354f52",
      glow: "#84a98c",
    },
    intensity: 0.5,
    speed: 0.35,
    difficulty: 0.5,
    luck: 0.4,
    nostalgia: 0.4,
    realism: 0.4,
    sessionLength: 0.5,
    scoreUnit: "hits",
    maxScorePerSecond: 1.5,
  },
  {
    hint: "drag back to throw",
    overMsg: "KNOCKED OUT",
    init: () => ({
      turn: 0,
      hp: [3, 3],
      shot: null,
      aim: null,
      wind: rand(-0.7, 0.7),
      cool: 0,
      sparks: [],
    }),
    down: (s, x, y) => {
      if (s.shot || s.turn !== 0) return;
      s.aim = { x, y };
    },
    move: (s, x, y) => {
      if (s.aim) s.aim = { x, y };
    },
    up: (s, x, y, api) => {
      if (!s.aim || s.shot || s.turn !== 0) return;
      const px = api.W * 0.16;
      const py = api.H * 0.62;
      s.aim = null;
      const dx = px - x;
      const dy = py - y;
      if (Math.hypot(dx, dy) < 16) return;
      s.shot = { x: px, y: py, vx: dx * 3, vy: dy * 3 };
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      stepSparks(s.sparks, dt);
      if (s.cool > 0) {
        s.cool -= dt;
        if (s.cool <= 0 && s.turn === 1 && !s.shot) {
          // the rival takes its shot, with a wobble that keeps it beatable
          const ex = W * 0.84;
          const ey = H * 0.62;
          s.shot = {
            x: ex,
            y: ey,
            vx: -(ex - W * 0.16) * rand(1.1, 1.5) - s.wind * 90,
            vy: -H * rand(0.6, 0.85),
          };
        }
        return;
      }
      if (!s.shot) return;
      const b = s.shot;
      b.vy += H * 1.5 * dt;
      b.vx += s.wind * 90 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const targets: [number, number][] = [
        [W * 0.16, H * 0.62],
        [W * 0.84, H * 0.62],
      ];
      const hitIdx = s.turn === 0 ? 1 : 0;
      const [tx, ty] = targets[hitIdx];
      if (Math.hypot(b.x - tx, b.y - ty) < 30) {
        s.hp[hitIdx] -= 1;
        burst(s.sparks, tx, ty, api.pal.prize, 14, 200);
        api.haptic("hit");
        if (s.turn === 0) api.add(1);
        s.shot = null;
        s.wind = rand(-0.9, 0.9);
        if (s.hp[hitIdx] <= 0) {
          if (hitIdx === 1) {
            api.add(5);
            s.hp = [3, 3];
          } else api.end();
          return;
        }
        s.turn = s.turn === 0 ? 1 : 0;
        s.cool = 0.9;
        return;
      }
      if (b.y > H * 0.72 || b.x < -50 || b.x > W + 50) {
        s.shot = null;
        s.turn = s.turn === 0 ? 1 : 0;
        s.cool = 0.9;
        s.wind = rand(-0.9, 0.9);
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.shot || s.cool > 0 || s.turn !== 0) return;
      const { W, H } = api;
      s.shot = {
        x: W * 0.16,
        y: H * 0.62,
        vx: (W * 0.68) * rand(1.1, 1.5) - s.wind * 90,
        vy: -H * rand(0.6, 0.85),
      };
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      // two cliffs and a gap
      g.fillStyle = shade(pal.glow, -0.4);
      g.fillRect(0, H * 0.62, W * 0.3, H);
      g.fillRect(W * 0.7, H * 0.62, W * 0.3, H);
      const drawGuy = (x: number, col: string, hp: number, active: boolean) => {
        g.fillStyle = col;
        roundRect(g, x - 13, H * 0.62 - 40, 26, 40, 9);
        g.fill();
        g.fillStyle = "#fff";
        circle(g, x - 5, H * 0.62 - 28, 3.4);
        g.fill();
        circle(g, x + 5, H * 0.62 - 28, 3.4);
        g.fill();
        for (let i = 0; i < 3; i++) {
          g.fillStyle = i < hp ? pal.prize : alpha(pal.prize, 0.2);
          g.fillRect(x - 15 + i * 11, H * 0.62 - 54, 8, 6);
        }
        if (active) {
          g.strokeStyle = alpha(pal.prize, 0.8);
          g.lineWidth = 2;
          circle(g, x, H * 0.62 - 20, 30);
          g.stroke();
        }
      };
      drawGuy(W * 0.16, pal.hero, s.hp[0], s.turn === 0);
      drawGuy(W * 0.84, pal.foe, s.hp[1], s.turn === 1);
      if (s.aim) {
        g.strokeStyle = alpha("#ffffff", 0.55);
        g.lineWidth = 3;
        g.setLineDash([5, 5]);
        g.beginPath();
        g.moveTo(W * 0.16, H * 0.62);
        g.lineTo(s.aim.x, s.aim.y);
        g.stroke();
        g.setLineDash([]);
      }
      if (s.shot) {
        g.fillStyle = pal.prize;
        circle(g, s.shot.x, s.shot.y, 8);
        g.fill();
      }
      drawSparks(g, s.sparks, 5);
      centred(g, `${api.score}`, W / 2, 44, 26, t.ink, t.fontDisplay);
      centred(
        g,
        `wind ${s.wind > 0 ? "→" : "←"}`,
        W / 2,
        68,
        14,
        t.inkDim,
        t.fontBody,
        700
      );
      if (s.turn === 1)
        centred(g, "their turn", W / 2, H * 0.2, 18, pal.foe, t.fontDisplay);
    },
  }
);

// ---------------------------------------------------------- Corner Pocket

interface PoolBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  col: number;
  in: boolean;
}

const cornerPocket = defineGame<{
  balls: PoolBall[];
  aim: { x: number; y: number } | null;
  shots: number;
  moving: boolean;
}>(
  {
    slug: "corner-pocket",
    title: "Corner Pocket",
    rule: "Drag from the cue, sink colours",
    year: 2010,
    description: "Ten shots. Empty the table. Do not sink the white.",
    history:
      "Homage to the 2010 online pool hall where the aiming line was free and everything else was not.",
    tags: ["precision", "drag", "calm"],
    palette: {
      hero: "#ffffff",
      foe: "#0b3d2e",
      prize: "#ffd60a",
      deep: "#0d5c46",
      glow: "#14795c",
    },
    intensity: 0.3,
    speed: 0.3,
    difficulty: 0.5,
    luck: 0.3,
    nostalgia: 0.8,
    realism: 0.6,
    sessionLength: 0.6,
    scoreUnit: "balls",
    maxScorePerSecond: 2,
  },
  {
    hint: "drag from the white ball",
    overMsg: "OUT OF SHOTS",
    init: (api) => {
      const balls: PoolBall[] = [
        { x: api.W / 2, y: api.H * 0.72, vx: 0, vy: 0, col: -1, in: false },
      ];
      let k = 0;
      for (let row = 0; row < 4; row++)
        for (let i = 0; i <= row; i++)
          balls.push({
            x: api.W / 2 + (i - row / 2) * 26,
            y: api.H * 0.32 + row * 23,
            vx: 0,
            vy: 0,
            col: k++ % 5,
            in: false,
          });
      return { balls, aim: null, shots: 10, moving: false };
    },
    down: (s, x, y) => {
      if (s.moving) return;
      s.aim = { x, y };
    },
    move: (s, x, y) => {
      if (s.aim) s.aim = { x, y };
    },
    up: (s, x, y, api) => {
      if (!s.aim || s.moving) return;
      s.aim = null;
      const cue = s.balls[0];
      const dx = cue.x - x;
      const dy = cue.y - y;
      const d = Math.hypot(dx, dy);
      if (d < 14) return;
      const p = Math.min(d, 160) * 5.5;
      cue.vx = (dx / d) * p;
      cue.vy = (dy / d) * p;
      s.shots -= 1;
      s.moving = true;
      api.haptic("hit");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const top = H * 0.18;
      const bot = H * 0.9;
      const R = 11;
      const pockets: [number, number][] = [
        [16, top + 4],
        [W / 2, top - 2],
        [W - 16, top + 4],
        [16, bot - 4],
        [W / 2, bot + 2],
        [W - 16, bot - 4],
      ];
      let moving = false;
      for (const b of s.balls) {
        if (b.in) continue;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const drag = Math.pow(0.28, dt);
        b.vx *= drag;
        b.vy *= drag;
        if (Math.hypot(b.vx, b.vy) < 6) {
          b.vx = 0;
          b.vy = 0;
        } else moving = true;
        if (b.x < 12 + R) {
          b.x = 12 + R;
          b.vx = Math.abs(b.vx) * 0.85;
        }
        if (b.x > W - 12 - R) {
          b.x = W - 12 - R;
          b.vx = -Math.abs(b.vx) * 0.85;
        }
        if (b.y < top + R) {
          b.y = top + R;
          b.vy = Math.abs(b.vy) * 0.85;
        }
        if (b.y > bot - R) {
          b.y = bot - R;
          b.vy = -Math.abs(b.vy) * 0.85;
        }
        for (const [px, py] of pockets)
          if (Math.hypot(b.x - px, b.y - py) < 19) {
            b.in = true;
            if (b.col < 0) {
              // scratch: white comes back, costs a shot
              b.in = false;
              b.x = W / 2;
              b.y = H * 0.72;
              b.vx = 0;
              b.vy = 0;
              s.shots -= 1;
              api.haptic("fail");
            } else {
              api.add(1);
              api.haptic("hit");
            }
          }
      }
      // pair collisions
      for (let i = 0; i < s.balls.length; i++)
        for (let j = i + 1; j < s.balls.length; j++) {
          const a = s.balls[i];
          const b = s.balls[j];
          if (a.in || b.in) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d === 0 || d > R * 2) continue;
          const nx = dx / d;
          const ny = dy / d;
          const push = (R * 2 - d) / 2;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          a.vx -= p * nx;
          a.vy -= p * ny;
          b.vx += p * nx;
          b.vy += p * ny;
          moving = true;
        }
      s.moving = moving;
      if (s.balls.every((b) => b.in || b.col < 0)) {
        api.add(20);
        api.end();
      } else if (s.shots <= 0 && !moving) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.moving) return;
      const cue = s.balls[0];
      const target = s.balls.find((b) => !b.in && b.col >= 0);
      if (!target) return;
      const dx = target.x - cue.x + rand(-16, 16);
      const dy = target.y - cue.y;
      const d = Math.hypot(dx, dy) || 1;
      cue.vx = (dx / d) * 620;
      cue.vy = (dy / d) * 620;
      s.moving = true;
      s.shots = Math.max(2, s.shots);
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      const top = H * 0.18;
      const bot = H * 0.9;
      sky(g, W, H, shade(pal.foe, -0.5), shade(pal.foe, -0.65));
      g.fillStyle = "#5c3a21";
      roundRect(g, 4, top - 14, W - 8, bot - top + 28, 12);
      g.fill();
      g.fillStyle = pal.deep;
      roundRect(g, 12, top, W - 24, bot - top, 6);
      g.fill();
      const pockets: [number, number][] = [
        [16, top + 4],
        [W / 2, top - 2],
        [W - 16, top + 4],
        [16, bot - 4],
        [W / 2, bot + 2],
        [W - 16, bot - 4],
      ];
      g.fillStyle = "#0a0a0c";
      for (const [px, py] of pockets) {
        circle(g, px, py, 15);
        g.fill();
      }
      const COLS = ["#ffd60a", "#e63946", "#3a86ff", "#7209b7", "#f77f00"];
      for (const b of s.balls) {
        if (b.in) continue;
        g.fillStyle = alpha("#000000", 0.3);
        circle(g, b.x + 2, b.y + 3, 11);
        g.fill();
        g.fillStyle = b.col < 0 ? pal.hero : COLS[b.col];
        circle(g, b.x, b.y, 11);
        g.fill();
        g.fillStyle = alpha("#ffffff", 0.45);
        circle(g, b.x - 3.5, b.y - 4, 3.4);
        g.fill();
      }
      if (s.aim) {
        const cue = s.balls[0];
        g.strokeStyle = alpha("#ffffff", 0.5);
        g.lineWidth = 2;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.moveTo(cue.x, cue.y);
        g.lineTo(cue.x + (cue.x - s.aim.x) * 2, cue.y + (cue.y - s.aim.y) * 2);
        g.stroke();
        g.setLineDash([]);
      }
      centred(g, `${api.score} down · ${s.shots} shots`, W / 2, 40, 18, t.ink, t.fontDisplay);
    },
  }
);

// --------------------------------------------------------------- Peg Drop

const pegDrop = defineGame<{
  pegs: { x: number; y: number; hot: boolean; hit: boolean }[];
  ball: { x: number; y: number; vx: number; vy: number } | null;
  balls: number;
  aim: number;
  sparks: Spark[];
}>(
  {
    slug: "peg-drop",
    title: "Peg Drop",
    rule: "Aim, drop, clear the bright pegs",
    year: 2007,
    description: "Physics does most of it. You just get the credit.",
    history:
      "Homage to the 2007 peg-clearing game whose ending fanfare is still the most disproportionate reward in games.",
    tags: ["luck", "precision", "calm"],
    palette: {
      hero: "#ffffff",
      foe: "#4361ee",
      prize: "#ff9e00",
      deep: "#10002b",
      glow: "#7b2cbf",
    },
    intensity: 0.35,
    speed: 0.3,
    difficulty: 0.35,
    luck: 0.6,
    nostalgia: 0.8,
    realism: 0.35,
    sessionLength: 0.5,
    scoreUnit: "pegs",
    maxScorePerSecond: 5,
  },
  {
    hint: "tap to drop a ball",
    overMsg: "OUT OF BALLS",
    init: (api) => {
      const pegs = [];
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 8; c++) {
          if ((r + c) % 2) continue;
          pegs.push({
            x: api.W * (0.1 + (c / 7) * 0.8) + (r % 2 ? 12 : 0),
            y: api.H * (0.3 + r * 0.075),
            hot: Math.random() < 0.3,
            hit: false,
          });
        }
      return { pegs, ball: null, balls: 8, aim: api.W / 2, sparks: [] };
    },
    move: (s, x) => {
      s.aim = x;
    },
    down: (s, x, _y, api) => {
      s.aim = x;
      if (s.ball) return;
      const dx = x - api.W / 2;
      s.ball = { x: api.W / 2, y: api.H * 0.16, vx: dx * 1.5, vy: 40 };
      s.balls -= 1;
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      stepSparks(s.sparks, dt);
      if (!s.ball) {
        if (s.balls <= 0) api.end();
        return;
      }
      const b = s.ball;
      b.vy += H * 1.1 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 8) {
        b.x = 8;
        b.vx = Math.abs(b.vx);
      }
      if (b.x > W - 8) {
        b.x = W - 8;
        b.vx = -Math.abs(b.vx);
      }
      for (const p of s.pegs) {
        if (p.hit) continue;
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < 16) {
          const nx = (b.x - p.x) / (d || 1);
          const ny = (b.y - p.y) / (d || 1);
          const dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * 0.72;
          b.vy = (b.vy - 2 * dot * ny) * 0.72;
          b.x = p.x + nx * 17;
          b.y = p.y + ny * 17;
          p.hit = true;
          api.add(p.hot ? 5 : 1);
          burst(s.sparks, p.x, p.y, p.hot ? api.pal.prize : api.pal.foe, 6, 100);
          api.haptic("hit");
        }
      }
      if (b.y > H + 20) {
        s.ball = null;
        // a free ball for every bucket landing keeps a good run alive
        if (Math.abs(b.x - W / 2) < 40) s.balls += 1;
        if (s.pegs.every((p) => p.hit || !p.hot)) {
          api.add(30);
          for (const p of s.pegs) {
            p.hit = false;
            p.hot = Math.random() < 0.3;
          }
          s.balls += 3;
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.ball) return;
      const hot = s.pegs.find((p) => !p.hit && p.hot);
      const aimX = hot ? hot.x : api.W / 2;
      s.aim = aimX;
      s.ball = {
        x: api.W / 2,
        y: api.H * 0.16,
        vx: (aimX - api.W / 2) * 1.5,
        vy: 40,
      };
      s.balls = Math.max(2, s.balls);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      if (!s.ball) {
        g.strokeStyle = alpha(pal.hero, 0.35);
        g.lineWidth = 2;
        g.setLineDash([5, 7]);
        g.beginPath();
        g.moveTo(W / 2, H * 0.16);
        g.lineTo(s.aim, H * 0.42);
        g.stroke();
        g.setLineDash([]);
      }
      for (const p of s.pegs) {
        if (p.hit) continue;
        g.fillStyle = p.hot ? pal.prize : pal.foe;
        circle(g, p.x, p.y, 7);
        g.fill();
        g.fillStyle = alpha("#ffffff", 0.4);
        circle(g, p.x - 2, p.y - 2, 2.4);
        g.fill();
      }
      // free-ball bucket
      g.fillStyle = alpha(pal.prize, 0.5);
      roundRect(g, W / 2 - 40, H - 26, 80, 18, 6);
      g.fill();
      if (s.ball) {
        g.fillStyle = pal.hero;
        circle(g, s.ball.x, s.ball.y, 9);
        g.fill();
      }
      drawSparks(g, s.sparks, 4);
      centred(g, `${api.score}`, W / 2, 44, 26, t.ink, t.fontDisplay);
      centred(g, `${s.balls} balls`, W / 2, 68, 14, t.inkDim, t.fontBody, 700);
    },
  }
);

// ----------------------------------------------------------- Sphere Chain

const CHAIN_COLS = ["#ef476f", "#ffd166", "#06d6a0", "#118ab2"];

const sphereChain = defineGame<{
  chain: number[];
  head: number; // distance along the path
  shot: { x: number; y: number; vx: number; vy: number; col: number } | null;
  loaded: number;
  aim: number;
}>(
  {
    slug: "sphere-chain",
    title: "Sphere Chain",
    rule: "Fire into the line, match three",
    year: 2003,
    description: "The line never stops. It only gets closer.",
    history:
      "Homage to the 2003 marble shooter that lived on a thousand office desktops under a thousand fake filenames.",
    tags: ["precision", "chaos", "endurance"],
    palette: {
      hero: "#ffd166",
      foe: "#073b4c",
      prize: "#06d6a0",
      deep: "#1b3a4b",
      glow: "#2a6f97",
    },
    intensity: 0.6,
    speed: 0.55,
    difficulty: 0.55,
    luck: 0.3,
    nostalgia: 0.8,
    realism: 0.2,
    sessionLength: 0.5,
    scoreUnit: "pts",
    maxScorePerSecond: 25,
  },
  {
    hint: "tap to fire",
    overMsg: "OVERRUN",
    autoStart: true,
    init: () => ({
      chain: Array.from({ length: 22 }, () => Math.floor(rand(0, 4))),
      head: 0,
      shot: null,
      loaded: Math.floor(rand(0, 4)),
      aim: -Math.PI / 2,
    }),
    move: (s, x, y, api) => {
      s.aim = Math.atan2(y - api.H * 0.78, x - api.W / 2);
    },
    down: (s, x, y, api) => {
      s.aim = Math.atan2(y - api.H * 0.78, x - api.W / 2);
      if (s.shot) return;
      s.shot = {
        x: api.W / 2,
        y: api.H * 0.78,
        vx: Math.cos(s.aim) * api.H * 0.9,
        vy: Math.sin(s.aim) * api.H * 0.9,
        col: s.loaded,
      };
      s.loaded = Math.floor(rand(0, 4));
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.head += (16 + api.t * 0.7) * dt;
      // the path is a slow S down the screen; index -> position
      const at = (i: number) => {
        const d = s.head - i * 24;
        const p = clamp(d / (H * 0.9 + 120), 0, 1.2);
        return {
          x: W / 2 + Math.sin(p * 4.2) * W * 0.32,
          y: -40 + p * (H * 0.86),
          p,
        };
      };
      if (s.shot) {
        const b = s.shot;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < 10 || b.x > W - 10) b.vx *= -1;
        if (b.y < -30 || b.y > H + 30) s.shot = null;
        else
          for (let i = 0; i < s.chain.length; i++) {
            const q = at(i);
            if (Math.hypot(b.x - q.x, b.y - q.y) < 22) {
              s.chain.splice(i, 0, b.col);
              s.shot = null;
              // resolve runs of three or more
              let run = 1;
              let start = i;
              while (start > 0 && s.chain[start - 1] === b.col) {
                start -= 1;
                run += 1;
              }
              let end = i;
              while (end < s.chain.length - 1 && s.chain[end + 1] === b.col) {
                end += 1;
                run += 1;
              }
              if (run >= 3) {
                s.chain.splice(start, run);
                api.add(run * 10);
                api.haptic("hit");
              }
              break;
            }
          }
      }
      if (!s.chain.length) {
        api.add(50);
        s.chain = Array.from({ length: 24 }, () => Math.floor(rand(0, 4)));
        s.head = 0;
      }
      if (at(0).p >= 1.15) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.shot) return;
      const i = s.chain.findIndex((c, k) => c === s.chain[k + 1]);
      const target = i >= 0 ? i : 0;
      const { W, H } = api;
      const d = s.head - target * 24;
      const p = clamp(d / (H * 0.9 + 120), 0, 1.2);
      const tx = W / 2 + Math.sin(p * 4.2) * W * 0.32;
      const ty = -40 + p * (H * 0.86);
      s.aim = Math.atan2(ty - H * 0.78, tx - W / 2);
      s.loaded = s.chain[target] ?? 0;
      s.shot = {
        x: W / 2,
        y: H * 0.78,
        vx: Math.cos(s.aim) * H * 0.9,
        vy: Math.sin(s.aim) * H * 0.9,
        col: s.loaded,
      };
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.foe);
      // the groove the chain runs in
      g.strokeStyle = alpha("#000000", 0.28);
      g.lineWidth = 30;
      g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const p = k / 40;
        const x = W / 2 + Math.sin(p * 4.2) * W * 0.32;
        const y = -40 + p * (H * 0.86);
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      for (let i = s.chain.length - 1; i >= 0; i--) {
        const d = s.head - i * 24;
        const p = clamp(d / (H * 0.9 + 120), 0, 1.2);
        if (p <= 0) continue;
        const x = W / 2 + Math.sin(p * 4.2) * W * 0.32;
        const y = -40 + p * (H * 0.86);
        g.fillStyle = CHAIN_COLS[s.chain[i]];
        circle(g, x, y, 13);
        g.fill();
        g.fillStyle = alpha("#ffffff", 0.35);
        circle(g, x - 4, y - 4, 4);
        g.fill();
      }
      const sx = W / 2;
      const sy = H * 0.78;
      g.strokeStyle = alpha(pal.prize, 0.4);
      g.lineWidth = 2;
      g.setLineDash([4, 8]);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(s.aim) * 120, sy + Math.sin(s.aim) * 120);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = shade(pal.foe, 0.3);
      circle(g, sx, sy, 26);
      g.fill();
      g.fillStyle = CHAIN_COLS[s.loaded];
      circle(g, sx, sy, 14);
      g.fill();
      if (s.shot) {
        g.fillStyle = CHAIN_COLS[s.shot.col];
        circle(g, s.shot.x, s.shot.y, 12);
        g.fill();
      }
      centred(g, `${api.score}`, W / 2, 44, 26, t.ink, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Ball Storm

const ballStorm = defineGame<{
  rows: { y: number; cells: number[] }[];
  balls: { x: number; y: number; vx: number; vy: number }[];
  aim: number;
  firing: number;
  count: number;
  launchX: number;
}>(
  {
    slug: "ball-storm",
    title: "Ball Storm",
    rule: "Aim the stream, break the numbers",
    year: 2017,
    description: "One angle a turn. The maths does the shouting.",
    history:
      "Homage to the 2017 brick-breaker variant that replaced one ball with forty and one paddle with an angle.",
    tags: ["precision", "chaos", "endurance"],
    palette: {
      hero: "#ffffff",
      foe: "#f72585",
      prize: "#4cc9f0",
      deep: "#0d1b2a",
      glow: "#1b263b",
    },
    intensity: 0.55,
    speed: 0.5,
    difficulty: 0.5,
    luck: 0.25,
    nostalgia: 0.2,
    realism: 0.1,
    sessionLength: 0.6,
    scoreUnit: "pts",
    maxScorePerSecond: 20,
  },
  {
    hint: "drag to aim, release to fire",
    overMsg: "BREACHED",
    init: (api) => ({
      rows: [
        { y: api.H * 0.24, cells: Array.from({ length: 7 }, () => (Math.random() < 0.6 ? 2 : 0)) },
      ],
      balls: [],
      aim: -Math.PI / 2,
      firing: 0,
      count: 6,
      launchX: api.W / 2,
    }),
    move: (s, x, y, api) => {
      if (s.balls.length || s.firing > 0) return;
      const a = Math.atan2(y - api.H * 0.88, x - s.launchX);
      s.aim = clamp(a, -Math.PI * 0.92, -Math.PI * 0.08);
    },
    down: (s, x, y, api) => {
      if (s.balls.length || s.firing > 0) return;
      const a = Math.atan2(y - api.H * 0.88, x - s.launchX);
      s.aim = clamp(a, -Math.PI * 0.92, -Math.PI * 0.08);
    },
    up: (s, _x, _y, api) => {
      if (s.balls.length || s.firing > 0) return;
      s.firing = s.count;
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const launchY = H * 0.88;
      if (s.firing > 0 && s.balls.length < s.count) {
        if (Math.floor(api.t * 22) % 2 === 0 || s.balls.length === 0) {
          s.balls.push({
            x: s.launchX,
            y: launchY,
            vx: Math.cos(s.aim) * H * 1.15,
            vy: Math.sin(s.aim) * H * 1.15,
          });
          s.firing -= 1;
        }
      }
      const cw = W / 7;
      for (let i = s.balls.length - 1; i >= 0; i--) {
        const b = s.balls[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < 7) {
          b.x = 7;
          b.vx = Math.abs(b.vx);
        }
        if (b.x > W - 7) {
          b.x = W - 7;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y < 7) {
          b.y = 7;
          b.vy = Math.abs(b.vy);
        }
        if (b.y > launchY) {
          s.balls.splice(i, 1);
          continue;
        }
        for (const row of s.rows) {
          for (let c = 0; c < 7; c++) {
            if (row.cells[c] <= 0) continue;
            const bx = c * cw;
            if (b.x > bx && b.x < bx + cw && b.y > row.y && b.y < row.y + 40) {
              row.cells[c] -= 1;
              api.add(1);
              // bounce off the shallower axis
              const fromSide =
                Math.min(Math.abs(b.x - bx), Math.abs(b.x - bx - cw)) <
                Math.min(Math.abs(b.y - row.y), Math.abs(b.y - row.y - 40));
              if (fromSide) b.vx *= -1;
              else b.vy *= -1;
            }
          }
        }
      }
      if (s.firing <= 0 && s.balls.length === 0) {
        // next turn: everything steps down and a fresh row appears
        for (const row of s.rows) row.y += 44;
        s.rows = s.rows.filter((r) => r.cells.some((v) => v > 0));
        const level = Math.floor(api.score / 12) + 2;
        s.rows.unshift({
          y: api.H * 0.24,
          cells: Array.from({ length: 7 }, () =>
            Math.random() < 0.62 ? Math.floor(rand(1, level + 1)) : 0
          ),
        });
        s.count += 1;
        if (s.rows.some((r) => r.y > api.H * 0.78 && r.cells.some((v) => v > 0)))
          api.end();
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.balls.length || s.firing > 0) return;
      const cw = api.W / 7;
      const row = s.rows.find((r) => r.cells.some((v) => v > 0));
      const c = row ? row.cells.findIndex((v) => v > 0) : 3;
      const tx = c * cw + cw / 2;
      s.aim = Math.atan2(api.H * 0.24 - api.H * 0.88, tx - s.launchX);
      s.firing = s.count;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const cw = W / 7;
      for (const row of s.rows)
        for (let c = 0; c < 7; c++) {
          const v = row.cells[c];
          if (v <= 0) continue;
          g.fillStyle = mix(pal.prize, pal.foe, clamp(v / 10, 0, 1));
          roundRect(g, c * cw + 3, row.y + 3, cw - 6, 34, 6);
          g.fill();
          centred(g, `${v}`, c * cw + cw / 2, row.y + 26, 18, "#0d1b2a", t.fontDisplay);
        }
      const launchY = H * 0.88;
      if (!s.balls.length && s.firing <= 0) {
        g.strokeStyle = alpha(pal.hero, 0.35);
        g.lineWidth = 2;
        g.setLineDash([4, 8]);
        g.beginPath();
        g.moveTo(s.launchX, launchY);
        g.lineTo(
          s.launchX + Math.cos(s.aim) * 150,
          launchY + Math.sin(s.aim) * 150
        );
        g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = pal.hero;
      for (const b of s.balls) {
        circle(g, b.x, b.y, 6);
        g.fill();
      }
      circle(g, s.launchX, launchY, 9);
      g.fill();
      centred(g, `${api.score}`, W / 2, 44, 26, t.ink, t.fontDisplay);
      centred(g, `x${s.count}`, s.launchX, launchY + 26, 14, t.inkDim, t.fontBody, 800);
    },
  }
);

// ------------------------------------------------------------ Brick Rally

const brickRally = defineGame<{
  px: number;
  bx: number;
  by: number;
  vx: number;
  vy: number;
  bricks: { x: number; y: number; hp: number }[];
  stuck: boolean;
  lives: number;
  level: number;
}>(
  {
    slug: "brick-rally",
    title: "Brick Rally",
    rule: "Slide the paddle, clear the wall",
    year: 2003,
    description: "The one that came preloaded. Still undefeated.",
    history:
      "Homage to the 2003 paddle game bundled on a business phone, played almost entirely in meetings it was not meant for.",
    tags: ["reflex", "precision", "drag", "retro"],
    palette: {
      hero: "#ffd60a",
      foe: "#ef233c",
      prize: "#8ecae6",
      deep: "#0a0908",
      glow: "#22333b",
    },
    intensity: 0.6,
    speed: 0.6,
    difficulty: 0.5,
    luck: 0.15,
    nostalgia: 1,
    realism: 0.15,
    sessionLength: 0.6,
    scoreUnit: "pts",
    maxScorePerSecond: 15,
  },
  {
    hint: "drag to move the paddle",
    overMsg: "NO BALLS LEFT",
    init: (api) => ({
      px: api.W / 2,
      bx: api.W / 2,
      by: api.H * 0.8,
      vx: 0,
      vy: 0,
      bricks: Array.from({ length: 6 * 7 }, (_, i) => ({
        x: (i % 7) * (api.W / 7),
        y: api.H * 0.16 + Math.floor(i / 7) * 26,
        hp: Math.floor(i / 7) < 2 ? 2 : 1,
      })),
      stuck: true,
      lives: 3,
      level: 1,
    }),
    move: (s, x) => {
      s.px = x;
    },
    down: (s, x, _y, api) => {
      s.px = x;
      if (s.stuck) {
        s.stuck = false;
        s.vx = api.W * 0.42;
        s.vy = -api.H * 0.52;
      }
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const pw = 74;
      s.px = clamp(s.px, pw / 2, W - pw / 2);
      const py = H * 0.86;
      if (s.stuck) {
        s.bx = s.px;
        s.by = py - 14;
        return;
      }
      s.bx += s.vx * dt;
      s.by += s.vy * dt;
      if (s.bx < 8) {
        s.bx = 8;
        s.vx = Math.abs(s.vx);
      }
      if (s.bx > W - 8) {
        s.bx = W - 8;
        s.vx = -Math.abs(s.vx);
      }
      if (s.by < 8) {
        s.by = 8;
        s.vy = Math.abs(s.vy);
      }
      if (s.by > py - 12 && s.by < py + 8 && Math.abs(s.bx - s.px) < pw / 2 + 6 && s.vy > 0) {
        s.vy = -Math.abs(s.vy);
        s.vx += ((s.bx - s.px) / (pw / 2)) * W * 0.3;
        s.vx = clamp(s.vx, -W * 0.75, W * 0.75);
        api.haptic("light");
      }
      const bw = W / 7;
      for (let i = s.bricks.length - 1; i >= 0; i--) {
        const b = s.bricks[i];
        if (s.bx > b.x && s.bx < b.x + bw && s.by > b.y && s.by < b.y + 22) {
          b.hp -= 1;
          api.add(b.hp <= 0 ? 5 : 2);
          if (b.hp <= 0) s.bricks.splice(i, 1);
          s.vy *= -1;
          api.haptic("hit");
          break;
        }
      }
      if (!s.bricks.length) {
        s.level += 1;
        api.add(50);
        s.bricks = Array.from({ length: 6 * 7 }, (_, i) => ({
          x: (i % 7) * bw,
          y: H * 0.16 + Math.floor(i / 7) * 26,
          hp: Math.floor(i / 7) < 2 ? 2 : 1,
        }));
        s.stuck = true;
      }
      if (s.by > H) {
        s.lives -= 1;
        s.stuck = true;
        api.haptic("fail");
        if (s.lives <= 0) api.end();
      }
    },
    bot: (s, dt, api) => {
      void dt;
      s.px += clamp(s.bx - s.px, -api.W * 0.03, api.W * 0.03);
      if (s.stuck) {
        s.stuck = false;
        s.vx = api.W * 0.42 * (Math.random() < 0.5 ? 1 : -1);
        s.vy = -api.H * 0.52;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const bw = W / 7;
      for (const b of s.bricks) {
        g.fillStyle = b.hp > 1 ? pal.foe : pal.prize;
        roundRect(g, b.x + 2, b.y + 2, bw - 4, 22, 3);
        g.fill();
        g.fillStyle = alpha("#ffffff", 0.2);
        g.fillRect(b.x + 4, b.y + 4, bw - 8, 5);
      }
      const py = H * 0.86;
      g.fillStyle = pal.hero;
      roundRect(g, s.px - 37, py, 74, 12, 6);
      g.fill();
      g.fillStyle = "#fff";
      circle(g, s.bx, s.by, 7);
      g.fill();
      centred(g, `${api.score}`, W / 2, 40, 24, t.ink, t.fontDisplay);
      for (let i = 0; i < s.lives; i++) {
        g.fillStyle = pal.hero;
        circle(g, 18 + i * 16, H - 18, 5);
        g.fill();
      }
    },
  }
);

// -------------------------------------------------------------- Blade Log

const bladeLog = defineGame<{
  ang: number;
  spin: number;
  stuck: number[];
  flying: { y: number } | null;
  left: number;
  round: number;
}>(
  {
    slug: "blade-log",
    title: "Blade Log",
    rule: "Throw, but not into your own",
    year: 2018,
    description: "The log is spinning. You have eight knives and one job.",
    history:
      "Homage to the 2018 one-tap thrower that made an entire hit out of a rotating circle and a collision check.",
    tags: ["precision", "oneTap", "chaos"],
    palette: {
      hero: "#adb5bd",
      foe: "#7f5539",
      prize: "#e9c46a",
      deep: "#22223b",
      glow: "#4a4e69",
    },
    intensity: 0.6,
    speed: 0.5,
    difficulty: 0.6,
    luck: 0.2,
    nostalgia: 0.2,
    realism: 0.3,
    sessionLength: 0.35,
    scoreUnit: "knives",
    maxScorePerSecond: 3,
  },
  {
    hint: "tap to throw",
    overMsg: "CLANG",
    autoStart: true,
    init: () => ({ ang: 0, spin: 1.6, stuck: [], flying: null, left: 7, round: 1 }),
    down: (s, _x, _y, api) => {
      if (s.flying || s.left <= 0) return;
      s.flying = { y: api.H * 0.86 };
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { H } = api;
      s.ang += s.spin * dt;
      if (!s.flying) return;
      s.flying.y -= H * 1.5 * dt;
      const logY = H * 0.42;
      const R = 62;
      if (s.flying.y <= logY + R) {
        const hitAngle = ((-s.ang - Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const clash = s.stuck.some((a) => {
          let d = Math.abs(a - hitAngle);
          d = Math.min(d, Math.PI * 2 - d);
          return d < 0.34;
        });
        s.flying = null;
        if (clash) {
          api.end();
          return;
        }
        s.stuck.push(hitAngle);
        s.left -= 1;
        api.add(1);
        api.haptic("hit");
        if (s.left <= 0) {
          s.round += 1;
          api.add(10);
          s.stuck = [];
          s.left = 6 + s.round;
          s.spin = (Math.random() < 0.5 ? -1 : 1) * (1.5 + s.round * 0.22);
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.flying) return;
      const hitAngle = ((-s.ang - Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const clash = s.stuck.some((a) => {
        let d = Math.abs(a - hitAngle);
        d = Math.min(d, Math.PI * 2 - d);
        return d < 0.6;
      });
      if (!clash) s.flying = { y: api.H * 0.86 };
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const cx = W / 2;
      const cy = H * 0.42;
      const R = 62;
      g.save();
      g.translate(cx, cy);
      g.rotate(s.ang);
      for (const a of s.stuck) {
        g.save();
        g.rotate(a);
        g.fillStyle = pal.hero;
        g.fillRect(-3, R - 6, 6, 40);
        g.fillStyle = shade(pal.foe, -0.3);
        g.fillRect(-5, R + 30, 10, 18);
        g.restore();
      }
      g.fillStyle = pal.foe;
      circle(g, 0, 0, R);
      g.fill();
      g.fillStyle = shade(pal.foe, -0.25);
      circle(g, 0, 0, R * 0.66);
      g.fill();
      g.fillStyle = shade(pal.foe, 0.15);
      circle(g, 0, 0, R * 0.3);
      g.fill();
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = alpha("#000000", 0.18);
        g.lineWidth = 2;
        circle(g, 0, 0, R * (0.4 + i * 0.12));
        g.stroke();
      }
      g.restore();
      if (s.flying) {
        g.fillStyle = pal.hero;
        g.fillRect(cx - 3, s.flying.y - 34, 6, 40);
        g.fillStyle = shade(pal.foe, -0.3);
        g.fillRect(cx - 5, s.flying.y + 2, 10, 18);
      } else if (s.left > 0) {
        g.fillStyle = pal.hero;
        g.fillRect(cx - 3, H * 0.86 - 34, 6, 40);
        g.fillStyle = shade(pal.foe, -0.3);
        g.fillRect(cx - 5, H * 0.86 + 2, 10, 18);
      }
      centred(g, `${api.score}`, W / 2, 44, 26, t.ink, t.fontDisplay);
      for (let i = 0; i < s.left; i++) {
        g.fillStyle = pal.hero;
        g.fillRect(16 + i * 11, H - 34, 4, 20);
      }
      centred(g, `stage ${s.round}`, W / 2, 68, 13, t.inkDim, t.fontBody, 700);
    },
  }
);

// -------------------------------------------------------------- Glass Run

const glassRun = defineGame<{
  panes: { z: number; x: number; w: number; broken: boolean }[];
  shots: { x: number; z: number; vx: number }[];
  ammo: number;
  next: number;
  dist: number;
  sparks: Spark[];
}>(
  {
    slug: "glass-run",
    title: "Glass Run",
    rule: "Tap where the glass is",
    year: 2014,
    description: "You cannot stop. You can only make a hole.",
    history:
      "Homage to the 2014 corridor smasher whose sound design did more work than most engines.",
    tags: ["reflex", "precision", "chaos"],
    palette: {
      hero: "#caf0f8",
      foe: "#ff006e",
      prize: "#ffbe0b",
      deep: "#03045e",
      glow: "#0077b6",
    },
    intensity: 0.75,
    speed: 0.75,
    difficulty: 0.6,
    luck: 0.2,
    nostalgia: 0.4,
    realism: 0.35,
    sessionLength: 0.35,
    scoreUnit: "m",
    maxScorePerSecond: 30,
  },
  {
    hint: "tap the glass",
    overMsg: "SHATTERED",
    autoStart: true,
    init: () => ({ panes: [], shots: [], ammo: 12, next: 0.4, dist: 0, sparks: [] }),
    down: (s, x, _y, api) => {
      if (s.ammo <= 0) return;
      s.ammo -= 1;
      s.shots.push({ x: api.W / 2, z: 0, vx: (x - api.W / 2) * 1.5 });
      api.haptic("light");
    },
    update: (s, dt, api) => {
      const { W } = api;
      const v = 0.55 + api.t * 0.012;
      s.dist += v * dt * 40;
      api.set(Math.floor(s.dist));
      stepSparks(s.sparks, dt, 90);
      s.next -= dt;
      if (s.next <= 0) {
        const w = rand(W * 0.3, W * 0.6);
        s.panes.push({ z: 1, x: rand(w / 2, W - w / 2), w, broken: false });
        s.next = rand(0.55, 0.95) / api.tune.density;
      }
      for (let i = s.shots.length - 1; i >= 0; i--) {
        const sh = s.shots[i];
        sh.z += v * 1.9 * dt;
        sh.x += sh.vx * dt * 0.5;
        if (sh.z > 1.1) s.shots.splice(i, 1);
      }
      for (let i = s.panes.length - 1; i >= 0; i--) {
        const p = s.panes[i];
        p.z -= v * dt;
        if (p.z < -0.05) {
          if (!p.broken) api.end();
          s.panes.splice(i, 1);
          continue;
        }
        if (p.broken) continue;
        for (let j = s.shots.length - 1; j >= 0; j--) {
          const sh = s.shots[j];
          if (Math.abs(sh.z - (1 - p.z)) < 0.09 && Math.abs(sh.x - p.x) < p.w / 2) {
            p.broken = true;
            s.shots.splice(j, 1);
            s.ammo = Math.min(20, s.ammo + 2);
            api.add(5);
            burst(s.sparks, p.x, api.H * 0.5, api.pal.hero, 14, 200);
            api.haptic("hit");
            break;
          }
        }
      }
      if (s.ammo <= 0 && s.panes.some((p) => !p.broken)) {
        // one mercy ball so a dry run isn't an instant wall
        s.ammo = 1;
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const p = s.panes.filter((q) => !q.broken).sort((a, b) => a.z - b.z)[0];
      if (p && p.z < 0.7 && s.shots.length < 2) {
        s.shots.push({ x: api.W / 2, z: 0, vx: (p.x - api.W / 2) * 1.7 });
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, "#01011f");
      // corridor rails
      g.strokeStyle = alpha(pal.glow, 0.5);
      g.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const z = ((i / 12 + (1 - ((s.dist * 0.04) % 1))) % 1) ** 2;
        const w = W * (0.1 + z * 1.4);
        const h = H * (0.1 + z * 1.1);
        g.strokeRect(W / 2 - w / 2, H / 2 - h / 2, w, h);
      }
      for (const p of [...s.panes].sort((a, b) => b.z - a.z)) {
        if (p.broken) continue;
        const sc = (1 - p.z) ** 1.6;
        const w = p.w * (0.15 + sc * 1.5);
        const h = H * (0.08 + sc * 0.7);
        const x = W / 2 + (p.x - W / 2) * (0.15 + sc * 1.5);
        g.fillStyle = alpha(pal.hero, 0.26);
        g.fillRect(x - w / 2, H / 2 - h / 2, w, h);
        g.strokeStyle = alpha(pal.hero, 0.8);
        g.lineWidth = 2;
        g.strokeRect(x - w / 2, H / 2 - h / 2, w, h);
        g.strokeStyle = alpha("#ffffff", 0.3);
        g.beginPath();
        g.moveTo(x - w / 2, H / 2 + h / 2);
        g.lineTo(x + w / 2, H / 2 - h / 2);
        g.stroke();
      }
      for (const sh of s.shots) {
        const sc = sh.z ** 1.6;
        const r = 4 + sc * 16;
        g.fillStyle = pal.prize;
        circle(g, W / 2 + (sh.x - W / 2) * (0.1 + sc), H / 2 + (1 - sc) * 40, r);
        g.fill();
      }
      drawSparks(g, s.sparks, 4);
      centred(g, `${api.score}m`, W / 2, 44, 24, t.ink, t.fontDisplay);
      centred(g, `${s.ammo} balls`, W / 2, 68, 14, t.inkDim, t.fontBody, 700);
    },
  }
);

// -------------------------------------------------------------- Deep Cast

const deepCast = defineGame<{
  phase: "down" | "up";
  x: number;
  depth: number;
  caught: number;
  fish: { x: number; y: number; vx: number; size: number; gone: boolean }[];
  shots: { x: number; y: number }[];
  best: number;
}>(
  {
    slug: "deep-cast",
    title: "Deep Cast",
    rule: "Miss on the way down, hit going up",
    year: 2013,
    description: "A fishing game where the fishing is the setup and the punchline is airborne.",
    history:
      "Homage to the 2013 fishing satire that inverted its own genre halfway through every single cast.",
    tags: ["reflex", "chaos", "drag"],
    palette: {
      hero: "#ffd166",
      foe: "#ef476f",
      prize: "#06d6a0",
      deep: "#003049",
      glow: "#0096c7",
    },
    intensity: 0.65,
    speed: 0.6,
    difficulty: 0.5,
    luck: 0.35,
    nostalgia: 0.6,
    realism: 0.3,
    sessionLength: 0.4,
    scoreUnit: "fish",
    maxScorePerSecond: 6,
  },
  {
    hint: "drag to steer the hook",
    overMsg: "LINE SNAPPED",
    autoStart: true,
    init: (api) => ({
      phase: "down" as const,
      x: api.W / 2,
      depth: 0,
      caught: 0,
      fish: Array.from({ length: 26 }, (_, i) => ({
        x: rand(20, api.W - 20),
        y: api.H * 0.34 + i * 78,
        vx: rand(-50, 50),
        size: rand(10, 20),
        gone: false,
      })),
      shots: [],
      best: 0,
    }),
    move: (s, x) => {
      s.x = x;
    },
    down: (s, x, y, api) => {
      s.x = x;
      if (s.phase === "up") {
        s.shots.push({ x, y });
        api.haptic("light");
      }
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.x = clamp(s.x, 14, W - 14);
      const hookY = H * 0.3;
      for (const f of s.fish) {
        f.x += f.vx * dt;
        if (f.x < 16 || f.x > W - 16) f.vx *= -1;
      }
      if (s.phase === "down") {
        s.depth += (H * 0.42 + s.depth * 0.12) * dt;
        for (const f of s.fish) {
          if (f.gone) continue;
          const fy = f.y - s.depth + hookY;
          if (Math.abs(fy - hookY) < f.size && Math.abs(f.x - s.x) < f.size + 8) {
            // snagged: the descent ends and the ascent begins
            s.phase = "up";
            s.best = s.depth;
            api.haptic("hit");
          }
        }
        if (s.depth > 2400) {
          s.phase = "up";
          s.best = s.depth;
        }
      } else {
        s.depth -= H * 1.1 * dt;
        for (let i = s.shots.length - 1; i >= 0; i--) {
          s.shots[i].y -= H * 1.1 * dt;
          if (s.shots[i].y < -20) s.shots.splice(i, 1);
        }
        for (const f of s.fish) {
          if (f.gone) continue;
          const fy = f.y - s.depth + hookY;
          for (let j = s.shots.length - 1; j >= 0; j--) {
            const sh = s.shots[j];
            if (Math.abs(fy - sh.y) < f.size + 8 && Math.abs(f.x - sh.x) < f.size + 10) {
              f.gone = true;
              s.shots.splice(j, 1);
              s.caught += 1;
              api.add(1);
              api.haptic("hit");
              break;
            }
          }
        }
        if (s.depth <= 0) {
          // land the run, then cast again deeper
          api.add(Math.floor(s.best / 200));
          s.phase = "down";
          s.depth = 0;
          for (const f of s.fish) {
            f.gone = false;
            f.y = rand(H * 0.34, 2600);
          }
        }
      }
    },
    bot: (s, dt, api) => {
      void dt;
      const hookY = api.H * 0.3;
      if (s.phase === "down") {
        const near = s.fish
          .map((f) => ({ f, fy: f.y - s.depth + hookY }))
          .filter((q) => q.fy > hookY && q.fy < hookY + 200 && !q.f.gone)
          .sort((a, b) => a.fy - b.fy)[0];
        if (near) s.x += clamp(near.f.x < api.W / 2 ? 40 : -40, -6, 6);
      } else if (s.shots.length < 4) {
        const f = s.fish.find((q) => !q.gone);
        if (f) s.shots.push({ x: f.x, y: f.y - s.depth + hookY + 60 });
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      const deepness = clamp(s.depth / 2400, 0, 1);
      sky(g, W, H, mix(pal.glow, pal.deep, deepness), mix(pal.deep, "#000814", deepness));
      const hookY = H * 0.3;
      // surface line stays anchored to the cast
      const surfY = hookY - s.depth * 0.6;
      if (surfY > -40 && surfY < H) {
        g.fillStyle = alpha("#ffffff", 0.25);
        g.fillRect(0, surfY, W, 3);
      }
      for (const f of s.fish) {
        if (f.gone) continue;
        const fy = f.y - s.depth + hookY;
        if (fy < -40 || fy > H + 40) continue;
        g.fillStyle = f.size > 16 ? pal.foe : pal.prize;
        g.beginPath();
        g.ellipse(f.x, fy, f.size, f.size * 0.6, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(f.x - f.size * (f.vx > 0 ? 1 : -1), fy);
        g.lineTo(f.x - f.size * 1.7 * (f.vx > 0 ? 1 : -1), fy - f.size * 0.5);
        g.lineTo(f.x - f.size * 1.7 * (f.vx > 0 ? 1 : -1), fy + f.size * 0.5);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = alpha("#ffffff", 0.4);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(s.x, -10);
      g.lineTo(s.x, hookY);
      g.stroke();
      g.fillStyle = pal.hero;
      circle(g, s.x, hookY, 7);
      g.fill();
      g.fillStyle = pal.prize;
      for (const sh of s.shots) {
        circle(g, sh.x, sh.y, 5);
        g.fill();
      }
      centred(g, `${api.score}`, W / 2, 44, 26, t.ink, t.fontDisplay);
      centred(
        g,
        s.phase === "down" ? `${Math.floor(s.depth)}m down` : "shoot them",
        W / 2,
        68,
        14,
        t.inkDim,
        t.fontBody,
        700
      );
    },
  }
);

export const aimPack: GameModule[] = [
  flingFort,
  deskToss,
  arcDuel,
  cornerPocket,
  pegDrop,
  sphereChain,
  ballStorm,
  brickRally,
  bladeLog,
  glassRun,
  deepCast,
];
