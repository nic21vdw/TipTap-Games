import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "shaft-descent",
  title: "Shaft Descent",
  rule: "Drag to steer, tap to shoot straight down",
  year: 2015,
  description: "Falling forever. Steer, shoot, survive deeper.",
  history:
    "Homage to the 2015 vertical free-fall shooters where gravity never let up and every platform and foe demanded a split-second call.",
  tags: ["reflex", "drag", "precision"],
  palette: {
    hero: "#9d4edd",
    foe: "#ff477e",
    prize: "#5ee7df",
    deep: "#240046",
    glow: "#c77dff",
  },
  intensity: 0.7,
  luck: 0.15,
  nostalgia: 0.4,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

interface Thing {
  x: number;
  y: number; // world y, larger = deeper
  kind: "platform" | "enemy" | "hazard";
  w: number;
  dead?: boolean;
}
interface Shot {
  x: number;
  y: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let px = W / 2;
  let targetX = px;
  let depth = 0;
  let fallSpeed = 160;
  let things: Thing[] = [];
  let shots: Shot[] = [];
  let score = 0;
  let over = false;
  let spawnY = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartPX = 0;
  let shotCd = 0;

  const spawnRow = (y: number) => {
    const kind = Math.random() < 0.4 ? "enemy" : Math.random() < 0.6 ? "hazard" : "platform";
    things.push({
      x: rand(W * 0.15, W * 0.85),
      y,
      kind: kind as Thing["kind"],
      w: kind === "platform" ? rand(50, 100) : 26,
    });
  };

  const reset = () => {
    px = W / 2;
    targetX = px;
    depth = 0;
    fallSpeed = 160;
    things = [];
    shots = [];
    spawnY = H * 0.5;
    for (let i = 0; i < 8; i++) {
      spawnRow(spawnY);
      spawnY += rand(90, 150);
    }
    score = 0;
    over = false;
    ctx.onScore(0);
  };

  const posOf = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  let downTime = 0;
  let downPos = { x: 0, y: 0 };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const p = posOf(e);
    dragging = true;
    dragStartX = p.x;
    dragStartPX = targetX;
    downTime = 0;
    downPos = p;
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const p = posOf(e);
    targetX = Math.max(16, Math.min(W - 16, dragStartPX + (p.x - dragStartX)));
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    if (over) return;
    const p = posOf(e);
    if (Math.hypot(p.x - downPos.x, p.y - downPos.y) < 8 && shotCd <= 0) {
      shots.push({ x: px, y: H * 0.35 });
      shotCd = 0.22;
      ctx.haptic("light");
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;
  let autoShotCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      fallSpeed = Math.min(420, fallSpeed + dt * 3);
      depth += fallSpeed * dt;
      score = Math.floor(depth / 20);
      ctx.onScore(score);
      shotCd = Math.max(0, shotCd - dt);

      if (auto) {
        const near = things.find((th) => !th.dead && th.y - depth > 0 && th.y - depth < H * 0.6);
        if (near) targetX = near.kind === "platform" ? near.x : near.x + 60;
        autoShotCd -= dt;
        if (autoShotCd <= 0) {
          const enemyBelow = things.find(
            (th) => th.kind === "enemy" && !th.dead && Math.abs(th.x - px) < 20 && th.y - depth > 0
          );
          if (enemyBelow) {
            shots.push({ x: px, y: H * 0.35 });
            autoShotCd = 0.25;
          } else {
            autoShotCd = 0.1;
          }
        }
      }
      px += (targetX - px) * Math.min(1, dt * 10);

      for (const s of shots) s.y -= 500 * dt;
      shots = shots.filter((s) => s.y > -20);

      for (const th of things) {
        if (th.dead) continue;
        const screenY = th.y - depth;
        if (th.kind === "enemy") {
          for (const s of shots) {
            if (Math.abs(s.x - th.x) < th.w * 0.6 && Math.abs(s.y - screenY) < 14) {
              th.dead = true;
              score += 3;
              ctx.onScore(score);
              ctx.haptic("hit");
            }
          }
        }
        if (!th.dead && screenY > H * 0.32 && screenY < H * 0.4) {
          if (Math.abs(th.x - px) < th.w * 0.55 + 12) {
            if (th.kind === "hazard" || th.kind === "enemy") {
              over = true;
              ctx.haptic("fail");
              ctx.onRunEnd(score);
            }
          }
        }
      }

      // recycle
      for (const th of things) {
        if (th.y - depth > H + 60) {
          th.y = spawnY;
          th.x = rand(W * 0.15, W * 0.85);
          const kind = Math.random() < 0.4 ? "enemy" : Math.random() < 0.6 ? "hazard" : "platform";
          th.kind = kind as Thing["kind"];
          th.w = kind === "platform" ? rand(50, 100) : 26;
          th.dead = false;
          spawnY += rand(90, 150);
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);
    // depth streak lines for motion feel
    g.strokeStyle = "rgba(255,255,255,.05)";
    for (let i = 0; i < 6; i++) {
      const y = ((i * 90 + depth * 0.6) % H);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }

    for (const th of things) {
      if (th.dead) continue;
      const y = th.y - depth;
      if (y < -40 || y > H + 40) continue;
      if (th.kind === "platform") {
        g.fillStyle = shade(pal.deep, 0.35);
        roundRect(g, th.x - th.w / 2, y - 8, th.w, 12, 4);
        g.fill();
      } else if (th.kind === "enemy") {
        g.fillStyle = pal.foe;
        g.beginPath();
        g.arc(th.x, y, th.w * 0.5, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = pal.foe;
        g.beginPath();
        g.moveTo(th.x - th.w / 2, y - 10);
        g.lineTo(th.x + th.w / 2, y - 10);
        g.lineTo(th.x, y + 10);
        g.fill();
      }
    }

    for (const s of shots) {
      g.fillStyle = pal.prize;
      g.fillRect(s.x - 2, s.y - 10, 4, 14);
    }

    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(px, H * 0.36, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = pal.glow;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.arc(px, H * 0.36, 18, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;

    g.fillStyle = t.ink;
    g.font = `700 14px ${t.fontBody}`;
    g.fillText(`${score}m`, 14, 26);

    if (over) endCard(g, t, W, H, "GAME OVER");
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
