import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "horde-run",
  title: "Nic vs the Horde",
  rule: "Tap top or bottom to swap lanes, keep your crowd",
  year: 2012,
  description: "Collect the crowd. Dodge the gaps. Don't lose them all.",
  history:
    "Homage to the 2012 lane-dodging sprint era where a trailing crowd of followers became the whole scoreboard.",
  tags: ["reflex", "endurance", "chaos"],
  palette: {
    hero: "#f72585",
    foe: "#3a0ca3",
    prize: "#4cc9f0",
    deep: "#14213d",
    glow: "#ffb703",
  },
  intensity: 0.65,
  luck: 0.15,
  nostalgia: 0.6,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

const LANES = 3;

interface Thing {
  x: number;
  lane: number;
  kind: "obstacle" | "pickup";
  resolved: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const safeTop = ctx.safeTop;
  const { g, width: W, height: H, pal } = ctx;

  const playerX = W * 0.26;
  const laneGap = H * 0.9 / LANES;
  const laneTop = H * 0.05;
  const laneY = (lane: number) => laneTop + laneGap * (lane + 0.5);
  const playerR = Math.min(W, H) * 0.03;
  const thingW = playerR * 1.8;

  let worldX = 0;
  let speed = 0;
  let baseSpeed = W * 0.4;
  let lane = 1;
  let drawY = laneY(1);
  let things: Thing[] = [];
  let spawnCd = 0;
  let horde = 3;
  let score = 0;
  let distance = 0;
  let over = false;
  let shakeT = 0;
  let hitFlash = 0;

  const history: number[] = [];
  const HIST_MAX = 600;
  const FOLLOWER_LAG = 7;
  const MAX_DRAW_FOLLOWERS = 24;

  const reset = () => {
    worldX = 0;
    speed = baseSpeed;
    lane = 1;
    drawY = laneY(1);
    things = [];
    spawnCd = 0.4;
    horde = 3;
    score = 0;
    distance = 0;
    over = false;
    shakeT = 0;
    hitFlash = 0;
    history.length = 0;
    ctx.onScore(0);
  };

  const setLane = (delta: number) => {
    if (over) {
      reset();
      return;
    }
    lane = clamp(lane + delta, 0, LANES - 1);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const y = e.clientY - r.top;
    setLane(y < H / 2 ? -1 : 1);
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();

    if (!over) {
      speed = baseSpeed + Math.min(worldX * 0.018, baseSpeed * 1.1);
      worldX += speed * dt;
      distance = worldX;
      score = Math.floor(distance * 0.05);
      ctx.onScore(score);

      drawY += (laneY(lane) - drawY) * clamp(dt * 10, 0, 1);
      history.push(drawY);
      if (history.length > HIST_MAX) history.shift();

      spawnCd -= dt;
      if (spawnCd <= 0) {
        spawnCd = clamp(0.55 - distance * 0.00006, 0.28, 0.55);
        const isPickup = Math.random() < 0.3;
        const busyLanes = new Set<number>();
        const count = isPickup ? 1 : 1 + (Math.random() < 0.4 ? 1 : 0);
        for (let i = 0; i < count; i++) {
          let l = Math.floor(Math.random() * LANES);
          let guard = 0;
          while (busyLanes.has(l) && guard++ < 6) l = Math.floor(Math.random() * LANES);
          busyLanes.add(l);
          things.push({
            x: worldX + W * (0.95 + i * 0.12),
            lane: l,
            kind: isPickup ? "pickup" : "obstacle",
            resolved: false,
          });
        }
      }

      if (auto) {
        const upcoming = things
          .filter((t) => !t.resolved && t.x - worldX > 0 && t.x - worldX < W * 0.4)
          .sort((a, b) => a.x - b.x)[0];
        if (upcoming) {
          if (upcoming.kind === "obstacle" && upcoming.lane === lane) {
            setLane(lane === 0 ? 1 : -1);
          } else if (upcoming.kind === "pickup" && upcoming.lane !== lane) {
            setLane(upcoming.lane > lane ? 1 : -1);
          }
        }
      }

      for (const th of things) {
        const sx = th.x - worldX;
        if (!th.resolved && sx < playerX + thingW / 2 && sx > playerX - thingW / 2 && th.lane === lane) {
          th.resolved = true;
          if (th.kind === "pickup") {
            horde = Math.min(60, horde + 1);
            ctx.haptic("hit");
          } else {
            horde = Math.max(0, horde - (1 + Math.floor(Math.random() * 2)));
            shakeT = 0.3;
            hitFlash = 1;
            ctx.haptic("fail");
            if (horde <= 0) {
              over = true;
              ctx.onRunEnd(score + horde * 3);
            }
          }
        }
      }
      things = things.filter((t) => t.x - worldX > -W * 0.1);
    }

    shakeT = Math.max(0, shakeT - dt);
    hitFlash = Math.max(0, hitFlash - dt * 2.5);
    const sx = shakeT > 0 ? (Math.random() - 0.5) * 6 * shakeT : 0;
    const sy = shakeT > 0 ? (Math.random() - 0.5) * 6 * shakeT : 0;

    g.save();
    g.translate(sx, sy);

    const bgGrad = g.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, shade(pal.deep, -0.15));
    bgGrad.addColorStop(1, shade(pal.deep, -0.65));
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, W, H);

    // lane dividers
    g.strokeStyle = "rgba(255,255,255,.08)";
    g.lineWidth = 2;
    for (let l = 1; l < LANES; l++) {
      const y = laneTop + laneGap * l;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }

    // things
    for (const th of things) {
      if (th.resolved) continue;
      const sxp = th.x - worldX;
      const y = laneY(th.lane);
      if (th.kind === "obstacle") {
        g.fillStyle = pal.foe;
        roundRect(g, sxp - thingW / 2, y - thingW / 2, thingW, thingW, 6);
        g.fill();
      } else {
        g.fillStyle = pal.prize;
        g.beginPath();
        g.arc(sxp, y, thingW * 0.4, 0, Math.PI * 2);
        g.fill();
      }
    }

    // followers trailing behind, using position history for a snake-like lag
    const followerCount = Math.min(horde, MAX_DRAW_FOLLOWERS);
    for (let i = followerCount; i >= 1; i--) {
      const idx = history.length - 1 - i * FOLLOWER_LAG;
      const fy = idx >= 0 ? history[idx] : drawY;
      const fx = playerX - i * (playerR * 1.7);
      if (fx < -playerR) continue;
      const k = 1 - i / (followerCount + 1);
      g.fillStyle = shade(pal.hero, -0.1 - k * 0.3);
      g.beginPath();
      g.arc(fx, fy, playerR * 0.62, 0, Math.PI * 2);
      g.fill();
    }

    // player — one Nic out front of the horde chasing him
    drawNicHead(g, {
      x: playerX,
      y: drawY,
      r: playerR,
      skin: over ? shade(pal.hero, -0.3) : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: theme.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: theme.ink,
      // glancing back at what is gaining on him
      gaze: -0.7,
      gape: hitFlash > 0 || over ? 0.8 : 0.15,
      scowl: over ? 1 : 0.4,
    });

    if (hitFlash > 0) {
      g.fillStyle = `rgba(255,0,0,${0.25 * hitFlash})`;
      g.fillRect(0, 0, W, H);
    }

    // horde readout
    g.textAlign = "left";
    g.fillStyle = theme.ink;
    g.font = `800 20px ${theme.fontDisplay}`;
    g.fillText(`horde ${horde}`, 16, 28 + safeTop);

    g.restore();

    if (over) endCard(g, theme, W, H, "WIPED OUT");
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
