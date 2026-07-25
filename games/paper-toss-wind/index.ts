import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "paper-toss-wind",
  title: "Toss It",
  rule: "Flick to toss. Read the wind.",
  year: 2009,
  description: "Flick it in the bin. The wind has other plans.",
  history:
    "Homage to the 2009 office-break flick-toss games that turned a crumpled ball and a trash can into a pocket obsession — read the wind, adjust your arm, repeat.",
  tags: ["precision", "drag", "luck"],
  palette: {
    hero: "#f4e9d8",
    foe: "#5b4636",
    prize: "#e07a5f",
    deep: "#2b2118",
    glow: "#81b29a",
  },
  intensity: 0.3,
  luck: 0.35,
  nostalgia: 0.8,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

const GRAVITY = 1500;
const WIND_ACCEL = 260;
const MAX_THROWS = 15;

type Pt = { x: number; y: number; t: number };

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const startX = W / 2;
  const startY = H * 0.86;
  const binY = H * 0.18;
  const binW = W * 0.26;
  const binX = W / 2;

  let ball = { x: startX, y: startY, vx: 0, vy: 0 };
  let prevBallY = startY;
  let inFlight = false;
  let wind = 0;
  let streak = 0;
  let bestStreak = 0;
  let totalMakes = 0;
  let throws = 0;
  let over = false;
  let flash = 0;
  let flashGood = false;

  let trail: Pt[] = [];
  let dragging = false;
  let auto = false;
  let autoCd = 0.4;

  const newWind = () => {
    wind = rand(-1, 1);
  };

  const reset = () => {
    ball = { x: startX, y: startY, vx: 0, vy: 0 };
    prevBallY = startY;
    inFlight = false;
    streak = 0;
    bestStreak = 0;
    totalMakes = 0;
    throws = 0;
    over = false;
    dragging = false;
    trail = [];
    newWind();
    ctx.onScore(0);
  };

  const launch = (vx: number, vy: number) => {
    ball = { x: startX, y: startY, vx, vy };
    prevBallY = startY;
    inFlight = true;
  };

  const resolveThrow = (made: boolean) => {
    inFlight = false;
    throws += 1;
    flash = 0.35;
    flashGood = made;
    if (made) {
      streak += 1;
      totalMakes += 1;
      bestStreak = Math.max(bestStreak, streak);
      ctx.haptic("hit");
    } else {
      streak = 0;
      ctx.haptic("light");
    }
    ctx.onScore(bestStreak);
    newWind();
    ball = { x: startX, y: startY, vx: 0, vy: 0 };
    prevBallY = startY;
    if (throws >= MAX_THROWS) {
      over = true;
      ctx.onRunEnd(bestStreak);
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    if (inFlight || auto) return;
    const r = ctx.canvas.getBoundingClientRect();
    dragging = true;
    trail = [
      { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() / 1000 },
    ];
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const r = ctx.canvas.getBoundingClientRect();
    trail.push({
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      t: performance.now() / 1000,
    });
    if (trail.length > 10) trail.shift();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    const rec = trail;
    trail = [];
    if (rec.length < 2) return;
    const a = rec[0];
    const b = rec[rec.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0.001) return;
    const vx = ((b.x - a.x) / dt) * 0.9;
    const vy = ((b.y - a.y) / dt) * 0.9;
    // require a real upward flick, not a limp release
    if (vy > -180 || Math.sqrt(vx * vx + vy * vy) < 260) return;
    launch(vx, vy);
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  // attract mode: solve for the velocity that (given current wind) drops the
  // ball dead-center in the bin, so the preview looks intentional, not lucky
  const autoLaunch = () => {
    const vy0 = -1150;
    const a = 0.5 * GRAVITY;
    const c = startY - binY;
    const disc = vy0 * vy0 + 4 * a * c;
    const t = (-vy0 + Math.sqrt(Math.max(0, disc))) / (2 * a);
    const dx = binX - startX;
    const windDisp = 0.5 * wind * WIND_ACCEL * t * t;
    const vx0 = (dx - windDisp) / Math.max(0.05, t);
    launch(vx0, vy0);
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (flash > 0) flash = Math.max(0, flash - dt);

    if (!over) {
      if (auto && !inFlight && !dragging) {
        autoCd -= dt;
        if (autoCd <= 0) {
          autoLaunch();
          autoCd = 0.9;
        }
      }
      if (inFlight) {
        prevBallY = ball.y;
        ball.vy += GRAVITY * dt;
        ball.vx += wind * WIND_ACCEL * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        if (prevBallY > binY && ball.y <= binY) {
          const made = Math.abs(ball.x - binX) <= binW / 2;
          resolveThrow(made);
        } else if (ball.y > H + 40 || ball.x < -40 || ball.x > W + 40) {
          resolveThrow(false);
        }
      }
    }

    // scenery
    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,.03)";
    for (let i = 0; i < 6; i++) g.fillRect(0, (H / 6) * i, W, 1);

    // bin
    g.fillStyle = shade(pal.foe, -0.1);
    g.fillRect(binX - binW / 2, binY - 8, binW, 34);
    g.fillStyle = pal.prize;
    roundRect(g, binX - binW / 2 - 4, binY + 18, binW + 8, 20, 8);
    g.fill();
    g.fillStyle = shade(pal.deep, -0.5);
    roundRect(g, binX - binW / 2 + 4, binY + 4, binW - 8, 16, 6);
    g.fill();

    // wind indicator
    const wx = W * 0.5;
    const wy = H * 0.08;
    const wlen = 26 + Math.abs(wind) * 40;
    const dirSign = wind >= 0 ? 1 : -1;
    g.strokeStyle = pal.glow;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(wx - dirSign * (wlen / 2), wy);
    g.lineTo(wx + dirSign * (wlen / 2), wy);
    g.stroke();
    g.beginPath();
    g.moveTo(wx + dirSign * (wlen / 2), wy);
    g.lineTo(wx + dirSign * (wlen / 2 - 10), wy - 6);
    g.lineTo(wx + dirSign * (wlen / 2 - 10), wy + 6);
    g.closePath();
    g.fillStyle = pal.glow;
    g.fill();
    g.fillStyle = t.inkDim;
    g.font = `600 12px ${t.fontBody}`;
    g.textAlign = "center";
    g.fillText("WIND", wx, wy + 22);

    // ball
    g.beginPath();
    g.arc(ball.x, ball.y, 12, 0, Math.PI * 2);
    g.fillStyle = pal.hero;
    g.fill();
    g.fillStyle = "rgba(0,0,0,.15)";
    g.beginPath();
    g.arc(ball.x - 3, ball.y - 3, 4, 0, Math.PI * 2);
    g.fill();

    // hud
    g.fillStyle = t.ink;
    g.font = `700 16px ${t.fontDisplay}`;
    g.textAlign = "left";
    g.fillText(`streak ${streak}`, 14, H - 18);
    g.textAlign = "right";
    g.fillText(`${throws}/${MAX_THROWS}`, W - 14, H - 18);
    g.textAlign = "left";

    if (flash > 0) {
      g.fillStyle = flashGood ? "rgba(129,178,154,.25)" : "rgba(224,122,95,.25)";
      g.fillRect(0, 0, W, H);
    }

    if (over) endCard(g, t, W, H, "SESSION DONE");
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
