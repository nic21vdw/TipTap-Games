// Arcade-casino, deliberately: virtual chips only, no purchases, no top-ups,
// nothing to buy anywhere. Chips exist for the leaderboard and for nerve.
import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, clamp, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";
import {
  createFx,
  drawBackdrop,
  resultCard,
  hexA,
  halo,
  pulse,
  easeOutCubic,
  groundInk,
  safeBox,
} from "@/games/fx";

const meta = {
  slug: "cash-out",
  title: "Nic's Tab",
  rule: "Stop before the jitters take it",
  year: 2014,
  description: "The caffeine multiplier climbs. Your nerve decides. Cans are pretend.",
  history:
    "Homage to the crash-curve games of the mid-2010s, re-pointed at a running tab of energy drinks. Virtual cans only, free reset, nothing to buy anywhere.",
  tags: ["casino", "luck", "oneTap"],
  palette: {
    hero: "#e8a33d",
    foe: "#d81f2a",
    prize: "#3fbf6f",
    deep: "#171a24",
    glow: "#1f6fd0",
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
const CEIL = 30; // the top of the plotted range

type Phase = "arming" | "rising" | "banked" | "busted" | "out";

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();

  let chips = START_CHIPS;
  let phase: Phase = "arming";
  let phaseT = 0.9;
  let mult = 1;
  let bustAt = 2;
  let lastWin = 0;
  let peak = START_CHIPS;
  let bankedRounds = 0;
  let bestMult = 1;
  let history: { m: number; banked: boolean }[] = [];
  let curve: { t: number; m: number }[] = [];
  let elapsed = 0;
  let clock = 0;
  let overAge = 0;

  const rollBust = () => {
    // heavy tail: most rounds bust low, some run long
    const u = Math.random();
    bustAt = Math.min(CEIL, Math.max(1.01, 0.97 / (1 - u)));
  };

  let auto = false;
  let autoTarget = 2;

  const startRound = () => {
    phase = "rising";
    mult = 1;
    elapsed = 0;
    curve = [{ t: 0, m: 1 }];
    rollBust();
    autoTarget = 1.3 + Math.random() * 2.2;
  };

  const reset = () => {
    chips = START_CHIPS;
    peak = START_CHIPS;
    bankedRounds = 0;
    bestMult = 1;
    phase = "arming";
    phaseT = 0.9;
    overAge = 0;
    history = [];
    curve = [];
    fx.clear();
    ctx.onScore(chips);
  };

  // the plot area the curve lives in
  const plot = () => {
    const box = safeBox(W, H);
    return { x: W * 0.13, y: H * 0.17, w: box.right - W * 0.16, h: H * 0.33 };
  };

  const plotPoint = (t: number, m: number) => {
    const p = plot();
    const maxT = Math.max(4, elapsed * 1.05);
    return {
      x: p.x + (t / maxT) * p.w,
      y: p.y + p.h - (Math.log(m) / Math.log(CEIL)) * p.h,
    };
  };

  const onDown = () => {
    if (phase === "out") {
      if (overAge > 0.3) reset();
      return;
    }
    if (phase !== "rising") return;
    const th = ctx.getTheme();
    // bank it
    lastWin = Math.round(BET * (mult - 1));
    chips += lastWin;
    peak = Math.max(peak, chips);
    bankedRounds += 1;
    bestMult = Math.max(bestMult, mult);
    ctx.onScore(chips);
    ctx.haptic("hit");
    history.unshift({ m: mult, banked: true });
    history = history.slice(0, 6);
    phase = "banked";
    phaseT = 1.0;
    const pt = plotPoint(elapsed, mult);
    fx.ring(pt.x, pt.y, pal.prize, 26, 5);
    fx.burst(pt.x, pt.y, {
      count: 22,
      colour: [pal.prize, pal.hero, "#ffffff"],
      speed: 260,
      life: 0.7,
      size: 4,
      gravity: 260,
    });
    fx.flash(pal.prize, 0.16);
    fx.pop(W / 2, H * 0.6, `+${lastWin} CHIPS`, pal.prize, 26, th.fontDisplay);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  ctx.onScore(chips);

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    if (phase === "out") overAge += dt;

    if (phase === "arming") {
      phaseT -= dt;
      if (phaseT <= 0) startRound();
    } else if (phase === "rising") {
      // attract mode: bank somewhere believable, sometimes too late
      if (auto && mult >= autoTarget) onDown();
      elapsed += dt;
      mult *= Math.exp(0.55 * dt);
      curve.push({ t: elapsed, m: mult });
      if (curve.length > 400) curve.shift();
      if (mult >= bustAt) {
        mult = bustAt;
        chips -= BET;
        ctx.onScore(Math.max(0, chips));
        ctx.haptic("fail");
        history.unshift({ m: bustAt, banked: false });
        history = history.slice(0, 6);
        const pt = plotPoint(elapsed, mult);
        fx.shake(16);
        fx.flash(pal.foe, 0.34);
        fx.burst(pt.x, pt.y, {
          count: 28,
          colour: [pal.foe, "#ffffff"],
          speed: 320,
          life: 0.8,
          size: 4.5,
          gravity: 500,
        });
        if (chips <= 0) {
          chips = 0;
          phase = "out";
          overAge = 0;
          ctx.onRunEnd(peak);
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

    drawBackdrop(g, W, H, pal, clock, {
      kind: "blobs",
      intensity: phase === "rising" ? 0.4 + Math.min(0.6, mult / 6) : 0.35,
      vignette: 0.6,
    });

    fx.begin(g);

    // ---- the plot
    const p = plot();
    g.fillStyle = hexA("#000000", 0.3);
    roundRect(g, p.x - 12, p.y - 12, p.w + 24, p.h + 24, 16);
    g.fill();
    // grid lines at 2x, 5x, 10x — the marks people actually aim for
    g.font = `600 10px ${th.fontBody}`;
    for (const m of [2, 5, 10, 20]) {
      const y = p.y + p.h - (Math.log(m) / Math.log(CEIL)) * p.h;
      g.strokeStyle = hexA(ink.main, 0.1);
      g.lineWidth = 1;
      g.setLineDash([3, 5]);
      g.beginPath();
      g.moveTo(p.x, y);
      g.lineTo(p.x + p.w, y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = hexA(ink.main, 0.28);
      g.fillText(`${m}x`, p.x - 10, y + 3);
    }

    // the curve itself
    if (curve.length > 1) {
      const live = phase === "rising";
      const col = phase === "busted" ? pal.foe : live ? pal.hero : pal.prize;
      // a filled wash under the line, so a tall curve reads as a big number
      g.beginPath();
      g.moveTo(plotPoint(curve[0].t, curve[0].m).x, p.y + p.h);
      for (const pt of curve) {
        const q = plotPoint(pt.t, pt.m);
        g.lineTo(q.x, q.y);
      }
      const last = plotPoint(curve[curve.length - 1].t, curve[curve.length - 1].m);
      g.lineTo(last.x, p.y + p.h);
      g.closePath();
      const wash = g.createLinearGradient(0, p.y, 0, p.y + p.h);
      wash.addColorStop(0, hexA(col, 0.34));
      wash.addColorStop(1, hexA(col, 0));
      g.fillStyle = wash;
      g.fill();

      g.strokeStyle = col;
      g.lineWidth = 3;
      g.lineJoin = "round";
      g.beginPath();
      for (let i = 0; i < curve.length; i++) {
        const q = plotPoint(curve[i].t, curve[i].m);
        if (i === 0) g.moveTo(q.x, q.y);
        else g.lineTo(q.x, q.y);
      }
      g.stroke();

      // the head of the curve is his head, and it knows when it busts
      halo(g, last.x, last.y, 30, col, 0.6);
      drawNicHead(g, {
        x: last.x,
        y: last.y,
        r: phase === "busted" ? 13 : 11,
        skin: phase === "busted" ? pal.foe : "#ffffff",
        hair: shade(pal.deep, -0.4),
        eye: th.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: th.ink,
        gape: phase === "busted" ? 0.85 : phase === "rising" ? 0.25 : 0,
        scowl: phase === "busted" ? 1 : 0,
        lean: phase === "rising" ? -0.15 : 0,
      });
    }

    // ---- the number
    g.textAlign = "center";
    const numCol =
      phase === "busted" ? pal.foe : phase === "banked" ? pal.prize : ink.main;
    const bump =
      phase === "rising" ? 1 + Math.min(0.25, (mult - 1) * 0.04) : 1;
    g.save();
    g.translate(W / 2, H * 0.63);
    g.scale(bump, bump);
    g.fillStyle = hexA(numCol, 0.25);
    g.font = `900 62px ${th.fontDisplay}`;
    g.fillText(`${mult.toFixed(2)}x`, 2, 3);
    g.fillStyle = numCol;
    g.fillText(`${mult.toFixed(2)}x`, 0, 0);
    g.restore();

    g.font = `800 15px ${th.fontBody}`;
    if (phase === "rising") {
      g.fillStyle = hexA(ink.main, 0.55 + pulse(clock, 0.8) * 0.45);
      g.fillText("TAP ANYWHERE TO BANK", W / 2, H * 0.7);
    } else if (phase === "banked") {
      g.fillStyle = pal.prize;
      g.fillText(`BANKED +${lastWin} CHIPS`, W / 2, H * 0.7);
    } else if (phase === "busted") {
      g.fillStyle = pal.foe;
      const k = easeOutCubic(clamp(1 - phaseT / 1.1, 0, 1));
      g.fillText(`BUST AT ${bustAt.toFixed(2)}x   −${BET}`, W / 2, H * 0.7 - (1 - k) * 6);
    } else if (phase === "arming") {
      g.fillStyle = hexA(ink.dim, 0.9);
      g.fillText("NEXT ROUND…", W / 2, H * 0.7);
    }

    // ---- chips + stake
    g.fillStyle = pal.hero;
    g.font = `900 30px ${th.fontDisplay}`;
    g.fillText(`${chips}`, W / 2 - 18, H * 0.76);
    g.fillStyle = hexA(ink.main, 0.6);
    g.font = `700 15px ${th.fontBody}`;
    g.textAlign = "left";
    g.fillText("chips", W / 2 + 6, H * 0.76);
    g.textAlign = "center";
    g.fillStyle = hexA(ink.dim, 0.85);
    g.font = `600 12px ${th.fontBody}`;
    g.fillText(`${BET} chip stake · virtual only, resets free`, W / 2, H * 0.76 + 22);

    // ---- last rounds, as chips
    history.forEach((h, i) => {
      const cw = W * 0.13;
      const x = W * 0.115 + i * (W * 0.135);
      const y = H * 0.09;
      g.fillStyle = hexA(h.banked ? pal.prize : pal.foe, 0.18);
      roundRect(g, x - cw / 2, y - 11, cw, 22, 11);
      g.fill();
      g.strokeStyle = hexA(h.banked ? pal.prize : pal.foe, 0.6);
      g.lineWidth = 1;
      roundRect(g, x - cw / 2, y - 11, cw, 22, 11);
      g.stroke();
      g.fillStyle = h.banked ? pal.prize : pal.foe;
      g.font = `800 11px ${th.fontBody}`;
      g.fillText(`${h.m.toFixed(2)}x`, x, y + 4);
    });
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (phase === "out") {
      resultCard(g, th, W, H, {
        title: "chips gone",
        score: peak,
        unit: "peak chips",
        sub: `${bankedRounds} rounds banked · best ${bestMult.toFixed(2)}x`,
        age: overAge,
        accent: pal.hero,
      });
    }
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
