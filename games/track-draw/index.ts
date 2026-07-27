import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "track-draw",
  title: "Nic's Track Draw",
  rule: "Draw a track, then watch the sled ride it",
  year: 2006,
  description: "Sketch the hill. Physics does the rest.",
  history:
    "Homage to the 2006 freehand physics sandbox that let anyone with a mouse become a track designer and a stunt engineer at once.",
  tags: ["drag", "precision", "calm"],
  palette: {
    hero: "#f4a261",
    foe: "#e76f51",
    prize: "#2a9d8f",
    deep: "#264653",
    glow: "#e9c46a",
  },
  intensity: 0.35,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

interface Pt {
  x: number;
  y: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const finish: Pt = { x: W * 0.88, y: H * 0.85 };

  let track: Pt[] = [];
  let drawing = false;
  let riding = false;
  let sled = { x: 0, y: 0, vx: 0, vy: 0 };
  let attempt = 1;
  let score = 0;
  let over = false;
  let resultMsg = "";

  const reset = () => {
    track = [];
    drawing = false;
    riding = false;
    attempt = 1;
    score = 0;
    over = false;
    resultMsg = "";
    ctx.onScore(0);
  };

  const posOf = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startRide = () => {
    if (track.length < 3) return;
    sled = { x: track[0].x, y: track[0].y - 4, vx: 0, vy: 0 };
    riding = true;
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const p = posOf(e);
    if (riding) return;
    if (!drawing && track.length > 0 && Math.hypot(p.x - W * 0.5, p.y - H * 0.06) < 26) {
      // tap the "play" button area (drawn top-center once a track exists)
      startRide();
      return;
    }
    drawing = true;
    track = [p];
  };
  const onMove = (e: PointerEvent) => {
    if (!drawing || over) return;
    const p = posOf(e);
    const last = track[track.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 4) track.push(p);
  };
  const onUp = () => {
    drawing = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;
  let autoT = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (auto) {
      autoT += dt;
      if (!drawing && !riding && track.length === 0) {
        // auto-draw a plausible downhill wiggly track
        track = [];
        for (let i = 0; i <= 20; i++) {
          const fx = (W * 0.1) + (i / 20) * (finish.x - W * 0.1);
          const fy = H * 0.15 + (i / 20) * (finish.y - H * 0.15) + Math.sin(i * 0.8) * 20;
          track.push({ x: fx, y: fy });
        }
        startRide();
      }
    }

    if (riding && !over) {
      // move sled along nearest track segment with simple gravity-follow
      let nearestIdx = 0;
      let nearestD = Infinity;
      for (let i = 0; i < track.length; i++) {
        const d = Math.hypot(track[i].x - sled.x, track[i].y - sled.y);
        if (d < nearestD) {
          nearestD = d;
          nearestIdx = i;
        }
      }
      const next = track[Math.min(track.length - 1, nearestIdx + 1)];
      const dx = next.x - sled.x;
      const dy = next.y - sled.y;
      const d = Math.hypot(dx, dy) || 1;
      const slope = dy / d;
      sled.vx += (dx / d) * (140 + slope * 260) * dt;
      sled.vy += 480 * dt; // gravity
      // snap toward the track line to emulate riding on it
      sled.x += sled.vx * dt;
      sled.y += sled.vy * dt;
      if (nearestD < 40) {
        sled.y += (track[nearestIdx].y - sled.y) * Math.min(1, dt * 6);
        sled.vy *= 0.6;
      }

      if (Math.hypot(sled.x - finish.x, sled.y - finish.y) < 24) {
        riding = false;
        over = true;
        score = attempt;
        resultMsg = "FINISHED";
        ctx.onScore(score);
        ctx.haptic("hit");
        ctx.onRunEnd(score);
      } else if (
        nearestIdx >= track.length - 1 && nearestD > 60
      ) {
        riding = false;
        over = true;
        resultMsg = "CRASHED";
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      } else if (sled.y > H + 40 || sled.x < -40 || sled.x > W + 40) {
        riding = false;
        over = true;
        resultMsg = "CRASHED";
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);

    // track
    if (track.length > 1) {
      g.strokeStyle = pal.hero;
      g.lineWidth = 5;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(track[0].x, track[0].y);
      for (const p of track.slice(1)) g.lineTo(p.x, p.y);
      g.stroke();
    }

    // finish flag
    g.strokeStyle = t.ink;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(finish.x, finish.y - 26);
    g.lineTo(finish.x, finish.y + 6);
    g.stroke();
    g.fillStyle = pal.prize;
    g.beginPath();
    g.moveTo(finish.x, finish.y - 26);
    g.lineTo(finish.x + 16, finish.y - 20);
    g.lineTo(finish.x, finish.y - 14);
    g.fill();

    // play button hint if track drawn but not riding
    if (!drawing && !riding && track.length > 2 && !over) {
      g.fillStyle = "rgba(0,0,0,.3)";
      g.beginPath();
      g.arc(W * 0.5, H * 0.06, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = pal.glow;
      g.beginPath();
      g.moveTo(W * 0.5 - 6, H * 0.06 - 9);
      g.lineTo(W * 0.5 - 6, H * 0.06 + 9);
      g.lineTo(W * 0.5 + 10, H * 0.06);
      g.fill();
    }

    // sled
    if (track.length > 0) {
      const sx = riding ? sled.x : track[0].x;
      const sy = riding ? sled.y : track[0].y - 4;
      drawNicHead(g, {
        x: sx,
        y: sy,
        r: 10,
        skin: over ? pal.foe : pal.glow,
        hair: shade(pal.deep, -0.4),
        eye: t.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: t.ink,
        gape: riding ? 0.5 : 0,
        scowl: over ? 1 : 0,
      });
    }

    if (over) endCard(g, t, W, H, resultMsg || "GAME OVER");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
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
