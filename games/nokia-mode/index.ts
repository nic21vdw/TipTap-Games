import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "nokia-mode",
  title: "Nokia Mode",
  rule: "Tap left or right to turn. Eat. Grow.",
  year: 1997,
  description: "Grow the line. Don't bite yourself.",
  history:
    "Homage to the 1997 phone classic that shipped on 350 million handsets — the game that made mobile gaming exist in the first place.",
  tags: ["retro", "endurance", "precision"],
  palette: {
    hero: "#43aa8b",
    foe: "#f94144",
    prize: "#f9c74f",
    deep: "#277da1",
    glow: "#90be6d",
  },
  intensity: 0.45,
  luck: 0.05,
  nostalgia: 1.0,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

const COLS = 11;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const cell = Math.ceil(W / COLS);
  const ROWS = Math.ceil(H / cell);
  const gx = Math.floor((W - cell * COLS) / 2);
  const gy = 0;

  let snake: { x: number; y: number }[] = [];
  let dir = { x: 1, y: 0 };
  let pendingTurn = 0; // -1 left, +1 right, applied on next step
  let food = { x: 0, y: 0 };
  let stepT = 0;
  let stepEvery = 0.16;
  let score = 0;
  let over = false;
  let pulse = 0;

  const placeFood = () => {
    do {
      food = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS),
      };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  };

  const reset = () => {
    snake = [
      { x: 5, y: Math.floor(ROWS / 2) },
      { x: 4, y: Math.floor(ROWS / 2) },
      { x: 3, y: Math.floor(ROWS / 2) },
    ];
    dir = { x: 1, y: 0 };
    pendingTurn = 0;
    stepEvery = 0.16;
    score = 0;
    over = false;
    ctx.onScore(0);
    placeFood();
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    pendingTurn = e.clientX - r.left < W / 2 ? -1 : 1;
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  // attract mode: greedily head for the food, but never into a wall or itself
  const autoTurn = () => {
    const options: { turn: number; d: number }[] = [];
    for (const turn of [0, 1, -1]) {
      const nd =
        turn === 0
          ? dir
          : turn === 1
            ? { x: -dir.y, y: dir.x }
            : { x: dir.y, y: -dir.x };
      const head = { x: snake[0].x + nd.x, y: snake[0].y + nd.y };
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) continue;
      if (snake.some((s) => s.x === head.x && s.y === head.y)) continue;
      options.push({
        turn,
        d: Math.abs(head.x - food.x) + Math.abs(head.y - food.y),
      });
    }
    if (options.length === 0) return;
    options.sort((a, b) => a.d - b.d);
    pendingTurn = options[0].turn;
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    pulse += dt;
    if (!over) {
      stepT += dt;
      if (stepT >= stepEvery) {
        stepT = 0;
        if (auto) autoTurn();
        if (pendingTurn !== 0) {
          // rotate 90°: left = CCW, right = CW (screen coords, y down)
          dir =
            pendingTurn === 1
              ? { x: -dir.y, y: dir.x }
              : { x: dir.y, y: -dir.x };
          pendingTurn = 0;
        }
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        const hitWall =
          head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
        const hitSelf = snake.some((s) => s.x === head.x && s.y === head.y);
        if (hitWall || hitSelf) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(score, "GAME OVER");
        } else {
          snake.unshift(head);
          if (head.x === food.x && head.y === food.y) {
            score += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
            stepEvery = Math.max(0.07, stepEvery * 0.97);
            placeFood();
          } else {
            snake.pop();
          }
        }
      }
    }

    // full-bleed field, no frame — a subtle checker gives it depth
    g.fillStyle = shade(pal.deep, -0.62);
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,.035)";
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++)
        if ((c + r) % 2 === 0) g.fillRect(gx + c * cell, gy + r * cell, cell, cell);

    // food: a berry with a leaf and a highlight
    const fx = gx + food.x * cell + cell / 2;
    const fy = gy + food.y * cell + cell / 2;
    const fr = cell * 0.36 + Math.sin(pulse * 5) * cell * 0.04;
    g.beginPath();
    g.arc(fx, fy, fr, 0, Math.PI * 2);
    g.fillStyle = pal.prize;
    g.fill();
    g.beginPath();
    g.arc(fx - fr * 0.3, fy - fr * 0.32, fr * 0.28, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,.7)";
    g.fill();
    g.fillStyle = pal.glow;
    g.fillRect(fx - 1.5, fy - fr - 4, 3, 5);

    // snake: rounded segments, brightest at the head, with eyes
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const k = 1 - i / Math.max(1, snake.length);
      const pad = cell * (i === 0 ? 0.06 : 0.13);
      g.fillStyle = over
        ? shade(pal.foe, -0.15 + k * 0.2)
        : shade(pal.hero, -0.3 + k * 0.42);
      roundRect(
        g,
        gx + s.x * cell + pad,
        gy + s.y * cell + pad,
        cell - pad * 2,
        cell - pad * 2,
        cell * 0.34
      );
      g.fill();
    }
    const head = snake[0];
    const hx = gx + head.x * cell + cell / 2;
    const hy = gy + head.y * cell + cell / 2;
    const ex = dir.x * cell * 0.16;
    const ey = dir.y * cell * 0.16;
    const px = -dir.y * cell * 0.18;
    const py = dir.x * cell * 0.18;
    for (const sgn of [1, -1]) {
      g.beginPath();
      g.arc(hx + ex + px * sgn, hy + ey + py * sgn, cell * 0.11, 0, Math.PI * 2);
      g.fillStyle = "#fff";
      g.fill();
      g.beginPath();
      g.arc(hx + ex * 1.6 + px * sgn, hy + ey * 1.6 + py * sgn, cell * 0.055, 0, Math.PI * 2);
      g.fillStyle = "#101418";
      g.fill();
    }

    if (over) endCard(g, t, W, H, "GAME OVER");
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
