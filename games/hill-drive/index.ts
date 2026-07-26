import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "hill-drive",
  title: "Nic's Hill Drive",
  rule: "Hold to gas, ease off in the air, don't flip",
  year: 2012,
  description: "Gun it up the hills, ease off for the landing, don't go over.",
  history:
    "Homage to the 2012 physics driving craze that turned tilting hills and ragdoll flips into a one-thumb obsession on every commute.",
  tags: ["hold", "endurance", "precision"],
  palette: {
    hero: "#f4a261",
    foe: "#e63946",
    prize: "#2a9d8f",
    deep: "#1d3557",
    glow: "#e9c46a",
  },
  intensity: 0.55,
  luck: 0.05,
  nostalgia: 0.6,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

interface Pickup {
  x: number;
  taken: boolean;
}

const GRAVITY = 900;
const HOVER = 15;
const FLIP_LIMIT = 2.35; // ~135 degrees from upright

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const heightAt = (x: number): number =>
    H * 0.66 -
    H * 0.16 * Math.sin(x * 0.006) -
    H * 0.08 * Math.sin(x * 0.014 + 1.7) -
    H * 0.04 * Math.sin(x * 0.031 + 3.1);

  const slopeAngleAt = (x: number): number => {
    const eps = 3;
    return Math.atan2(heightAt(x + eps) - heightAt(x - eps), eps * 2);
  };

  const normalizeAngle = (a: number): number => {
    let n = a % (Math.PI * 2);
    if (n > Math.PI) n -= Math.PI * 2;
    if (n < -Math.PI) n += Math.PI * 2;
    return n;
  };

  let distance = 0;
  let speed = 60;
  let y = 0;
  let vy = 0;
  let rot = 0;
  let angVel = 0;
  let fuel = 1;
  let coins = 0;
  let score = 0;
  let lastScore = -1;
  let over = false;
  let overMsg = "GAME OVER";
  let pickups: Pickup[] = [];
  let nextPickupX = 260;

  const reset = () => {
    distance = 0;
    speed = 60;
    y = heightAt(0) - HOVER;
    vy = 0;
    rot = 0;
    angVel = 0;
    fuel = 1;
    coins = 0;
    score = 0;
    lastScore = -1;
    over = false;
    overMsg = "GAME OVER";
    pickups = [];
    nextPickupX = 260;
    ctx.onScore(0);
  };

  let gasHeld = false;
  let auto = false;

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    gasHeld = true;
    ctx.haptic("light");
  };
  const onUp = () => {
    gasHeld = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    const gas = auto ? true : gasHeld;

    if (!over) {
      if (gas) {
        speed += 140 * dt;
        fuel -= 0.05 * dt;
      } else {
        speed -= 70 * dt;
        fuel -= 0.012 * dt;
      }
      speed = clamp(speed, 20, 320);
      distance += speed * dt;

      const groundY = heightAt(distance);
      const grounded = y + HOVER >= groundY;
      if (grounded) {
        y = groundY - HOVER;
        vy = 0;
        const slope = slopeAngleAt(distance);
        rot += (slope - rot) * clamp(dt * 8, 0, 1);
        angVel *= 0.5;
      } else {
        vy += GRAVITY * dt;
        y += vy * dt;
        angVel += (gas ? -2.6 : 1.4) * dt;
        angVel *= 0.995;
        rot += angVel * dt;
      }

      if (Math.abs(normalizeAngle(rot)) > FLIP_LIMIT) {
        over = true;
        overMsg = "FLIPPED";
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      } else if (fuel <= 0) {
        over = true;
        overMsg = "OUT OF FUEL";
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }

      while (nextPickupX < distance + W * 1.5) {
        pickups.push({ x: nextPickupX, taken: false });
        nextPickupX += rand(200, 340);
      }
      for (const p of pickups) {
        if (!p.taken && Math.abs(p.x - distance) < 24) {
          p.taken = true;
          coins += 1;
          fuel = Math.min(1, fuel + 0.18);
          ctx.haptic("hit");
        }
      }
      if (pickups.length > 40) pickups = pickups.filter((p) => p.x > distance - 400);

      score = Math.floor(distance / 8) + coins * 8;
      if (score !== lastScore) {
        lastScore = score;
        ctx.onScore(score);
      }
    }

    const cameraX = distance - W * 0.32;
    const vehicleScreenX = W * 0.32;

    // sky
    g.fillStyle = shade(pal.deep, -0.1);
    g.fillRect(0, 0, W, H);

    // terrain
    g.beginPath();
    g.moveTo(0, heightAt(cameraX));
    for (let sx = 0; sx <= W; sx += 6) {
      g.lineTo(sx, heightAt(cameraX + sx));
    }
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.closePath();
    const grad = g.createLinearGradient(0, H * 0.4, 0, H);
    grad.addColorStop(0, shade(pal.deep, 0.05));
    grad.addColorStop(1, shade(pal.deep, -0.45));
    g.fillStyle = grad;
    g.fill();

    // pickups
    for (const p of pickups) {
      if (p.taken) continue;
      const sx = p.x - cameraX;
      if (sx < -20 || sx > W + 20) continue;
      const sy = heightAt(p.x) - 30;
      g.beginPath();
      g.arc(sx, sy, 8, 0, Math.PI * 2);
      g.fillStyle = pal.prize;
      g.fill();
      g.beginPath();
      g.arc(sx - 2.5, sy - 2.5, 3, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,.7)";
      g.fill();
    }

    // vehicle
    g.save();
    g.translate(vehicleScreenX, y);
    g.rotate(rot);
    g.fillStyle = over ? pal.foe : pal.hero;
    g.fillRect(-22, -10, 44, 16);
    g.fillStyle = shade(over ? pal.foe : pal.hero, -0.3);
    g.beginPath();
    g.arc(-14, 8, 8, 0, Math.PI * 2);
    g.arc(14, 8, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = pal.glow;
    g.fillRect(6, -16, 10, 8);
    g.restore();

    // fuel bar
    const fw = W * 0.5;
    g.fillStyle = t.surface;
    g.fillRect(W / 2 - fw / 2, 14, fw, 10);
    g.fillStyle = fuel < 0.25 ? pal.foe : pal.prize;
    g.fillRect(W / 2 - fw / 2, 14, fw * Math.max(0, fuel), 10);

    if (over) endCard(g, t, W, H, overMsg);
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
