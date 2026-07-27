import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "wall-hop",
  title: "Nic's Wall Hop",
  rule: "Tap to switch walls and dodge the spikes",
  year: 2010,
  description: "Bounce wall to wall. One tap, one chance.",
  history:
    "Homage to the 2010 arcade climbers where a lone figure ricocheted up a narrow shaft, timing switches against jutting hazards.",
  tags: ["reflex", "oneTap", "precision"],
  palette: {
    hero: "#ffb703",
    foe: "#d62828",
    prize: "#219ebc",
    deep: "#023047",
    glow: "#8ecae6",
  },
  intensity: 0.75,
  luck: 0.1,
  nostalgia: 0.8,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

interface Obstacle {
  y: number; // world y (climbs down as player ascends)
  side: -1 | 1;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const wallW = W * 0.12;
  const leftX = wallW;
  const rightX = W - wallW;

  let side: -1 | 1 = -1;
  let playerY = H * 0.5;
  let vy = 0;
  let camY = 0;
  let obstacles: Obstacle[] = [];
  let score = 0;
  let over = false;
  let speed = 90;

  const reset = () => {
    side = -1;
    playerY = H * 0.5;
    vy = -speed;
    camY = 0;
    speed = 90;
    obstacles = [];
    let y = H * 0.2;
    for (let i = 0; i < 14; i++) {
      y -= rand(70, 110);
      obstacles.push({ y, side: Math.random() < 0.5 ? -1 : 1 });
    }
    score = 0;
    over = false;
    ctx.onScore(0);
  };

  const switchSide = () => {
    if (over) {
      reset();
      return;
    }
    side = side === -1 ? 1 : -1;
    vy = -speed;
    ctx.haptic("light");
  };
  const onDown = () => switchSide();
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      speed = Math.min(240, speed + dt * 4);
      vy += 340 * dt; // gravity pulls back down between hops
      playerY += vy * dt;
      camY -= speed * dt * 0.6;

      if (auto) {
        // bot: look at nearest obstacle on current side within hop range and switch pre-emptively
        const px = side === -1 ? leftX : rightX;
        for (const o of obstacles) {
          const oy = o.y + camY;
          if (o.side === side && oy > H * 0.3 && oy < H * 0.62) {
            switchSide();
            break;
          }
        }
      }

      const px = side === -1 ? leftX : rightX;
      const py = playerY;
      for (const o of obstacles) {
        const oy = o.y + camY;
        if (Math.abs(oy - py) < 16 && o.side === side) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
          break;
        }
      }

      // score by how high we've climbed
      const newScore = Math.max(0, Math.floor(-camY / 40));
      if (newScore > score) {
        score = newScore;
        ctx.onScore(score);
      }

      // recycle obstacles that scrolled off the bottom, add new ones above
      for (const o of obstacles) {
        if (o.y + camY > H + 40) {
          o.y = obstacles.reduce((min, x) => Math.min(min, x.y), o.y) - rand(70, 110);
          o.side = Math.random() < 0.5 ? -1 : 1;
        }
      }

      if (playerY + camY > H + 60) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.deep, 0.25);
    g.fillRect(0, 0, wallW, H);
    g.fillRect(W - wallW, 0, wallW, H);

    for (const o of obstacles) {
      const oy = o.y + camY;
      if (oy < -30 || oy > H + 30) continue;
      const bx = o.side === -1 ? 0 : W - wallW;
      g.fillStyle = pal.foe;
      g.beginPath();
      if (o.side === -1) {
        g.moveTo(bx + wallW, oy);
        g.lineTo(bx + wallW + 22, oy + 12);
        g.lineTo(bx + wallW, oy + 24);
      } else {
        g.moveTo(bx, oy);
        g.lineTo(bx - 22, oy + 12);
        g.lineTo(bx, oy + 24);
      }
      g.fill();
    }

    const px = side === -1 ? leftX + 14 : rightX - 14;
    drawNicHead(g, {
      x: px,
      y: playerY,
      r: 13,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      gape: over ? 0.8 : 0,
      scowl: over ? 1 : 0,
    });

    g.fillStyle = t.ink;
    g.font = `700 14px ${t.fontBody}`;
    g.fillText(`${score}`, 14, 26);

    if (over) endCard(g, t, W, H, "FELL");
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
