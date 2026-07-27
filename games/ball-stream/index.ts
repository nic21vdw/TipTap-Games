import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "ball-stream",
  title: "Nic's Ball Stream",
  rule: "Aim, release, break the numbered rows",
  year: 2017,
  description: "One shot, a burst of balls, and a wall of numbers.",
  history:
    "Homage to the 2017 bouncing-ball breakers that turned a single trajectory into a whole volley of chances against a falling wall.",
  tags: ["precision", "reflex", "chaos"],
  palette: {
    hero: "#2ec4b6",
    foe: "#e71d36",
    prize: "#ff9f1c",
    deep: "#011627",
    glow: "#fdffb6",
  },
  intensity: 0.65,
  luck: 0.2,
  nostalgia: 0.2,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

const COLS = 6;
const ROW_H = 34;
const TOP_Y = 46;

interface Block {
  col: number;
  row: number;
  hp: number;
}
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  live: boolean;
  delay: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const colW = W / COLS;
  const ballR = 6;
  const dangerY = H * 0.68;
  const launcherY = H * 0.88;
  const speed = 480;

  let blocks: Block[] = [];
  let ballCount = 3;
  let launcherX = W / 2;
  let aim = { x: 0, y: -1 };
  let aiming = false;
  let firing = false;
  let balls: Ball[] = [];
  let landed = 0;
  let score = 0;
  let over = false;

  const spawnRow = () => {
    for (const b of blocks) b.row += 1;
    const n = Math.max(1, blocks.length ? Math.max(...blocks.map((b) => b.row)) : 0);
    for (let c = 0; c < COLS; c++) {
      if (Math.random() < 0.78) {
        blocks.push({ col: c, row: 0, hp: Math.floor(1 + Math.random() * (2 + Math.floor(n / 3))) });
      }
    }
    for (const b of blocks) {
      if (TOP_Y + b.row * ROW_H > dangerY) {
        over = true;
      }
    }
    if (over) {
      ctx.haptic("fail");
      ctx.onRunEnd(score);
    }
  };

  const reset = () => {
    blocks = [];
    ballCount = 3;
    launcherX = W / 2;
    score = 0;
    over = false;
    balls = [];
    firing = false;
    aiming = false;
    ctx.onScore(0);
    for (let i = 0; i < 3; i++) spawnRow();
    over = false;
  };
  reset();

  const setAim = (clientX: number, clientY: number) => {
    const r = ctx.canvas.getBoundingClientRect();
    const dx = clientX - r.left - launcherX;
    let dy = clientY - r.top - launcherY;
    if (dy > -30) dy = -30;
    const len = Math.hypot(dx, dy) || 1;
    aim = { x: dx / len, y: dy / len };
  };

  const fire = () => {
    if (firing || over) return;
    firing = true;
    landed = 0;
    balls = [];
    for (let i = 0; i < ballCount; i++) {
      balls.push({ x: launcherX, y: launcherY, vx: 0, vy: 0, live: false, delay: i * 0.06 });
    }
  };

  const pointerPos = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    if (firing) return;
    aiming = true;
    setAim(e.clientX, e.clientY);
  };
  const onMove = (e: PointerEvent) => {
    if (aiming) setAim(e.clientX, e.clientY);
  };
  const onUp = () => {
    if (aiming) {
      aiming = false;
      fire();
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      if (auto && !firing) {
        autoCd -= dt;
        if (autoCd <= 0) {
          aim = { x: rand(-0.4, 0.4), y: -1 };
          const len = Math.hypot(aim.x, aim.y);
          aim.x /= len;
          aim.y /= len;
          fire();
          autoCd = rand(0.4, 0.7);
        }
      }

      if (firing) {
        let anyLive = false;
        for (const b of balls) {
          if (!b.live) {
            b.delay -= dt;
            if (b.delay <= 0) {
              b.live = true;
              b.x = launcherX;
              b.y = launcherY;
              b.vx = aim.x * speed;
              b.vy = aim.y * speed;
            } else {
              anyLive = true;
              continue;
            }
          }
          anyLive = true;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x < ballR || b.x > W - ballR) {
            b.vx *= -1;
            b.x = clamp(b.x, ballR, W - ballR);
          }
          if (b.y < ballR) {
            b.vy *= -1;
            b.y = ballR;
          }
          for (let i = blocks.length - 1; i >= 0; i--) {
            const bl = blocks[i];
            const bx = bl.col * colW + colW / 2;
            const by = TOP_Y + bl.row * ROW_H + ROW_H / 2;
            if (
              b.x > bx - colW / 2 + 2 &&
              b.x < bx + colW / 2 - 2 &&
              b.y > by - ROW_H / 2 + 2 &&
              b.y < by + ROW_H / 2 - 2
            ) {
              bl.hp -= 1;
              b.vy *= -1;
              if (bl.hp <= 0) {
                blocks.splice(i, 1);
                score += 15;
                ctx.onScore(score);
                ctx.haptic("hit");
              } else {
                ctx.haptic("light");
              }
              break;
            }
          }
          if (b.y > launcherY) {
            landed += 1;
            b.y = launcherY + 999; // mark done, filtered below
          }
        }
        balls = balls.filter((b) => b.y < launcherY + 500);
        if (!anyLive || balls.length === 0) {
          firing = false;
          ballCount = clamp(landed || ballCount, 2, 12);
          spawnRow();
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);

    g.strokeStyle = "rgba(255,255,255,.08)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, dangerY);
    g.lineTo(W, dangerY);
    g.stroke();

    for (const bl of blocks) {
      const bx = bl.col * colW + 3;
      const by = TOP_Y + bl.row * ROW_H;
      const hue = clamp(bl.hp / 6, 0, 1);
      g.fillStyle = shade(pal.hero, -0.5 + hue * 0.4);
      roundRect(g, bx, by, colW - 6, ROW_H - 6, 6);
      g.fill();
      g.fillStyle = "#fff";
      g.font = "700 14px system-ui";
      g.textAlign = "center";
      g.fillText(String(bl.hp), bx + (colW - 6) / 2, by + (ROW_H - 6) / 2 + 5);
      g.textAlign = "left";
    }

    // every ball in the stream is another one of him
    for (const b of balls) {
      if (!b.live) continue;
      drawNicHead(g, {
        x: b.x,
        y: b.y,
        r: ballR * 1.15,
        skin: pal.prize,
        hair: shade(pal.deep, -0.4),
        eye: t.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: t.ink,
        gape: 0.3,
      });
    }

    if (aiming && !over) {
      g.strokeStyle = "rgba(255,255,255,.3)";
      g.lineWidth = 2;
      g.setLineDash([4, 5]);
      g.beginPath();
      g.moveTo(launcherX, launcherY);
      g.lineTo(launcherX + aim.x * 200, launcherY + aim.y * 200);
      g.stroke();
      g.setLineDash([]);
    }

    g.beginPath();
    g.arc(launcherX, launcherY, 10, 0, Math.PI * 2);
    g.fillStyle = pal.glow;
    g.fill();

    g.fillStyle = "rgba(255,255,255,.6)";
    g.font = "600 13px system-ui";
    g.fillText(`x${ballCount}`, launcherX + 16, launcherY + 4);

    if (over) endCard(g, t, W, H, "WALL BREACHED");
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
