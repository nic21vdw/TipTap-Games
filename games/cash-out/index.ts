// Arcade-casino, deliberately: virtual cans only, no purchases, no top-ups,
// nothing to buy anywhere. Cans exist for the leaderboard and for nerve.
import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, shade } from "@/games/engine";
import { drawCan, drawRoom, skins } from "@/games/nic-art";

const meta = {
  slug: "cash-out",
  title: "The Tab",
  rule: "Stop drinking before the jitters",
  year: 2014,
  description: "The caffeine multiplier climbs. Your nerve decides.",
  history:
    "Homage to the crash-curve games of the mid-2010s, re-pointed at a running tab of energy drinks. Virtual cans only, free reset, nothing to buy anywhere.",
  tags: ["casino", "luck", "oneTap"],
  palette: {
    hero: "#e8a33d",
    foe: "#d81f2a",
    prize: "#3fbf6f",
    deep: "#12161f",
    glow: "#1f6fd0",
  },
  intensity: 0.7,
  luck: 0.85,
  nostalgia: 0.1,
  sessionLength: 0.5,
  scoreUnit: "cans",
  maxScorePerSecond: 400,
} satisfies GameModule["meta"];

const START_CANS = 100;
const BET = 10;

type Phase = "arming" | "rising" | "banked" | "busted" | "out";

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  let chips = START_CANS;
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
    chips = START_CANS;
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
          ctx.onRunEnd(0);
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

    drawRoom(g, W, H, pal.deep, pal.glow);
    const sk = skins(pal);
    g.textAlign = "center";

    // caffeine arc — sweeps as it climbs
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

    // the can in the middle of the dial, shaking harder the longer you go
    const jitter = phase === "rising" ? Math.min(3, (mult - 1) * 0.7) : 0;
    g.save();
    g.translate(
      cx + Math.sin(mult * 37) * jitter,
      cy - rad * 0.1 + Math.cos(mult * 53) * jitter
    );
    drawCan(g, 0, 0, rad * 0.5, rad * 0.86, phase === "busted" ? { ...sk.energy, body: pal.foe } : sk.energy, "energy");
    g.restore();

    g.fillStyle =
      phase === "busted" ? pal.foe : phase === "banked" ? pal.prize : t.ink;
    g.font = `800 44px ${t.fontDisplay}`;
    g.fillText(`${mult.toFixed(2)}x`, cx, cy + rad * 0.82);

    g.font = `600 18px ${t.fontBody}`;
    g.fillStyle = t.inkDim;
    if (phase === "rising") g.fillText("TAP TO STOP", cx, cy + rad + 52);
    else if (phase === "banked") {
      g.fillStyle = pal.prize;
      g.fillText(`+${lastWin} cans`, cx, cy + rad + 52);
    } else if (phase === "busted") {
      g.fillStyle = pal.foe;
      g.fillText(`JITTERS  -${BET} cans`, cx, cy + rad + 52);
    } else if (phase === "arming") g.fillText("cracking another...", cx, cy + rad + 52);

    // the tab, always visible
    g.fillStyle = pal.hero;
    g.font = `800 26px ${t.fontDisplay}`;
    g.fillText(`${chips} cans`, cx, H * 0.82);
    g.fillStyle = t.inkDim;
    g.font = `500 14px ${t.fontBody}`;
    g.fillText(`${BET} can stake · virtual only, resets free`, cx, H * 0.82 + 26);

    // last rounds strip
    g.font = `600 13px ${t.fontBody}`;
    history.forEach((h, i) => {
      g.fillStyle = h.banked ? pal.prize : pal.foe;
      g.fillText(`${h.m.toFixed(2)}x`, W * 0.14 + i * (W * 0.145), H * 0.1);
    });

    if (phase === "out") {
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("FRIDGE EMPTY", cx, H * 0.62);
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
