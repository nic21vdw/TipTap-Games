import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "glass-break",
  title: "Nic's Glass Break",
  rule: "Aim your lane. Tap to shatter the wave.",
  year: 2014,
  description: "Tunnel vision. Shatter every pane before it hits you.",
  history:
    "Homage to the 2014 wave of tap-timing tunnel runners — endless forward motion with nothing but a single tap standing between you and the next wall.",
  tags: ["reflex", "chaos", "precision"],
  palette: {
    hero: "#4ee1ff",
    foe: "#ff2e63",
    prize: "#ffe066",
    deep: "#05010d",
    glow: "#7b2ff7",
  },
  intensity: 0.75,
  luck: 0.2,
  nostalgia: 0.4,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

const LANES = 5;
const START_LIVES = 3;

interface Panel {
  lane: number;
  alive: boolean;
}
interface Wave {
  z: number; // 1 far -> 0 at player
  panels: Panel[];
  arrived: boolean;
}
interface Shot {
  lane: number;
  z: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const vanishX = W / 2;
  const vanishY = H * 0.16;
  const nearY = H * 0.86;

  const laneX = (lane: number) => ((lane + 0.5) / LANES) * W;

  let playerX = W / 2;
  let waves: Wave[] = [];
  let shots: Shot[] = [];
  let waveSpeed = 0.16; // z units per second
  let spawnCd = 1.6;
  let lives = START_LIVES;
  let score = 0;
  let over = false;
  let flash = 0;
  let tPulse = 0;

  const nearestLane = (x: number) =>
    clamp(Math.round((x / W) * LANES - 0.5), 0, LANES - 1);

  const spawnWave = () => {
    const count = 2 + Math.floor(Math.random() * (LANES - 1));
    const lanesSet = new Set<number>();
    while (lanesSet.size < count) lanesSet.add(Math.floor(Math.random() * LANES));
    waves.push({
      z: 1,
      panels: Array.from(lanesSet).map((lane) => ({ lane, alive: true })),
      arrived: false,
    });
  };

  const reset = () => {
    waves = [];
    shots = [];
    waveSpeed = 0.16;
    spawnCd = 1.2;
    lives = START_LIVES;
    score = 0;
    over = false;
    playerX = W / 2;
    ctx.onScore(0);
  };

  const fire = () => {
    shots.push({ lane: nearestLane(playerX), z: 0 });
    ctx.haptic("light");
  };

  const onMove = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    playerX = clamp(e.clientX - r.left, 0, W);
  };
  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    onMove(e);
    fire();
  };
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0.3;

  // z: 0 = at the player (near, large), 1 = at the vanishing point (far, small)
  const projected = (z: number, lane: number) => {
    const k = clamp(z, 0, 1);
    const x = laneX(lane) + (vanishX - laneX(lane)) * k;
    const y = nearY + (vanishY - nearY) * k;
    const size = (W / LANES) * (1 - 0.85 * k);
    return { x, y, size };
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    tPulse += dt;
    flash = Math.max(0, flash - dt);

    if (!over) {
      if (auto) {
        autoCd -= dt;
        // aim toward the nearest lane with an alive, incoming panel
        let target: Panel | null = null;
        let bestZ = Infinity;
        for (const w of waves) {
          for (const p of w.panels) {
            if (p.alive && w.z < bestZ) {
              bestZ = w.z;
              target = p;
            }
          }
        }
        if (target) playerX = laneX(target.lane);
        if (autoCd <= 0) {
          fire();
          autoCd = 0.35;
        }
      }

      spawnCd -= dt;
      if (spawnCd <= 0) {
        spawnWave();
        spawnCd = Math.max(0.7, 1.6 - score * 0.002);
      }

      for (const w of waves) {
        w.z -= waveSpeed * dt;
        if (w.z <= 0 && !w.arrived) {
          w.arrived = true;
          const unbroken = w.panels.filter((p) => p.alive).length;
          if (unbroken > 0) {
            lives -= 1;
            flash = 0.3;
            ctx.haptic("fail");
            if (lives <= 0) {
              over = true;
              ctx.onRunEnd(score);
            }
          } else {
            score += 15;
            ctx.onScore(score);
          }
        }
      }
      waves = waves.filter((w) => w.z > -0.15);

      for (const s of shots) s.z += dt * 1.6;
      for (const s of shots) {
        for (const w of waves) {
          if (Math.abs(w.z - s.z) < 0.05) {
            const panel = w.panels.find((p) => p.alive && p.lane === s.lane);
            if (panel) {
              panel.alive = false;
              s.z = 999; // consume shot
              score += 10;
              ctx.onScore(score);
              ctx.haptic("hit");
            }
          }
        }
      }
      shots = shots.filter((s) => s.z < 1.05);

      waveSpeed = Math.min(0.42, 0.16 + score * 0.0006);
    }

    // background tunnel
    g.fillStyle = shade(pal.deep, 0.05);
    g.fillRect(0, 0, W, H);
    g.strokeStyle = shade(pal.glow, -0.1);
    g.lineWidth = 1.5;
    const rings = 6;
    for (let i = 0; i < rings; i++) {
      const k = ((i / rings + tPulse * 0.08) % 1);
      const y = vanishY + (nearY - vanishY) * k;
      const hw = (W * 0.5) * (0.08 + 0.92 * k);
      g.globalAlpha = 0.5 * (1 - k * 0.6);
      g.strokeRect(vanishX - hw, y - hw * 0.22, hw * 2, hw * 0.44);
      g.globalAlpha = 1;
    }
    // lane guide rails
    g.strokeStyle = "rgba(255,255,255,.06)";
    for (let i = 0; i <= LANES; i++) {
      g.beginPath();
      g.moveTo(vanishX + (((i / LANES) * W - vanishX) * 0.06), vanishY);
      g.lineTo((i / LANES) * W, nearY);
      g.stroke();
    }

    if (flash > 0) {
      g.fillStyle = `rgba(255,46,99,${flash * 0.35})`;
      g.fillRect(0, 0, W, H);
    }

    // panels, far to near
    const sortedWaves = [...waves].sort((a, b) => b.z - a.z);
    for (const w of sortedWaves) {
      for (const p of w.panels) {
        if (!p.alive) continue;
        const { x, y, size } = projected(w.z, p.lane);
        g.fillStyle = `rgba(78,225,255,${0.16 + 0.24 * (1 - w.z)})`;
        roundRect(g, x - size / 2, y - size / 2, size, size, size * 0.12);
        g.fill();
        g.strokeStyle = pal.glow;
        g.lineWidth = 2;
        roundRect(g, x - size / 2, y - size / 2, size, size, size * 0.12);
        g.stroke();
        // crack lines for glass feel
        g.strokeStyle = "rgba(255,255,255,.35)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x - size * 0.3, y - size * 0.3);
        g.lineTo(x + size * 0.25, y + size * 0.2);
        g.moveTo(x + size * 0.3, y - size * 0.25);
        g.lineTo(x - size * 0.2, y + size * 0.3);
        g.stroke();
      }
    }

    // shots
    for (const s of shots) {
      const { x, y } = projected(s.z, s.lane);
      g.beginPath();
      g.arc(x, y, 8 - 3 * s.z, 0, Math.PI * 2);
      g.fillStyle = pal.prize;
      g.fill();
    }

    // player
    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(playerX, nearY + 14, 12, 0, Math.PI * 2);
    g.fill();
    roundRect(g, playerX - 16, nearY + 22, 32, 18, 6);
    g.fill();

    // lives HUD
    for (let i = 0; i < START_LIVES; i++) {
      g.beginPath();
      g.arc(W * 0.08 + i * 18, H * 0.06, 5, 0, Math.PI * 2);
      g.fillStyle = i < lives ? pal.foe : "rgba(255,255,255,.15)";
      g.fill();
    }

    if (over) endCard(g, t, W, H, "SHATTERED");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointermove", onMove);
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
