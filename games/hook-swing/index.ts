import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "hook-swing",
  title: "Nic's Hook Swing",
  rule: "Tap to release, swing to the next anchor",
  year: 2019,
  description: "Release, swing, repeat — don't miss the next hook.",
  history:
    "Homage to the 2019 wave of one-button grapple runners that turned every gap and spike pit into a pure timing puzzle.",
  tags: ["reflex", "precision", "oneTap"],
  palette: {
    hero: "#3fc1c9",
    foe: "#e94560",
    prize: "#ffc857",
    deep: "#16213e",
    glow: "#4895ef",
  },
  intensity: 0.6,
  luck: 0.05,
  nostalgia: 0.2,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 8,
} satisfies GameModule["meta"];

interface Anchor {
  x: number;
  y: number;
}

const GRAV = 1500;
const DAMPING = 0.06;
const GRAB_RADIUS = 34;
const GROUND_Y_FRAC = 0.86;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const groundY = H * GROUND_Y_FRAC;

  let anchors: Anchor[] = [];
  let curIdx = 0;
  let ropeLen = 100;
  let theta = 0;
  let omega = 0;
  let mode: "swing" | "fly" = "swing";
  let flyX = 0;
  let flyY = 0;
  let flyVX = 0;
  let flyVY = 0;
  let camX = 0;
  let score = 0;
  let over = false;
  let failReason = "MISSED!";

  const ensureAnchors = () => {
    while (
      anchors.length === 0 ||
      anchors[anchors.length - 1].x < camX + W * 2.2
    ) {
      const prev = anchors[anchors.length - 1];
      const px = prev ? prev.x : 0;
      const py = prev ? prev.y : H * 0.35;
      const nx = px + rand(170, 235);
      const ny = Math.min(H * 0.66, Math.max(H * 0.12, py + rand(-110, 110)));
      anchors.push({ x: nx, y: ny });
    }
  };

  const playerWorld = (): { x: number; y: number } => {
    if (mode === "fly") return { x: flyX, y: flyY };
    const a = anchors[curIdx];
    return {
      x: a.x + ropeLen * Math.sin(theta),
      y: a.y + ropeLen * Math.cos(theta),
    };
  };

  const reset = () => {
    anchors = [];
    ensureAnchors();
    curIdx = 0;
    ropeLen = 100;
    theta = -0.9;
    omega = 0;
    mode = "swing";
    camX = 0;
    score = 0;
    over = false;
    ctx.onScore(0);
  };

  const release = () => {
    if (over || mode !== "swing") return;
    const a = anchors[curIdx];
    const vx = ropeLen * omega * Math.cos(theta);
    const vy = -ropeLen * omega * Math.sin(theta);
    ensureAnchors();
    const nextIdx = curIdx + 1;
    if (nextIdx >= anchors.length) return;
    flyX = a.x + ropeLen * Math.sin(theta);
    flyY = a.y + ropeLen * Math.cos(theta);
    flyVX = vx;
    flyVY = vy;
    curIdx = nextIdx;
    mode = "fly";
    ctx.haptic("light");
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    release();
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let wasBehind = true;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (mode === "swing") {
        const angAccel = -(GRAV / ropeLen) * Math.sin(theta) - DAMPING * omega;
        omega += angAccel * dt;
        theta += omega * dt;

        // attract mode: release once the swing crests forward through center
        if (auto) {
          const forward = omega > 0.15 && theta > -0.06 && theta < 0.35;
          if (forward && wasBehind) {
            release();
          }
          wasBehind = theta < -0.06;
        }

        const p = playerWorld();
        if (p.y > groundY) {
          over = true;
          failReason = "SPIKED!";
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
        camX = p.x - W * 0.36;
      } else {
        flyVY += GRAV * dt;
        flyX += flyVX * dt;
        flyY += flyVY * dt;
        camX = flyX - W * 0.36;

        const target = anchors[curIdx];
        const dx = flyX - target.x;
        const dy = flyY - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < GRAB_RADIUS) {
          ropeLen = Math.max(40, dist);
          theta = Math.atan2(dx, dy);
          omega =
            (flyVX * Math.cos(theta) - flyVY * Math.sin(theta)) / ropeLen;
          mode = "swing";
          ctx.haptic("hit");
        } else if (flyY > groundY) {
          over = true;
          failReason = "MISSED!";
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
      }

      const worldX = mode === "fly" ? flyX : playerWorld().x;
      const newScore = Math.max(0, Math.floor(worldX / 20));
      if (newScore !== score) {
        score = newScore;
        ctx.onScore(score);
      }
    }

    // background
    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, shade(pal.deep, 0.08));
    sky.addColorStop(1, shade(pal.deep, -0.4));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, groundY);

    // spikes / ground strip, scrolling with camera
    g.fillStyle = shade(pal.deep, -0.7);
    g.fillRect(0, groundY, W, H - groundY);
    const spikeW = 22;
    const startI = Math.floor(camX / spikeW) - 1;
    for (let i = startI; i < startI + Math.ceil(W / spikeW) + 2; i++) {
      const sx = i * spikeW - camX;
      g.beginPath();
      g.moveTo(sx, groundY);
      g.lineTo(sx + spikeW / 2, groundY - 16);
      g.lineTo(sx + spikeW, groundY);
      g.closePath();
      g.fillStyle = pal.foe;
      g.fill();
    }

    // anchors + rope
    for (const a of anchors) {
      const ax = a.x - camX;
      if (ax < -40 || ax > W + 40) continue;
      g.beginPath();
      g.arc(ax, a.y, 8, 0, Math.PI * 2);
      g.fillStyle = pal.prize;
      g.fill();
      g.beginPath();
      g.arc(ax, a.y, 3.5, 0, Math.PI * 2);
      g.fillStyle = shade(pal.prize, -0.4);
      g.fill();
    }

    const p = playerWorld();
    const psx = p.x - camX;
    if (mode === "swing") {
      const a = anchors[curIdx];
      g.strokeStyle = pal.glow;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(a.x - camX, a.y);
      g.lineTo(psx, p.y);
      g.stroke();
    }

    drawNicHead(g, {
      x: psx,
      y: p.y,
      r: 13,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      gape: over ? 0.8 : 0,
      scowl: over ? 1 : 0,
    });

    if (over) endCard(g, t, W, H, failReason);
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
