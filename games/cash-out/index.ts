// Arcade-casino, deliberately: virtual chips only, no purchases, no top-ups,
// nothing to buy anywhere. Chips exist for the leaderboard and for nerve.
import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "cash-out",
  title: "Cash Out",
  rule: "Bank it before it busts",
  year: 2014,
  description: "The multiplier climbs. Your nerve decides.",
  history:
    "Homage to the crash-curve games of the mid-2010s. Virtual chips only, free reset, and the house here charges absolutely nothing.",
  tags: ["casino", "luck", "oneTap"],
  palette: {
    hero: "#ffd60a",
    foe: "#d00000",
    prize: "#70e000",
    deep: "#03071e",
    glow: "#ffba08",
  },
  intensity: 0.7,
  luck: 0.85,
  nostalgia: 0.1,
  sessionLength: 0.5,
  scoreUnit: "chips",
  maxScorePerSecond: 400,
} satisfies GameModule["meta"];

const START_CHIPS = 100;
const BET = 10;

type Phase = "arming" | "rising" | "banked" | "busted" | "out";

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  let chips = START_CHIPS;
  let phase: Phase = "arming";
  let phaseT = 0.9;
  let mult = 1;
  let bustAt = 2;
  let lastWin = 0;
  let history: { m: number; banked: boolean }[] = [];

  const rollBust = () => {
    // heavy tail: most rounds bust low, some run long
    const u = Math.random();
    bustAt = Math.min(30, Math.max(1.01, 0.97 / (1 - u)));
  };

  let auto = false;
  let autoTarget = 2;

  const startRound = () => {
    phase = "rising";
    mult = 1;
    rollBust();
    autoTarget = 1.3 + Math.random() * 2.2;
  };

  const reset = () => {
    chips = START_CHIPS;
    phase = "arming";
    phaseT = 0.9;
    history = [];
    ctx.onScore(chips);
  };

  const onDown = () => {
    if (phase === "out") {
      reset();
      return;
    }
    if (phase !== "rising") return;
    // bank it
    lastWin = Math.round(BET * (mult - 1));
    chips += lastWin;
    ctx.onScore(chips);
    ctx.haptic("hit");
    history.unshift({ m: mult, banked: true });
    history = history.slice(0, 6);
    phase = "banked";
    phaseT = 1.0;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  ctx.onScore(chips);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (phase === "arming") {
      phaseT -= dt;
      if (phaseT <= 0) startRound();
    } else if (phase === "rising") {
      // attract mode: bank somewhere believable, sometimes too late
      if (auto && mult >= autoTarget) onDown();
      mult *= Math.exp(0.55 * dt);
      if (mult >= bustAt) {
        chips -= BET;
        ctx.onScore(Math.max(0, chips));
        ctx.haptic("fail");
        history.unshift({ m: bustAt, banked: false });
        history = history.slice(0, 6);
        if (chips <= 0) {
          chips = 0;
          phase = "out";
          ctx.onRunEnd(0, "CHIPS GONE");
        } else {
          phase = "busted";
          phaseT = 1.1;
        }
      }
    } else if (phase === "banked" || phase === "busted") {
      phaseT -= dt;
      if (phaseT <= 0) {
        phase = "arming";
        phaseT = 0.5;
      }
    }

    const ground = g.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, shade(pal.deep, -0.15));
    ground.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);
    g.textAlign = "center";

    // multiplier arc — sweeps as it climbs
    const cx = W / 2;
    const cy = H * 0.42;
    const rad = Math.min(W, H) * 0.28;
    const sweep = Math.min(1, Math.log(mult) / Math.log(30));
    g.beginPath();
    g.arc(cx, cy, rad, -Math.PI * 0.75, Math.PI * 0.75);
    g.strokeStyle = t.surface;
    g.lineWidth = 14;
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, rad, -Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 1.5 * sweep);
    g.strokeStyle =
      phase === "busted" ? pal.foe : phase === "banked" ? pal.prize : pal.hero;
    g.stroke();

    g.fillStyle =
      phase === "busted" ? pal.foe : phase === "banked" ? pal.prize : t.ink;
    g.font = `800 56px ${t.fontDisplay}`;
    g.fillText(`${mult.toFixed(2)}x`, cx, cy + 18);

    g.font = `600 18px ${t.fontBody}`;
    g.fillStyle = t.inkDim;
    if (phase === "rising") g.fillText("TAP TO BANK", cx, cy + rad + 52);
    else if (phase === "banked") {
      g.fillStyle = pal.prize;
      g.fillText(`+${lastWin} chips`, cx, cy + rad + 52);
    } else if (phase === "busted") {
      g.fillStyle = pal.foe;
      g.fillText(`BUST  -${BET} chips`, cx, cy + rad + 52);
    } else if (phase === "arming") g.fillText("next round...", cx, cy + rad + 52);

    // chip count + stake, always visible
    g.fillStyle = pal.hero;
    g.font = `800 26px ${t.fontDisplay}`;
    g.fillText(`${chips} chips`, cx, H * 0.82);
    g.fillStyle = t.inkDim;
    g.font = `500 14px ${t.fontBody}`;
    g.fillText(`${BET} chip stake · virtual only, resets free`, cx, H * 0.82 + 26);

    // last rounds strip
    g.font = `600 13px ${t.fontBody}`;
    history.forEach((h, i) => {
      g.fillStyle = h.banked ? pal.prize : pal.foe;
      g.fillText(`${h.m.toFixed(2)}x`, W * 0.14 + i * (W * 0.145), H * 0.1);
    });

    if (phase === "out") {
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("CHIPS GONE", cx, H * 0.62);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap for a fresh 100", cx, H * 0.62 + 34);
    }
    g.textAlign = "left";
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
