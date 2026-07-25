import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand } from "@/games/engine";

const meta = {
  slug: "cross-traffic",
  title: "Cross Traffic",
  rule: "Tap to hop forward. Time the gaps.",
  year: 2014,
  description: "Hop. Wait. Hop. Don't get flattened.",
  history:
    "Homage to 2014's hop-across-traffic arcade — the one that made 'why did the chicken cross the road' a genre.",
  tags: ["precision", "oneTap", "endurance"],
  intensity: 0.6,
  luck: 0.2,
  nostalgia: 0.4,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

interface Lane {
  kind: "safe" | "road";
  dir: 1 | -1;
  speed: number;
  cars: number[]; // x positions
  carW: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
  const rowH = H * 0.11;
  const px = W / 2;
  const pR = 13;
  let lanes: Lane[] = [];
  let row = 0; // player progress (index into lanes)
  let cam = 0; // camera row offset (smooth)
  let score = 0;
  let over = false;
  let idleT = 0; // pressure: too long on a road lane's edge is fine, but reward pace

  const makeLane = (i: number): Lane => {
    if (i < 2 || Math.random() < 0.35)
      return { kind: "safe", dir: 1, speed: 0, cars: [], carW: 0 };
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = rand(W * 0.25, W * 0.55) + Math.min(score, 30) * 2;
    const carW = rand(50, 90);
    const n = 2 + Math.floor(Math.random() * 2);
    const gap = (W + carW * 2) / n;
    const off = rand(0, gap);
    return {
      kind: "road",
      dir: dir as 1 | -1,
      speed,
      carW,
      cars: Array.from({ length: n }, (_, k) => off + k * gap),
    };
  };

  const reset = () => {
    lanes = Array.from({ length: 30 }, (_, i) => makeLane(i));
    row = 0;
    cam = 0;
    score = 0;
    over = false;
    idleT = 0;
    ctx.onScore(0);
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    row += 1;
    idleT = 0;
    if (row > score) {
      score = row;
      ctx.onScore(score);
    }
    ctx.haptic("light");
    while (lanes.length < row + 12) lanes.push(makeLane(lanes.length));
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  const laneY = (i: number) => H * 0.72 - (i - cam) * rowH;

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: hop the moment the next lane has a clear window
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          const next = lanes[row + 1];
          const clear =
            !next ||
            next.kind === "safe" ||
            next.cars.every((cx) => {
              const gapAhead =
                next.dir === 1 ? px - (cx + next.carW) : cx - px;
              return gapAhead > 60 || gapAhead < -next.carW - 40;
            });
          if (clear) {
            row += 1;
            if (row > score) {
              score = row;
              ctx.onScore(score);
            }
            while (lanes.length < row + 12) lanes.push(makeLane(lanes.length));
            autoCd = 0.28;
          }
        }
      }
      cam += (row - cam) * Math.min(1, dt * 6);
      idleT += dt;
      for (const lane of lanes) {
        if (lane.kind !== "road") continue;
        for (let i = 0; i < lane.cars.length; i++) {
          lane.cars[i] += lane.dir * lane.speed * dt;
          if (lane.dir === 1 && lane.cars[i] > W + lane.carW) lane.cars[i] = -lane.carW * 2;
          if (lane.dir === -1 && lane.cars[i] < -lane.carW * 2) lane.cars[i] = W + lane.carW;
        }
      }
      const cur = lanes[row];
      if (cur.kind === "road") {
        const y = laneY(row);
        for (const cx of cur.cars) {
          if (px + pR > cx && px - pR < cx + cur.carW && Math.abs(y - laneY(row)) < rowH) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          }
        }
      }
    }

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);
    const lo = Math.max(0, Math.floor(cam) - 4);
    const hi = Math.min(lanes.length - 1, Math.floor(cam) + 10);
    for (let i = lo; i <= hi; i++) {
      const y = laneY(i);
      if (lanes[i].kind === "road") {
        g.fillStyle = t.surface;
        g.fillRect(0, y - rowH / 2, W, rowH - 2);
        g.fillStyle = t.accentAlt;
        for (const cx of lanes[i].cars)
          g.fillRect(cx, y - rowH * 0.28, lanes[i].carW, rowH * 0.56);
      } else {
        g.fillStyle = t.bg;
        g.fillRect(0, y - rowH / 2, W, rowH - 2);
        g.strokeStyle = t.surface;
        g.strokeRect(-2, y - rowH / 2, W + 4, rowH - 2);
      }
    }
    // player
    g.beginPath();
    g.arc(px, laneY(row), pR, 0, Math.PI * 2);
    g.fillStyle = over ? t.danger : t.accent;
    g.fill();

    g.textAlign = "center";
    if (over) {
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("SPLAT", W / 2, H * 0.16);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, H * 0.16 + 34);
    }
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
