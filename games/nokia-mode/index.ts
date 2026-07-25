import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop } from "@/games/engine";

const meta = {
  slug: "nokia-mode",
  title: "Nokia Mode",
  rule: "Tap left or right to turn. Eat. Grow.",
  year: 1997,
  description: "Grow the line. Don't bite yourself.",
  history:
    "Homage to the 1997 phone classic that shipped on 350 million handsets — the game that made mobile gaming exist in the first place.",
  tags: ["retro", "endurance", "precision"],
  intensity: 0.45,
  luck: 0.05,
  nostalgia: 1.0,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

const COLS = 15;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
  const cell = Math.floor((W * 0.92) / COLS);
  const ROWS = Math.floor((H * 0.6) / cell);
  const gx = Math.floor((W - cell * COLS) / 2);
  const gy = Math.floor(H * 0.18);

  let snake: { x: number; y: number }[] = [];
  let dir = { x: 1, y: 0 };
  let pendingTurn = 0; // -1 left, +1 right, applied on next step
  let food = { x: 0, y: 0 };
  let stepT = 0;
  let stepEvery = 0.16;
  let score = 0;
  let over = false;

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
          ctx.onRunEnd(score);
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

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);
    // board frame
    g.strokeStyle = t.inkDim;
    g.lineWidth = 2;
    g.strokeRect(gx - 3, gy - 3, cell * COLS + 6, cell * ROWS + 6);
    // food
    g.fillStyle = t.accent;
    g.fillRect(gx + food.x * cell + 2, gy + food.y * cell + 2, cell - 4, cell - 4);
    // snake
    g.fillStyle = over ? t.danger : t.ink;
    for (const s of snake)
      g.fillRect(gx + s.x * cell + 1, gy + s.y * cell + 1, cell - 2, cell - 2);

    g.textAlign = "center";
    g.fillStyle = t.inkDim;
    g.font = `500 14px ${t.fontBody}`;
    g.fillText("tap left / right of screen to turn", W / 2, gy + ROWS * cell + 34);
    if (over) {
      g.fillStyle = t.ink;
      g.font = `800 32px ${t.fontDisplay}`;
      g.fillText("GAME OVER", W / 2, gy - 40);
      g.font = `500 16px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, gy - 14);
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
