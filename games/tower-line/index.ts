import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "tower-line",
  title: "Nic's Tower Line",
  rule: "Tap tiles by the path to build. Hold the line.",
  year: 2011,
  description: "One lane, endless waves. Build smart or lose lives.",
  history:
    "Homage to the 2011 single-lane defense toys that turned one winding path and a handful of turrets into an escalating war of attrition.",
  tags: ["precision", "endurance", "chaos"],
  palette: {
    hero: "#4d96ff",
    foe: "#ff8f4d",
    prize: "#ffd166",
    deep: "#141d2b",
    glow: "#7bdff2",
  },
  intensity: 0.55,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

const COLS = 6;
const ROWS = 10;
const LIVES_MAX = 3;
const TURRET_COST = 40;
const RESOURCE_MAX = 160;
const RESOURCE_RATE = 6; // per second

interface Pt {
  x: number;
  y: number;
}

interface Tile {
  cx: number;
  cy: number;
  isPath: boolean;
  placeable: boolean;
  turret: Turret | null;
}

interface Turret {
  range: number;
  damage: number;
  cooldown: number;
  cd: number;
}

interface Enemy {
  dist: number;
  speed: number;
  hp: number;
  maxHp: number;
}

interface Shot {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ttl: number;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return Math.hypot(px - cx, py - cy);
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const TW = W / COLS;
  const TH = H / ROWS;

  const waypoints: Pt[] = [
    { x: -0.1 * W, y: 0.08 * H },
    { x: 0.85 * W, y: 0.08 * H },
    { x: 0.85 * W, y: 0.32 * H },
    { x: 0.15 * W, y: 0.32 * H },
    { x: 0.15 * W, y: 0.56 * H },
    { x: 0.85 * W, y: 0.56 * H },
    { x: 0.85 * W, y: 0.8 * H },
    { x: 0.15 * W, y: 0.8 * H },
    { x: 0.15 * W, y: 1.1 * H },
  ];
  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const l = Math.hypot(
      waypoints[i + 1].x - waypoints[i].x,
      waypoints[i + 1].y - waypoints[i].y
    );
    segLens.push(l);
    totalLen += l;
  }

  const pointAt = (dist: number): Pt => {
    let d = Math.max(0, Math.min(totalLen, dist));
    for (let i = 0; i < segLens.length; i++) {
      if (d <= segLens[i] || i === segLens.length - 1) {
        const t = segLens[i] > 0 ? d / segLens[i] : 0;
        const a = waypoints[i];
        const b = waypoints[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      d -= segLens[i];
    }
    return waypoints[waypoints.length - 1];
  };

  const distToPath = (px: number, py: number) => {
    let best = Infinity;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const d = distToSeg(px, py, waypoints[i].x, waypoints[i].y, waypoints[i + 1].x, waypoints[i + 1].y);
      if (d < best) best = d;
    }
    return best;
  };

  let tiles: Tile[] = [];
  const tileIdx = (c: number, r: number) => r * COLS + c;

  const buildTiles = () => {
    tiles = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = c * TW + TW / 2;
        const cy = r * TH + TH / 2;
        const isPath = distToPath(cx, cy) < Math.min(TW, TH) * 0.62;
        tiles.push({ cx, cy, isPath, placeable: false, turret: null });
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = tiles[tileIdx(c, r)];
        if (t.isPath) continue;
        const adj = [
          c > 0 ? tiles[tileIdx(c - 1, r)] : null,
          c < COLS - 1 ? tiles[tileIdx(c + 1, r)] : null,
          r > 0 ? tiles[tileIdx(c, r - 1)] : null,
          r < ROWS - 1 ? tiles[tileIdx(c, r + 1)] : null,
        ];
        t.placeable = adj.some((n) => n && n.isPath);
      }
    }
  };

  let enemies: Enemy[] = [];
  let shots: Shot[] = [];
  let resource = 80;
  let lives = LIVES_MAX;
  let wave = 0;
  let score = 0;
  let over = false;
  let spawnQueue = 0;
  let spawnTimer = 0;
  let spawnEvery = 0.8;
  let waveHp = 30;
  let waveSpeed = 42;
  let waveBreak = 1.2;

  const startWave = () => {
    wave += 1;
    spawnQueue = 4 + wave * 2;
    spawnEvery = Math.max(0.32, 0.85 - wave * 0.03);
    waveHp = 22 + wave * 9;
    waveSpeed = 40 + wave * 4;
    spawnTimer = 0;
  };

  const reset = () => {
    buildTiles();
    enemies = [];
    shots = [];
    resource = 80;
    lives = LIVES_MAX;
    wave = 0;
    score = 0;
    over = false;
    waveBreak = 1.0;
    ctx.onScore(0);
    startWave();
  };

  const placeTurretAt = (i: number) => {
    const t = tiles[i];
    if (!t.placeable || t.turret || over) return;
    if (resource < TURRET_COST) return;
    resource -= TURRET_COST;
    t.turret = { range: Math.max(TW, TH) * 1.7, damage: 9 + wave * 0.6, cooldown: 0.55, cd: 0 };
    ctx.haptic("light");
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const c = Math.floor(x / TW);
    const row = Math.floor(y / TH);
    if (c < 0 || c >= COLS || row < 0 || row >= ROWS) return;
    placeTurretAt(tileIdx(c, row));
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();

    if (!over) {
      resource = Math.min(RESOURCE_MAX, resource + dt * RESOURCE_RATE);

      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          autoCd = 0.5;
          if (resource >= TURRET_COST) {
            const open = tiles
              .map((t, i) => (t.placeable && !t.turret ? i : -1))
              .filter((i) => i >= 0);
            if (open.length) placeTurretAt(open[Math.floor(Math.random() * open.length)]);
          }
        }
      }

      // spawn
      if (spawnQueue > 0) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          spawnTimer = spawnEvery;
          spawnQueue -= 1;
          enemies.push({ dist: 0, speed: waveSpeed, hp: waveHp, maxHp: waveHp });
        }
      }

      // move enemies
      for (const en of enemies) en.dist += en.speed * dt;

      // enemies reaching the end cost a life
      const arriving = enemies.filter((en) => en.dist >= totalLen);
      if (arriving.length) {
        lives -= arriving.length;
        ctx.haptic("fail");
        enemies = enemies.filter((en) => en.dist < totalLen);
        if (lives <= 0) {
          lives = 0;
          over = true;
          ctx.onRunEnd(score);
        }
      }

      // turrets fire
      if (!over) {
        for (const t of tiles) {
          if (!t.turret) continue;
          const tur = t.turret;
          tur.cd -= dt;
          if (tur.cd > 0) continue;
          let bestI = -1;
          let bestDist = Infinity;
          for (let i = 0; i < enemies.length; i++) {
            const p = pointAt(enemies[i].dist);
            const d = Math.hypot(p.x - t.cx, p.y - t.cy);
            if (d <= tur.range && d < bestDist) {
              bestDist = d;
              bestI = i;
            }
          }
          if (bestI >= 0) {
            const en = enemies[bestI];
            en.hp -= tur.damage;
            tur.cd = tur.cooldown;
            const p = pointAt(en.dist);
            shots.push({ x1: t.cx, y1: t.cy, x2: p.x, y2: p.y, ttl: 0.1 });
          }
        }
        enemies = enemies.filter((en) => en.hp > 0);
      }

      // wave clear
      if (!over && spawnQueue === 0 && enemies.length === 0) {
        waveBreak -= dt;
        if (waveBreak <= 0) {
          score += 1;
          ctx.onScore(score);
          ctx.haptic("hit");
          waveBreak = 1.2;
          startWave();
        }
      }
    }

    for (const s of shots) s.ttl -= dt;
    shots = shots.filter((s) => s.ttl > 0);

    // background
    g.fillStyle = shade(pal.deep, -0.45);
    g.fillRect(0, 0, W, H);

    // path lane
    g.strokeStyle = shade(pal.deep, 0.35);
    g.lineWidth = Math.min(TW, TH) * 1.05;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(waypoints[0].x, waypoints[0].y);
    for (let i = 1; i < waypoints.length; i++) g.lineTo(waypoints[i].x, waypoints[i].y);
    g.stroke();

    // placeable tiles hint
    for (const t of tiles) {
      if (!t.placeable || t.turret) continue;
      g.fillStyle = "rgba(255,255,255,.05)";
      roundRect(g, t.cx - TW * 0.36, t.cy - TH * 0.36, TW * 0.72, TH * 0.72, 6);
      g.fill();
    }

    // turrets
    for (const t of tiles) {
      if (!t.turret) continue;
      g.fillStyle = "rgba(255,255,255,.04)";
      g.beginPath();
      g.arc(t.cx, t.cy, t.turret.range, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pal.hero;
      roundRect(g, t.cx - TW * 0.3, t.cy - TH * 0.3, TW * 0.6, TH * 0.6, 6);
      g.fill();
      g.fillStyle = shade(pal.hero, 0.4);
      g.beginPath();
      g.arc(t.cx, t.cy, Math.min(TW, TH) * 0.14, 0, Math.PI * 2);
      g.fill();
    }

    // shots
    g.strokeStyle = pal.glow;
    g.lineWidth = 2;
    for (const s of shots) {
      g.globalAlpha = Math.max(0, s.ttl / 0.1);
      g.beginPath();
      g.moveTo(s.x1, s.y1);
      g.lineTo(s.x2, s.y2);
      g.stroke();
    }
    g.globalAlpha = 1;

    // enemies
    for (const en of enemies) {
      const p = pointAt(en.dist);
      const r = Math.min(TW, TH) * 0.26;
      // the creeps walking your line are him
      drawNicHead(g, {
        x: p.x,
        y: p.y,
        r,
        skin: pal.foe,
        hair: shade(pal.deep, -0.4),
        eye: theme.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: theme.ink,
        scowl: 1,
        gape: 0.3,
      });
      const hpw = r * 1.8;
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fillRect(p.x - hpw / 2, p.y - r - 8, hpw, 4);
      g.fillStyle = pal.prize;
      g.fillRect(p.x - hpw / 2, p.y - r - 8, hpw * Math.max(0, en.hp / en.maxHp), 4);
    }

    // HUD
    g.textAlign = "left";
    g.fillStyle = theme.ink;
    g.font = `700 13px ${theme.fontBody}`;
    g.fillText(`Wave ${wave}`, 10, 18);
    g.fillText(`Lives ${lives}`, 10, 36);
    g.textAlign = "right";
    g.fillText(`Res ${Math.floor(resource)}`, W - 10, 18);
    g.textAlign = "left";

    if (over) endCard(g, theme, W, H, "OVERRUN");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
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
