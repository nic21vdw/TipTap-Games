import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "gauntlet-micro",
  title: "Nic's Micro Gauntlet",
  rule: "Read it, do it, survive the next one",
  year: 2013,
  description:
    "Four seconds. One command. Zero mercy — the gauntlet never repeats itself twice.",
  history:
    "Homage to the 2013 wave of rapid-fire minigame compilations that packed dozens of tiny reflex tests into one relentless session, ramping speed until you slipped.",
  tags: ["reflex", "chaos", "oneTap"],
  palette: {
    hero: "#ffb703",
    foe: "#e63946",
    prize: "#2ec4b6",
    deep: "#1d3557",
    glow: "#f4a261",
  },
  intensity: 0.85,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

type Challenge = "tap" | "avoid" | "still" | "swipe";
const CHALLENGES: Challenge[] = ["tap", "avoid", "still", "swipe"];
const LABELS: Record<Challenge, string> = {
  tap: "TAP FAST",
  avoid: "DODGE THE ZONE",
  still: "HOLD STILL",
  swipe: "SWIPE UP",
};

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let round = 0;
  let phase: "flash" | "play" = "flash";
  let phaseT = 0;
  let flashDur = 0.6;
  let playDur = 3.6;
  let challenge: Challenge = "tap";
  let resolved = false;
  let score = 0;
  let over = false;

  // tap challenge
  let tapsNeeded = 4;
  let tapsDone = 0;

  // avoid challenge
  let dotX = W / 2;
  let zoneSpeed = 2;
  let zoneWidth = W * 0.3;
  let dwellAccum = 0;
  let dwellLimit = 0.46;

  // still challenge
  // (fail triggers instantly on any pointerdown while in this challenge)

  // swipe challenge
  let swipeActive = false;
  let swipeStartY = 0;
  let swipeDone = false;

  let auto = false;
  let autoTapCd = 0;
  let overTimer = 0;

  const pulse = { t: 0 };

  const startRound = () => {
    phase = "flash";
    phaseT = 0;
    resolved = false;
    challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    playDur = Math.max(1.6, 3.6 - round * 0.12);
    tapsNeeded = Math.min(10, 4 + Math.floor(round / 2));
    tapsDone = 0;
    dotX = W / 2;
    zoneSpeed = 2 + round * 0.16;
    zoneWidth = Math.max(W * 0.16, W * 0.3 - round * 0.01 * W);
    dwellAccum = 0;
    dwellLimit = Math.max(0.22, 0.46 - round * 0.02);
    swipeActive = false;
    swipeDone = false;
  };

  const reset = () => {
    round = 0;
    score = 0;
    over = false;
    overTimer = 0;
    ctx.onScore(0);
    startRound();
  };

  const resolveSuccess = () => {
    if (resolved || over) return;
    resolved = true;
    round += 1;
    score += 10;
    ctx.onScore(score);
    ctx.haptic("hit");
    startRound();
  };

  const resolveFail = () => {
    if (resolved || over) return;
    resolved = true;
    over = true;
    ctx.haptic("fail");
    ctx.onRunEnd(score);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    if (phase !== "play" || auto) return;
    const r = ctx.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (challenge === "tap") {
      tapsDone += 1;
      ctx.haptic("light");
      if (tapsDone >= tapsNeeded) resolveSuccess();
    } else if (challenge === "avoid") {
      dotX = px;
    } else if (challenge === "still") {
      resolveFail();
    } else if (challenge === "swipe") {
      swipeActive = true;
      swipeStartY = e.clientY;
    }
  };

  const onMove = (e: PointerEvent) => {
    if (over || phase !== "play" || auto) return;
    if (challenge === "avoid") {
      const r = ctx.canvas.getBoundingClientRect();
      dotX = e.clientX - r.left;
    }
  };

  const onUp = (e: PointerEvent) => {
    if (over || auto) return;
    if (challenge === "swipe" && swipeActive) {
      swipeActive = false;
      const dy = swipeStartY - e.clientY;
      if (dy > 36 && !swipeDone) {
        swipeDone = true;
        resolveSuccess();
      }
    }
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  const autoTick = (dt: number, t: number) => {
    if (phase !== "play") return;
    if (challenge === "tap") {
      autoTapCd -= dt;
      if (autoTapCd <= 0) {
        autoTapCd = 0.11;
        tapsDone += 1;
        if (tapsDone >= tapsNeeded) resolveSuccess();
      }
    } else if (challenge === "avoid") {
      const zoneCenter = W / 2 + Math.sin(t * zoneSpeed) * (W * 0.32);
      dotX = zoneCenter < W / 2 ? W * 0.86 : W * 0.14;
    } else if (challenge === "swipe") {
      if (!swipeDone && phaseT > 0.25) {
        swipeDone = true;
        resolveSuccess();
      }
    }
    // still: bot simply does nothing, which is correct
  };

  const loop = makeLoop((dt, t) => {
    const theme = ctx.getTheme();
    pulse.t += dt;

    if (!over) {
      phaseT += dt;
      if (auto) autoTick(dt, t);
      if (phase === "flash" && phaseT >= flashDur) {
        phase = "play";
        phaseT = 0;
      } else if (phase === "play") {
        if (challenge === "avoid") {
          const zoneCenter = W / 2 + Math.sin(t * zoneSpeed) * (W * 0.32);
          if (Math.abs(dotX - zoneCenter) < zoneWidth / 2) {
            dwellAccum += dt;
            if (dwellAccum >= dwellLimit) resolveFail();
          } else {
            dwellAccum = Math.max(0, dwellAccum - dt * 2);
          }
        }
        if (!resolved && phaseT >= playDur) {
          if (challenge === "tap" && tapsDone < tapsNeeded) resolveFail();
          else if (challenge === "swipe" && !swipeDone) resolveFail();
          else resolveSuccess();
        }
      }
    } else if (auto) {
      overTimer += dt;
      if (overTimer > 1.0) reset();
    }

    // background
    g.fillStyle = shade(pal.deep, -0.62);
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.deep, -0.4);
    for (let i = 0; i < 5; i++) {
      g.globalAlpha = 0.05;
      g.fillRect(0, (H / 5) * i, W, 2);
    }
    g.globalAlpha = 1;

    // round counter
    g.fillStyle = theme.inkDim;
    g.font = `700 14px ${theme.fontBody}`;
    g.textAlign = "left";
    g.fillText(`ROUND ${round + 1}`, 16, 28);

    if (phase === "flash" && !over) {
      const shakeX = challenge === "still" ? 0 : 0;
      g.textAlign = "center";
      g.fillStyle = pal.glow;
      g.font = `900 30px ${theme.fontDisplay}`;
      const bounce = Math.sin(pulse.t * 14) * 4;
      g.fillText(LABELS[challenge], W / 2 + shakeX, H / 2 + bounce);
      g.textAlign = "left";
    } else if (phase === "play" && !over) {
      const cx = W / 2;
      const cy = H * 0.52;

      if (challenge === "tap") {
        g.beginPath();
        g.arc(cx, cy, 60 + Math.sin(pulse.t * 10) * 4, 0, Math.PI * 2);
        g.fillStyle = pal.hero;
        g.fill();
        g.textAlign = "center";
        g.fillStyle = "#101418";
        g.font = `900 30px ${theme.fontDisplay}`;
        g.fillText(`${tapsDone}/${tapsNeeded}`, cx, cy + 11);
        g.textAlign = "left";
      } else if (challenge === "avoid") {
        const zoneCenter = W / 2 + Math.sin(t * zoneSpeed) * (W * 0.32);
        g.fillStyle = shade(pal.foe, dwellAccum / dwellLimit > 0.6 ? 0.1 : -0.1);
        g.globalAlpha = 0.75;
        g.fillRect(zoneCenter - zoneWidth / 2, H * 0.2, zoneWidth, H * 0.55);
        g.globalAlpha = 1;
        g.beginPath();
        g.arc(dotX, H * 0.62, 16, 0, Math.PI * 2);
        g.fillStyle = pal.hero;
        g.fill();
        // safety meter
        const mw = W * 0.5;
        g.fillStyle = theme.surface;
        g.fillRect(cx - mw / 2, H * 0.16, mw, 8);
        g.fillStyle = pal.prize;
        g.fillRect(cx - mw / 2, H * 0.16, mw * (1 - dwellAccum / dwellLimit), 8);
      } else if (challenge === "still") {
        const shk = 2 + round * 0.15;
        for (let i = 0; i < 3; i++) {
          const jx = rand(-shk, shk);
          const jy = rand(-shk, shk);
          g.fillStyle = shade(pal.prize, -0.1 + i * 0.15);
          g.globalAlpha = 0.5;
          roundRect(g, cx - 30 + jx + i * 24 - 24, cy - 20 + jy, 24, 24, 6);
          g.fill();
        }
        g.globalAlpha = 1;
        g.beginPath();
        g.arc(cx, cy + 30, 22, 0, Math.PI * 2);
        g.fillStyle = pal.hero;
        g.fill();
      } else if (challenge === "swipe") {
        const bob = Math.sin(pulse.t * 6) * 10;
        g.fillStyle = pal.hero;
        g.beginPath();
        g.moveTo(cx, cy - 40 + bob);
        g.lineTo(cx - 16, cy - 12 + bob);
        g.lineTo(cx + 16, cy - 12 + bob);
        g.closePath();
        g.fill();
        g.fillRect(cx - 6, cy - 12 + bob, 12, 34);
      }

      // play timer bar
      const remain = Math.max(0, 1 - phaseT / playDur);
      g.fillStyle = theme.surface;
      g.fillRect(W * 0.1, H * 0.86, W * 0.8, 8);
      g.fillStyle = remain < 0.3 ? pal.foe : pal.glow;
      g.fillRect(W * 0.1, H * 0.86, W * 0.8 * remain, 8);
    }

    if (over) endCard(g, theme, W, H, "GAUNTLET OVER");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
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
