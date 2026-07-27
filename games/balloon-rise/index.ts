import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "balloon-rise",
  title: "Nic's Balloon Rise",
  rule: "Drag left or right, dodge every spike",
  year: 2018,
  description: "Up, up, and don't drift into a spike.",
  history:
    "Homage to the 2018 wave of drag-to-steer ascent runners — endless climbs where the only enemy was your own thumb.",
  tags: ["reflex", "drag", "endurance"],
  palette: {
    hero: "#ff70a6",
    foe: "#ff9770",
    prize: "#ffd670",
    deep: "#0b1d51",
    glow: "#70d6ff",
  },
  intensity: 0.55,
  luck: 0.15,
  nostalgia: 0.2,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

interface Spike {
  x: number;
  y: number;
  vx: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const balloonY = H * 0.32;
  const r = 16;

  let x = 0;
  let dragging = false;
  let targetX = 0;
  let spikes: Spike[] = [];
  let spawnTimer = 0;
  let height = 0;
  let over = false;
  let wind = 0;
  let windTimer = 0;
  let bob = 0;

  const reset = () => {
    x = W / 2;
    targetX = x;
    dragging = false;
    spikes = [];
    spawnTimer = 0;
    height = 0;
    over = false;
    wind = 0;
    windTimer = rand(2, 4);
    ctx.onScore(0);
  };
  reset();

  const pointerPos = (e: PointerEvent) => {
    const rct = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - rct.left, y: e.clientY - rct.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    dragging = true;
    targetX = pointerPos(e).x;
  };
  const onMove = (e: PointerEvent) => {
    if (dragging) targetX = pointerPos(e).x;
  };
  const onUp = () => {
    dragging = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  let auto = false;

  const autoSteer = () => {
    let target: Spike | null = null;
    for (const s of spikes) {
      if (s.y < balloonY) {
        if (!target || s.y > target.y) target = s;
      }
    }
    targetX = target ? (target.x < W / 2 ? W * 0.75 : W * 0.25) : x;
  };

  const loop = makeLoop((dt, t) => {
    const theme = ctx.getTheme();

    if (!over) {
      if (auto) autoSteer();

      const climbSpeed = clamp(90 + height * 0.06, 90, 260);

      windTimer -= dt;
      if (windTimer <= 0) {
        wind = rand(-70, 70);
        windTimer = rand(2.5, 4.5);
      }

      const ease = 1 - Math.pow(0.001, dt);
      x += (targetX - x) * ease + wind * dt;
      x = clamp(x, r, W - r);

      spawnTimer += dt;
      const interval = clamp(0.62 - height * 0.0006, 0.28, 0.62);
      if (spawnTimer >= interval) {
        spawnTimer = 0;
        spikes.push({ x: rand(r * 2, W - r * 2), y: H + 20, vx: rand(-20, 20) });
      }

      for (const s of spikes) {
        s.y -= climbSpeed * dt;
        s.x += s.vx * dt;
        if (s.x < 10 || s.x > W - 10) s.vx *= -1;
        if (Math.hypot(s.x - x, s.y - balloonY) < r + 12) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(Math.floor(height));
        }
      }
      spikes = spikes.filter((s) => s.y > -30);

      height += climbSpeed * dt * 0.08;
      ctx.onScore(Math.floor(height));
    }

    bob += dt;

    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.05));
    sky.addColorStop(1, shade(pal.deep, -0.62));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    for (const s of spikes) {
      g.beginPath();
      g.moveTo(s.x, s.y - 16);
      g.lineTo(s.x - 13, s.y + 12);
      g.lineTo(s.x + 13, s.y + 12);
      g.closePath();
      g.fillStyle = pal.foe;
      g.fill();
    }

    const bobY = balloonY + Math.sin(bob * 2.2) * 3;
    g.strokeStyle = shade(pal.hero, -0.2);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, bobY + r);
    g.lineTo(x, bobY + r + 20);
    g.stroke();
    drawNicHead(g, {
      x: x,
      y: bobY,
      r: r,
      skin: over ? pal.foe : pal.hero,
      hair: shade(pal.deep, -0.4),
      eye: theme.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: theme.ink,
      gape: over ? 0.85 : 0,
      scowl: over ? 1 : 0,
    });
    g.fillStyle = shade(pal.hero, -0.3);
    g.beginPath();
    g.moveTo(x - 4, bobY + r);
    g.lineTo(x + 4, bobY + r);
    g.lineTo(x, bobY + r + 8);
    g.closePath();
    g.fill();

    g.fillStyle = "rgba(255,255,255,.6)";
    g.font = "600 13px system-ui";
    g.fillText(`wind ${wind > 0 ? "→" : wind < 0 ? "←" : "-"}`, 14, 24);

    if (over) endCard(g, theme, W, H, "POPPED");
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
