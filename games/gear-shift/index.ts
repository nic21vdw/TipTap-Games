import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "gear-shift",
  title: "Nic's Gear Shift",
  rule: "Hold to rev, release in the green to shift",
  year: 2009,
  description: "Rev it up. Nail the shift. Beat the ghost to the line.",
  history:
    "Homage to the 2009 drag-strip tap-timing craze that turned a single hold-and-release into a whole racing genre on the phone.",
  tags: ["precision", "hold", "reflex"],
  palette: {
    hero: "#ff5400",
    foe: "#8d99ae",
    prize: "#06d6a0",
    deep: "#1b1b2f",
    glow: "#ffd60a",
  },
  intensity: 0.7,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.3,
  scoreUnit: "sec",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

const GEARS_NEEDED = 4;
const GHOST_TARGET_TIME = 6.5;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const trackY = H * 0.62;
  const trackH = H * 0.1;
  const finishX = W * 0.92;
  const startX = W * 0.08;

  let holding = false;
  let rpm = 0;
  let gear = 0;
  let greenLo = 0.68;
  let greenHi = 0.82;
  let qualitySum = 0;
  let elapsed = 0;
  let over = false;
  let finished = false;
  let shiftFlash = 0;
  let flashColor = "#fff";
  let score = 0;

  const rollGreenZone = () => {
    const width = rand(0.1, 0.16);
    const center = rand(0.55, 0.82);
    greenLo = clamp(center - width / 2, 0.4, 0.95);
    greenHi = clamp(center + width / 2, greenLo + 0.05, 0.98);
  };

  const reset = () => {
    holding = false;
    rpm = 0;
    gear = 0;
    qualitySum = 0;
    elapsed = 0;
    over = false;
    finished = false;
    shiftFlash = 0;
    score = 0;
    rollGreenZone();
    ctx.onScore(0);
  };

  const evaluateShift = () => {
    let quality: number;
    if (rpm >= greenLo && rpm <= greenHi) {
      quality = 1;
      flashColor = pal.prize;
      ctx.haptic("hit");
    } else if (rpm >= greenLo - 0.12 && rpm <= greenHi + 0.12) {
      quality = 0.5;
      elapsed += 0.4;
      flashColor = pal.glow;
      ctx.haptic("light");
    } else {
      quality = 0.15;
      elapsed += 1.0;
      flashColor = pal.foe;
      ctx.haptic("fail");
    }
    qualitySum += quality;
    gear += 1;
    rpm = 0;
    shiftFlash = 1;
    rollGreenZone();
    if (gear >= GEARS_NEEDED) {
      finished = true;
      over = true;
      ctx.onRunEnd(Math.max(0, Math.round(elapsed * 10) / 10));
    }
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    holding = true;
  };
  const onUp = () => {
    if (over || !holding) return;
    holding = false;
    evaluateShift();
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;
  let autoTargetHold = false;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();

    if (!over) {
      elapsed += dt;
      score = Math.max(0, Math.round(elapsed * 10) / 10);
      ctx.onScore(score);

      const revRate = 0.55 + gear * 0.12;

      if (auto) {
        const zoneCenter = (greenLo + greenHi) / 2;
        if (!holding && !autoTargetHold) {
          holding = true;
          autoTargetHold = true;
        } else if (holding && rpm >= zoneCenter) {
          holding = false;
          autoTargetHold = false;
          evaluateShift();
        }
      }

      if (holding) {
        rpm = clamp(rpm + revRate * dt, 0, 1);
        if (rpm >= 1) {
          holding = false;
          autoTargetHold = false;
          evaluateShift();
        }
      }
    }
    shiftFlash = Math.max(0, shiftFlash - dt * 2);

    // background
    const bgGrad = g.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, shade(pal.deep, -0.1));
    bgGrad.addColorStop(1, shade(pal.deep, -0.6));
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, W, H);

    // track
    g.fillStyle = shade(pal.deep, -0.35);
    roundRect(g, startX, trackY, finishX - startX, trackH, 8);
    g.fill();
    g.fillStyle = pal.foe;
    g.fillRect(finishX - 3, trackY - 10, 4, trackH + 20);

    const playerProgress = clamp(qualitySum / GEARS_NEEDED, 0, 1);
    const ghostProgress = clamp(elapsed / GHOST_TARGET_TIME, 0, 1);

    // ghost car
    const ghostX = startX + (finishX - startX) * ghostProgress;
    g.fillStyle = shade(pal.foe, 0.15);
    g.beginPath();
    g.arc(ghostX, trackY - 14, 9, 0, Math.PI * 2);
    g.fill();

    // player car
    const playerX = startX + (finishX - startX) * playerProgress;
    drawNicHead(g, {
      x: playerX,
      y: trackY + trackH + 14,
      r: 10,
      skin: over ? shade(pal.hero, -0.2) : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: theme.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: theme.ink,
      scowl: 0.6,
      gape: over ? 0.9 : 0,
    });

    // RPM bar
    const barX = W * 0.14;
    const barW = W * 0.72;
    const barY = H * 0.78;
    const barH = 22;
    g.fillStyle = shade(pal.deep, -0.2);
    roundRect(g, barX, barY, barW, barH, 10);
    g.fill();
    // green zone
    g.fillStyle = "rgba(6,214,160,.35)";
    g.fillRect(barX + barW * greenLo, barY, barW * (greenHi - greenLo), barH);
    // rpm fill
    const rpmColor = rpm >= greenLo && rpm <= greenHi ? pal.prize : rpm > greenHi ? pal.foe : pal.glow;
    g.fillStyle = rpmColor;
    roundRect(g, barX, barY, barW * rpm, barH, 10);
    g.fill();

    if (shiftFlash > 0) {
      g.fillStyle = flashColor;
      g.globalAlpha = shiftFlash * 0.35;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }

    // gear readout
    g.textAlign = "center";
    g.fillStyle = theme.ink;
    g.font = `800 24px ${theme.fontDisplay}`;
    g.fillText(`gear ${Math.min(gear + 1, GEARS_NEEDED)}/${GEARS_NEEDED}`, W / 2, H * 0.15);
    g.fillStyle = theme.inkDim;
    g.font = `600 14px ${theme.fontBody}`;
    g.fillText(over ? "" : holding ? "release in the green" : "hold to rev", W / 2, H * 0.15 + 20);
    g.textAlign = "left";

    if (over) endCard(g, theme, W, H, finished ? "FINISH!" : "GAME OVER");
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
      if (!on) {
        holding = false;
        autoTargetHold = false;
        reset();
      }
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
