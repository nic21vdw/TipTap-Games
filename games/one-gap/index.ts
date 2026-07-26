import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "one-gap",
  title: "One Gap",
  rule: "Tap to flap through the gaps",
  year: 2013,
  description: "Tap to flap. The gap is smaller than your ego.",
  history:
    "Homage to 2013's infamous one-button rage game — pulled from the stores at its peak by its own creator, never really gone since.",
  tags: ["reflex", "oneTap", "endurance", "chaos"],
  palette: {
    hero: "#ffd166",
    foe: "#2a9d8f",
    prize: "#ffffff",
    deep: "#118ab2",
    glow: "#8ecae6",
  },
  intensity: 0.7,
  speed: 0.8,
  difficulty: 0.8,
  luck: 0.1,
  nostalgia: 0.6,
  realism: 0.2,
  kidSafe: true,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

interface Pipe {
  x: number;
  gapY: number;
  passed: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const bx = W * 0.3;
  const R = 15;
  const GAP = H * 0.25;
  const PIPE_W = 62;
  const GROUND = H * 0.09;
  let by = H / 2;
  let vy = 0;
  let pipes: Pipe[] = [];
  let spawnIn = 0;
  let score = 0;
  let over = false;
  let started = false;
  let auto = false;
  let scroll = 0;
  let flap = 0; // wing animation clock

  const reset = () => {
    by = H / 2;
    vy = 0;
    pipes = [];
    spawnIn = 0.4;
    score = 0;
    over = false;
    started = false;
    ctx.onScore(0);
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    started = true;
    vy = -H * 0.55;
    flap = 0.22;
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (auto) {
      started = true;
      const next = pipes.find((p) => p.x + PIPE_W > bx - R);
      const aim = next ? next.gapY - GAP * 0.12 : H / 2;
      if (by > aim && vy > -H * 0.1) {
        vy = -H * 0.55;
        flap = 0.22;
      }
    }
    const speed = W * 0.42 + score * 2;
    if (!over && started) {
      vy += H * 1.5 * dt;
      by += vy * dt;
      flap = Math.max(0, flap - dt);
      scroll = (scroll + speed * dt) % 40;
      spawnIn -= dt;
      if (spawnIn <= 0) {
        pipes.push({
          x: W + PIPE_W,
          gapY: rand(GAP * 0.75, H - GROUND - GAP * 0.75),
          passed: false,
        });
        spawnIn = 1.6;
      }
      for (let i = pipes.length - 1; i >= 0; i--) {
        const p = pipes[i];
        p.x -= speed * dt;
        if (!p.passed && p.x + PIPE_W < bx - R) {
          p.passed = true;
          score += 1;
          ctx.onScore(score);
          ctx.haptic("hit");
        }
        if (p.x < -PIPE_W) pipes.splice(i, 1);
        const inX = bx + R > p.x && bx - R < p.x + PIPE_W;
        const inGap = by - R > p.gapY - GAP / 2 && by + R < p.gapY + GAP / 2;
        if (inX && !inGap) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score, "DOWN");
        }
      }
      if (by + R > H - GROUND || by - R < 0) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score, "DOWN");
      }
    }

    // ---- sky ----
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, pal.deep);
    sky.addColorStop(0.75, pal.glow);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // drifting clouds, parallax at a third of pipe speed
    g.fillStyle = "rgba(255,255,255,.55)";
    for (let i = 0; i < 4; i++) {
      const cw = 70 + i * 18;
      const cx = ((i * 137 + scroll * 0.33 * (i + 1)) % (W + 160)) - 80;
      const cy = H * (0.12 + i * 0.13);
      g.beginPath();
      g.arc(cx, cy, cw * 0.28, 0, Math.PI * 2);
      g.arc(cx + cw * 0.3, cy + 4, cw * 0.22, 0, Math.PI * 2);
      g.arc(cx - cw * 0.28, cy + 5, cw * 0.19, 0, Math.PI * 2);
      g.fill();
    }

    // ---- pipes ----
    for (const p of pipes) {
      const body = g.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
      body.addColorStop(0, shade(pal.foe, -0.22));
      body.addColorStop(0.35, pal.foe);
      body.addColorStop(1, shade(pal.foe, -0.32));
      const capH = 22;
      const topH = p.gapY - GAP / 2;
      const botY = p.gapY + GAP / 2;
      g.fillStyle = body;
      g.fillRect(p.x, 0, PIPE_W, topH - capH);
      g.fillRect(p.x, botY + capH, PIPE_W, H - botY - capH);
      // lips
      g.fillRect(p.x - 5, topH - capH, PIPE_W + 10, capH);
      g.fillRect(p.x - 5, botY, PIPE_W + 10, capH);
      g.fillStyle = "rgba(255,255,255,.22)";
      g.fillRect(p.x + 6, 0, 7, topH - capH);
      g.fillRect(p.x + 6, botY + capH, 7, H - botY - capH);
      g.fillStyle = "rgba(0,0,0,.18)";
      g.fillRect(p.x - 5, topH - 3, PIPE_W + 10, 3);
      g.fillRect(p.x - 5, botY, PIPE_W + 10, 3);
    }

    // ---- ground ----
    g.fillStyle = shade(pal.foe, -0.45);
    g.fillRect(0, H - GROUND, W, GROUND);
    g.fillStyle = shade(pal.foe, -0.1);
    g.fillRect(0, H - GROUND, W, 7);
    g.fillStyle = "rgba(0,0,0,.14)";
    for (let x = -scroll; x < W; x += 40) g.fillRect(x, H - GROUND + 7, 20, 5);

    // ---- bird ----
    const tilt = Math.max(-0.5, Math.min(1.1, vy / (H * 0.9)));
    g.save();
    g.translate(bx, by);
    g.rotate(tilt);
    // body
    g.beginPath();
    g.ellipse(0, 0, R * 1.25, R, 0, 0, Math.PI * 2);
    g.fillStyle = over ? "#e5646d" : pal.hero;
    g.fill();
    g.strokeStyle = "rgba(0,0,0,.28)";
    g.lineWidth = 2;
    g.stroke();
    // belly
    g.beginPath();
    g.ellipse(-2, 4, R * 0.72, R * 0.5, 0, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,.55)";
    g.fill();
    // wing — flaps on tap
    const wing = flap > 0 ? -0.9 : 0.25;
    g.save();
    g.translate(-3, -1);
    g.rotate(wing);
    g.beginPath();
    g.ellipse(0, 0, R * 0.62, R * 0.42, 0, 0, Math.PI * 2);
    g.fillStyle = shade(pal.hero, -0.28);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,.22)";
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
    // beak
    g.beginPath();
    g.moveTo(R * 1.15, -1);
    g.lineTo(R * 1.85, 3);
    g.lineTo(R * 1.1, 7);
    g.closePath();
    g.fillStyle = "#f4802f";
    g.fill();
    // eye
    g.beginPath();
    g.arc(R * 0.55, -R * 0.35, R * 0.3, 0, Math.PI * 2);
    g.fillStyle = "#fff";
    g.fill();
    g.beginPath();
    g.arc(R * 0.66, -R * 0.35, R * 0.14, 0, Math.PI * 2);
    g.fillStyle = "#1b1b1f";
    g.fill();
    g.restore();

    g.textAlign = "center";
    if (!started && !over) {
      g.fillStyle = "rgba(0,0,0,.5)";
      g.font = `700 17px ${t.fontBody}`;
      g.fillText("tap to start flapping", W / 2, H * 0.3);
    }
    if (over) endCard(g, t, W, H, "DOWN");
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
