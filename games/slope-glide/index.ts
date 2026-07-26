import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "slope-glide",
  title: "Nic's Slope Glide",
  rule: "Hold to pump downhills. Catch air off crests.",
  year: 2011,
  description: "Pump the hills, catch big air, don't eat the uphill.",
  history:
    "Homage to the 2011 rolling-hills touch game that turned one hold-and-release gesture into an endless physics joyride across procedurally rolling terrain.",
  tags: ["hold", "endurance", "retro"],
  palette: {
    hero: "#ff8c42",
    foe: "#d7263d",
    prize: "#ffd23f",
    deep: "#1b1b3a",
    glow: "#4ecdc4",
  },
  intensity: 0.5,
  luck: 0.05,
  nostalgia: 0.6,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

// ---- procedural terrain: sum of drifting sines, effectively endless ----
const A1 = 42;
const F1 = 0.0055;
const A2 = 20;
const F2 = 0.016;
const DRIFT_F = 0.00035;

function terrainHeight(x: number): number {
  const drift = Math.sin(x * DRIFT_F) * 1.4;
  return A1 * Math.sin(x * F1 + drift) + A2 * Math.sin(x * F2 - drift * 0.7);
}

function terrainSlope(x: number): number {
  const d = 3;
  return (terrainHeight(x + d) - terrainHeight(x - d)) / (2 * d);
}

const GRAVITY = 340; // world-height units/s^2 (downward pull on vy)
const GRAVITY_SLOPE = 60; // natural accel/decel from slope while grounded
const DOWNHILL_BOOST = 130; // extra pump while holding on a downhill
const MAX_VX = 320;
const MIN_VX = 30;
const LAUNCH_MULT = 0.5;
const STEEP_UPHILL = 0.62;
const SLOW_THRESHOLD = 70;
const BALL_R = 10;
const PLAYER_SCREEN_X_FRAC = 0.32;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const baseY = H * 0.72;
  const playerScreenX = W * PLAYER_SCREEN_X_FRAC;

  let worldX = 0;
  let vx = 150;
  let vy = 0;
  let playerHeight = 0;
  let airborne = false;
  let airTime = 0;
  let rollAngle = 0;
  let score = 0;
  let over = false;
  let held = false;
  let bonusFlash = 0;
  let bonusText = "";

  const reset = () => {
    worldX = 0;
    vx = 150;
    vy = 0;
    playerHeight = terrainHeight(0);
    airborne = false;
    airTime = 0;
    rollAngle = 0;
    score = 0;
    over = false;
    held = false;
    bonusFlash = 0;
    ctx.onScore(0);
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    held = true;
  };
  const onUp = () => {
    held = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);
  ctx.canvas.addEventListener("pointerleave", onUp);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    bonusFlash = Math.max(0, bonusFlash - dt);

    if (!over) {
      const isHeld = auto ? terrainSlope(worldX) < 0 : held;

      if (!airborne) {
        const s = terrainSlope(worldX);
        // natural momentum: slopes accelerate downhill, sap speed uphill
        vx += -s * GRAVITY_SLOPE * dt;
        if (isHeld && s < 0) vx += DOWNHILL_BOOST * -s * dt;
        vx = clamp(vx, MIN_VX, MAX_VX);

        // crest detection: was descending, ground curves away into a climb ahead
        const lookAhead = clamp(vx * 0.12, 10, 60);
        const slopeAhead = terrainSlope(worldX + lookAhead);
        if (s < -0.12 && slopeAhead > 0.16 && vx > 120) {
          airborne = true;
          airTime = 0;
          vy = vx * LAUNCH_MULT * Math.min(1, -s + 0.3);
          ctx.haptic("light");
        } else {
          // steep uphill wall while too slow: crash
          if (slopeAhead > STEEP_UPHILL && vx < SLOW_THRESHOLD) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(Math.floor(score));
          }
          worldX += vx * dt;
          playerHeight = terrainHeight(worldX);
          rollAngle = Math.atan2(-slopeAhead * 40, 40);
        }
      } else {
        airTime += dt;
        vy -= GRAVITY * dt;
        worldX += vx * dt;
        playerHeight += vy * dt;
        rollAngle += dt * 9 * (vx > 0 ? 1 : -1);
        const groundY = terrainHeight(worldX);
        if (playerHeight <= groundY) {
          playerHeight = groundY;
          airborne = false;
          vy = 0;
          if (airTime > 0.18) {
            const bonus = Math.round(airTime * 40);
            score += bonus;
            bonusText = `+${bonus} AIR`;
            bonusFlash = 0.9;
            ctx.haptic("hit");
          }
        }
      }

      if (!over) {
        score += vx * dt * 0.02;
        ctx.onScore(Math.floor(score));
      }
    }

    // ---- draw sky ----
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.25));
    sky.addColorStop(1, shade(pal.deep, -0.4));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // Far ridge, drawn tall and slow: the sky used to be a third of the phone
    // with nothing in it, and on a full-bleed card that reads as dead screen.
    g.fillStyle = shade(pal.deep, 0.06);
    g.beginPath();
    g.moveTo(0, H);
    const far = worldX * 0.12;
    for (let sx = 0; sx <= W; sx += 20) {
      const wx = far + (sx - playerScreenX) * 0.3;
      g.lineTo(sx, baseY - terrainHeight(wx) * 2.2 - H * 0.42);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();

    // distant silhouette layer (parallax)
    g.fillStyle = shade(pal.deep, -0.15);
    g.beginPath();
    g.moveTo(0, H);
    const parallax = worldX * 0.35;
    for (let sx = 0; sx <= W; sx += 16) {
      const wx = parallax + (sx - playerScreenX) * 0.6;
      const hgt = terrainHeight(wx) * 0.5;
      g.lineTo(sx, baseY - hgt - H * 0.11);
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();

    // main terrain
    g.beginPath();
    g.moveTo(0, H);
    const step = 5;
    for (let sx = 0; sx <= W + step; sx += step) {
      const wx = worldX + (sx - playerScreenX);
      const hgt = terrainHeight(wx);
      g.lineTo(sx, baseY - hgt);
    }
    g.lineTo(W, H);
    g.closePath();
    const groundGrad = g.createLinearGradient(0, baseY - 60, 0, H);
    groundGrad.addColorStop(0, shade(pal.glow, -0.1));
    groundGrad.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = groundGrad;
    g.fill();

    // player (sled/ball)
    const py = baseY - playerHeight - BALL_R;
    g.save();
    g.translate(playerScreenX, py);
    g.rotate(rollAngle);
    g.beginPath();
    g.arc(0, 0, BALL_R, 0, Math.PI * 2);
    g.fillStyle = over ? pal.foe : pal.hero;
    g.fill();
    g.strokeStyle = shade(pal.hero, -0.4);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-BALL_R * 0.6, 0);
    g.lineTo(BALL_R * 0.6, 0);
    g.stroke();
    g.restore();

    if (airborne) {
      g.fillStyle = pal.glow;
      g.font = `700 13px ${t.fontBody}`;
      g.textAlign = "center";
      g.fillText("AIR", playerScreenX, py - BALL_R - 10);
      g.textAlign = "left";
    }
    if (bonusFlash > 0) {
      g.globalAlpha = clamp(bonusFlash / 0.9, 0, 1);
      g.fillStyle = pal.prize;
      g.font = `800 16px ${t.fontDisplay}`;
      g.textAlign = "center";
      g.fillText(bonusText, playerScreenX, py - BALL_R - 24);
      g.textAlign = "left";
      g.globalAlpha = 1;
    }

    if (over) endCard(g, t, W, H, "WIPED OUT");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
      ctx.canvas.removeEventListener("pointerleave", onUp);
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
