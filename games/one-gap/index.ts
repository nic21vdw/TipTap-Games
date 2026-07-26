import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawFoot } from "@/games/nic-art";

const meta = {
  slug: "one-gap",
  title: "Foot Cam",
  rule: "Tap to kick up through the gaps",
  year: 2013,
  description: "The camera was pointed down there anyway.",
  history:
    "Homage to 2013's infamous one-button rage game — pulled from the stores at its peak by its own creator, never really gone since. This one is shot on the basement foot cam.",
  tags: ["reflex", "oneTap", "endurance", "chaos"],
  palette: {
    hero: "#e8b48c",
    foe: "#8d97a3",
    prize: "#ffffff",
    deep: "#1b2230",
    glow: "#39465c",
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
          ctx.onRunEnd(score);
        }
      }
      if (by + R > H - GROUND || by - R < 0) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    // ---- the wall behind the desk ----
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, pal.deep);
    sky.addColorStop(0.75, pal.glow);
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // dust hanging in the monitor light, parallax at a third of the scroll
    g.fillStyle = "rgba(255,255,255,.2)";
    for (let i = 0; i < 26; i++) {
      const cx = ((i * 137 + scroll * 0.33 * (1 + (i % 3))) % (W + 60)) - 30;
      const cy = H * (((i * 0.161) % 1) * 0.9 + 0.05);
      g.beginPath();
      g.arc(cx, cy, 1 + (i % 3) * 0.7, 0, Math.PI * 2);
      g.fill();
    }

    // ---- the towers of empties you have to kick between ----
    /** Rims every 30px turn a plain column into a stack of cans. */
    const stackRims = (x: number, y: number, h: number) => {
      if (h <= 0) return;
      g.save();
      g.beginPath();
      g.rect(x, y, PIPE_W, h);
      g.clip();
      for (let yy = y; yy < y + h; yy += 30) {
        g.fillStyle = "rgba(0,0,0,.3)";
        g.fillRect(x, yy, PIPE_W, 4);
        g.fillStyle = "rgba(255,255,255,.16)";
        g.fillRect(x, yy + 4, PIPE_W, 2);
      }
      g.restore();
    };
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
      stackRims(p.x, 0, topH - capH);
      stackRims(p.x, botY + capH, H - botY - capH);
      // the can nearest the gap, sitting proud of the stack
      g.fillStyle = body;
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

    // ---- the foot ----
    // A kick pitches the toes up; falling rolls them back down.
    const tilt = Math.max(-0.5, Math.min(1.1, vy / (H * 0.9)));
    const kick = flap > 0 ? -0.5 : 0;
    drawFoot(
      g,
      bx,
      by,
      R * 2.9,
      tilt + kick,
      over ? shade(pal.hero, -0.3) : pal.hero,
      shade(pal.hero, 0.4)
    );

    // the foot cam's own overlay, because it is always recording. Sits below
    // the feed's top chrome so the two never overlap.
    g.strokeStyle = "rgba(255,255,255,.22)";
    g.lineWidth = 2;
    g.strokeRect(10, 10, W - 20, H - 20);
    const recY = H * 0.16;
    // the record light reads off the theme, not the palette — `foe` here is
    // the colour of the stacks, and a grey REC dot fools nobody
    g.fillStyle = t.danger;
    g.beginPath();
    g.arc(26, recY, 5, 0, Math.PI * 2);
    g.fill();
    g.textAlign = "left";
    g.fillStyle = "rgba(255,255,255,.7)";
    g.font = `700 12px ${t.fontBody}`;
    g.fillText("FOOT CAM", 38, recY + 5);

    g.textAlign = "center";
    if (!started && !over) {
      g.fillStyle = "rgba(255,255,255,.7)";
      g.font = `700 17px ${t.fontBody}`;
      g.fillText("tap to start kicking", W / 2, H * 0.3);
    }
    if (over) endCard(g, t, W, H, "TOES DOWN");
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
