import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade, clamp } from "@/games/engine";

const meta = {
  slug: "drift-loop",
  title: "Nic's Drift Loop",
  rule: "Drag to steer. Hold a drift. Tap to boost.",
  year: 2009,
  description: "Drift the corners, bank the boost, own the straight.",
  history:
    "Homage to the 2009 top-down arcade racers that turned a looping oval and a drift meter into pure thumb-twitch racing.",
  tags: ["drag", "reflex", "precision"],
  palette: {
    hero: "#06ffa5",
    foe: "#ff206e",
    prize: "#fbff12",
    deep: "#1b1b2f",
    glow: "#41ead4",
  },
  intensity: 0.75,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

const SESSION = 55;
const BASE_SPEED = 210;
const TURN_RATE = 2.6;

function norm(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const cx = W / 2;
  const cy = H / 2;
  const Rc = Math.min(W, H) * 0.34;
  const trackW = Math.min(W, H) * 0.22;

  let pos = { x: cx + Rc, y: cy };
  let heading = Math.PI / 2;
  let speed = BASE_SPEED;
  let steer = 0;
  let boostMeter = 0;
  let boostTimer = 0;
  let driftT = 0;
  let laps = 0;
  let prevAngle = 0;
  let timeLeft = SESSION;
  let over = false;
  let wallFlash = 0;
  let auto = false;

  let downX = 0;
  let downY = 0;
  let downT = 0;
  let pointerActive = false;

  const reset = () => {
    pos = { x: cx + Rc, y: cy };
    heading = Math.PI / 2;
    speed = BASE_SPEED;
    steer = 0;
    boostMeter = 0;
    boostTimer = 0;
    driftT = 0;
    laps = 0;
    prevAngle = 0;
    timeLeft = SESSION;
    over = false;
    wallFlash = 0;
    ctx.onScore(0);
  };
  reset();

  const doTap = () => {
    if (boostMeter >= 0.25) {
      boostMeter -= 0.25;
      boostTimer = 1.1;
      ctx.haptic("hit");
    } else {
      ctx.haptic("light");
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    downX = e.clientX - r.left;
    downY = e.clientY - r.top;
    downT = performance.now();
    pointerActive = true;
  };
  const onMove = (e: PointerEvent) => {
    if (!pointerActive || over) return;
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    steer = clamp((x - downX) / 55, -1, 1);
  };
  const onUp = (e: PointerEvent) => {
    if (!pointerActive) return;
    pointerActive = false;
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const moved = Math.hypot(x - downX, y - downY);
    const elapsed = performance.now() - downT;
    if (moved < 12 && elapsed < 320 && !over) doTap();
    steer = 0;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      let curSteer = steer;
      if (auto) {
        const dx = pos.x - cx;
        const dy = pos.y - cy;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const tangent = ang + Math.PI / 2;
        const correction = (r - Rc) * 0.01;
        const desired = tangent - correction;
        curSteer = clamp(norm(desired - heading) / 1.0, -1, 1);
        if (boostMeter >= 0.6 && Math.random() < dt * 0.6) doTap();
      }

      heading += curSteer * TURN_RATE * dt;

      if (Math.abs(curSteer) > 0.62) {
        driftT += dt;
        boostMeter = clamp(boostMeter + dt * 0.35, 0, 1);
      } else {
        driftT = 0;
      }

      if (boostTimer > 0) boostTimer -= dt;
      const targetSpeed = BASE_SPEED * (boostTimer > 0 ? 1.75 : 1);
      speed += (targetSpeed - speed) * clamp(dt * 3, 0, 1);

      pos.x += Math.cos(heading) * speed * dt;
      pos.y += Math.sin(heading) * speed * dt;

      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const r = Math.hypot(dx, dy);
      const diff = r - Rc;
      if (Math.abs(diff) > trackW / 2) {
        speed *= Math.pow(0.12, dt);
        const nx = dx / (r || 1);
        const ny = dy / (r || 1);
        const targetR = Rc + Math.sign(diff) * (trackW / 2);
        const corr = (targetR - r) * clamp(dt * 2, 0, 1);
        pos.x += nx * corr;
        pos.y += ny * corr;
        wallFlash = 0.25;
      } else {
        wallFlash = Math.max(0, wallFlash - dt);
      }

      let angle = Math.atan2(pos.y - cy, pos.x - cx);
      if (angle < 0) angle += Math.PI * 2;
      if (prevAngle > Math.PI * 1.5 && angle < Math.PI * 0.5) {
        laps += 1;
        ctx.onScore(laps * 100);
        ctx.haptic("hit");
      }
      prevAngle = angle;

      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(laps * 100);
      }
    }

    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);

    // track band
    g.lineWidth = trackW;
    g.strokeStyle = shade(pal.deep, -0.2);
    g.beginPath();
    g.arc(cx, cy, Rc, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,.18)";
    g.setLineDash([10, 10]);
    g.beginPath();
    g.arc(cx, cy, Rc, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = wallFlash > 0 ? pal.foe : "rgba(255,255,255,.25)";
    g.lineWidth = wallFlash > 0 ? 4 : 2;
    g.beginPath();
    g.arc(cx, cy, Rc - trackW / 2, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, Rc + trackW / 2, 0, Math.PI * 2);
    g.stroke();

    // car
    g.save();
    g.translate(pos.x, pos.y);
    g.rotate(heading);
    g.fillStyle = boostTimer > 0 ? pal.glow : pal.hero;
    roundRect(g, -12, -7, 24, 14, 4);
    g.fill();
    g.fillStyle = shade(pal.deep, -0.3);
    g.fillRect(6, -8, 5, 5);
    g.fillRect(6, 3, 5, 5);
    g.restore();

    // boost meter
    const mw = W * 0.5;
    g.fillStyle = "rgba(255,255,255,.15)";
    roundRect(g, W / 2 - mw / 2, 16, mw, 8, 4);
    g.fill();
    g.fillStyle = pal.prize;
    roundRect(g, W / 2 - mw / 2, 16, mw * boostMeter, 8, 4);
    g.fill();

    g.textAlign = "left";
    g.fillStyle = t.ink;
    g.font = `800 16px ${t.fontDisplay}`;
    g.fillText(`Lap ${laps}`, 14, H - 16);
    const barW = W - 28;
    g.fillStyle = "rgba(255,255,255,.15)";
    g.fillRect(14, H - 10, barW, 4);
    g.fillStyle = pal.glow;
    g.fillRect(14, H - 10, barW * (timeLeft / SESSION), 4);

    g.textAlign = "center";
    if (over) endCard(g, t, W, H, "GAME OVER");
    g.textAlign = "left";
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
