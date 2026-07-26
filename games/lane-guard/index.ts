import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "lane-guard",
  title: "Nic's Lane Guard",
  rule: "Tap a slot to place a defender before foes pass",
  year: 2009,
  description: "Place your defenders. Hold the line. Don't run dry.",
  history:
    "Homage to the 2009 lane-defense wave that turned placing a few units on a strip of grass into a genre unto itself.",
  tags: ["precision", "endurance", "chaos"],
  palette: {
    hero: "#2ec4b6",
    foe: "#9d4edd",
    prize: "#ffbf69",
    deep: "#12263a",
    glow: "#ff9f1c",
  },
  intensity: 0.55,
  luck: 0.15,
  nostalgia: 0.8,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

const SLOTS = 5;
const DEFENDER_DURABILITY = 3;
const METER_COST = 0.32;
const METER_RECHARGE = 0.13;
const MAX_LIVES = 3;

interface Foe {
  x: number;
  speed: number;
  row: number;
  dead: boolean;
}
interface Defender {
  durability: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const slotW = W / SLOTS;
  const laneY = H * 0.52;
  const laneH = 46;

  let defenders: (Defender | null)[] = new Array(SLOTS).fill(null);
  let foes: Foe[] = [];
  let meter = 1;
  let lives = MAX_LIVES;
  let score = 0;
  let over = false;
  let spawnTimer = 0.6;
  let elapsed = 0;
  let hitFlash: { slot: number; t: number }[] = [];
  let breachFlash = 0;

  const reset = () => {
    defenders = new Array(SLOTS).fill(null);
    foes = [];
    meter = 1;
    lives = MAX_LIVES;
    score = 0;
    over = false;
    spawnTimer = 0.6;
    elapsed = 0;
    hitFlash = [];
    breachFlash = 0;
    ctx.onScore(0);
  };
  reset();

  const placeAt = (slot: number): boolean => {
    if (slot < 0 || slot >= SLOTS) return false;
    if (defenders[slot]) return false;
    if (meter < METER_COST) return false;
    defenders[slot] = { durability: DEFENDER_DURABILITY };
    meter -= METER_COST;
    ctx.haptic("light");
    return true;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const slot = clamp(Math.floor(x / slotW), 0, SLOTS - 1);
    placeAt(slot);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;
  let autoCd = 0;

  const autoPlace = (dt: number) => {
    autoCd -= dt;
    if (autoCd > 0) return;
    let target = -1;
    let bestX = Infinity;
    for (const f of foes) {
      if (f.dead) continue;
      const slot = clamp(Math.floor(f.x / slotW), 0, SLOTS - 1);
      if (!defenders[slot] && f.x < bestX && f.x > 0) {
        bestX = f.x;
        target = slot;
      }
    }
    if (target >= 0 && meter >= METER_COST) {
      placeAt(target);
      autoCd = 0.4;
    } else {
      autoCd = 0.2;
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (auto) autoPlace(dt);

      elapsed += dt;
      meter = Math.min(1, meter + METER_RECHARGE * dt);

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const interval = clamp(1.7 - elapsed * 0.012, 0.55, 1.7);
        spawnTimer = interval * rand(0.8, 1.2);
        foes.push({
          x: W + 20,
          speed: rand(55, 150),
          row: Math.random() * 10,
          dead: false,
        });
      }

      for (const f of foes) {
        if (f.dead) continue;
        f.x -= f.speed * dt;
        const slot = Math.floor(f.x / slotW);
        if (slot >= 0 && slot < SLOTS && defenders[slot]) {
          const center = slot * slotW + slotW / 2;
          const tol = Math.max(9, f.speed * dt * 1.6);
          if (Math.abs(f.x - center) < tol) {
            f.dead = true;
            score += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
            const def = defenders[slot]!;
            def.durability -= 1;
            hitFlash.push({ slot, t: 0.25 });
            if (def.durability <= 0) defenders[slot] = null;
          }
        }
        if (!f.dead && f.x < -18) {
          f.dead = true;
          lives -= 1;
          breachFlash = 0.3;
          ctx.haptic("fail");
          if (lives <= 0) {
            over = true;
            ctx.onRunEnd(score);
          }
        }
      }
      foes = foes.filter((f) => !f.dead);
    }

    hitFlash = hitFlash.map((h) => ({ ...h, t: h.t - dt })).filter((h) => h.t > 0);
    breachFlash = Math.max(0, breachFlash - dt);

    // background
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, shade(pal.deep, 0.1));
    bg.addColorStop(1, shade(pal.deep, -0.5));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // lane strip
    g.fillStyle = "rgba(255,255,255,.04)";
    g.fillRect(0, laneY - laneH / 2, W, laneH);
    for (let i = 1; i < SLOTS; i++) {
      g.strokeStyle = "rgba(255,255,255,.08)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(i * slotW, laneY - laneH / 2);
      g.lineTo(i * slotW, laneY + laneH / 2);
      g.stroke();
    }

    // left edge (breach line)
    g.fillStyle = breachFlash > 0 ? pal.foe : "rgba(255,255,255,.12)";
    g.fillRect(0, laneY - laneH / 2 - 6, 4, laneH + 12);

    // defenders
    for (let i = 0; i < SLOTS; i++) {
      const def = defenders[i];
      if (!def) continue;
      const cx = i * slotW + slotW / 2;
      const flash = hitFlash.find((h) => h.slot === i);
      g.fillStyle = flash ? "#ffffff" : pal.hero;
      roundRect(g, cx - 14, laneY - 14, 28, 28, 8);
      g.fill();
      for (let d = 0; d < DEFENDER_DURABILITY; d++) {
        g.fillStyle = d < def.durability ? shade(pal.hero, 0.5) : "rgba(255,255,255,.15)";
        g.fillRect(cx - 12 + d * 8, laneY + 18, 6, 4);
      }
    }

    // foes
    for (const f of foes) {
      const fy = laneY + (f.row % 2 === 0 ? -1 : 1) * Math.min(6, f.row);
      g.fillStyle = pal.foe;
      g.beginPath();
      g.arc(f.x, fy, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(0,0,0,.25)";
      g.beginPath();
      g.arc(f.x + 3, fy - 2, 3, 0, Math.PI * 2);
      g.fill();
    }

    // meter
    const mw = W * 0.5;
    const mx = W / 2 - mw / 2;
    g.fillStyle = t.surface;
    roundRect(g, mx, H * 0.86, mw, 10, 5);
    g.fill();
    g.fillStyle = meter >= METER_COST ? pal.prize : shade(pal.prize, -0.3);
    roundRect(g, mx, H * 0.86, mw * meter, 10, 5);
    g.fill();

    // lives
    for (let i = 0; i < MAX_LIVES; i++) {
      g.fillStyle = i < lives ? pal.glow : "rgba(255,255,255,.15)";
      g.beginPath();
      g.arc(W / 2 - (MAX_LIVES - 1) * 10 + i * 20, H * 0.86 - 18, 6, 0, Math.PI * 2);
      g.fill();
    }

    g.textAlign = "center";
    g.fillStyle = t.ink;
    g.font = `700 15px ${t.fontBody}`;
    g.fillText(`${score}`, W / 2, 30);
    g.textAlign = "left";

    if (over) endCard(g, t, W, H, "OVERRUN");
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
