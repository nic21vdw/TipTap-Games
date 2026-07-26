// Sim pack — build, defend, farm, spread, and look after something.
// The management genres, trimmed to a single feed-length session.

import type { GameModule } from "@/games/types";
import { burst, centred, defineGame, drawSparks, sky, stepSparks, type Spark } from "@/games/kit";
import { alpha, circle, clamp, mix, rand, roundRect, shade } from "@/games/engine";

// ------------------------------------------------------------- Lane Guard

const LANES = 5;
const GUARD_COST = [25, 50, 75];

interface Walker {
  lane: number;
  x: number;
  hp: number;
  speed: number;
}

interface Guard {
  lane: number;
  col: number;
  kind: 0 | 1 | 2;
  cool: number;
  hp: number;
}

const laneGuard = defineGame<{
  guards: Guard[];
  walkers: Walker[];
  shots: { lane: number; x: number }[];
  sun: number;
  pick: 0 | 1 | 2;
  next: number;
  wave: number;
  sunTick: number;
}>(
  {
    slug: "lane-guard",
    title: "Lane Guard",
    rule: "Plant guards, hold five lanes",
    year: 2009,
    description: "Five lanes, one budget, and something coming down all of them.",
    history:
      "Homage to the 2009 lane-defence game that made tower defence funny, and made a whole genre approachable.",
    tags: ["calm", "precision", "endurance"],
    palette: {
      hero: "#70e000",
      foe: "#7f5539",
      prize: "#ffd60a",
      deep: "#283618",
      glow: "#606c38",
    },
    intensity: 0.45,
    speed: 0.35,
    difficulty: 0.5,
    luck: 0.25,
    nostalgia: 0.8,
    realism: 0.2,
    sessionLength: 0.7,
    scoreUnit: "waves",
    maxScorePerSecond: 4,
  },
  {
    hint: "tap a plot to plant",
    overMsg: "OVERRUN",
    autoStart: true,
    init: () => ({
      guards: [],
      walkers: [],
      shots: [],
      sun: 75,
      pick: 0 as 0 | 1 | 2,
      next: 3,
      wave: 1,
      sunTick: 0,
    }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y > H * 0.86) {
        s.pick = clamp(Math.floor((x / W) * 3), 0, 2) as 0 | 1 | 2;
        api.haptic("light");
        return;
      }
      const lane = clamp(Math.floor(((y - H * 0.16) / (H * 0.68)) * LANES), 0, LANES - 1);
      const col = clamp(Math.floor((x / (W * 0.62)) * 4), 0, 3);
      if (s.guards.some((q) => q.lane === lane && q.col === col)) return;
      const cost = GUARD_COST[s.pick];
      if (s.sun < cost) {
        api.haptic("fail");
        return;
      }
      s.sun -= cost;
      s.guards.push({ lane, col, kind: s.pick, cool: 0, hp: s.pick === 1 ? 12 : 5 });
      api.haptic("hit");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.sunTick += dt;
      if (s.sunTick > 3) {
        s.sunTick = 0;
        s.sun += 25;
      }
      const colX = (c: number) => (c + 0.5) * (W * 0.62 / 4);
      for (const gd of s.guards) {
        gd.cool -= dt;
        if (gd.kind === 1) continue; // wall
        if (gd.kind === 2) {
          // sun plot
          if (gd.cool <= 0) {
            gd.cool = 5;
            s.sun += 25;
          }
          continue;
        }
        if (gd.cool <= 0 && s.walkers.some((w) => w.lane === gd.lane && w.x > colX(gd.col))) {
          gd.cool = 1.2;
          s.shots.push({ lane: gd.lane, x: colX(gd.col) + 16 });
        }
      }
      for (let i = s.shots.length - 1; i >= 0; i--) {
        const sh = s.shots[i];
        sh.x += W * 0.5 * dt;
        if (sh.x > W) {
          s.shots.splice(i, 1);
          continue;
        }
        const hit = s.walkers.find((w) => w.lane === sh.lane && Math.abs(w.x - sh.x) < 18);
        if (hit) {
          hit.hp -= 2;
          s.shots.splice(i, 1);
        }
      }
      s.next -= dt;
      if (s.next <= 0) {
        const n = 1 + Math.floor(s.wave / 3);
        for (let k = 0; k < n; k++)
          s.walkers.push({
            lane: Math.floor(rand(0, LANES)),
            x: W + rand(0, 60),
            hp: 4 + s.wave,
            speed: rand(14, 24),
          });
        s.next = Math.max(2.2, 6 - s.wave * 0.2) / api.tune.density;
        s.wave += 1;
        api.set(s.wave - 1);
      }
      for (let i = s.walkers.length - 1; i >= 0; i--) {
        const w = s.walkers[i];
        if (w.hp <= 0) {
          s.walkers.splice(i, 1);
          s.sun += 8;
          api.haptic("hit");
          continue;
        }
        const blocker = s.guards.find(
          (gd) => gd.lane === w.lane && Math.abs(colX(gd.col) - w.x) < 20
        );
        if (blocker) {
          blocker.hp -= dt * 2;
          if (blocker.hp <= 0) s.guards.splice(s.guards.indexOf(blocker), 1);
        } else w.x -= w.speed * dt;
        if (w.x < 10) api.end();
      }
      void H;
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.sun < 50) return;
      const lane = Math.floor(rand(0, LANES));
      const col = Math.floor(rand(0, 4));
      if (s.guards.some((q) => q.lane === lane && q.col === col)) return;
      const kind = (s.guards.length < 2 ? 2 : Math.random() < 0.75 ? 0 : 1) as 0 | 1 | 2;
      s.sun -= GUARD_COST[kind];
      s.guards.push({ lane, col, kind, cool: 0, hp: kind === 1 ? 12 : 5 });
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.glow, -0.2));
      const laneH = (H * 0.68) / LANES;
      const laneY = (l: number) => H * 0.16 + l * laneH;
      for (let l = 0; l < LANES; l++) {
        g.fillStyle = l % 2 ? alpha(pal.glow, 0.5) : alpha(pal.glow, 0.34);
        g.fillRect(0, laneY(l), W, laneH);
      }
      const cw = (W * 0.62) / 4;
      g.strokeStyle = alpha("#ffffff", 0.12);
      g.lineWidth = 1;
      for (let c = 0; c <= 4; c++) {
        g.beginPath();
        g.moveTo(c * cw, H * 0.16);
        g.lineTo(c * cw, H * 0.84);
        g.stroke();
      }
      for (const gd of s.guards) {
        const x = (gd.col + 0.5) * cw;
        const y = laneY(gd.lane) + laneH / 2;
        if (gd.kind === 1) {
          g.fillStyle = "#a47148";
          roundRect(g, x - 15, y - 17, 30, 34, 7);
          g.fill();
        } else if (gd.kind === 2) {
          g.fillStyle = pal.prize;
          circle(g, x, y, 15);
          g.fill();
        } else {
          g.fillStyle = pal.hero;
          circle(g, x, y - 4, 14);
          g.fill();
          g.fillStyle = shade(pal.hero, -0.4);
          roundRect(g, x - 4, y + 6, 8, 12, 3);
          g.fill();
        }
        g.fillStyle = "#111";
        circle(g, x - 4, y - 6, 2.4);
        g.fill();
        circle(g, x + 4, y - 6, 2.4);
        g.fill();
      }
      g.fillStyle = pal.prize;
      for (const sh of s.shots) {
        circle(g, sh.x, laneY(sh.lane) + laneH / 2, 6);
        g.fill();
      }
      for (const w of s.walkers) {
        const y = laneY(w.lane) + laneH / 2;
        g.fillStyle = pal.foe;
        roundRect(g, w.x - 12, y - 20, 24, 38, 8);
        g.fill();
        g.fillStyle = "#dfe3d0";
        circle(g, w.x - 4, y - 12, 3);
        g.fill();
        circle(g, w.x + 5, y - 12, 3);
        g.fill();
      }
      const bw = W / 3;
      const NAMES = ["Shooter", "Wall", "Sun"];
      for (let i = 0; i < 3; i++) {
        const can = s.sun >= GUARD_COST[i];
        g.fillStyle = s.pick === i ? pal.hero : can ? alpha(pal.glow, 0.85) : alpha(pal.foe, 0.4);
        roundRect(g, i * bw + 6, H * 0.87, bw - 12, H * 0.1, 12);
        g.fill();
        centred(g, NAMES[i], i * bw + bw / 2, H * 0.9, 14, "#14200a", t.fontBody, 800);
        centred(g, `${GUARD_COST[i]}`, i * bw + bw / 2, H * 0.94, 16, "#14200a", t.fontDisplay);
      }
      centred(g, `☀ ${Math.floor(s.sun)}`, W * 0.22, 44, 24, pal.prize, t.fontDisplay);
      centred(g, `wave ${s.wave}`, W * 0.75, 44, 22, t.ink, t.fontDisplay);
    },
  }
);

// ---------------------------------------------------------- Field Defence

const FDW = 8;
const FDH = 11;

interface Creep {
  i: number; // index along the path
  p: number; // progress between nodes
  hp: number;
  max: number;
}

const fieldDefence = defineGame<{
  towers: { c: number; r: number; cool: number }[];
  creeps: Creep[];
  path: [number, number][];
  cash: number;
  lives: number;
  wave: number;
  next: number;
  spawn: number;
  queued: number;
  sparks: Spark[];
}>(
  {
    slug: "field-defence",
    title: "Field Defence",
    rule: "Place towers along the road",
    year: 2008,
    description: "They walk the same road every time. That is the only mercy.",
    history:
      "Homage to the 2008 open-field tower defence that let you build the maze instead of just decorating one.",
    tags: ["calm", "precision", "endurance", "memory"],
    palette: {
      hero: "#4895ef",
      foe: "#f72585",
      prize: "#ffd60a",
      deep: "#1b4332",
      glow: "#40916c",
    },
    intensity: 0.4,
    speed: 0.3,
    difficulty: 0.55,
    luck: 0.2,
    nostalgia: 0.8,
    realism: 0.25,
    sessionLength: 0.8,
    scoreUnit: "waves",
    maxScorePerSecond: 3,
  },
  {
    hint: "tap the grass to build",
    overMsg: "BASE LOST",
    autoStart: true,
    init: () => {
      // a fixed zig-zag road down the field
      const path: [number, number][] = [];
      let c = 1;
      for (let r = 0; r < FDH; r++) {
        path.push([c, r]);
        if (r % 3 === 2) {
          const to = c === 1 ? FDW - 2 : 1;
          const stepDir = Math.sign(to - c);
          while (c !== to) {
            c += stepDir;
            path.push([c, r]);
          }
        }
      }
      return {
        towers: [],
        creeps: [],
        path,
        cash: 120,
        lives: 10,
        wave: 1,
        next: 3,
        spawn: 0,
        queued: 0,
        sparks: [],
      };
    },
    down: (s, x, y, api) => {
      const { W, H } = api;
      const cw = W / FDW;
      const ch = (H * 0.78) / FDH;
      const c = Math.floor(x / cw);
      const r = Math.floor((y - H * 0.14) / ch);
      if (c < 0 || c >= FDW || r < 0 || r >= FDH) return;
      if (s.path.some(([pc, pr]) => pc === c && pr === r)) return;
      if (s.towers.some((tw) => tw.c === c && tw.r === r)) return;
      if (s.cash < 40) {
        api.haptic("fail");
        return;
      }
      s.cash -= 40;
      s.towers.push({ c, r, cool: 0 });
      api.haptic("hit");
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      const cw = W / FDW;
      const ch = (H * 0.78) / FDH;
      const at = (cr: Creep) => {
        const a = s.path[Math.min(cr.i, s.path.length - 1)];
        const b = s.path[Math.min(cr.i + 1, s.path.length - 1)];
        return {
          x: (a[0] + (b[0] - a[0]) * cr.p + 0.5) * cw,
          y: H * 0.14 + (a[1] + (b[1] - a[1]) * cr.p + 0.5) * ch,
        };
      };
      stepSparks(s.sparks, dt, 30);
      s.next -= dt;
      if (s.next <= 0 && s.queued === 0) {
        s.queued = 4 + s.wave;
        s.next = 99;
      }
      if (s.queued > 0) {
        s.spawn -= dt;
        if (s.spawn <= 0) {
          s.spawn = 0.6;
          s.queued -= 1;
          const hp = 4 + s.wave * 2.5;
          s.creeps.push({ i: 0, p: 0, hp, max: hp });
          if (s.queued === 0) {
            s.wave += 1;
            api.set(s.wave - 1);
            s.next = 5;
            s.cash += 40;
          }
        }
      }
      for (let i = s.creeps.length - 1; i >= 0; i--) {
        const cr = s.creeps[i];
        cr.p += (0.9 + s.wave * 0.03) * dt;
        while (cr.p >= 1) {
          cr.p -= 1;
          cr.i += 1;
        }
        if (cr.i >= s.path.length - 1) {
          s.creeps.splice(i, 1);
          s.lives -= 1;
          api.haptic("fail");
          if (s.lives <= 0) {
            api.end();
            return;
          }
          continue;
        }
        if (cr.hp <= 0) {
          const p = at(cr);
          burst(s.sparks, p.x, p.y, api.pal.foe, 7, 90);
          s.creeps.splice(i, 1);
          s.cash += 8;
        }
      }
      for (const tw of s.towers) {
        tw.cool -= dt;
        if (tw.cool > 0) continue;
        const tx = (tw.c + 0.5) * cw;
        const ty = H * 0.14 + (tw.r + 0.5) * ch;
        const target = s.creeps.find((cr) => {
          const p = at(cr);
          return Math.hypot(p.x - tx, p.y - ty) < cw * 2.2;
        });
        if (!target) continue;
        tw.cool = 0.65;
        target.hp -= 3;
        const p = at(target);
        burst(s.sparks, p.x, p.y, api.pal.hero, 3, 50);
      }
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.cash < 40) return;
      for (let k = 0; k < 12; k++) {
        const c = Math.floor(rand(0, FDW));
        const r = Math.floor(rand(0, FDH));
        if (s.path.some(([pc, pr]) => pc === c && pr === r)) continue;
        if (s.towers.some((tw) => tw.c === c && tw.r === r)) continue;
        s.cash -= 40;
        s.towers.push({ c, r, cool: 0 });
        return;
      }
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, shade(pal.glow, -0.3));
      const cw = W / FDW;
      const ch = (H * 0.78) / FDH;
      const oy = H * 0.14;
      for (let r = 0; r < FDH; r++)
        for (let c = 0; c < FDW; c++) {
          g.fillStyle = (r + c) % 2 ? alpha(pal.glow, 0.35) : alpha(pal.glow, 0.25);
          g.fillRect(c * cw, oy + r * ch, cw, ch);
        }
      g.fillStyle = "#9c7a54";
      for (const [c, r] of s.path) g.fillRect(c * cw, oy + r * ch, cw, ch);
      const last = s.path[s.path.length - 1];
      g.fillStyle = pal.prize;
      roundRect(g, last[0] * cw + 3, oy + last[1] * ch + 3, cw - 6, ch - 6, 5);
      g.fill();
      for (const tw of s.towers) {
        const x = (tw.c + 0.5) * cw;
        const y = oy + (tw.r + 0.5) * ch;
        g.fillStyle = alpha(pal.hero, 0.12);
        circle(g, x, y, cw * 2.2);
        g.fill();
        g.fillStyle = pal.hero;
        roundRect(g, x - cw * 0.3, y - ch * 0.32, cw * 0.6, ch * 0.64, 4);
        g.fill();
        g.fillStyle = shade(pal.hero, -0.4);
        circle(g, x, y, cw * 0.16);
        g.fill();
      }
      for (const cr of s.creeps) {
        const a = s.path[Math.min(cr.i, s.path.length - 1)];
        const b = s.path[Math.min(cr.i + 1, s.path.length - 1)];
        const x = (a[0] + (b[0] - a[0]) * cr.p + 0.5) * cw;
        const y = oy + (a[1] + (b[1] - a[1]) * cr.p + 0.5) * ch;
        g.fillStyle = pal.foe;
        circle(g, x, y, cw * 0.26);
        g.fill();
        g.fillStyle = alpha("#000000", 0.35);
        g.fillRect(x - 11, y - cw * 0.34 - 5, 22, 4);
        g.fillStyle = "#7bf1a8";
        g.fillRect(x - 11, y - cw * 0.34 - 5, 22 * clamp(cr.hp / cr.max, 0, 1), 4);
      }
      drawSparks(g, s.sparks, 4);
      centred(g, `£${s.cash}`, W * 0.22, 40, 22, pal.prize, t.fontDisplay);
      centred(g, `wave ${s.wave}`, W * 0.5, 40, 22, t.ink, t.fontDisplay);
      centred(g, `♥ ${s.lives}`, W * 0.78, 40, 22, pal.foe, t.fontDisplay);
    },
  }
);

// ------------------------------------------------------------- Raid Timer

interface Base {
  name: string;
  loot: number;
  guard: number;
  cool: number;
}

const raidTimer = defineGame<{
  gold: number;
  army: number;
  training: number;
  bases: Base[];
  left: number;
  msg: string;
  msgT: number;
}>(
  {
    slug: "raid-timer",
    title: "Raid Timer",
    rule: "Train, then raid the soft ones",
    year: 2012,
    description: "Everything is a timer. The game is which timer you start.",
    history:
      "Homage to the 2012 base builder whose real mechanic was patience, sold back to you by the minute.",
    tags: ["calm", "luck", "chaos"],
    palette: {
      hero: "#ffb703",
      foe: "#d00000",
      prize: "#8ecae6",
      deep: "#344e41",
      glow: "#588157",
    },
    intensity: 0.4,
    speed: 0.35,
    difficulty: 0.4,
    luck: 0.5,
    nostalgia: 0.6,
    realism: 0.3,
    sessionLength: 0.5,
    scoreUnit: "gold",
    maxScorePerSecond: 90,
  },
  {
    hint: "tap TRAIN, then tap a base",
    overMsg: "SEASON OVER",
    autoStart: true,
    init: () => ({
      gold: 0,
      army: 0,
      training: 0,
      bases: Array.from({ length: 3 }, (_, i) => ({
        name: `${["Iron", "Ash", "Pine", "Fen", "Rook"][Math.floor(rand(0, 5))]}hold`,
        loot: Math.round(rand(60, 220)),
        guard: 1 + i,
        cool: 0,
      })),
      left: 60,
      msg: "",
      msgT: 0,
    }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y > H * 0.82) {
        if (s.training <= 0) {
          s.training = 2.5;
          api.haptic("light");
        }
        return;
      }
      const i = clamp(Math.floor(((y - H * 0.28) / (H * 0.5)) * 3), 0, 2);
      const b = s.bases[i];
      if (b.cool > 0 || s.army <= 0) {
        api.haptic("fail");
        return;
      }
      const win = s.army >= b.guard;
      if (win) {
        const take = Math.round(b.loot * clamp(s.army / (b.guard * 2), 0.3, 1));
        s.gold += take;
        api.set(s.gold);
        s.msg = `+${take} from ${b.name}`;
        api.haptic("hit");
        s.army -= b.guard;
      } else {
        s.msg = `${b.name} held`;
        s.army = 0;
        api.haptic("fail");
      }
      s.msgT = 1.4;
      b.cool = 6;
      b.loot = Math.round(rand(60, 260));
      b.guard = Math.max(1, Math.round(rand(1, 5)));
      void W;
    },
    update: (s, dt, api) => {
      s.left -= dt;
      s.msgT = Math.max(0, s.msgT - dt);
      if (s.training > 0) {
        s.training -= dt;
        if (s.training <= 0) {
          s.army += 3;
          api.haptic("light");
        }
      }
      for (const b of s.bases) b.cool = Math.max(0, b.cool - dt);
      if (s.left <= 0) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.training <= 0 && s.army < 4) {
        s.training = 2.5;
        return;
      }
      const b = s.bases.find((q) => q.cool <= 0 && q.guard <= s.army);
      if (b) {
        const take = Math.round(b.loot * 0.7);
        s.gold += take;
        api.set(s.gold);
        s.army -= b.guard;
        b.cool = 6;
        b.loot = Math.round(rand(60, 260));
        s.msg = `+${take}`;
        s.msgT = 1.2;
      }
      s.left = Math.max(10, s.left);
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      centred(g, `${s.gold} gold`, W / 2, H * 0.11, 32, pal.hero, t.fontDisplay);
      centred(
        g,
        `army ${s.army} · ${Math.max(0, s.left).toFixed(0)}s left`,
        W / 2,
        H * 0.155,
        15,
        t.inkDim,
        t.fontBody,
        700
      );
      s.bases.forEach((b, i) => {
        const y = H * 0.28 + i * (H * 0.16);
        const ready = b.cool <= 0;
        g.fillStyle = ready ? alpha(pal.prize, 0.22) : alpha("#000000", 0.25);
        roundRect(g, W * 0.08, y, W * 0.84, H * 0.13, 14);
        g.fill();
        // little fort
        g.fillStyle = ready ? pal.foe : shade(pal.foe, -0.45);
        roundRect(g, W * 0.12, y + H * 0.035, 44, 42, 5);
        g.fill();
        g.fillStyle = shade(pal.foe, -0.3);
        for (let k = 0; k < 3; k++) g.fillRect(W * 0.12 + 4 + k * 15, y + H * 0.026, 10, 12);
        g.textAlign = "left";
        g.fillStyle = t.ink;
        g.font = `800 19px ${t.fontDisplay}`;
        g.fillText(b.name, W * 0.32, y + H * 0.05);
        g.fillStyle = t.inkDim;
        g.font = `700 13px ${t.fontBody}`;
        g.fillText(
          ready ? `${b.loot} loot · needs ${b.guard}` : `rebuilding ${b.cool.toFixed(0)}s`,
          W * 0.32,
          y + H * 0.082
        );
        g.textAlign = "center";
      });
      const busy = s.training > 0;
      g.fillStyle = busy ? alpha(pal.glow, 0.5) : pal.hero;
      roundRect(g, W * 0.15, H * 0.84, W * 0.7, H * 0.09, 16);
      g.fill();
      centred(
        g,
        busy ? `training ${s.training.toFixed(1)}s` : "TRAIN +3",
        W / 2,
        H * 0.84 + H * 0.058,
        21,
        "#2a1f05",
        t.fontDisplay
      );
      if (s.msgT > 0) {
        g.globalAlpha = clamp(s.msgT, 0, 1);
        centred(g, s.msg, W / 2, H * 0.22, 20, pal.prize, t.fontDisplay);
        g.globalAlpha = 1;
      }
    },
  }
);

// -------------------------------------------------------------- Plot Farm

type Plot = { stage: number; t: number; crop: number };

const CROPS = [
  { name: "Beans", grow: 4, pay: 12, col: "#7cb518" },
  { name: "Maize", grow: 7, pay: 26, col: "#ffc300" },
  { name: "Berry", grow: 11, pay: 48, col: "#d62828" },
];

const plotFarm = defineGame<{
  plots: Plot[];
  crop: number;
  left: number;
  pops: { x: number; y: number; a: number; txt: string }[];
}>(
  {
    slug: "plot-farm",
    title: "Plot Farm",
    rule: "Plant, wait, harvest, repeat",
    year: 2009,
    description: "Ninety seconds of crop rotation. Somehow, compelling.",
    history:
      "Homage to the 2009 social farm that put a growth timer in front of a hundred million people and asked them to come back.",
    tags: ["calm", "memory", "precision"],
    palette: {
      hero: "#7cb518",
      foe: "#8d6e63",
      prize: "#ffc300",
      deep: "#89c2d9",
      glow: "#a9d6e5",
    },
    intensity: 0.2,
    speed: 0.25,
    difficulty: 0.3,
    luck: 0.2,
    nostalgia: 0.8,
    realism: 0.35,
    sessionLength: 0.6,
    scoreUnit: "coins",
    maxScorePerSecond: 30,
  },
  {
    hint: "tap a plot to plant",
    overMsg: "SEASON OVER",
    autoStart: true,
    init: () => ({
      plots: Array.from({ length: 12 }, () => ({ stage: 0, t: 0, crop: 0 })),
      crop: 0,
      left: 90,
      pops: [],
    }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y > H * 0.84) {
        s.crop = clamp(Math.floor((x / W) * CROPS.length), 0, CROPS.length - 1);
        api.haptic("light");
        return;
      }
      const c = clamp(Math.floor((x / W) * 3), 0, 2);
      const r = clamp(Math.floor(((y - H * 0.2) / (H * 0.6)) * 4), 0, 3);
      const p = s.plots[r * 3 + c];
      if (p.stage === 0) {
        p.stage = 1;
        p.t = 0;
        p.crop = s.crop;
        api.haptic("light");
      } else if (p.stage === 3) {
        api.add(CROPS[p.crop].pay);
        s.pops.push({ x, y, a: 1, txt: `+${CROPS[p.crop].pay}` });
        p.stage = 0;
        api.haptic("hit");
      }
    },
    update: (s, dt, api) => {
      s.left -= dt;
      for (const p of s.plots) {
        if (p.stage === 0 || p.stage === 3) continue;
        p.t += dt;
        const grow = CROPS[p.crop].grow;
        p.stage = p.t > grow ? 3 : p.t > grow * 0.5 ? 2 : 1;
      }
      for (let i = s.pops.length - 1; i >= 0; i--) {
        const q = s.pops[i];
        q.y -= 40 * dt;
        q.a -= dt * 1.2;
        if (q.a <= 0) s.pops.splice(i, 1);
      }
      if (s.left <= 0) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      s.left = Math.max(20, s.left);
      const ready = s.plots.find((p) => p.stage === 3);
      if (ready) {
        api.add(CROPS[ready.crop].pay);
        ready.stage = 0;
        return;
      }
      const empty = s.plots.find((p) => p.stage === 0);
      if (empty) {
        empty.stage = 1;
        empty.t = 0;
        empty.crop = Math.floor(rand(0, CROPS.length));
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      g.fillStyle = shade(pal.foe, 0.15);
      g.fillRect(0, H * 0.18, W, H * 0.66);
      const pw = W / 3;
      const ph = (H * 0.6) / 4;
      s.plots.forEach((p, i) => {
        const c = i % 3;
        const r = Math.floor(i / 3);
        const x = c * pw;
        const y = H * 0.2 + r * ph;
        g.fillStyle = shade(pal.foe, -0.2);
        roundRect(g, x + 5, y + 4, pw - 10, ph - 8, 8);
        g.fill();
        g.fillStyle = alpha("#000000", 0.15);
        for (let k = 0; k < 3; k++)
          g.fillRect(x + 12, y + 12 + k * (ph / 4), pw - 24, 3);
        if (p.stage === 0) return;
        const col = CROPS[p.crop].col;
        const h = p.stage === 1 ? 10 : p.stage === 2 ? 20 : 30;
        for (let k = 0; k < 3; k++) {
          const sx = x + pw * 0.28 + k * pw * 0.22;
          const sy = y + ph - 14;
          g.strokeStyle = "#4a7c26";
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(sx, sy);
          g.lineTo(sx, sy - h);
          g.stroke();
          if (p.stage === 3) {
            g.fillStyle = col;
            circle(g, sx, sy - h - 4, 7);
            g.fill();
          } else {
            g.fillStyle = alpha(col, 0.6);
            circle(g, sx, sy - h, 4);
            g.fill();
          }
        }
        if (p.stage === 3) {
          g.fillStyle = pal.prize;
          circle(g, x + pw - 18, y + 16, 7);
          g.fill();
        }
      });
      for (const q of s.pops) {
        g.globalAlpha = clamp(q.a, 0, 1);
        centred(g, q.txt, q.x, q.y, 20, pal.prize, t.fontDisplay);
        g.globalAlpha = 1;
      }
      const bw = W / CROPS.length;
      CROPS.forEach((cr, i) => {
        g.fillStyle = s.crop === i ? cr.col : alpha(cr.col, 0.35);
        roundRect(g, i * bw + 6, H * 0.855, bw - 12, H * 0.1, 12);
        g.fill();
        centred(g, cr.name, i * bw + bw / 2, H * 0.888, 15, "#20240f", t.fontBody, 800);
        centred(g, `${cr.grow}s · ${cr.pay}`, i * bw + bw / 2, H * 0.925, 13, "#20240f", t.fontBody, 700);
      });
      centred(g, `${api.score}`, W / 2, H * 0.09, 30, t.ink, t.fontDisplay);
      centred(g, `${Math.max(0, s.left).toFixed(0)}s`, W / 2, H * 0.13, 14, t.inkDim, t.fontBody, 700);
    },
  }
);

// -------------------------------------------------------------- Floor Plan

interface Floor {
  kind: number; // 0 flat, 1 shop, 2 cafe
  stock: number;
  staffed: boolean;
}

const floorPlan = defineGame<{
  floors: Floor[];
  cash: number;
  lift: number;
  liftTo: number;
  riders: number;
  left: number;
  tick: number;
}>(
  {
    slug: "floor-plan",
    title: "Floor Plan",
    rule: "Build up, run the lift",
    year: 2011,
    description: "A tower is just a queue, standing on its end.",
    history:
      "Homage to the 2011 idle tower manager whose actual job was being the lift, forever.",
    tags: ["calm", "precision", "endurance"],
    palette: {
      hero: "#48cae4",
      foe: "#adb5bd",
      prize: "#ffd60a",
      deep: "#012a4a",
      glow: "#2c7da0",
    },
    intensity: 0.25,
    speed: 0.3,
    difficulty: 0.35,
    luck: 0.25,
    nostalgia: 0.6,
    realism: 0.3,
    sessionLength: 0.6,
    scoreUnit: "coins",
    maxScorePerSecond: 30,
  },
  {
    hint: "tap a floor to send the lift",
    overMsg: "CLOSING TIME",
    autoStart: true,
    init: () => ({
      floors: [
        { kind: 1, stock: 3, staffed: true },
        { kind: 0, stock: 0, staffed: true },
      ],
      cash: 60,
      lift: 0,
      liftTo: 0,
      riders: 0,
      left: 75,
      tick: 0,
    }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y > H * 0.88) {
        const cost = 40 + s.floors.length * 12;
        if (s.cash < cost) {
          api.haptic("fail");
          return;
        }
        s.cash -= cost;
        s.floors.push({
          kind: Math.random() < 0.6 ? 1 : 2,
          stock: 3,
          staffed: true,
        });
        api.haptic("hit");
        return;
      }
      const n = s.floors.length;
      const fh = (H * 0.72) / Math.max(6, n);
      const idx = Math.floor((H * 0.86 - y) / fh);
      if (idx >= 0 && idx < n) {
        s.liftTo = idx;
        api.haptic("light");
      }
      void W;
    },
    update: (s, dt, api) => {
      s.left -= dt;
      s.tick += dt;
      s.lift += clamp(s.liftTo - s.lift, -3 * dt, 3 * dt);
      const at = Math.round(s.lift);
      if (Math.abs(s.lift - s.liftTo) < 0.05) {
        const f = s.floors[at];
        if (f) {
          if (f.kind === 0 && s.riders < 3) {
            s.riders += 1;
            api.haptic("light");
            s.lift = at;
          } else if (f.kind > 0 && s.riders > 0 && f.stock > 0) {
            const pay = f.kind === 1 ? 14 : 22;
            s.cash += pay * s.riders;
            api.add(pay * s.riders);
            f.stock -= 1;
            s.riders = 0;
            api.haptic("hit");
          }
        }
      }
      if (s.tick > 3) {
        s.tick = 0;
        for (const f of s.floors) if (f.kind > 0 && f.stock < 4) f.stock += 1;
      }
      if (s.left <= 0) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      s.left = Math.max(20, s.left);
      if (Math.abs(s.lift - s.liftTo) > 0.05) return;
      if (s.riders > 0) {
        const i = s.floors.findIndex((f) => f.kind > 0 && f.stock > 0);
        s.liftTo = i >= 0 ? i : 0;
      } else {
        const i = s.floors.findIndex((f) => f.kind === 0);
        s.liftTo = i >= 0 ? i : 0;
      }
      if (s.cash > 120)
        s.floors.push({ kind: Math.random() < 0.6 ? 1 : 2, stock: 3, staffed: true });
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const n = Math.max(6, s.floors.length);
      const fh = (H * 0.72) / n;
      const base = H * 0.86;
      const NAMES = ["Flats", "Shop", "Cafe"];
      s.floors.forEach((f, i) => {
        const y = base - (i + 1) * fh;
        g.fillStyle = [alpha("#ffe8d6", 0.9), alpha("#ffd6a5", 0.9), alpha("#caffbf", 0.9)][f.kind];
        roundRect(g, W * 0.14, y + 2, W * 0.72, fh - 4, 5);
        g.fill();
        g.textAlign = "left";
        g.fillStyle = "#25323f";
        g.font = `800 ${Math.min(14, fh * 0.4)}px ${t.fontBody}`;
        g.fillText(NAMES[f.kind], W * 0.18, y + fh * 0.62);
        g.textAlign = "center";
        if (f.kind > 0)
          for (let k = 0; k < f.stock; k++) {
            g.fillStyle = pal.prize;
            circle(g, W * 0.62 + k * 12, y + fh * 0.5, 4);
            g.fill();
          }
        if (f.kind === 0) {
          g.fillStyle = pal.hero;
          for (let k = 0; k < 3; k++) circle(g, W * 0.62 + k * 13, y + fh * 0.5, 5);
          g.fill();
        }
      });
      // the lift shaft
      g.fillStyle = alpha("#000000", 0.35);
      g.fillRect(W * 0.04, base - n * fh, W * 0.09, n * fh);
      const ly = base - (s.lift + 1) * fh;
      g.fillStyle = pal.hero;
      roundRect(g, W * 0.045, ly + 2, W * 0.08, fh - 4, 3);
      g.fill();
      for (let k = 0; k < s.riders; k++) {
        g.fillStyle = "#fff";
        circle(g, W * 0.06 + k * 9, ly + fh * 0.5, 3.4);
        g.fill();
      }
      const cost = 40 + s.floors.length * 12;
      g.fillStyle = s.cash >= cost ? pal.prize : alpha(pal.foe, 0.4);
      roundRect(g, W * 0.15, H * 0.895, W * 0.7, H * 0.075, 14);
      g.fill();
      centred(g, `ADD FLOOR · ${cost}`, W / 2, H * 0.895 + H * 0.05, 18, "#2a2405", t.fontDisplay);
      centred(g, `${api.score}`, W / 2, H * 0.07, 28, t.ink, t.fontDisplay);
      centred(
        g,
        `${Math.max(0, s.left).toFixed(0)}s · ${s.riders} aboard`,
        W / 2,
        H * 0.105,
        13,
        t.inkDim,
        t.fontBody,
        700
      );
    },
  }
);

// ----------------------------------------------------------------- Spread

const REGIONS = [
  { name: "Coast", x: 0.24, y: 0.3 },
  { name: "Delta", x: 0.62, y: 0.24 },
  { name: "Ridge", x: 0.78, y: 0.48 },
  { name: "Basin", x: 0.36, y: 0.55 },
  { name: "Isles", x: 0.2, y: 0.72 },
  { name: "Steppe", x: 0.68, y: 0.76 },
];

const TRAITS = [
  { name: "Airborne", cost: 3, spread: 0.5 },
  { name: "Hardy", cost: 4, spread: 0.35 },
  { name: "Silent", cost: 5, spread: 0.2 },
];

const spread = defineGame<{
  inf: number[];
  dna: number;
  cure: number;
  traits: number[];
  rate: number;
  dnaTick: number;
}>(
  {
    slug: "spread",
    title: "Spread",
    rule: "Tap regions, buy traits, beat the cure",
    year: 2012,
    description: "A strategy game that is entirely a race against a progress bar.",
    history:
      "Homage to the 2012 epidemiology sim that made a bleak subject into a genuinely elegant optimisation puzzle.",
    tags: ["calm", "memory", "chaos"],
    palette: {
      hero: "#f77f00",
      foe: "#0077b6",
      prize: "#d62828",
      deep: "#03071e",
      glow: "#023e8a",
    },
    intensity: 0.35,
    speed: 0.3,
    difficulty: 0.5,
    luck: 0.35,
    nostalgia: 0.6,
    realism: 0.6,
    sessionLength: 0.6,
    scoreUnit: "%",
    maxScorePerSecond: 6,
  },
  {
    hint: "tap a lit region",
    overMsg: "CURED",
    autoStart: true,
    init: () => ({
      inf: [0.05, 0, 0, 0, 0, 0],
      dna: 2,
      cure: 0,
      traits: [],
      rate: 0.05,
      dnaTick: 0,
    }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y > H * 0.82) {
        const i = clamp(Math.floor((x / W) * TRAITS.length), 0, TRAITS.length - 1);
        if (s.traits.includes(i) || s.dna < TRAITS[i].cost) {
          api.haptic("fail");
          return;
        }
        s.dna -= TRAITS[i].cost;
        s.traits.push(i);
        s.rate += TRAITS[i].spread * 0.05;
        api.haptic("hit");
        return;
      }
      REGIONS.forEach((r, i) => {
        if (Math.hypot(r.x * W - x, r.y * H - y) < 42 && s.inf[i] > 0.02) {
          s.inf[i] = Math.min(1, s.inf[i] + 0.06);
          s.dna += 1;
          api.haptic("light");
        }
      });
    },
    update: (s, dt, api) => {
      s.dnaTick += dt;
      if (s.dnaTick > 4) {
        s.dnaTick = 0;
        s.dna += 1;
      }
      for (let i = 0; i < REGIONS.length; i++) {
        if (s.inf[i] <= 0) continue;
        s.inf[i] = Math.min(1, s.inf[i] + s.rate * dt);
        // jump to a neighbour once a region is well established
        if (s.inf[i] > 0.4) {
          const j = (i + 1) % REGIONS.length;
          const k = (i + 2) % REGIONS.length;
          for (const n of [j, k])
            if (s.inf[n] === 0 && Math.random() < s.rate * dt * 2) s.inf[n] = 0.02;
        }
      }
      const total = s.inf.reduce((a, b) => a + b, 0) / REGIONS.length;
      api.set(Math.round(total * 100));
      // the cure accelerates with how visible you are
      s.cure += (0.012 + total * 0.02 - (s.traits.includes(2) ? 0.006 : 0)) * dt;
      if (total >= 0.99) {
        api.add(50);
        api.end();
      }
      if (s.cure >= 1) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      s.cure = Math.min(s.cure, 0.7);
      const i = s.inf.findIndex((v) => v > 0.02 && v < 1);
      if (i >= 0) {
        s.inf[i] = Math.min(1, s.inf[i] + 0.02);
        s.dna += 0.3;
      }
      const tIdx = TRAITS.findIndex((tr, k) => !s.traits.includes(k) && s.dna >= tr.cost);
      if (tIdx >= 0) {
        s.dna -= TRAITS[tIdx].cost;
        s.traits.push(tIdx);
        s.rate += TRAITS[tIdx].spread * 0.05;
      }
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      REGIONS.forEach((r, i) => {
        const x = r.x * W;
        const y = r.y * H;
        const v = s.inf[i];
        g.fillStyle = alpha(mix(pal.foe, pal.prize, clamp(v, 0, 1)), 0.75);
        circle(g, x, y, 34);
        g.fill();
        g.strokeStyle = v > 0 ? pal.hero : alpha("#ffffff", 0.25);
        g.lineWidth = 2;
        circle(g, x, y, 34);
        g.stroke();
        centred(g, r.name, x, y + 4, 13, "#ffffff", t.fontBody, 800);
        if (v > 0)
          centred(g, `${Math.round(v * 100)}%`, x, y + 20, 12, alpha("#ffffff", 0.8), t.fontBody, 700);
      });
      centred(g, `${api.score}% infected`, W / 2, H * 0.1, 24, t.ink, t.fontDisplay);
      centred(g, `${Math.floor(s.dna)} DNA`, W / 2, H * 0.14, 15, pal.prize, t.fontBody, 800);
      // the cure bar
      g.fillStyle = alpha(t.ink, 0.14);
      roundRect(g, W * 0.12, H * 0.76, W * 0.76, 12, 6);
      g.fill();
      g.fillStyle = pal.foe;
      roundRect(g, W * 0.12, H * 0.76, W * 0.76 * clamp(s.cure, 0, 1), 12, 6);
      g.fill();
      centred(g, "cure research", W / 2, H * 0.755, 12, t.inkDim, t.fontBody, 700);
      const bw = W / TRAITS.length;
      TRAITS.forEach((tr, i) => {
        const owned = s.traits.includes(i);
        const can = s.dna >= tr.cost;
        g.fillStyle = owned ? pal.hero : can ? alpha(pal.prize, 0.75) : alpha("#ffffff", 0.12);
        roundRect(g, i * bw + 6, H * 0.84, bw - 12, H * 0.1, 12);
        g.fill();
        centred(g, tr.name, i * bw + bw / 2, H * 0.875, 14, owned || can ? "#1a1207" : t.inkDim, t.fontBody, 800);
        centred(
          g,
          owned ? "owned" : `${tr.cost} DNA`,
          i * bw + bw / 2,
          H * 0.912,
          13,
          owned || can ? "#1a1207" : t.inkDim,
          t.fontBody,
          700
        );
      });
    },
  }
);

// --------------------------------------------------------------- Pet Rock

const NEEDS = ["Food", "Fun", "Clean"] as const;

const petRock = defineGame<{
  meters: [number, number, number];
  mood: number;
  blink: number;
  bounce: number;
  age: number;
}>(
  {
    slug: "pet-rock",
    title: "Pet Rock",
    rule: "Keep all three bars alive",
    year: 2012,
    description: "It needs you. It will always need you. That is the entire product.",
    history:
      "Homage to the 2012 virtual pet whose mini games existed purely to fund the feeding of a small round creature.",
    tags: ["calm", "endurance", "precision"],
    palette: {
      hero: "#a3b18a",
      foe: "#bc4749",
      prize: "#f2e8cf",
      deep: "#dad7cd",
      glow: "#588157",
    },
    intensity: 0.2,
    speed: 0.2,
    difficulty: 0.35,
    luck: 0.15,
    nostalgia: 0.6,
    realism: 0.2,
    sessionLength: 0.7,
    scoreUnit: "sec",
    maxScorePerSecond: 1.2,
  },
  {
    hint: "tap a need before it empties",
    overMsg: "IT LEFT",
    autoStart: true,
    init: () => ({ meters: [1, 1, 1] as [number, number, number], mood: 1, blink: 0, bounce: 0, age: 0 }),
    down: (s, x, y, api) => {
      const { W, H } = api;
      if (y < H * 0.72) {
        s.bounce = 0.3;
        s.meters[1] = Math.min(1, s.meters[1] + 0.06);
        api.haptic("light");
        return;
      }
      const i = clamp(Math.floor((x / W) * 3), 0, 2);
      s.meters[i] = Math.min(1, s.meters[i] + 0.34);
      s.bounce = 0.25;
      api.haptic("hit");
    },
    update: (s, dt, api) => {
      s.age += dt;
      api.set(Math.floor(s.age));
      s.bounce = Math.max(0, s.bounce - dt);
      s.blink -= dt;
      if (s.blink < -3) s.blink = 0.16;
      const drain = 0.028 + s.age * 0.0009;
      s.meters[0] = Math.max(0, s.meters[0] - drain * dt);
      s.meters[1] = Math.max(0, s.meters[1] - drain * 1.25 * dt);
      s.meters[2] = Math.max(0, s.meters[2] - drain * 0.8 * dt);
      s.mood = (s.meters[0] + s.meters[1] + s.meters[2]) / 3;
      if (s.meters.some((m) => m <= 0)) api.end();
    },
    bot: (s, dt, api) => {
      void dt;
      const i = s.meters.indexOf(Math.min(...s.meters));
      if (s.meters[i] < 0.55) {
        s.meters[i] = Math.min(1, s.meters[i] + 0.34);
        s.bounce = 0.25;
      }
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.prize);
      const cx = W / 2;
      const cy = H * 0.42 - s.bounce * 22;
      const squash = 1 + s.bounce * 0.35;
      g.fillStyle = alpha("#000000", 0.16);
      g.beginPath();
      g.ellipse(cx, H * 0.42 + 62, 56, 13, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(pal.foe, pal.hero, clamp(s.mood, 0, 1));
      g.beginPath();
      g.ellipse(cx, cy, 62 / squash, 58 * squash, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = alpha("#ffffff", 0.25);
      g.beginPath();
      g.ellipse(cx - 18, cy - 20, 20, 14, -0.5, 0, Math.PI * 2);
      g.fill();
      const eyeH = s.blink > 0 ? 1.5 : 9;
      g.fillStyle = "#26221c";
      g.beginPath();
      g.ellipse(cx - 20, cy - 8, 8, eyeH, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(cx + 20, cy - 8, 8, eyeH, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#26221c";
      g.lineWidth = 3.4;
      g.beginPath();
      if (s.mood > 0.5) g.arc(cx, cy + 12, 17, 0.15 * Math.PI, 0.85 * Math.PI);
      else g.arc(cx, cy + 32, 17, 1.15 * Math.PI, 1.85 * Math.PI);
      g.stroke();
      NEEDS.forEach((n, i) => {
        const bw = W / 3;
        const x = i * bw;
        const v = s.meters[i];
        g.fillStyle = alpha("#ffffff", 0.5);
        roundRect(g, x + 10, H * 0.66, bw - 20, 12, 6);
        g.fill();
        g.fillStyle = v < 0.25 ? pal.foe : pal.glow;
        roundRect(g, x + 10, H * 0.66, (bw - 20) * clamp(v, 0, 1), 12, 6);
        g.fill();
        centred(g, n, x + bw / 2, H * 0.655, 13, t.inkDim, t.fontBody, 800);
        g.fillStyle = v < 0.95 ? pal.glow : alpha(pal.glow, 0.35);
        roundRect(g, x + 10, H * 0.75, bw - 20, H * 0.1, 12);
        g.fill();
        centred(g, `+ ${n}`, x + bw / 2, H * 0.75 + H * 0.062, 17, "#f4f6ef", t.fontDisplay);
      });
      centred(g, `${Math.floor(s.age)}s alive`, W / 2, H * 0.1, 24, t.ink, t.fontDisplay);
    },
  }
);

// --------------------------------------------------------------- Poke Pet

const POKES = ["head", "belly", "left paw", "right paw"];

const pokePet = defineGame<{
  seq: number[];
  step: number;
  showing: number; // index being demonstrated, -1 when it is your turn
  timer: number;
  round: number;
  flash: number;
  ok: boolean;
}>(
  {
    slug: "poke-pet",
    title: "Poke Pet",
    rule: "Poke it back, in order",
    year: 2010,
    description: "It repeats everything you do. Now do that.",
    history:
      "Homage to the 2010 talking pet app that turned poking a cartoon animal into one of the most downloaded things ever made.",
    tags: ["memory", "precision", "calm"],
    palette: {
      hero: "#ffb4a2",
      foe: "#b5838d",
      prize: "#ffcdb2",
      deep: "#6d6875",
      glow: "#e5989b",
    },
    intensity: 0.3,
    speed: 0.35,
    difficulty: 0.5,
    luck: 0.2,
    nostalgia: 0.6,
    realism: 0.2,
    sessionLength: 0.4,
    scoreUnit: "rounds",
    maxScorePerSecond: 1.2,
  },
  {
    hint: "watch, then repeat",
    overMsg: "IT SULKED",
    autoStart: true,
    init: () => ({
      seq: [Math.floor(rand(0, 4))],
      step: 0,
      showing: 0,
      timer: 0.7,
      round: 1,
      flash: -1,
      ok: true,
    }),
    down: (s, x, y, api) => {
      if (s.showing >= 0) return;
      const { W, H } = api;
      const cx = W / 2;
      const cy = H * 0.45;
      let hit = -1;
      if (Math.hypot(x - cx, y - (cy - 62)) < 46) hit = 0;
      else if (Math.hypot(x - cx, y - (cy + 26)) < 52) hit = 1;
      else if (Math.hypot(x - (cx - 66), y - (cy + 40)) < 30) hit = 2;
      else if (Math.hypot(x - (cx + 66), y - (cy + 40)) < 30) hit = 3;
      if (hit < 0) return;
      s.flash = hit;
      if (hit === s.seq[s.step]) {
        s.step += 1;
        api.haptic("light");
        if (s.step >= s.seq.length) {
          api.add(1);
          api.haptic("hit");
          s.round += 1;
          s.seq.push(Math.floor(rand(0, 4)));
          s.step = 0;
          s.showing = 0;
          s.timer = 0.7;
        }
      } else {
        s.ok = false;
        api.end();
      }
    },
    update: (s, dt, api) => {
      if (s.showing < 0) return;
      s.timer -= dt;
      if (s.timer > 0) {
        s.flash = s.timer > 0.25 ? s.seq[s.showing] : -1;
        return;
      }
      s.showing += 1;
      s.timer = 0.7;
      if (s.showing >= s.seq.length) {
        s.showing = -1;
        s.flash = -1;
      }
      void api;
    },
    bot: (s, dt, api) => {
      void dt;
      if (s.showing >= 0) return;
      s.flash = s.seq[s.step];
      s.step += 1;
      if (s.step >= s.seq.length) {
        api.add(1);
        s.round += 1;
        s.seq.push(Math.floor(rand(0, 4)));
        s.step = 0;
        s.showing = 0;
        s.timer = 0.7;
      }
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, pal.deep, pal.glow);
      const cx = W / 2;
      const cy = H * 0.45;
      const lit = (i: number) => (s.flash === i ? pal.prize : pal.hero);
      // body
      g.fillStyle = lit(1);
      g.beginPath();
      g.ellipse(cx, cy + 26, 56, 62, 0, 0, Math.PI * 2);
      g.fill();
      // paws
      g.fillStyle = lit(2);
      circle(g, cx - 66, cy + 40, 26);
      g.fill();
      g.fillStyle = lit(3);
      circle(g, cx + 66, cy + 40, 26);
      g.fill();
      // head
      g.fillStyle = lit(0);
      circle(g, cx, cy - 62, 46);
      g.fill();
      g.fillStyle = lit(0);
      g.beginPath();
      g.moveTo(cx - 40, cy - 92);
      g.lineTo(cx - 22, cy - 118);
      g.lineTo(cx - 12, cy - 88);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(cx + 40, cy - 92);
      g.lineTo(cx + 22, cy - 118);
      g.lineTo(cx + 12, cy - 88);
      g.closePath();
      g.fill();
      g.fillStyle = "#3b3238";
      circle(g, cx - 16, cy - 68, 6);
      g.fill();
      circle(g, cx + 16, cy - 68, 6);
      g.fill();
      g.fillStyle = pal.foe;
      g.beginPath();
      g.ellipse(cx, cy - 50, 9, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#3b3238";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy - 46, 14, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      centred(g, `round ${s.round}`, W / 2, H * 0.1, 26, t.ink, t.fontDisplay);
      centred(
        g,
        s.showing >= 0 ? "watch..." : `your turn · ${s.step}/${s.seq.length}`,
        W / 2,
        H * 0.14,
        15,
        t.inkDim,
        t.fontBody,
        700
      );
      if (s.showing < 0)
        centred(
          g,
          `next: poke where it did`,
          W / 2,
          H * 0.86,
          14,
          t.inkDim,
          t.fontBody,
          700
        );
      void POKES;
    },
  }
);

// ------------------------------------------------------------- Island Toy

interface Islander {
  x: number;
  y: number;
  vx: number;
  held: boolean;
  alive: boolean;
}

const islandToy = defineGame<{
  people: Islander[];
  held: number | null;
  worship: number;
  storm: number;
  left: number;
  sparks: Spark[];
}>(
  {
    slug: "island-toy",
    title: "Island Toy",
    rule: "Fling them, feed them, be worshipped",
    year: 2009,
    description: "No goal, no score screen — just an island and consequences.",
    history:
      "Homage to the 2009 sandbox toy that had no win condition and was updated every week for years anyway.",
    tags: ["chaos", "calm", "drag", "luck"],
    palette: {
      hero: "#ffd166",
      foe: "#118ab2",
      prize: "#06d6a0",
      deep: "#48cae4",
      glow: "#ade8f4",
    },
    intensity: 0.35,
    speed: 0.35,
    difficulty: 0.25,
    luck: 0.5,
    nostalgia: 0.8,
    realism: 0.2,
    sessionLength: 0.5,
    scoreUnit: "faith",
    maxScorePerSecond: 10,
  },
  {
    hint: "drag an islander around",
    overMsg: "ISLAND EMPTY",
    autoStart: true,
    init: (api) => ({
      people: Array.from({ length: 5 }, () => ({
        x: rand(api.W * 0.3, api.W * 0.7),
        y: api.H * 0.6,
        vx: rand(-20, 20),
        held: false,
        alive: true,
      })),
      held: null,
      worship: 0,
      storm: 0,
      left: 45,
      sparks: [],
    }),
    down: (s, x, y, api) => {
      const i = s.people.findIndex(
        (p) => p.alive && Math.hypot(p.x - x, p.y - y) < 30
      );
      if (i >= 0) {
        s.held = i;
        s.people[i].held = true;
        api.haptic("light");
        return;
      }
      // tapping the sky calls the weather
      if (y < api.H * 0.4 && s.storm <= 0) {
        s.storm = 1.2;
        api.haptic("hit");
      }
    },
    move: (s, x, y) => {
      if (s.held === null) return;
      const p = s.people[s.held];
      p.vx = (x - p.x) * 4;
      p.x = x;
      p.y = y;
    },
    up: (s) => {
      if (s.held === null) return;
      s.people[s.held].held = false;
      s.held = null;
    },
    update: (s, dt, api) => {
      const { W, H } = api;
      s.left -= dt;
      s.storm = Math.max(0, s.storm - dt);
      stepSparks(s.sparks, dt, 200);
      const ground = H * 0.62;
      for (const p of s.people) {
        if (!p.alive || p.held) continue;
        p.x += p.vx * dt;
        p.vx *= Math.pow(0.55, dt);
        if (p.y < ground) p.y = Math.min(ground, p.y + H * 0.9 * dt);
        if (Math.abs(p.vx) < 8) p.vx = rand(-28, 28);
        if (p.x < W * 0.22 || p.x > W * 0.78) {
          p.vx *= -1;
          p.x = clamp(p.x, W * 0.22, W * 0.78);
        }
        if (s.storm > 0 && Math.random() < dt * 1.5) {
          p.alive = false;
          burst(s.sparks, p.x, p.y, api.pal.foe, 10, 150);
          s.worship += 6;
        }
        // idle islanders quietly generate faith
        s.worship += dt * 0.8;
      }
      api.set(Math.floor(s.worship));
      if (s.people.every((p) => !p.alive)) api.end();
      if (s.left <= 0) {
        api.add(20);
        api.end();
      }
    },
    bot: (s, dt, api) => {
      void dt;
      s.left = Math.max(12, s.left);
      const i = s.people.findIndex((p) => p.alive);
      if (i < 0) return;
      const p = s.people[i];
      if (Math.random() < 0.02) {
        p.vx = rand(-260, 260);
        p.y -= 40;
      }
      void api;
    },
    draw: (s, g, api) => {
      const { W, H, pal } = api;
      const t = api.theme();
      sky(g, W, H, s.storm > 0 ? "#40506b" : pal.deep, pal.glow);
      // sea + island
      g.fillStyle = pal.foe;
      g.fillRect(0, H * 0.62, W, H * 0.38);
      g.fillStyle = alpha("#ffffff", 0.2);
      for (let i = 0; i < 6; i++)
        g.fillRect(0, H * 0.66 + i * 22 + Math.sin(api.t + i) * 3, W, 3);
      g.fillStyle = "#e9c46a";
      g.beginPath();
      g.ellipse(W / 2, H * 0.64, W * 0.34, H * 0.06, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#6a994e";
      g.fillRect(W * 0.6, H * 0.5, 6, H * 0.13);
      g.beginPath();
      g.ellipse(W * 0.63, H * 0.5, 30, 12, -0.3, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(W * 0.57, H * 0.5, 30, 12, 0.3, 0, Math.PI * 2);
      g.fill();
      if (s.storm > 0) {
        g.strokeStyle = alpha("#ffffff", clamp(s.storm, 0, 1));
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(W * 0.4, 0);
        g.lineTo(W * 0.46, H * 0.2);
        g.lineTo(W * 0.38, H * 0.24);
        g.lineTo(W * 0.5, H * 0.5);
        g.stroke();
      }
      for (const p of s.people) {
        if (!p.alive) continue;
        g.fillStyle = pal.hero;
        circle(g, p.x, p.y - 22, 11);
        g.fill();
        g.fillStyle = shade(pal.hero, -0.3);
        roundRect(g, p.x - 9, p.y - 12, 18, 14, 5);
        g.fill();
        g.fillStyle = "#3b2f16";
        circle(g, p.x - 4, p.y - 24, 2.2);
        g.fill();
        circle(g, p.x + 4, p.y - 24, 2.2);
        g.fill();
      }
      drawSparks(g, s.sparks, 5);
      centred(g, `${api.score} faith`, W / 2, H * 0.09, 26, t.ink, t.fontDisplay);
      centred(
        g,
        `${s.people.filter((p) => p.alive).length} islanders · ${Math.max(0, s.left).toFixed(0)}s`,
        W / 2,
        H * 0.13,
        13,
        t.inkDim,
        t.fontBody,
        700
      );
      centred(g, "tap the sky for weather", W / 2, H * 0.94, 13, t.inkDim, t.fontBody, 700);
    },
  }
);

export const simPack: GameModule[] = [
  laneGuard,
  fieldDefence,
  raidTimer,
  plotFarm,
  floorPlan,
  spread,
  petRock,
  pokePet,
  islandToy,
];

