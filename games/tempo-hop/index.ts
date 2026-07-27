import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "tempo-hop",
  title: "Nic's Tempo Hop",
  rule: "Tap on the beat to clear the bars",
  year: 2009,
  description: "Jump to the pulse. Chain perfects. Don't eat a bar.",
  history:
    "Homage to the 2009 one-button runners that synced every hop to a metronome — the era that proved a single tap could carry a whole game.",
  tags: ["reflex", "oneTap", "endurance"],
  palette: {
    hero: "#ffb703",
    foe: "#e63946",
    prize: "#8ecae6",
    deep: "#023047",
    glow: "#fb8500",
  },
  intensity: 0.75,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

interface Obstacle {
  x: number; // world x
  passed: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const groundY = H * 0.88;
  const playerX = W * 0.28;
  const playerR = Math.min(W, H) * 0.032;
  const obstacleW = playerR * 1.6;
  const obstacleH = playerR * 2.1;
  const jumpDur = 0.46;
  const jumpHeight = H * 0.32;

  let worldX = 0;
  let speed = 0;
  let baseSpeed = W * 0.42;
  let beatInterval = 0.62;
  let beatT = 0;
  let flash = 0;
  let obstacles: Obstacle[] = [];
  let nextSpawnBeat = 0;
  let beatCount = 0;

  let jumping = false;
  let jumpT = 0;
  let combo = 0;
  let bestCombo = 0;
  let score = 0;
  let distance = 0;
  let over = false;
  let shakeT = 0;

  const spawnGapBeats = () => 2 + Math.floor(Math.random() * 2);

  const reset = () => {
    worldX = 0;
    speed = baseSpeed;
    beatInterval = 0.62;
    beatT = 0;
    flash = 0;
    obstacles = [];
    beatCount = 0;
    nextSpawnBeat = spawnGapBeats();
    jumping = false;
    jumpT = 0;
    combo = 0;
    bestCombo = 0;
    score = 0;
    distance = 0;
    over = false;
    shakeT = 0;
    ctx.onScore(0);
  };

  const tryJump = () => {
    if (over || jumping) return;
    jumping = true;
    jumpT = 0;
    // timing check: how close are we to the nearest beat tick?
    const distToBeat = Math.min(beatT, beatInterval - beatT);
    const tolerance = beatInterval * 0.16;
    if (distToBeat <= tolerance) {
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
      ctx.haptic("hit");
    } else {
      combo = 0;
      ctx.haptic("light");
    }
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    tryJump();
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  const loop = makeLoop((dt, t) => {
    const theme = ctx.getTheme();

    if (!over) {
      speed = baseSpeed + Math.min(worldX * 0.02, baseSpeed * 1.3);
      beatInterval = clamp(0.62 - worldX * 0.00003, 0.34, 0.62);
      worldX += speed * dt;
      distance = worldX;

      beatT += dt;
      if (beatT >= beatInterval) {
        beatT -= beatInterval;
        flash = 1;
        beatCount += 1;
        if (beatCount >= nextSpawnBeat) {
          obstacles.push({ x: worldX + W * 0.95, passed: false });
          nextSpawnBeat = beatCount + spawnGapBeats();
        }
      }
      flash = Math.max(0, flash - dt * 3.2);

      if (auto) {
        // attract-mode bot: jump when the nearest obstacle is within lead distance
        const upcoming = obstacles.find((o) => !o.passed && o.x - worldX < W * 0.34);
        if (upcoming && !jumping) tryJump();
      }

      if (jumping) {
        jumpT += dt;
        if (jumpT >= jumpDur) {
          jumping = false;
          jumpT = 0;
        }
      }

      const jumpP = jumping ? jumpT / jumpDur : 0;
      const jumpOffset = jumping ? jumpHeight * 4 * jumpP * (1 - jumpP) : 0;
      const playerAirborne = jumpOffset > obstacleH * 0.55;

      for (const o of obstacles) {
        const sx = o.x - worldX;
        if (!o.passed && sx + obstacleW / 2 < playerX - playerR) {
          o.passed = true;
          score += 1 + combo;
          ctx.onScore(score);
        }
        const overlap =
          !o.passed &&
          sx - obstacleW / 2 < playerX + playerR &&
          sx + obstacleW / 2 > playerX - playerR;
        if (overlap && !playerAirborne) {
          over = true;
          shakeT = 0.35;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
      }
      obstacles = obstacles.filter((o) => o.x - worldX > -W * 0.1);
    }

    shakeT = Math.max(0, shakeT - dt);
    const sx = shakeT > 0 ? (Math.random() - 0.5) * 6 * shakeT : 0;
    const sy = shakeT > 0 ? (Math.random() - 0.5) * 6 * shakeT : 0;

    g.save();
    g.translate(sx, sy);

    // background
    const bgGrad = g.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, shade(pal.deep, -0.2));
    bgGrad.addColorStop(1, shade(pal.deep, -0.68));
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, W, H);

    // beat pulse bar at top
    const barY = H * 0.08;
    const barH = 10;
    g.fillStyle = shade(pal.deep, -0.3);
    roundRect(g, W * 0.1, barY, W * 0.8, barH, 5);
    g.fill();
    const beatP = 1 - beatT / beatInterval;
    g.fillStyle = pal.glow;
    roundRect(g, W * 0.1, barY, W * 0.8 * clamp(beatP, 0, 1), barH, 5);
    g.fill();
    if (flash > 0) {
      g.fillStyle = `rgba(255,255,255,${0.5 * flash})`;
      g.beginPath();
      g.arc(W * 0.1 + W * 0.8 * beatP, barY + barH / 2, 14 * flash + 6, 0, Math.PI * 2);
      g.fill();
    }

    // ground
    g.fillStyle = shade(pal.deep, -0.1);
    g.fillRect(0, groundY, W, H - groundY);
    g.fillStyle = shade(pal.hero, -0.5);
    g.fillRect(0, groundY, W, 3);

    // obstacles
    for (const o of obstacles) {
      const ox = o.x - worldX;
      g.fillStyle = pal.foe;
      roundRect(g, ox - obstacleW / 2, groundY - obstacleH, obstacleW, obstacleH, 5);
      g.fill();
    }

    // player
    const jumpP2 = jumping ? jumpT / jumpDur : 0;
    const jumpOffset2 = jumping ? jumpHeight * 4 * jumpP2 * (1 - jumpP2) : 0;
    const py = groundY - playerR - jumpOffset2;
    drawNicHead(g, {
      x: playerX,
      y: py,
      r: playerR,
      skin: over ? shade(pal.hero, -0.3) : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: theme.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: theme.ink,
      lean: -jumpOffset2 * 0.006,
      gape: jumping ? 0.35 : 0,
      scowl: over ? 1 : 0,
    });

    // combo readout
    g.textAlign = "center";
    g.fillStyle = theme.ink;
    g.font = `800 22px ${theme.fontDisplay}`;
    g.fillText(`x${combo + 1}`, W / 2, H * 0.2);
    g.fillStyle = theme.inkDim;
    g.font = `600 13px ${theme.fontBody}`;
    g.fillText("combo", W / 2, H * 0.2 + 18);
    g.textAlign = "left";

    g.restore();

    if (over) endCard(g, theme, W, H, "GAME OVER");
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
