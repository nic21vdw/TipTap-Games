import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "rocket-jetpack",
  title: "Nic's Thrust Run",
  rule: "Hold to thrust, thread the gates",
  year: 2011,
  description: "Hold to fly. Let go to fall. Thread every gate.",
  history:
    "Homage to the 2011 thrust-and-dodge runners that turned a single hold-to-fly gesture into an endless side-scrolling dash.",
  tags: ["reflex", "hold", "endurance"],
  palette: {
    hero: "#ff8c42",
    foe: "#e63946",
    prize: "#4cc9f0",
    deep: "#231651",
    glow: "#ffd60a",
  },
  intensity: 0.7,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

const PLAYER_X_RATIO = 0.28;
const PLAYER_R = 13;
const GRAVITY = 1300;
const THRUST = -2500;
const BASE_SPEED = 210;
const MAX_SPEED = 480;
const BAR_W = 28;

interface Gate {
  x: number;
  gapY: number;
  gapH: number;
}
interface Orb {
  x: number;
  y: number;
  r: number;
  taken: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const playerX = W * PLAYER_X_RATIO;

  let player = { y: H / 2, vy: 0 };
  let gates: Gate[] = [];
  let orbs: Orb[] = [];
  let distAcc = 0;
  let nextGateDist = 0;
  let elapsed = 0;
  let speed = BASE_SPEED;
  let score = 0;
  let over = false;
  let thrustHeld = false;
  let flicker = 0;
  const stars = Array.from({ length: 18 }, () => ({
    x: rand(0, W),
    y: rand(0, H),
    r: rand(0.6, 1.8),
  }));

  const spawnGate = (x: number) => {
    const gapH = clamp(230 - elapsed * 2.6, 130, 230);
    const gapY = rand(gapH / 2 + 30, H - gapH / 2 - 30);
    gates.push({ x, gapY, gapH });
    if (Math.random() < 0.85) {
      orbs.push({ x, y: gapY, r: 7, taken: false });
    }
    if (Math.random() < 0.3) {
      orbs.push({
        x: x - rand(80, 160),
        y: rand(40, H - 40),
        r: 6,
        taken: false,
      });
    }
  };

  const reset = () => {
    player = { y: H / 2, vy: 0 };
    gates = [];
    orbs = [];
    distAcc = 0;
    nextGateDist = rand(260, 340);
    elapsed = 0;
    speed = BASE_SPEED;
    score = 0;
    over = false;
    thrustHeld = false;
    ctx.onScore(0);
  };
  reset();

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    thrustHeld = true;
  };
  const onUp = () => {
    thrustHeld = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);
  window.addEventListener("pointerup", onUp);

  let auto = false;

  const autoThrust = () => {
    let target: Gate | null = null;
    for (const gt of gates) {
      if (gt.x + BAR_W / 2 > playerX && (!target || gt.x < target.x)) target = gt;
    }
    const desiredY = target ? target.gapY : H * 0.5;
    thrustHeld = player.y > desiredY;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (auto) autoThrust();

      elapsed += dt;
      speed = Math.min(MAX_SPEED, BASE_SPEED + elapsed * 9);

      player.vy += (thrustHeld ? THRUST : GRAVITY) * dt;
      player.vy = clamp(player.vy, -520, 620);
      player.y += player.vy * dt;
      if (player.y < PLAYER_R) {
        player.y = PLAYER_R;
        player.vy = 0;
      }
      if (player.y > H - PLAYER_R) {
        player.y = H - PLAYER_R;
        player.vy = 0;
      }

      distAcc += speed * dt;
      if (distAcc > nextGateDist) {
        distAcc = 0;
        nextGateDist = rand(260, 340);
        spawnGate(W + BAR_W);
      }

      for (const gt of gates) gt.x -= speed * dt;
      for (const o of orbs) o.x -= speed * dt;
      gates = gates.filter((gt) => gt.x > -BAR_W * 2);
      orbs = orbs.filter((o) => o.x > -30);

      for (const o of orbs) {
        if (o.taken) continue;
        const dx = o.x - playerX;
        const dy = o.y - player.y;
        if (Math.sqrt(dx * dx + dy * dy) < o.r + PLAYER_R) {
          o.taken = true;
          score += 1;
          ctx.onScore(score);
          ctx.haptic("hit");
        }
      }
      orbs = orbs.filter((o) => !o.taken);

      for (const gt of gates) {
        if (Math.abs(gt.x - playerX) < BAR_W / 2 + PLAYER_R) {
          const topEdge = gt.gapY - gt.gapH / 2;
          const botEdge = gt.gapY + gt.gapH / 2;
          if (player.y - PLAYER_R < topEdge || player.y + PLAYER_R > botEdge) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
            break;
          }
        }
      }
    }

    flicker += dt;

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, shade(pal.deep, 0.15));
    bg.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    for (const s of stars) {
      s.x -= speed * dt * 0.25;
      if (s.x < 0) s.x = W;
      g.fillStyle = "rgba(255,255,255,.25)";
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      g.fill();
    }

    for (const gt of gates) {
      const topEdge = gt.gapY - gt.gapH / 2;
      const botEdge = gt.gapY + gt.gapH / 2;
      g.fillStyle = pal.foe;
      roundRect(g, gt.x - BAR_W / 2, 0, BAR_W, Math.max(0, topEdge), 6);
      g.fill();
      roundRect(g, gt.x - BAR_W / 2, botEdge, BAR_W, Math.max(0, H - botEdge), 6);
      g.fill();
      g.fillStyle = "rgba(255,255,255,.15)";
      g.fillRect(gt.x - BAR_W / 2, Math.max(0, topEdge - 3), BAR_W, 3);
      g.fillRect(gt.x - BAR_W / 2, botEdge, BAR_W, 3);
    }

    for (const o of orbs) {
      g.beginPath();
      g.arc(o.x, o.y, o.r + Math.sin(flicker * 5 + o.x) * 1, 0, Math.PI * 2);
      g.fillStyle = pal.prize;
      g.fill();
      g.fillStyle = "rgba(255,255,255,.6)";
      g.beginPath();
      g.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.3, 0, Math.PI * 2);
      g.fill();
    }

    if (thrustHeld && !over) {
      g.fillStyle = pal.glow;
      g.globalAlpha = 0.7 + Math.sin(flicker * 30) * 0.2;
      g.beginPath();
      g.moveTo(playerX - PLAYER_R * 0.6, player.y + PLAYER_R * 0.6);
      g.lineTo(playerX - PLAYER_R * 1.6 - rand(0, 6), player.y + PLAYER_R * 1.1);
      g.lineTo(playerX - PLAYER_R * 0.6, player.y + PLAYER_R * 1.3);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    }

    drawNicHead(g, {
      x: playerX,
      y: player.y,
      r: PLAYER_R,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      lean: clamp(player.vy * 0.002, -0.3, 0.3),
      gape: over ? 0.8 : 0,
      scowl: over ? 1 : 0,
    });

    g.textAlign = "center";
    g.fillStyle = t.ink;
    g.font = `700 15px ${t.fontBody}`;
    g.fillText(`${score}`, W / 2, 30);
    g.textAlign = "left";

    if (over) endCard(g, t, W, H, "CRASHED");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointerup", onUp);
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      if (!on) {
        thrustHeld = false;
        reset();
      }
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
