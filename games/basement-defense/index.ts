import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade, roundRect } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "basement-defense",
  title: "Nic's Basement",
  rule: "Tap a slab, build junk, hold the stairs",
  year: 2009,
  description: "Your own basement junk vs. an army of your own face.",
  history:
    "Homage to the 2009 lane-defense boom — a receding grid, a slow shuffling horde, and one economy plant that pays for everything else.",
  tags: ["precision", "endurance", "oneTap", "calm"],
  palette: {
    hero: "#5ec98b",
    foe: "#a9c46c",
    prize: "#ffd166",
    deep: "#2a2233",
    glow: "#7ee0ff",
  },
  intensity: 0.45,
  speed: 0.3,
  difficulty: 0.5,
  luck: 0.15,
  nostalgia: 0.55,
  realism: 0.3,
  kidSafe: true,
  sessionLength: 0.8,
  scoreUnit: "pts",
  maxScorePerSecond: 25,
} satisfies GameModule["meta"];

type GadgetId = "fuse" | "router" | "freezer" | "laundry" | "sub";

interface Gadget {
  id: GadgetId;
  short: string; // chip label
  cost: number;
  hp: number;
  cd: number; // seconds between actions (0 = passive)
}

const GADGETS: Gadget[] = [
  { id: "fuse", short: "FUSE", cost: 50, hp: 90, cd: 0 },
  { id: "router", short: "WIFI", cost: 60, hp: 120, cd: 1.35 },
  { id: "freezer", short: "FRZR", cost: 110, hp: 160, cd: 1.9 },
  { id: "laundry", short: "WASH", cost: 40, hp: 380, cd: 0 },
  { id: "sub", short: "SUB", cost: 150, hp: 130, cd: 2.1 },
];

const COLS = 5;
const ROWS = 5;

interface Plant {
  kind: GadgetId;
  col: number;
  row: number;
  hp: number;
  max: number;
  cd: number;
  hurt: number; // flash timer when bitten
  pulse: number; // subwoofer ring, 0..1
}

interface Zed {
  col: number;
  z: number;
  hp: number;
  max: number;
  base: number; // rows per second
  kind: "walker" | "basket" | "sprint";
  slow: number; // seconds of chill left
  hurt: number;
  seed: number; // per-zombie animation offset
  eating: boolean;
}

interface Pellet {
  col: number;
  z: number;
  vz: number;
  dmg: number;
  frost: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  // --- the camera. One simple perspective: everything is a point (x, z, h)
  // in lane-units, projected onto the floor plane of the basement. ---
  // The near edge stops short of the feed's bottom swipe strip, and the far
  // edge stops below the score HUD, so the whole lawn is tappable.
  const HOR = H * 0.05; // where the floor would vanish
  const NEAR = H * 0.86; // the near edge of row 0, right at your shoes
  const LANE = W * 0.19; // one lane wide = one world unit
  const DEPTH = 1.4; // how hard the room recedes

  const scaleAt = (z: number) => 1 / (1 + (z / ROWS) * DEPTH);
  const floorY = (z: number) => HOR + (NEAR - HOR) * scaleAt(z);

  interface P {
    x: number;
    y: number;
    s: number;
  }
  const project = (x: number, z: number, h: number): P => {
    const s = scaleAt(z);
    return { x: W / 2 + (x - COLS / 2) * LANE * s, y: floorY(z) - h * LANE * s, s };
  };

  const quad = (a: P, b: P, c: P, d: P) => {
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.lineTo(c.x, c.y);
    g.lineTo(d.x, d.y);
    g.closePath();
    g.fill();
  };

  /** An axis-aligned box sitting on the floor at (cx, cz), drawn back-to-front. */
  const box = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    h: number,
    front: string,
    top: string,
    side: string,
    lift = 0
  ) => {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const zN = cz - d / 2;
    const zF = cz + d / 2;
    const fb0 = project(x0, zN, lift);
    const fb1 = project(x1, zN, lift);
    const ft0 = project(x0, zN, lift + h);
    const ft1 = project(x1, zN, lift + h);
    const bb0 = project(x0, zF, lift);
    const bb1 = project(x1, zF, lift);
    const bt0 = project(x0, zF, lift + h);
    const bt1 = project(x1, zF, lift + h);
    g.fillStyle = side;
    if (cx > COLS / 2) quad(ft0, fb0, bb0, bt0);
    else quad(ft1, fb1, bb1, bt1);
    g.fillStyle = top;
    quad(ft0, ft1, bt1, bt0);
    g.fillStyle = front;
    quad(ft0, ft1, fb1, fb0);
  };

  const shadow = (x: number, z: number, r: number) => {
    const p = project(x, z, 0);
    g.fillStyle = "rgba(0,0,0,.28)";
    g.beginPath();
    g.ellipse(p.x, p.y, r * LANE * p.s, r * LANE * p.s * 0.34, 0, 0, Math.PI * 2);
    g.fill();
  };

  // --- state ---
  let plants: Plant[] = [];
  let zeds: Zed[] = [];
  let pellets: Pellet[] = [];
  let watts = 90;
  let score = 0;
  let wave = 1;
  let waveT = 0;
  let spawnT = 2.2;
  let elapsed = 0;
  let selected: GadgetId = "router";
  let over = false;
  let shakeT = 0;
  let toast = "";
  let toastT = 0;
  let auto = false;
  let autoT = 0;

  const chips: { id: GadgetId; x: number; y: number; w: number; h: number }[] = [];
  // sits under the feed's score HUD, clear of the top pills
  const chipY = H * 0.105;
  const chipH = 56;
  const chipW = (W - 20 - 4 * 6) / 5;
  GADGETS.forEach((gd, i) => {
    chips.push({ id: gd.id, x: 10 + i * (chipW + 6), y: chipY, w: chipW, h: chipH });
  });

  const gadget = (id: GadgetId) => GADGETS.find((x) => x.id === id)!;

  // The basement is dark in every theme, so HUD text is lit from the palette
  // rather than from the theme's ink (which may be dark-on-light).
  const hudInk = shade(pal.deep, 0.92);
  const hudDim = shade(pal.deep, 0.6);

  const reset = () => {
    plants = [];
    zeds = [];
    pellets = [];
    watts = 90;
    score = 0;
    wave = 1;
    waveT = 0;
    elapsed = 0;
    spawnT = 2.2;
    selected = "router";
    over = false;
    shakeT = 0;
    toast = "";
    toastT = 0;
    autoT = 0.6;
    ctx.onScore(0);
  };

  const say = (msg: string) => {
    toast = msg;
    toastT = 1.4;
  };

  const plantAt = (col: number, row: number) =>
    plants.find((p) => p.col === col && p.row === row);

  const build = (col: number, row: number, id: GadgetId): boolean => {
    const gd = gadget(id);
    if (plantAt(col, row)) return false;
    if (watts < gd.cost) {
      say("not enough watts");
      ctx.haptic("fail");
      return false;
    }
    watts -= gd.cost;
    plants.push({ kind: id, col, row, hp: gd.hp, max: gd.hp, cd: gd.cd * 0.5, hurt: 0, pulse: 0 });
    ctx.haptic("hit");
    return true;
  };

  // --- input ---
  const cellAt = (px: number, py: number) => {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const a = project(col, row, 0);
        const b = project(col + 1, row, 0);
        const c = project(col + 1, row + 1, 0);
        const d = project(col, row + 1, 0);
        // the cell is a trapezoid: inside if between its two rails and rows
        if (py > a.y || py < d.y) continue;
        const k = (py - d.y) / Math.max(1, a.y - d.y);
        const lx = d.x + (a.x - d.x) * k;
        const rx = c.x + (b.x - c.x) * k;
        if (px >= lx && px <= rx) return { col, row };
      }
    }
    return null;
  };

  const onDown = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (over) {
      reset();
      return;
    }
    for (const c of chips) {
      if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) {
        selected = c.id;
        ctx.haptic("light");
        return;
      }
    }
    const cell = cellAt(px, py);
    if (cell) build(cell.col, cell.row, selected);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  // --- attract mode: builds a sensible board and lets it play out ---
  const autoBuild = () => {
    const threat = new Array(COLS).fill(0);
    for (const z of zeds) threat[z.col] += 1 + (ROWS - z.z) * 0.4;
    const fuses = plants.filter((p) => p.kind === "fuse").length;
    const roll = Math.random();
    const want: GadgetId =
      fuses < 2 && plants.length < 4
        ? "fuse"
        : roll < 0.22
          ? "laundry"
          : roll < 0.42 && watts > 140
            ? "freezer"
            : roll < 0.52 && watts > 190
              ? "sub"
              : "router";
    const gd = gadget(want);
    if (watts < gd.cost) return;
    let bestCol = 0;
    for (let c = 1; c < COLS; c++) if (threat[c] > threat[bestCol]) bestCol = c;
    if (threat[bestCol] === 0) bestCol = Math.floor(rand(0, COLS));
    const rows =
      want === "laundry"
        ? [ROWS - 2, ROWS - 1, ROWS - 3]
        : want === "fuse"
          ? [0, 1]
          : [1, 2, 0, 3];
    for (const row of rows) {
      if (!plantAt(bestCol, row)) {
        build(bestCol, row, want);
        return;
      }
    }
    for (let c = 0; c < COLS; c++)
      for (const row of rows)
        if (!plantAt(c, row)) {
          build(c, row, want);
          return;
        }
  };

  const spawn = () => {
    const col = Math.floor(rand(0, COLS));
    const ramp = Math.min(1, elapsed / 90);
    const roll = Math.random();
    let kind: Zed["kind"] = "walker";
    if (elapsed > 22 && roll < 0.22 + ramp * 0.12) kind = "basket";
    else if (elapsed > 35 && roll > 0.86) kind = "sprint";
    // later waves are tougher on both axes, so a full board still loses eventually
    const tough = 1 + (wave - 1) * 0.28;
    const hp = (kind === "basket" ? 260 : kind === "sprint" ? 70 : 110) * tough;
    const base =
      (kind === "basket" ? 0.2 : kind === "sprint" ? 0.5 : 0.27) * (1 + ramp * 0.55);
    zeds.push({
      col,
      z: ROWS + 0.6,
      hp,
      max: hp,
      base,
      kind,
      slow: 0,
      hurt: 0,
      seed: rand(0, 10),
      eating: false,
    });
  };

  // --- the face. Every zombie is wearing it. ---
  const drawFace = (
    cx: number,
    cy: number,
    r: number,
    lean: number,
    z: Zed,
    ink: string
  ) => {
    const skin = z.hurt > 0 ? shade(pal.foe, 0.45) : pal.foe;
    // the canonical head — same one that fills the screen in Five Nights
    drawNicHead(g, {
      x: cx,
      y: cy,
      r,
      skin,
      hair: shade(pal.deep, 0.16),
      eye: shade(pal.prize, 0.6),
      pupil: shade(pal.deep, -0.1),
      dark: shade(pal.deep, -0.35),
      tooth: shade(pal.prize, 0.7),
      lean,
      gaze: Math.sin(z.seed * 3 + z.z * 1.6),
      gape: z.eating ? 0.35 + Math.sin(z.seed + z.z * 22) * 0.15 : 0.1,
    });
    // the accessories stay local: they belong to the horde, not to the face
    g.save();
    g.translate(cx, cy);
    g.rotate(lean);
    if (z.kind === "basket") {
      // laundry basket helmet: honest protection
      g.fillStyle = shade(pal.glow, -0.25);
      roundRect(g, -r * 1.02, -r * 1.5, r * 2.04, r * 0.95, r * 0.16);
      g.fill();
      g.strokeStyle = shade(pal.deep, 0.05);
      g.lineWidth = Math.max(1, r * 0.08);
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * r * 0.36, -r * 1.48);
        g.lineTo(i * r * 0.36, -r * 0.58);
        g.stroke();
      }
    }
    if (z.kind === "sprint") {
      // no shoes, all commitment
      g.strokeStyle = ink;
      g.globalAlpha = 0.5;
      g.lineWidth = Math.max(1, r * 0.1);
      g.beginPath();
      g.moveTo(r * 1.05, -r * 0.2);
      g.lineTo(r * 1.6, -r * 0.3);
      g.moveTo(r * 1.05, r * 0.15);
      g.lineTo(r * 1.7, r * 0.1);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();
  };

  const drawZed = (z: Zed, ink: string) => {
    const x = z.col + 0.5;
    const s = scaleAt(z.z);
    // old-animation shuffle: pose steps at 8 fps, never in between
    const phase = Math.floor((elapsed * 7 + z.seed * 5) % 8) / 8;
    const swing = Math.sin(phase * Math.PI * 2);
    const bob = Math.abs(Math.cos(phase * Math.PI * 2)) * 0.06;
    const moving = !z.eating;
    const sw = moving ? swing : swing * 0.15;
    const skin = z.hurt > 0 ? shade(pal.foe, 0.45) : pal.foe;
    const shirt = z.kind === "sprint" ? shade(pal.glow, -0.4) : shade(pal.deep, 0.3);
    const w = z.kind === "basket" ? 0.54 : 0.46;

    shadow(x, z.z, w * 0.9);
    // legs
    box(x - 0.14, z.z + sw * 0.12, 0.18, 0.24, 0.4 + sw * 0.05, shade(pal.deep, 0.1), shade(pal.deep, 0.2), shade(pal.deep, 0.02));
    box(x + 0.14, z.z - sw * 0.12, 0.18, 0.24, 0.4 - sw * 0.05, shade(pal.deep, 0.14), shade(pal.deep, 0.24), shade(pal.deep, 0.04));
    // torso
    box(x, z.z, w, 0.32, 0.5 + bob, shirt, shade(shirt, 0.18), shade(shirt, -0.16), 0.38);
    // arms, reaching for the stairs
    const reach = moving ? 0.2 : 0.14 + Math.abs(sw) * 0.05;
    box(x - w * 0.58, z.z - reach, 0.15, 0.2, 0.15, skin, shade(skin, 0.2), shade(skin, -0.2), 0.74 + bob + sw * 0.03);
    box(x + w * 0.58, z.z - reach, 0.15, 0.2, 0.15, skin, shade(skin, 0.2), shade(skin, -0.2), 0.74 + bob - sw * 0.03);
    // head
    const hp = project(x, z.z - 0.08, 1.2 + bob);
    drawFace(hp.x, hp.y, 0.34 * LANE * s, sw * 0.08, z, ink);
    // health pips, only once bitten into
    if (z.hp < z.max) {
      const bp = project(x, z.z, 1.75 + bob);
      const bw = 0.5 * LANE * s;
      g.fillStyle = "rgba(0,0,0,.4)";
      roundRect(g, bp.x - bw / 2, bp.y, bw, 4 * s + 1.5, 3);
      g.fill();
      g.fillStyle = pal.hero;
      roundRect(g, bp.x - bw / 2, bp.y, (bw * z.hp) / z.max, 4 * s + 1.5, 3);
      g.fill();
    }
    if (z.slow > 0) {
      const fp = project(x, z.z, 0.5);
      g.fillStyle = pal.glow;
      g.globalAlpha = 0.22;
      g.beginPath();
      g.ellipse(fp.x, fp.y, 0.4 * LANE * s, 0.6 * LANE * s, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  };

  const drawPlant = (p: Plant, t: { ink: string; inkDim: string; fontBody: string }) => {
    const x = p.col + 0.5;
    const z = p.row + 0.5;
    const s = scaleAt(z);
    const hurt = p.hurt > 0 ? 0.35 : 0;
    shadow(x, z, 0.34);

    if (p.kind === "laundry") {
      // a pile of everything you meant to fold
      const cols = [pal.glow, pal.prize, pal.hero, pal.foe];
      for (let i = 0; i < 4; i++) {
        const c = shade(cols[i % cols.length], -0.15 + hurt);
        box(
          x + Math.sin(i * 2.3) * 0.08,
          z + Math.cos(i * 1.7) * 0.06,
          0.78 - i * 0.07,
          0.6 - i * 0.06,
          0.13,
          c,
          shade(c, 0.2),
          shade(c, -0.2),
          i * 0.12
        );
      }
    } else if (p.kind === "fuse") {
      const c = shade(pal.prize, -0.25 + hurt);
      box(x, z, 0.58, 0.34, 0.54, c, shade(c, 0.25), shade(c, -0.22), 0.02);
      const lp = project(x, z - 0.17, 0.42);
      g.fillStyle = shade(pal.deep, -0.2);
      g.fillRect(lp.x - 5 * s, lp.y, 10 * s, 16 * s);
      g.fillStyle = pal.prize;
      const spark = 0.5 + Math.sin(elapsed * 6 + p.col) * 0.5;
      g.globalAlpha = 0.35 + spark * 0.5;
      g.beginPath();
      g.arc(lp.x, lp.y - 6 * s, 7 * s, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    } else if (p.kind === "router") {
      const c = shade(pal.hero, -0.1 + hurt);
      box(x, z, 0.66, 0.36, 0.42, c, shade(c, 0.25), shade(c, -0.2), 0.03);
      // antennas
      const a0 = project(x - 0.2, z, 0.44);
      const a1 = project(x - 0.3, z, 0.86);
      const b0 = project(x + 0.2, z, 0.44);
      const b1 = project(x + 0.3, z, 0.86);
      g.strokeStyle = shade(pal.deep, 0.3);
      g.lineWidth = Math.max(1.5, 3 * s);
      g.beginPath();
      g.moveTo(a0.x, a0.y);
      g.lineTo(a1.x, a1.y);
      g.moveTo(b0.x, b0.y);
      g.lineTo(b1.x, b1.y);
      g.stroke();
      const led = project(x, z - 0.18, 0.3);
      g.fillStyle = p.cd < 0.25 ? pal.glow : shade(pal.glow, -0.45);
      g.beginPath();
      g.arc(led.x, led.y, Math.max(1.5, 4 * s), 0, Math.PI * 2);
      g.fill();
    } else if (p.kind === "freezer") {
      const c = shade(pal.glow, 0.35 + hurt);
      box(x, z, 0.76, 0.44, 0.36, c, shade(c, 0.22), shade(c, -0.18));
      const lid = project(x, z, 0.4);
      g.fillStyle = shade(pal.glow, -0.1);
      g.globalAlpha = 0.35 + Math.sin(elapsed * 2 + p.row) * 0.1;
      g.beginPath();
      g.ellipse(lid.x, lid.y, 0.4 * LANE * s, 0.16 * LANE * s, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    } else {
      // subwoofer
      const c = shade(pal.deep, 0.22 + hurt);
      box(x, z, 0.64, 0.4, 0.6, c, shade(c, 0.2), shade(c, -0.2));
      const cone = project(x, z - 0.2, 0.34);
      const r = (0.24 + p.pulse * 0.06) * LANE * s;
      g.fillStyle = shade(pal.deep, -0.25);
      g.beginPath();
      g.arc(cone.x, cone.y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.1);
      g.beginPath();
      g.arc(cone.x, cone.y, r * 0.45, 0, Math.PI * 2);
      g.fill();
      if (p.pulse > 0) {
        const rp = project(x, z, 0.1);
        g.strokeStyle = pal.hero;
        g.globalAlpha = p.pulse * 0.5;
        g.lineWidth = 3 * s + 1;
        g.beginPath();
        g.ellipse(rp.x, rp.y, (1 - p.pulse) * 1.6 * LANE * s, (1 - p.pulse) * 0.6 * LANE * s, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    if (p.hp < p.max) {
      const bp = project(x, z, 0.86);
      const bw = 0.56 * LANE * s;
      g.fillStyle = "rgba(0,0,0,.35)";
      roundRect(g, bp.x - bw / 2, bp.y, bw, 3 * s + 1.5, 3);
      g.fill();
      g.fillStyle = p.hp / p.max < 0.35 ? shade(pal.foe, -0.2) : pal.hero;
      roundRect(g, bp.x - bw / 2, bp.y, (bw * p.hp) / p.max, 3 * s + 1.5, 3);
      g.fill();
    }
    void t;
  };

  const drawPellet = (b: Pellet) => {
    const p = project(b.col + 0.5, b.z, 0.42);
    const r = Math.max(2, (b.frost ? 8 : 5) * p.s);
    g.fillStyle = b.frost ? pal.glow : shade(pal.hero, 0.35);
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.35;
    g.beginPath();
    g.arc(p.x, p.y, r * 1.9, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) elapsed += dt;

    if (!over) {
      // --- economy ---
      const fuses = plants.filter((p) => p.kind === "fuse").length;
      watts = Math.min(999, watts + (9 + fuses * 7) * dt);

      // --- waves ---
      waveT += dt;
      if (waveT > 26) {
        waveT = 0;
        wave += 1;
        say(`WAVE ${wave}`);
      }
      spawnT -= dt;
      if (spawnT <= 0) {
        spawn();
        const ramp = Math.min(1, elapsed / 100);
        spawnT = Math.max(0.55, rand(2.8, 3.9) - ramp * 2.1);
        if (wave > 2 && Math.random() < 0.2 + wave * 0.06) spawn();
      }

      if (auto) {
        autoT -= dt;
        if (autoT <= 0) {
          autoBuild();
          autoT = rand(0.7, 1.5);
        }
      }

      // --- plants act ---
      for (const p of plants) {
        p.hurt = Math.max(0, p.hurt - dt);
        p.pulse = Math.max(0, p.pulse - dt * 1.6);
        const gd = gadget(p.kind);
        if (gd.cd === 0) continue;
        p.cd -= dt;
        if (p.cd > 0) continue;
        if (p.kind === "sub") {
          let hit = false;
          for (const z of zeds) {
            if (Math.abs(z.col - p.col) <= 1 && z.z > p.row - 0.5 && z.z < p.row + 3.2) {
              z.hp -= 20;
              z.hurt = 0.12;
              hit = true;
            }
          }
          if (hit) ctx.haptic("light");
          p.pulse = 1;
          p.cd = gd.cd;
        } else {
          const target = zeds.some((z) => z.col === p.col && z.z > p.row + 0.4);
          if (!target) {
            p.cd = 0.12;
            continue;
          }
          pellets.push({
            col: p.col,
            z: p.row + 0.6,
            vz: p.kind === "freezer" ? 5.2 : 7.4,
            dmg: p.kind === "freezer" ? 14 : 26,
            frost: p.kind === "freezer",
          });
          p.cd = gd.cd;
        }
      }

      // --- pellets ---
      for (let i = pellets.length - 1; i >= 0; i--) {
        const b = pellets[i];
        b.z += b.vz * dt;
        if (b.z > ROWS + 1.2) {
          pellets.splice(i, 1);
          continue;
        }
        let best: Zed | null = null;
        for (const z of zeds) {
          if (z.col !== b.col) continue;
          if (Math.abs(z.z - b.z) > 0.3) continue;
          if (!best || z.z < best.z) best = z;
        }
        if (best) {
          best.hp -= b.dmg;
          best.hurt = 0.12;
          if (b.frost) best.slow = 3;
          pellets.splice(i, 1);
        }
      }

      // --- zombies ---
      for (let i = zeds.length - 1; i >= 0; i--) {
        const z = zeds[i];
        z.hurt = Math.max(0, z.hurt - dt);
        z.slow = Math.max(0, z.slow - dt);
        if (z.hp <= 0) {
          zeds.splice(i, 1);
          score += 12;
          ctx.onScore(score);
          ctx.haptic("hit");
          continue;
        }
        // the plant it is currently chewing on: the furthest-forward one it has reached
        let meal: Plant | null = null;
        for (const p of plants) {
          if (p.col !== z.col) continue;
          if (p.row + 0.95 >= z.z - 0.05 && p.row <= z.z) {
            if (!meal || p.row > meal.row) meal = p;
          }
        }
        z.eating = !!meal;
        if (meal) {
          meal.hp -= 26 * dt;
          meal.hurt = 0.1;
          if (meal.hp <= 0) {
            plants = plants.filter((p) => p !== meal);
            ctx.haptic("fail");
          }
        } else {
          z.z -= z.base * (z.slow > 0 ? 0.42 : 1) * dt;
          if (z.z <= 0.05) {
            over = true;
            shakeT = 0.6;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          }
        }
      }
    }

    toastT = Math.max(0, toastT - dt);
    shakeT = Math.max(0, shakeT - dt);

    // ================= draw =================
    g.save();
    if (shakeT > 0) g.translate(rand(-4, 4) * shakeT, rand(-3, 3) * shakeT);

    // room: dark walls, one bulb
    const room = g.createLinearGradient(0, 0, 0, H);
    room.addColorStop(0, shade(pal.deep, -0.45));
    room.addColorStop(0.55, shade(pal.deep, -0.1));
    room.addColorStop(1, shade(pal.deep, -0.35));
    g.fillStyle = room;
    g.fillRect(0, 0, W, H);

    const backY = floorY(ROWS);
    // far wall + the junk stacked against it
    g.fillStyle = shade(pal.deep, 0.06);
    g.fillRect(0, backY - H * 0.2, W, H * 0.2);
    g.fillStyle = shade(pal.deep, 0.14);
    for (let i = 0; i < 7; i++) {
      const bw = 26 + ((i * 37) % 30);
      const bh = 18 + ((i * 53) % 26);
      const bx = ((i * 97) % (W - 40)) + 6;
      g.fillRect(bx, backY - bh, bw, bh);
      g.fillStyle = shade(pal.deep, 0.2);
      g.fillRect(bx, backY - bh, bw, 4);
      g.fillStyle = shade(pal.deep, 0.14);
    }
    // the sign someone hung above the shelves
    const signY = backY - H * 0.13;
    g.fillStyle = shade(pal.deep, 0.16);
    roundRect(g, W / 2 - 76, signY - 20, 152, 30, 5);
    g.fill();
    g.textAlign = "center";
    g.fillStyle = hudDim;
    g.font = `800 13px ${t.fontDisplay}`;
    g.fillText("NIC'S BASEMENT", W / 2, signY);
    g.textAlign = "left";

    // swinging bulb — the only light down here
    const sway = Math.sin(elapsed * 1.1) * 10;
    g.strokeStyle = shade(pal.deep, 0.25);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(W * 0.5, 0);
    g.lineTo(W * 0.5 + sway, backY - H * 0.14);
    g.stroke();
    const bulbG = g.createRadialGradient(
      W * 0.5 + sway,
      backY - H * 0.13,
      2,
      W * 0.5 + sway,
      backY - H * 0.13,
      W * 0.5
    );
    bulbG.addColorStop(0, pal.prize);
    bulbG.addColorStop(0.08, `${pal.prize}55`);
    bulbG.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = bulbG;
    g.globalAlpha = 0.5;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;

    // the room around the lawn: bare floor either side, and two walls, so the
    // grid reads as a basement and not a road
    const EDGE = 2.4;
    g.fillStyle = shade(pal.deep, 0.09);
    quad(
      project(-EDGE, ROWS, 0),
      project(COLS + EDGE, ROWS, 0),
      project(COLS + EDGE, -0.8, 0),
      project(-EDGE, -0.8, 0)
    );
    g.fillStyle = shade(pal.deep, -0.02);
    quad(
      project(-EDGE, ROWS, 0),
      project(-EDGE, ROWS, 2.6),
      project(-EDGE, -0.8, 2.6),
      project(-EDGE, -0.8, 0)
    );
    g.fillStyle = shade(pal.deep, -0.14);
    quad(
      project(COLS + EDGE, ROWS, 0),
      project(COLS + EDGE, ROWS, 2.6),
      project(COLS + EDGE, -0.8, 2.6),
      project(COLS + EDGE, -0.8, 0)
    );
    // the water heater in the corner, because every basement has one
    box(COLS + 1.3, ROWS - 1.6, 0.9, 0.9, 1.7, shade(pal.deep, 0.1), shade(pal.deep, 0.22), shade(pal.deep, 0.02));

    // ceiling joists overhead — the reason you have to duck down here
    for (const bz of [1, 2.6, 4.4]) {
      box(
        COLS / 2,
        bz,
        COLS + EDGE * 2,
        0.3,
        0.2,
        shade(pal.deep, 0.02),
        shade(pal.deep, -0.12),
        shade(pal.deep, 0.1),
        2.5
      );
    }

    // floor: concrete slabs, checkered, painter-ordered far to near
    for (let row = ROWS - 1; row >= 0; row--) {
      for (let col = 0; col < COLS; col++) {
        const a = project(col, row, 0);
        const b = project(col + 1, row, 0);
        const c = project(col + 1, row + 1, 0);
        const d = project(col, row + 1, 0);
        const lit = (row + col) % 2 === 0;
        g.fillStyle = shade(pal.deep, lit ? 0.2 : 0.14);
        quad(a, b, c, d);
      }
    }
    g.strokeStyle = shade(pal.deep, 0.3);
    g.lineWidth = 1;
    for (let col = 0; col <= COLS; col++) {
      const n = project(col, 0, 0);
      const f = project(col, ROWS, 0);
      g.beginPath();
      g.moveTo(n.x, n.y);
      g.lineTo(f.x, f.y);
      g.stroke();
    }
    for (let row = 0; row <= ROWS; row++) {
      const l = project(0, row, 0);
      const r = project(COLS, row, 0);
      g.beginPath();
      g.moveTo(l.x, l.y);
      g.lineTo(r.x, r.y);
      g.stroke();
    }

    // the stairs you are standing on
    const s0 = project(0, 0, 0);
    const s1 = project(COLS, 0, 0);
    g.fillStyle = shade(pal.prize, -0.82);
    g.fillRect(0, s0.y, W, H - s0.y);
    g.fillStyle = shade(pal.prize, -0.7);
    for (let i = 0; i < 3; i++) {
      g.fillRect(0, s0.y + i * ((H - s0.y) / 3), W, 6);
    }
    g.fillStyle = shade(pal.prize, -0.6);
    g.fillRect(0, s0.y - 3, W, 4);
    void s1;

    // entities, far to near
    const draws: { z: number; run: () => void }[] = [];
    for (const p of plants) draws.push({ z: p.row + 0.5, run: () => drawPlant(p, t) });
    for (const z of zeds) draws.push({ z: z.z, run: () => drawZed(z, hudInk) });
    for (const b of pellets) draws.push({ z: b.z, run: () => drawPellet(b) });
    draws.sort((a, b) => b.z - a.z);
    for (const d of draws) d.run();

    // ---- HUD ----
    const infoY = chipY + chipH + 22;
    // watts, in a little pill so it reads over the concrete
    g.fillStyle = "rgba(0,0,0,.4)";
    roundRect(g, 10, infoY - 17, 124, 26, 13);
    g.fill();
    g.fillStyle = pal.prize;
    g.beginPath();
    g.arc(26, infoY - 6, 7, 0, Math.PI * 2);
    g.fill();
    g.fillRect(23, infoY - 1, 6, 5);
    g.textAlign = "left";
    g.fillStyle = hudInk;
    g.font = `800 17px ${t.fontDisplay}`;
    g.fillText(`${Math.floor(watts)}`, 40, infoY + 1);
    g.fillStyle = hudDim;
    g.font = `700 10px ${t.fontBody}`;
    g.fillText("WATTS", 76, infoY);

    g.textAlign = "right";
    g.fillStyle = hudDim;
    g.font = `700 11px ${t.fontBody}`;
    g.fillText(`WAVE ${wave}`, W - 12, infoY);

    // gadget chips
    for (const c of chips) {
      const gd = gadget(c.id);
      const afford = watts >= gd.cost;
      const on = selected === c.id;
      g.fillStyle = on ? shade(pal.deep, 0.34) : "rgba(0,0,0,.34)";
      roundRect(g, c.x, c.y, c.w, c.h, Math.max(8, t.radius * 0.6));
      g.fill();
      g.globalAlpha = afford ? 1 : 0.4;
      // tiny icon
      const ix = c.x + c.w / 2;
      const iy = c.y + 20;
      g.fillStyle =
        c.id === "fuse"
          ? pal.prize
          : c.id === "router"
            ? pal.hero
            : c.id === "freezer"
              ? pal.glow
              : c.id === "laundry"
                ? shade(pal.foe, 0.2)
                : shade(pal.deep, 0.4);
      roundRect(g, ix - 11, iy - 9, 22, 18, 4);
      g.fill();
      g.textAlign = "center";
      g.fillStyle = hudInk;
      g.font = `800 9px ${t.fontBody}`;
      g.fillText(gd.short, ix, c.y + 40);
      g.fillStyle = afford ? pal.prize : hudDim;
      g.font = `700 11px ${t.fontBody}`;
      g.fillText(`${gd.cost}`, ix, c.y + 52);
      g.globalAlpha = 1;
      if (on) {
        g.strokeStyle = pal.prize;
        g.lineWidth = 2;
        roundRect(g, c.x, c.y, c.w, c.h, Math.max(8, t.radius * 0.6));
        g.stroke();
      }
    }

    g.textAlign = "center";
    if (toastT > 0) {
      g.globalAlpha = Math.min(1, toastT * 2);
      g.fillStyle = hudInk;
      g.font = `800 18px ${t.fontDisplay}`;
      g.fillText(toast, W / 2, chipY + chipH + 58);
      g.globalAlpha = 1;
    } else if (!over && plants.length === 0) {
      g.fillStyle = hudDim;
      g.font = `500 13px ${t.fontBody}`;
      g.fillText("pick a gadget, tap a slab", W / 2, chipY + chipH + 56);
    }

    if (over) endCard(g, t, W, H, "BASEMENT BREACHED");
    g.textAlign = "left";
    g.restore();
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
      else autoT = 0.2;
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
