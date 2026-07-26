import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "hardwater",
  title: "Nic's Hardwater",
  rule: "Walk the ice. Crank. Ease off when it runs.",
  year: 2026,
  description: "Nic walks a frozen lake at dusk, hunting live holes.",
  history:
    "Hardwater is what ice anglers call the lake once it locks up. The whole sport is one decision made over and over: crank while it swims to you, ease off the second it runs, because the only thing between you and the fish is four pounds of line.",
  tags: ["calm", "hold", "drag", "precision", "endurance"],
  palette: {
    hero: "#ff8a3d", // Nic's jacket
    foe: "#ff4d6d", // line tension
    prize: "#ffd166", // the sunset, the shack window
    deep: "#111a33", // the treeline and the deep ice
    glow: "#7fd3ff", // the holes
  },
  intensity: 0.35,
  speed: 0.3,
  difficulty: 0.5,
  luck: 0.35,
  nostalgia: 0.2,
  realism: 0.75,
  kidSafe: true,
  sessionLength: 0.85,
  scoreUnit: "lb",
  maxScorePerSecond: 10,
} satisfies GameModule["meta"];

/* ------------------------------------------------------------------ *
 * The world is real 3D: metres, y-up, camera behind and above Nic.
 * Everything below projects through one pinhole and paints back-to-front.
 * ------------------------------------------------------------------ */

interface Vec {
  x: number;
  y: number;
  z: number;
}

interface Hole {
  x: number;
  z: number;
  r: number;
  live: boolean;
  phase: number;
}

interface Tree {
  x: number;
  z: number;
  h: number;
  r: number;
}

interface Species {
  name: string;
  min: number;
  max: number;
  fight: number; // how hard it pulls
  weight: number; // how often it shows up
}

const SPECIES: Species[] = [
  { name: "PERCH", min: 0.4, max: 1.2, fight: 0.55, weight: 34 },
  { name: "WALLEYE", min: 2, max: 6, fight: 0.85, weight: 27 },
  { name: "PIKE", min: 5, max: 14, fight: 1.15, weight: 21 },
  { name: "LAKER", min: 8, max: 22, fight: 1.3, weight: 13 },
  { name: "NIC'S TROPHY", min: 24, max: 38, fight: 1.45, weight: 5 },
];

function rollSpecies(): Species {
  const total = SPECIES.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (const s of SPECIES) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return SPECIES[0];
}

const LAKE = 52; // Nic can't walk past this
const START_LINES = 3;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  // ---- camera -------------------------------------------------------
  const FOCAL = H * 0.75;
  const PITCH = 0.26;
  const SP = Math.sin(PITCH);
  const CP = Math.cos(PITCH);
  const CAM_BACK = 13;
  const CAM_UP = 7.5;
  const HORIZON = H / 2 - FOCAL * (SP / CP);

  let camX = 0;
  let camZ = -CAM_BACK;

  // The lake is always at dusk, so the scene lights itself off the palette
  // rather than the theme: theme ink is near-black under Coast and would
  // vanish against this sky. Theme still owns the fonts and the end card.
  const LIT = shade(pal.glow, 0.8); // snow, stars, text on the sky
  const LIT_DIM = shade(pal.glow, 0.42); // hints, spent rims, bar troughs
  const DARK = shade(pal.deep, -0.45); // the rod, his headphones

  interface P2 {
    x: number;
    y: number;
    z: number; // camera-space depth, <=0 means behind the lens
  }

  const project = (x: number, y: number, z: number): P2 => {
    const dx = x - camX;
    const dy = y - CAM_UP;
    const dz = z - camZ;
    const zc = dz * CP - dy * SP;
    const yc = dy * CP + dz * SP;
    const inv = FOCAL / (zc || 0.001);
    return { x: W / 2 + dx * inv, y: H / 2 - yc * inv, z: zc };
  };

  /** A box in world space, painted with a lit top and a shaded side. */
  const box3 = (
    cx: number,
    y: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    color: string
  ) => {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const y0 = y;
    const y1 = y + h;
    const near = [
      project(x0, y0, z0),
      project(x1, y0, z0),
      project(x1, y1, z0),
      project(x0, y1, z0),
    ];
    if (near.some((p) => p.z < 0.35)) return;
    const top = [
      project(x0, y1, z0),
      project(x1, y1, z0),
      project(x1, y1, z1),
      project(x0, y1, z1),
    ];
    // the visible side is whichever one the camera is standing off to
    const sideX = camX < cx ? x0 : x1;
    const side = [
      project(sideX, y0, z0),
      project(sideX, y1, z0),
      project(sideX, y1, z1),
      project(sideX, y0, z1),
    ];

    const poly = (pts: P2[], fill: string) => {
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    poly(side, shade(color, -0.32));
    poly(top, shade(color, 0.16));
    poly(near, color);
  };

  /** A hole is a disc on the ice — project its axes so it foreshortens. */
  const holeEllipse = (hx: number, hz: number, r: number) => {
    const c = project(hx, 0, hz);
    const px = project(hx + r, 0, hz);
    const pz = project(hx, 0, hz + r);
    if (c.z < 0.5) return null;
    return {
      cx: c.x,
      cy: c.y,
      rx: Math.abs(px.x - c.x),
      ry: Math.max(1.2, Math.abs(pz.y - c.y)),
      z: c.z,
    };
  };

  // ---- world --------------------------------------------------------
  const trees: Tree[] = [];
  for (let i = 0; i < 260; i++) {
    // a deterministic ring so the treeline never shimmers between runs
    const a = (i / 260) * Math.PI * 2 + ((i * 37) % 11) * 0.012;
    const rad = 96 + ((i * 53) % 62);
    trees.push({
      x: Math.cos(a) * rad,
      z: Math.sin(a) * rad,
      h: 5.5 + ((i * 29) % 11) * 0.62,
      r: 1.1 + ((i * 17) % 5) * 0.22,
    });
  }

  const SHACK: Vec = { x: 26, y: 0, z: 22 };

  let holes: Hole[] = [];
  /** New holes appear a short walk away, never on top of the one just fished. */
  const spawnHole = (awayFromX: number, awayFromZ: number) => {
    for (let tries = 0; tries < 40; tries++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(11, 30);
      const x = clamp(nicX + Math.cos(a) * d, -LAKE + 4, LAKE - 4);
      const z = clamp(nicZ + Math.sin(a) * d, -LAKE + 4, LAKE - 4);
      if ((x - awayFromX) ** 2 + (z - awayFromZ) ** 2 < 100) continue;
      if (holes.some((h) => (h.x - x) ** 2 + (h.z - z) ** 2 < 49)) continue;
      holes.push({ x, z, r: 0.85, live: true, phase: rand(0, 6.28) });
      return;
    }
    holes.push({ x: rand(-30, 30), z: rand(-30, 30), r: 0.85, live: true, phase: 0 });
  };

  // ---- snow ---------------------------------------------------------
  const snow: Vec[] = Array.from({ length: 90 }, () => ({
    x: rand(-26, 26),
    y: rand(0, 14),
    z: rand(-6, 40),
  }));

  // ---- Nic ----------------------------------------------------------
  let nicX = 0;
  let nicZ = 0;
  let nicVX = 0;
  let nicVZ = 0;
  let bob = 0;

  // ---- run state ----------------------------------------------------
  type Phase = "walk" | "drop" | "bite" | "fight" | "landed";
  let phase: Phase = "walk";
  let score = 0;
  let lines = START_LINES;
  let over = false;

  let atHole: Hole | null = null;
  let dropT = 0;
  let biteWindow = 0;

  let fish: Species = SPECIES[0];
  let fishLb = 0;
  let dist = 100; // % of line still out
  let tension = 0;
  let running = false;
  let runT = 0;
  let cranking = false;
  let crankTick = 0;

  let toast = "";
  let toastT = 0;
  let landedT = 0;
  let shake = 0;

  // ---- input --------------------------------------------------------
  let held = false;
  let stickX = 0;
  let stickZ = 0;
  let originX = 0;
  let originY = 0;

  const local = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    ctx.canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    held = true;
    originX = p.x;
    originY = p.y;
    stickX = stickZ = 0;
    if (phase === "bite") setHook();
    if (phase === "fight") cranking = true;
  };

  const onMove = (e: PointerEvent) => {
    if (!held || phase === "fight") return;
    const p = local(e);
    // a thumb-anchored stick: drag from wherever you pressed
    const dx = p.x - originX;
    const dy = p.y - originY;
    const len = Math.hypot(dx, dy);
    const max = Math.min(W, H) * 0.16;
    const s = len > max ? max / len : 1;
    stickX = (dx * s) / max;
    stickZ = (-dy * s) / max; // dragging up walks away from camera
  };

  const onUp = () => {
    held = false;
    cranking = false;
    stickX = stickZ = 0;
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  // ---- fishing ------------------------------------------------------
  const dropLine = (h: Hole) => {
    atHole = h;
    phase = "drop";
    dropT = rand(1.1, 2.9);
    ctx.haptic("light");
  };

  const startBite = () => {
    phase = "bite";
    biteWindow = 1.3;
    fish = rollSpecies();
    fishLb = rand(fish.min, fish.max);
    ctx.haptic("hit");
  };

  const setHook = () => {
    phase = "fight";
    dist = 100;
    tension = 0.12;
    running = false;
    runT = rand(1.2, 2.2);
    cranking = true;
    say("HOOKED UP");
    ctx.haptic("hit");
  };

  const missBite = () => {
    say("it spat the hook");
    phase = "drop";
    dropT = rand(1.0, 2.2);
  };

  const say = (msg: string) => {
    toast = msg;
    toastT = 1.7;
  };

  const land = () => {
    const lb = Math.max(1, Math.round(fishLb));
    score += lb;
    ctx.onScore(score);
    say(`NIC LANDED A ${fishLb.toFixed(1)} lb ${fish.name}`);
    ctx.haptic("hit");
    phase = "landed";
    landedT = 1.5;
    if (atHole) {
      atHole.live = false;
      spawnHole(atHole.x, atHole.z);
    }
  };

  const snap = () => {
    lines -= 1;
    shake = 1;
    say("LINE SNAPPED");
    ctx.haptic("fail");
    phase = "walk";
    atHole = null;
    if (lines <= 0) {
      over = true;
      ctx.onRunEnd(score);
    }
  };

  function reset() {
    nicX = 0;
    nicZ = 0;
    nicVX = nicVZ = 0;
    camX = 0;
    camZ = -CAM_BACK;
    score = 0;
    lines = START_LINES;
    over = false;
    phase = "walk";
    atHole = null;
    tension = 0;
    toast = "";
    toastT = 0;
    shake = 0;
    holes = [];
    for (let i = 0; i < 9; i++) spawnHole(0, 0);
    ctx.onScore(0);
  }

  reset();

  // ---- attract mode -------------------------------------------------
  let auto = false;
  const autoBrain = (dt: number) => {
    if (phase === "walk" || phase === "drop" || phase === "landed") {
      let best: Hole | null = null;
      let bestD = Infinity;
      for (const h of holes) {
        if (!h.live) continue;
        const d = (h.x - nicX) ** 2 + (h.z - nicZ) ** 2;
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
      if (best && phase === "walk") {
        const dx = best.x - nicX;
        const dz = best.z - nicZ;
        const len = Math.hypot(dx, dz) || 1;
        // ease off on the approach so he settles onto the hole instead of orbiting it
        const gain = len < 3 ? 0 : clamp(len / 6, 0.25, 1);
        stickX = (dx / len) * gain;
        stickZ = (dz / len) * gain;
      } else {
        stickX = stickZ = 0;
      }
    }
    if (phase === "bite" && biteWindow < 1.05) setHook();
    if (phase === "fight") {
      // the demo plays it the way the hint tells you to
      cranking = !running && tension < 0.72;
    }
    void dt;
  };

  // ---- frame --------------------------------------------------------
  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (auto) autoBrain(dt);

    // ---------- simulate ----------
    const simulate = () => {
      if (phase === "fight") {
        stickX = stickZ = 0;
        runT -= dt;
        if (runT <= 0) {
          running = !running;
          runT = running ? rand(0.7, 1.5) : rand(1.1, 2.4);
          if (running) ctx.haptic("light");
        }
        const str = fish.fight;
        if (cranking) {
          dist -= (running ? 8 : 26) * dt * (1.35 - str * 0.35);
          // cranking into a run is what snaps line — the calm window is nearly free
          tension += (running ? 0.95 : 0.3) * str * dt;
          crankTick += dt;
          if (crankTick > 0.22) {
            crankTick = 0;
            ctx.haptic("light");
          }
        } else {
          dist += (running ? 6.5 : 1.5) * dt * str;
          tension -= 0.8 * dt;
        }
        tension = clamp(tension, 0, 1.4);
        dist = clamp(dist, 0, 120);
        if (tension >= 1) snap();
        else if (dist <= 0) land();
      } else if (phase === "drop") {
        dropT -= dt;
        if (dropT <= 0) startBite();
      } else if (phase === "bite") {
        biteWindow -= dt;
        if (biteWindow <= 0) missBite();
      } else if (phase === "landed") {
        landedT -= dt;
        if (landedT <= 0) {
          phase = "walk";
          atHole = null;
        }
      }

      // The fight above can end the run mid-frame. Stop here when it does, or
      // the last snap would drop a fresh line on the very frame it went out.
      if (over) return;

      const canWalk = phase === "walk" || phase === "drop" || phase === "bite";
      const ax = canWalk ? stickX : 0;
      const az = canWalk ? stickZ : 0;
      const SPEED = 9.5;
      nicVX += (ax * SPEED - nicVX) * Math.min(1, dt * 7);
      nicVZ += (az * SPEED - nicVZ) * Math.min(1, dt * 7);
      nicX += nicVX * dt;
      nicZ += nicVZ * dt;
      const rad = Math.hypot(nicX, nicZ);
      if (rad > LAKE) {
        nicX = (nicX / rad) * LAKE;
        nicZ = (nicZ / rad) * LAKE;
        nicVX *= 0.2;
        nicVZ *= 0.2;
      }
      const moving = Math.hypot(nicVX, nicVZ);
      if (moving > 0.4) bob += dt * moving * 1.6;

      // once the line is down he settles onto the rim, just behind the hole
      if (atHole && phase !== "walk" && !stickX && !stickZ) {
        const k = Math.min(1, dt * 2.5);
        nicX += (atHole.x - nicX) * k;
        nicZ += (atHole.z + 1 - nicZ) * k;
      }

      // walking off a hole abandons the drop
      if ((phase === "drop" || phase === "bite") && atHole) {
        if ((atHole.x - nicX) ** 2 + (atHole.z - nicZ) ** 2 > 12) {
          phase = "walk";
          atHole = null;
        }
      }
      // standing on a live hole drops the line by itself
      if (phase === "walk" && moving < 3.2) {
        for (const h of holes) {
          if (!h.live) continue;
          if ((h.x - nicX) ** 2 + (h.z - nicZ) ** 2 < 7) {
            dropLine(h);
            break;
          }
        }
      }
    };
    if (!over) simulate();

    // camera lag — it follows Nic like a drone on a string
    camX += (nicX - camX) * Math.min(1, dt * 3.4);
    camZ += (nicZ - CAM_BACK - camZ) * Math.min(1, dt * 3.4);
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 2.4);
      camX += Math.sin(bob * 90) * shake * 0.12;
    }
    for (const h of holes) h.phase += dt;
    if (toastT > 0) toastT -= dt;

    // ---------- draw ----------
    // sky: dusk, orange on the deck, night overhead
    const sky = g.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, shade(pal.deep, -0.25));
    sky.addColorStop(0.55, shade(pal.deep, 0.3));
    sky.addColorStop(1, pal.prize);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, Math.max(0, HORIZON));

    // stars, deterministic so they hold still
    g.fillStyle = LIT;
    g.globalAlpha = 0.5;
    for (let i = 0; i < 46; i++) {
      const sx = (((i * 733) % 1000) / 1000) * W;
      const sy = (((i * 419) % 1000) / 1000) * HORIZON * 0.72;
      g.fillRect(sx, sy, 1.6, 1.6);
    }
    g.globalAlpha = 1;

    // the low sun, parked on the far shore
    const sunP = project(-70, 3, 130);
    if (sunP.z > 0) {
      const halo = g.createRadialGradient(sunP.x, sunP.y, 0, sunP.x, sunP.y, H * 0.22);
      halo.addColorStop(0, pal.prize);
      halo.addColorStop(0.25, `${shade(pal.prize, -0.1)}66`);
      halo.addColorStop(1, `${pal.prize}00`);
      g.fillStyle = halo;
      g.fillRect(sunP.x - H * 0.22, sunP.y - H * 0.22, H * 0.44, H * 0.44);
    }

    // the ice sheet
    const ice = g.createLinearGradient(0, HORIZON, 0, H);
    ice.addColorStop(0, shade(pal.glow, -0.42));
    ice.addColorStop(0.35, shade(pal.deep, 0.34));
    ice.addColorStop(1, shade(pal.deep, 0.06));
    g.fillStyle = ice;
    g.fillRect(0, Math.max(0, HORIZON), W, H - Math.max(0, HORIZON));

    // wind-scoured drift lines, drawn in world space so they slide correctly
    g.strokeStyle = LIT;
    g.globalAlpha = 0.05;
    g.lineWidth = 1.5;
    const z0 = Math.floor(camZ / 9) * 9;
    for (let i = 0; i < 14; i++) {
      const wz = z0 + i * 9;
      const a = project(camX - 90, 0, wz);
      const b = project(camX + 90, 0, wz);
      if (a.z < 0.5 || b.z < 0.5) continue;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    g.globalAlpha = 1;

    // ---------- depth-sorted scene ----------
    interface Item {
      z: number;
      draw: () => void;
    }
    const items: Item[] = [];

    for (const tr of trees) {
      const base = project(tr.x, 0, tr.z);
      if (base.z < 1) continue;
      if (base.x < -80 || base.x > W + 80) continue;
      const apex = project(tr.x, tr.h, tr.z);
      const l = project(tr.x - tr.r, 0, tr.z);
      const r = project(tr.x + tr.r, 0, tr.z);
      items.push({
        z: base.z,
        draw: () => {
          g.fillStyle = shade(pal.deep, -0.35);
          g.beginPath();
          g.moveTo(l.x, l.y);
          g.lineTo(apex.x, apex.y);
          g.lineTo(r.x, r.y);
          g.closePath();
          g.fill();
        },
      });
    }

    {
      const s = project(SHACK.x, 0, SHACK.z);
      if (s.z > 1) {
        items.push({
          z: s.z,
          draw: () => {
            box3(SHACK.x, 0, SHACK.z, 4.4, 3.2, 4, shade(pal.deep, -0.1));
            // pitched roof
            const ax = SHACK.x;
            const ay = 4.6;
            const pts = [
              project(ax - 2.6, 3.2, SHACK.z - 2.4),
              project(ax + 2.6, 3.2, SHACK.z - 2.4),
              project(ax, ay, SHACK.z),
              project(ax - 2.6, 3.2, SHACK.z + 2.4),
            ];
            if (pts.every((p) => p.z > 0.5)) {
              g.fillStyle = shade(pal.deep, 0.05);
              g.beginPath();
              g.moveTo(pts[0].x, pts[0].y);
              g.lineTo(pts[1].x, pts[1].y);
              g.lineTo(pts[2].x, pts[2].y);
              g.closePath();
              g.fill();
              g.fillStyle = shade(pal.deep, -0.3);
              g.beginPath();
              g.moveTo(pts[0].x, pts[0].y);
              g.lineTo(pts[2].x, pts[2].y);
              g.lineTo(pts[3].x, pts[3].y);
              g.closePath();
              g.fill();
            }
            // Nic left the light on
            const w0 = project(SHACK.x - 0.7, 1.2, SHACK.z - 2.02);
            const w1 = project(SHACK.x + 0.7, 2.3, SHACK.z - 2.02);
            if (w0.z > 0.5) {
              g.fillStyle = pal.prize;
              g.fillRect(
                Math.min(w0.x, w1.x),
                Math.min(w0.y, w1.y),
                Math.abs(w1.x - w0.x),
                Math.abs(w1.y - w0.y)
              );
            }
          },
        });
      }
    }

    for (const h of holes) {
      const e = holeEllipse(h.x, h.z, h.r);
      if (!e) continue;
      const isMine = atHole === h;
      if (h.live) {
        // the halo is light lying on the ice, so it always passes under Nic
        items.push({
          z: e.z + 3,
          draw: () => {
            const pulse = 0.55 + Math.sin(h.phase * 2.2) * 0.2;
            const gr = g.createRadialGradient(e.cx, e.cy, 0, e.cx, e.cy, e.rx * 2.2);
            gr.addColorStop(0, `${pal.glow}cc`);
            gr.addColorStop(1, `${pal.glow}00`);
            g.save();
            g.globalAlpha = pulse;
            g.fillStyle = gr;
            g.beginPath();
            g.ellipse(e.cx, e.cy, e.rx * 2.2, e.ry * 2.2, 0, 0, Math.PI * 2);
            g.fill();
            g.restore();
          },
        });
      }
      items.push({
        z: e.z,
        draw: () => {
          // the cut itself
          g.fillStyle = h.live ? shade(pal.deep, -0.5) : shade(pal.deep, -0.15);
          g.beginPath();
          g.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = h.live ? pal.glow : LIT_DIM;
          g.lineWidth = 2;
          g.stroke();

          // the fish coming up under the ice
          if (isMine && phase === "fight") {
            const near = clamp(1 - dist / 100, 0, 1);
            g.save();
            g.globalAlpha = 0.45 + near * 0.55;
            g.fillStyle = running ? pal.foe : shade(pal.glow, -0.05);
            g.beginPath();
            g.ellipse(
              e.cx,
              e.cy,
              e.rx * (0.2 + near * 0.62),
              e.ry * (0.2 + near * 0.62),
              0,
              0,
              Math.PI * 2
            );
            g.fill();
            g.restore();
          }
        },
      });
    }

    {
      const p = project(nicX, 0, nicZ);
      items.push({
        z: p.z,
        draw: () => drawNic(),
      });
    }

    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();

    // ---------- Nic ----------
    function drawNic() {
      const step = Math.sin(bob * 6) * 0.16;
      const crouch = phase === "walk" ? 0 : 0.28;
      const y = -crouch;
      // shadow
      const sh = holeEllipse(nicX, nicZ, 0.75);
      if (sh) {
        g.save();
        g.globalAlpha = 0.28;
        g.fillStyle = shade(pal.deep, -0.6);
        g.beginPath();
        g.ellipse(sh.cx, sh.cy, sh.rx, sh.ry, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // legs
      box3(nicX - 0.22, y, nicZ + step * 0.4, 0.34, 0.85, 0.34, shade(pal.deep, 0.1));
      box3(nicX + 0.22, y, nicZ - step * 0.4, 0.34, 0.85, 0.34, shade(pal.deep, 0.1));
      // jacket
      box3(nicX, y + 0.82, nicZ, 1.05, 1.05, 0.62, pal.hero);
      // arms
      box3(nicX - 0.66, y + 0.9, nicZ, 0.28, 0.9, 0.3, shade(pal.hero, -0.22));
      box3(nicX + 0.66, y + 0.9, nicZ, 0.28, 0.9, 0.3, shade(pal.hero, -0.22));
      // head + toque
      box3(nicX, y + 1.86, nicZ, 0.62, 0.55, 0.55, shade(pal.hero, 0.42));
      box3(nicX, y + 2.36, nicZ, 0.68, 0.3, 0.6, pal.foe);
      // headphones, because he's always got them on
      box3(nicX - 0.36, y + 2.02, nicZ, 0.14, 0.28, 0.34, DARK);
      box3(nicX + 0.36, y + 2.02, nicZ, 0.14, 0.28, 0.34, DARK);

      // rod + line
      if (atHole && (phase === "drop" || phase === "bite" || phase === "fight")) {
        // the rod points at whatever he's fishing, not at whatever he walked in facing
        const dirX = atHole.x >= nicX ? 1 : -1;
        const tipX = nicX + dirX * 0.9;
        const tip = project(tipX, y + 1.6, nicZ - 0.5);
        const hole = project(atHole.x, 0, atHole.z);
        if (tip.z > 0.5 && hole.z > 0.5) {
          g.strokeStyle = DARK;
          g.lineWidth = 2.4;
          g.beginPath();
          g.moveTo(project(nicX, y + 1.0, nicZ).x, project(nicX, y + 1.0, nicZ).y);
          g.lineTo(tip.x, tip.y);
          g.stroke();
          // the line bows when something is on it
          const bowT = phase === "fight" ? tension : 0;
          g.strokeStyle = phase === "fight" && running ? pal.foe : LIT_DIM;
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(tip.x, tip.y);
          g.quadraticCurveTo(
            (tip.x + hole.x) / 2 + dirX * bowT * 26,
            (tip.y + hole.y) / 2,
            hole.x,
            hole.y
          );
          g.stroke();
        }
      }
    }

    // ---------- snow ----------
    g.fillStyle = LIT;
    for (const s of snow) {
      s.y -= dt * 1.4;
      s.x += Math.sin(s.y * 0.4) * dt * 0.6;
      if (s.y < 0) {
        s.y = 14;
        s.x = camX + rand(-26, 26);
        s.z = camZ + rand(2, 46);
      }
      const p = project(s.x, s.y, s.z);
      if (p.z < 0.6) continue;
      const r = clamp(FOCAL / p.z / 34, 0.6, 2.6);
      g.globalAlpha = clamp(1 - p.z / 46, 0.05, 0.5);
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // ---------- HUD ----------
    // remaining line spools, top-left
    for (let i = 0; i < START_LINES; i++) {
      g.beginPath();
      g.arc(20 + i * 20, H * 0.08, 6, 0, Math.PI * 2);
      g.lineWidth = 2;
      g.strokeStyle = i < lines ? pal.hero : LIT_DIM;
      g.stroke();
      if (i < lines) {
        g.fillStyle = pal.hero;
        g.fill();
      }
    }

    g.textAlign = "center";

    if (phase === "bite" && !over) {
      const k = 1 + Math.sin(biteWindow * 30) * 0.12;
      g.save();
      g.translate(W / 2, H * 0.3);
      g.scale(k, k);
      g.fillStyle = pal.foe;
      g.font = `800 44px ${t.fontDisplay}`;
      g.fillText("!", 0, 0);
      g.restore();
      g.fillStyle = LIT;
      g.font = `700 16px ${t.fontBody}`;
      g.fillText("TAP TO SET THE HOOK", W / 2, H * 0.36);
    }

    if (phase === "fight" && !over) {
      // up top, clear of the hole Nic is standing over
      const bw = Math.min(W * 0.72, 300);
      const bx = W / 2 - bw / 2;
      const by = H * 0.19;

      // tension
      g.fillStyle = `${LIT_DIM}44`;
      g.fillRect(bx, by, bw, 10);
      g.fillStyle = tension > 0.75 ? pal.foe : tension > 0.5 ? pal.prize : pal.glow;
      g.fillRect(bx, by, bw * clamp(tension, 0, 1), 10);
      g.fillStyle = pal.foe;
      g.fillRect(bx + bw * 0.88, by - 3, 2, 16);

      // line still out
      g.fillStyle = `${LIT_DIM}44`;
      g.fillRect(bx, by + 20, bw, 6);
      g.fillStyle = pal.hero;
      g.fillRect(bx, by + 20, bw * clamp(1 - dist / 100, 0, 1), 6);

      g.fillStyle = LIT;
      g.font = `800 15px ${t.fontDisplay}`;
      g.fillText(`${fish.name} · ${fishLb.toFixed(1)} lb`, W / 2, by - 12);

      g.font = `700 15px ${t.fontBody}`;
      if (running) {
        g.fillStyle = pal.foe;
        g.fillText("IT'S RUNNING — LET GO", W / 2, by + 50);
      } else {
        g.fillStyle = LIT_DIM;
        g.fillText("HOLD TO CRANK", W / 2, by + 50);
      }
    }

    if (!over && phase === "walk") {
      g.fillStyle = LIT_DIM;
      g.font = `500 13px ${t.fontBody}`;
      g.fillText("drag to walk · stand on a glowing hole", W / 2, H * 0.93);
    }
    if (!over && phase === "drop") {
      g.fillStyle = LIT_DIM;
      g.font = `500 13px ${t.fontBody}`;
      g.fillText("line's down · wait for it", W / 2, H * 0.93);
    }

    if (toastT > 0 && !over) {
      g.globalAlpha = clamp(toastT / 0.5, 0, 1);
      g.fillStyle = LIT;
      g.font = `800 17px ${t.fontDisplay}`;
      g.fillText(toast, W / 2, H * 0.44);
      g.globalAlpha = 1;
    }

    if (over) endCard(g, t, W, H, "OUT OF LINE");

    g.textAlign = "left";
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      held = false;
      cranking = false;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
