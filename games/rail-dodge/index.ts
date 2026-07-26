import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "rail-dodge",
  title: "Rail Dodge",
  rule: "Drag to stay on the rail. Dodge the beat.",
  year: 2016,
  description: "Auto-roll forward. Weave the winding rail. Don't miss a beat.",
  history:
    "Homage to the 2016 rhythm-runner wave that timed every hazard to a pulsing beat, turning a narrow lane into a test of nerve.",
  tags: ["reflex", "drag", "precision"],
  palette: {
    hero: "#4cc9f0",
    foe: "#f72585",
    prize: "#ffd60a",
    deep: "#10002b",
    glow: "#7209b7",
  },
  intensity: 0.7,
  luck: 0.15,
  nostalgia: 0.4,
  sessionLength: 0.4,
  scoreUnit: "sec",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

type Kind = "wallLeft" | "wallRight" | "gapCenter";

interface Obstacle {
  y: number;
  kind: Kind;
  blockedMin: number; // relative to lane center
  blockedMax: number;
  checked: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const LANE_W = W * 0.62;
  const HALF = LANE_W / 2;
  const BALL_R = 12;
  const playerY = H * 0.78;

  const laneCenterX = (scroll: number) => W / 2 + Math.sin(scroll * 0.004) * W * 0.16;
  const laneHalfWidthAt = (scroll: number) =>
    HALF * (0.7 + 0.3 * Math.sin(scroll * 0.012));

  let distance = 0;
  let speed = 130;
  let playerOffset = 0;
  let obstacles: Obstacle[] = [];
  let spawnTimer = 0;
  let pulseInterval = 0.85;
  let score = 0;
  let over = false;
  let dragging = false;
  let dragStartX = 0;
  let dragStartOffset = 0;
  let lastKind: Kind | null = null;
  let flash = 0;

  const makeObstacle = (): Obstacle => {
    const kinds: Kind[] = ["wallLeft", "wallRight", "gapCenter"];
    let kind = kinds[Math.floor(Math.random() * kinds.length)];
    if (kind === lastKind) kind = pickOther(kind);
    lastKind = kind;
    let blockedMin = -HALF;
    let blockedMax = HALF;
    if (kind === "wallLeft") {
      blockedMin = -HALF;
      blockedMax = -HALF + LANE_W * 0.6;
    } else if (kind === "wallRight") {
      blockedMin = HALF - LANE_W * 0.6;
      blockedMax = HALF;
    } else {
      blockedMin = -LANE_W * 0.2;
      blockedMax = LANE_W * 0.2;
    }
    return { y: -30, kind, blockedMin, blockedMax, checked: false };
  };

  function pickOther(exclude: Kind): Kind {
    const kinds: Kind[] = ["wallLeft", "wallRight", "gapCenter"].filter(
      (k) => k !== exclude
    ) as Kind[];
    return kinds[Math.floor(Math.random() * kinds.length)];
  }

  const reset = () => {
    distance = 0;
    speed = 130;
    playerOffset = 0;
    obstacles = [];
    spawnTimer = 0;
    pulseInterval = 0.85;
    score = 0;
    over = false;
    lastKind = null;
    ctx.onScore(0);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    dragging = true;
    dragStartX = e.clientX;
    dragStartOffset = playerOffset;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    playerOffset = clamp(dragStartOffset + (e.clientX - dragStartX), -HALF, HALF);
  };
  const onUp = () => {
    dragging = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;

  const pickSafeTarget = (ob: Obstacle) => {
    const leftZoneW = ob.blockedMin - -HALF;
    const rightZoneW = HALF - ob.blockedMax;
    if (leftZoneW > rightZoneW) return (-HALF + ob.blockedMin) / 2;
    return (ob.blockedMax + HALF) / 2;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      distance += speed * dt;
      speed = clamp(130 + distance * 0.045, 130, 520);
      score += dt;
      ctx.onScore(Math.floor(score));

      pulseInterval = clamp(0.85 - distance * 0.0009, 0.42, 0.85);
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        obstacles.push(makeObstacle());
        spawnTimer = pulseInterval;
        flash = 1;
      }
      flash = Math.max(0, flash - dt * 2.2);

      if (auto) {
        // aim for the nearest upcoming obstacle's safe gap, else drift to center
        const upcoming = obstacles.find((o) => o.y > playerY - 220 && o.y < playerY);
        const target = upcoming ? pickSafeTarget(upcoming) : 0;
        playerOffset += clamp(target - playerOffset, -260 * dt, 260 * dt);
      }

      for (const ob of obstacles) {
        ob.y += speed * dt;
        if (!ob.checked && ob.y >= playerY - 6 && ob.y <= playerY + 6) {
          ob.checked = true;
          if (playerOffset > ob.blockedMin && playerOffset < ob.blockedMax) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(Math.floor(score));
          } else {
            ctx.haptic("light");
          }
        }
      }
      obstacles = obstacles.filter((o) => o.y < H + 40);

      const curHalf = laneHalfWidthAt(distance) - BALL_R * 0.5;
      if (Math.abs(playerOffset) > curHalf) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(Math.floor(score));
      }
    }

    // background
    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);

    const cx = laneCenterX(distance);
    const curHalf = laneHalfWidthAt(distance);

    // scrolling rail floor
    g.fillStyle = shade(pal.deep, 0.05);
    g.fillRect(cx - curHalf, 0, curHalf * 2, H);
    // rail edges
    g.strokeStyle = pal.glow;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx - curHalf, 0);
    g.lineTo(cx - curHalf, H);
    g.moveTo(cx + curHalf, 0);
    g.lineTo(cx + curHalf, H);
    g.stroke();
    // lane stripes for motion feel
    g.strokeStyle = "rgba(255,255,255,.08)";
    g.lineWidth = 2;
    const stripeOffset = distance % 40;
    for (let y = -stripeOffset; y < H; y += 40) {
      g.beginPath();
      g.moveTo(cx - curHalf, y);
      g.lineTo(cx + curHalf, y);
      g.stroke();
    }

    // obstacles
    for (const ob of obstacles) {
      if (ob.kind === "gapCenter") {
        g.fillStyle = shade(pal.deep, -0.75);
        g.fillRect(cx + ob.blockedMin, ob.y - 14, ob.blockedMax - ob.blockedMin, 28);
        g.strokeStyle = shade(pal.deep, -0.9);
        g.lineWidth = 2;
        g.strokeRect(cx + ob.blockedMin, ob.y - 14, ob.blockedMax - ob.blockedMin, 28);
      } else {
        g.fillStyle = pal.foe;
        roundRect(g, cx + ob.blockedMin, ob.y - 14, ob.blockedMax - ob.blockedMin, 28, 6);
        g.fill();
      }
    }

    // beat pulse ring (visualizes the spawn cadence)
    const phase = 1 - spawnTimer / pulseInterval;
    g.beginPath();
    g.arc(cx, H * 0.12, 14 + phase * 26, 0, Math.PI * 2);
    g.strokeStyle = `rgba(${hexToRgb(pal.prize)},${clamp(1 - phase, 0.15, 1)})`;
    g.lineWidth = 3;
    g.stroke();
    if (flash > 0) {
      g.beginPath();
      g.arc(cx, H * 0.12, 10, 0, Math.PI * 2);
      g.fillStyle = `rgba(${hexToRgb(pal.prize)},${flash})`;
      g.fill();
    }

    // player ball
    const px = cx + playerOffset;
    g.beginPath();
    g.arc(px, playerY, BALL_R, 0, Math.PI * 2);
    g.fillStyle = over ? pal.foe : pal.hero;
    g.fill();
    g.beginPath();
    g.arc(px - BALL_R * 0.3, playerY - BALL_R * 0.3, BALL_R * 0.35, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,.7)";
    g.fill();

    if (over) endCard(g, t, W, H, "OFF THE RAIL");
  });
  loop.start();

  function hexToRgb(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

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
