import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, pick, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "temple-dash",
  title: "Ruin Runner",
  rule: "Swipe to switch lanes, jump, or slide.",
  year: 2011,
  description: "Swipe fast, don't trip — the ruins won't wait.",
  history:
    "Homage to the 2011 endless-runner craze that sent players sprinting through crumbling ruins with a swipe of the thumb.",
  tags: ["reflex", "endurance", "retro"],
  palette: {
    hero: "#f4a259",
    foe: "#bc4b51",
    prize: "#f9dc5c",
    deep: "#1d3354",
    glow: "#8cb369",
  },
  intensity: 0.7,
  luck: 0.05,
  nostalgia: 0.6,
  sessionLength: 0.55,
  scoreUnit: "sec",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

type ObType = "wall" | "jump" | "slide";
interface Obstacle {
  lane: -1 | 0 | 1;
  depth: number; // 0 (at player) -> 1 (vanishing point / spawn)
  type: ObType;
  passed: boolean;
  botHandled: boolean;
}

const VP_Y_RATIO = 0.14;
const PLAYER_Y_RATIO = 0.86;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const vp = { x: W / 2, y: H * VP_Y_RATIO };
  const bottomY = H * PLAYER_Y_RATIO;
  const laneSpanBottom = W * 0.34;

  const project = (depth: number, laneOffset: number) => {
    const d = clamp(depth, 0, 1);
    const x = vp.x + (laneOffset * laneSpanBottom) * (1 - d) ** 1.15;
    const y = vp.y + (bottomY - vp.y) * (1 - d) ** 1.15;
    const scale = 0.12 + 0.88 * (1 - d) ** 1.2;
    return { x, y, scale };
  };

  let lane: -1 | 0 | 1 = 0;
  let visualLane = 0;
  let jumping = false;
  let jumpT = 0;
  const jumpDur = 0.42;
  let sliding = false;
  let slideT = 0;
  const slideDur = 0.42;

  let obstacles: Obstacle[] = [];
  let spawnCd = 1;
  let elapsed = 0;
  let speed = 0.34;
  let score = 0;
  let over = false;

  let dragStart: { x: number; y: number } | null = null;

  const reset = () => {
    lane = 0;
    visualLane = 0;
    jumping = false;
    jumpT = 0;
    sliding = false;
    slideT = 0;
    obstacles = [];
    spawnCd = 1;
    elapsed = 0;
    speed = 0.34;
    score = 0;
    over = false;
    ctx.onScore(0);
  };

  const spawn = () => {
    const laneOpts: (-1 | 0 | 1)[] = [-1, 0, 1];
    const type: ObType = pick(["wall", "jump", "slide"] as const);
    obstacles.push({ lane: pick(laneOpts), depth: 1, type, passed: false, botHandled: false });
  };

  const doJump = () => {
    if (!jumping && !sliding) {
      jumping = true;
      jumpT = 0;
      ctx.haptic("light");
    }
  };
  const doSlide = () => {
    if (!jumping && !sliding) {
      sliding = true;
      slideT = 0;
      ctx.haptic("light");
    }
  };
  const changeLane = (dir: -1 | 1) => {
    lane = clamp(lane + dir, -1, 1) as -1 | 0 | 1;
    ctx.haptic("light");
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onUp = (e: PointerEvent) => {
    if (!dragStart) return;
    const r = ctx.canvas.getBoundingClientRect();
    const dx = e.clientX - r.left - dragStart.x;
    const dy = e.clientY - r.top - dragStart.y;
    dragStart = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 28) {
      changeLane(dx > 0 ? 1 : -1);
    } else if (dy < -28) {
      doJump();
    } else if (dy > 28) {
      doSlide();
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();

  let auto = false;

  const autoThink = () => {
    for (const o of obstacles) {
      if (o.botHandled || o.depth > 0.8) continue;
      if (o.type === "wall") {
        if (o.lane === lane) {
          changeLane(lane === 0 ? (Math.random() < 0.5 ? -1 : 1) : (-lane as -1 | 1));
        }
        o.botHandled = true;
      } else if (o.type === "jump" && o.lane === lane) {
        doJump();
        o.botHandled = true;
      } else if (o.type === "slide" && o.lane === lane) {
        doSlide();
        o.botHandled = true;
      } else {
        o.botHandled = true;
      }
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      elapsed += dt;
      speed = clamp(0.34 + elapsed * 0.011, 0.34, 0.95);
      const newScore = Math.floor(elapsed);
      if (newScore !== score) {
        score = newScore;
        ctx.onScore(score);
      }

      if (auto) autoThink();

      visualLane += (lane - visualLane) * clamp(dt * 10, 0, 1);

      if (jumping) {
        jumpT += dt;
        if (jumpT >= jumpDur) jumping = false;
      }
      if (sliding) {
        slideT += dt;
        if (slideT >= slideDur) sliding = false;
      }

      spawnCd -= dt;
      if (spawnCd <= 0) {
        spawn();
        spawnCd = clamp(1.15 - elapsed * 0.012, 0.5, 1.15);
      }

      for (const o of obstacles) {
        o.depth -= speed * dt;
        if (!o.passed && o.depth < 0.05) {
          const hitLane = o.lane === lane;
          let hit = false;
          if (hitLane) {
            if (o.type === "wall") hit = true;
            else if (o.type === "jump" && !jumping) hit = true;
            else if (o.type === "slide" && !sliding) hit = true;
          }
          if (hit) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          } else {
            o.passed = true;
          }
        }
      }
      obstacles = obstacles.filter((o) => o.depth > -0.08);
    }

    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.3));
    sky.addColorStop(1, shade(pal.deep, -0.5));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // road (trapezoid)
    g.fillStyle = shade(pal.deep, -0.2);
    g.beginPath();
    g.moveTo(vp.x - 4, vp.y);
    g.lineTo(vp.x + 4, vp.y);
    g.lineTo(W / 2 + laneSpanBottom * 1.55, bottomY + 20);
    g.lineTo(W / 2 - laneSpanBottom * 1.55, bottomY + 20);
    g.closePath();
    g.fill();

    // lane divider lines
    g.strokeStyle = "rgba(255,255,255,.18)";
    g.lineWidth = 2;
    for (const lo of [-0.5, 0.5]) {
      const a = project(0, lo * 2);
      g.beginPath();
      g.moveTo(vp.x, vp.y);
      g.lineTo(a.x, a.y);
      g.stroke();
    }

    // obstacles far -> near
    const sorted = [...obstacles].sort((a, b) => b.depth - a.depth);
    for (const o of sorted) {
      const p = project(o.depth, o.lane);
      const bw = 46 * p.scale;
      const bh = 30 * p.scale;
      g.fillStyle = shade(pal.foe, o.type === "jump" ? 0.1 : o.type === "slide" ? -0.2 : -0.05);
      if (o.type === "slide") {
        // overhead beam: draw near top of the lane slot
        roundRect(g, p.x - bw / 2, p.y - bh * 1.6, bw, bh * 0.6, 4 * p.scale);
      } else if (o.type === "jump") {
        roundRect(g, p.x - bw / 2, p.y - bh * 0.5, bw, bh * 0.5, 4 * p.scale);
      } else {
        roundRect(g, p.x - bw / 2, p.y - bh, bw, bh, 4 * p.scale);
      }
      g.fill();
    }

    // player
    const pp = project(0, visualLane);
    const jumpArc = jumping ? Math.sin(Math.PI * (jumpT / jumpDur)) * 44 : 0;
    const squash = sliding ? 0.5 : 1;
    g.fillStyle = pal.hero;
    roundRect(g, pp.x - 16, pp.y - 46 * squash - jumpArc, 32, 46 * squash, 10);
    g.fill();
    g.beginPath();
    g.arc(pp.x, pp.y - 46 * squash - jumpArc - 12, 12, 0, Math.PI * 2);
    g.fillStyle = shade(pal.hero, 0.2);
    g.fill();

    g.fillStyle = t.ink;
    g.font = `700 15px ${t.fontDisplay}`;
    g.fillText(`${score}s`, 14, 24);

    if (over) endCard(g, t, W, H, "RUIN CLAIMED YOU");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
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
