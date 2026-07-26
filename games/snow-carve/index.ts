import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "snow-carve",
  title: "Nic's Snow Carve",
  rule: "Hold to lean in, let go to line up jumps",
  year: 2015,
  description: "Lean into the mountain, catch air, chain the spins forever.",
  history:
    "Homage to the 2015 one-thumb downhill runners that turned holding your finger down into a whole language of carving, jumping and crashing.",
  tags: ["hold", "reflex", "endurance"],
  palette: {
    hero: "#ef476f",
    foe: "#118ab2",
    prize: "#06d6a0",
    deep: "#073b4c",
    glow: "#ffc6ff",
  },
  intensity: 0.6,
  luck: 0.1,
  nostalgia: 0.4,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

interface Marker {
  x: number;
  side: -1 | 0 | 1;
  taken: boolean;
}

const CARVE_FREQ = 0.0035;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const carveAmplitude = W * 0.3;
  const playerScreenY = H * 0.62;

  let distance = 0;
  let lean = 0;
  let score = 0;
  let lastScore = -1;
  let over = false;

  let airborne = false;
  let airT = 0;
  let airDuration = 0.6;
  let spinCounter = 0;
  let trickMult = 1;

  let rocks: Marker[] = [];
  let nextRockX = 320;
  let moguls: Marker[] = [];
  let nextMogulX = 420;

  const playerX = (d: number, ln: number) =>
    W / 2 + Math.sin(d * CARVE_FREQ) * carveAmplitude * (0.3 + ln * 0.7);

  const reset = () => {
    distance = 0;
    lean = 0;
    score = 0;
    lastScore = -1;
    over = false;
    airborne = false;
    airT = 0;
    spinCounter = 0;
    trickMult = 1;
    rocks = [];
    nextRockX = 320;
    moguls = [];
    nextMogulX = 420;
    ctx.onScore(0);
  };

  let pointerDown = false;
  let auto = false;

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    pointerDown = true;
    ctx.haptic("light");
  };
  const onUp = () => {
    pointerDown = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      let held = pointerDown;
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          held = Math.random() < 0.6;
          autoCd = rand(0.4, 0.9);
        } else {
          held = pointerDown;
        }
      }
      const leanTarget = held ? 1 : 0;
      lean += (leanTarget - lean) * clamp(dt * 3.2, 0, 1);

      const speed = 150 + lean * 130;
      distance += speed * dt;

      while (nextRockX < distance + W * 1.5) {
        const side = Math.random() < 0.5 ? -1 : 1;
        rocks.push({ x: nextRockX, side, taken: false });
        nextRockX += rand(260, 420);
      }
      while (nextMogulX < distance + W * 1.5) {
        moguls.push({ x: nextMogulX, side: 0, taken: false });
        nextMogulX += rand(380, 600);
      }
      if (rocks.length > 30) rocks = rocks.filter((r) => r.x > distance - 400);
      if (moguls.length > 20) moguls = moguls.filter((m) => m.x > distance - 400);

      if (airborne) {
        airT += dt;
        spinCounter += dt * 3.4;
        if (airT >= airDuration) {
          airborne = false;
          const spins = Math.max(0, Math.floor(spinCounter));
          trickMult = clamp(trickMult + spins * 0.55, 1, 6);
          spinCounter = 0;
          if (lean > 0.8 && Math.random() < 0.12 * lean) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(Math.floor(score));
          }
        }
      } else {
        trickMult += (1 - trickMult) * dt * 0.12;

        for (const m of moguls) {
          if (!m.taken && Math.abs(m.x - distance) < 16) {
            m.taken = true;
            airborne = true;
            airT = 0;
            airDuration = 0.55 + lean * 0.35;
            ctx.haptic("light");
          }
        }

        if (!over) {
          const px = playerX(distance, lean);
          for (const r of rocks) {
            if (r.taken) continue;
            if (Math.abs(r.x - distance) < 16) {
              const rockX = W / 2 + r.side * W * 0.22;
              if (Math.abs(rockX - px) < 28) {
                r.taken = true;
                over = true;
                ctx.haptic("fail");
                ctx.onRunEnd(Math.floor(score));
              }
            }
          }
        }
      }

      if (!over) {
        score += (90 + lean * 70) * trickMult * dt;
        const rounded = Math.floor(score);
        if (rounded !== lastScore) {
          lastScore = rounded;
          ctx.onScore(rounded);
        }
      }
    }

    // slope background with subtle scrolling drift lines
    g.fillStyle = shade(pal.deep, 0.05);
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,.06)";
    g.lineWidth = 2;
    const driftSpacing = 46;
    const offset = distance * 0.4 % driftSpacing;
    for (let i = -1; i * driftSpacing - offset < H; i++) {
      const yy = i * driftSpacing - offset;
      g.beginPath();
      g.moveTo(0, yy);
      g.lineTo(W, yy + 18);
      g.stroke();
    }

    // rocks
    for (const r of rocks) {
      const relX = r.x - distance;
      const sy = playerScreenY - relX * 0.6;
      if (sy < -20 || sy > H + 20 || r.taken) continue;
      const sx = W / 2 + r.side * W * 0.22;
      g.fillStyle = shade(pal.foe, -0.1);
      g.beginPath();
      g.arc(sx, sy, 13, 0, Math.PI * 2);
      g.fill();
    }

    // moguls (jump ramps)
    for (const m of moguls) {
      const relX = m.x - distance;
      const sy = playerScreenY - relX * 0.6;
      if (sy < -20 || sy > H + 20 || m.taken) continue;
      g.fillStyle = pal.glow;
      g.beginPath();
      g.moveTo(W / 2 - 26, sy + 10);
      g.lineTo(W / 2, sy - 12);
      g.lineTo(W / 2 + 26, sy + 10);
      g.closePath();
      g.fill();
    }

    // player
    const px = playerX(distance, lean);
    const hop = airborne ? Math.sin(clamp(airT / airDuration, 0, 1) * Math.PI) * 40 : 0;
    const py = playerScreenY - hop;
    g.save();
    g.translate(px, py);
    if (airborne) g.rotate(spinCounter * Math.PI * 2);
    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(0, 0, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(pal.hero, -0.3);
    g.fillRect(-18, 8, 36, 6);
    g.restore();

    // speed / lean meter
    const mw = W * 0.4;
    g.fillStyle = t.surface;
    g.fillRect(W / 2 - mw / 2, H - 20, mw, 8);
    g.fillStyle = pal.prize;
    g.fillRect(W / 2 - mw / 2, H - 20, mw * lean, 8);

    if (over) endCard(g, t, W, H, "WIPED OUT");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
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
