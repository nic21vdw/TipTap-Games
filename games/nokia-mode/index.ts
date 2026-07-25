import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, roundRect, clamp } from "@/games/engine";
import {
  createFx,
  createCombo,
  drawCombo,
  resultCard,
  hexA,
  mix,
  halo,
  pulse,
  lerp,
  vignette,
  groundInk,
  safeBox,
} from "@/games/fx";

const meta = {
  slug: "nokia-mode",
  title: "Nokia Mode",
  rule: "Tap left or right to turn. Eat. Grow.",
  year: 1997,
  description: "Grow the line. Don't bite yourself. Eat fast for the chain.",
  history:
    "Homage to the 1997 phone classic that shipped on 350 million handsets — the game that made mobile gaming exist in the first place.",
  tags: ["retro", "endurance", "precision"],
  palette: {
    hero: "#43aa8b",
    foe: "#f94144",
    prize: "#f9c74f",
    deep: "#0d3b4f",
    glow: "#90be6d",
  },
  intensity: 0.45,
  luck: 0.05,
  nostalgia: 1.0,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

const COLS = 11;

interface P {
  x: number;
  y: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(3, 4);

  // the field is inset so food never spawns behind the feed's chrome
  const box = safeBox(W, H);
  const cell = Math.ceil(W / COLS);
  const ROWS = Math.max(6, Math.floor((box.bottom - box.top + cell) / cell));
  const gx = Math.floor((W - cell * COLS) / 2);
  const gy = Math.round(box.top - cell * 0.5);

  let snake: P[] = [];
  let prev: P[] = []; // last step's positions, so drawing can interpolate
  let dir: P = { x: 1, y: 0 };
  let pendingTurn = 0; // -1 left, +1 right, applied on next step
  let food: P = { x: 0, y: 0 };
  let foodBorn = 0;
  let stepT = 0;
  let stepEvery = 0.17;
  let score = 0;
  let best = 0;
  let over = false;
  let overAge = 0;
  let clock = 0;
  let eatFlash = 0;

  const placeFood = () => {
    do {
      food = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS),
      };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
    foodBorn = clock;
  };

  const reset = () => {
    const midRow = Math.floor(ROWS / 2);
    snake = [
      { x: 5, y: midRow },
      { x: 4, y: midRow },
      { x: 3, y: midRow },
    ];
    prev = snake.map((s) => ({ ...s }));
    dir = { x: 1, y: 0 };
    pendingTurn = 0;
    stepEvery = 0.17;
    stepT = 0;
    score = 0;
    over = false;
    overAge = 0;
    combo.clear();
    fx.clear();
    ctx.onScore(0);
    placeFood();
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      if (overAge > 0.3) reset();
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

  const die = () => {
    over = true;
    overAge = 0;
    best = Math.max(best, score);
    combo.break();
    ctx.haptic("fail");
    fx.shake(16);
    fx.flash(pal.foe, 0.34);
    const h = snake[0];
    fx.burst(gx + h.x * cell + cell / 2, gy + h.y * cell + cell / 2, {
      count: 24,
      colour: [pal.foe, pal.hero, "#ffffff"],
      speed: 280,
      life: 0.8,
      size: 4.5,
      gravity: 400,
    });
    ctx.onRunEnd(score);
  };

  const step = () => {
    const th = ctx.getTheme();
    if (auto) autoTurn();
    if (pendingTurn !== 0) {
      // rotate 90°: left = CCW, right = CW (screen coords, y down)
      dir =
        pendingTurn === 1 ? { x: -dir.y, y: dir.x } : { x: dir.y, y: -dir.x };
      pendingTurn = 0;
    }
    prev = snake.map((s) => ({ ...s }));
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const hitWall = head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS;
    // the tail tip moves out of the way this step, so it is never a crash
    const hitSelf = snake.some(
      (s, i) => i < snake.length - 1 && s.x === head.x && s.y === head.y
    );
    if (hitWall || hitSelf) {
      die();
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      const gained = combo.hit();
      score += gained;
      ctx.onScore(score);
      ctx.haptic("hit");
      eatFlash = 0.35;
      const fxx = gx + food.x * cell + cell / 2;
      const fyy = gy + food.y * cell + cell / 2;
      fx.ring(fxx, fyy, pal.prize, cell * 0.5, 4);
      fx.burst(fxx, fyy, {
        count: 14,
        colour: [pal.prize, pal.glow, "#ffffff"],
        speed: 190,
        life: 0.5,
        size: 3.2,
      });
      if (gained > 1) {
        fx.pop(fxx, fyy - cell * 0.7, `+${gained}`, pal.prize, 20, th.fontDisplay);
      }
      stepEvery = Math.max(0.075, stepEvery * 0.975);
      placeFood();
      // the snake grew, so the new tail segment interpolates from where the
      // old tail already was
      prev.push(prev[prev.length - 1]);
    } else {
      snake.pop();
    }
  };

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    combo.update(dt);
    eatFlash = Math.max(0, eatFlash - dt);

    if (over) {
      overAge += dt;
    } else {
      stepT += dt;
      if (stepT >= stepEvery) {
        stepT -= stepEvery;
        step();
      }
    }

    // the alpha between grid steps, so the snake glides instead of jumping
    const k = over ? 1 : clamp(stepT / stepEvery, 0, 1);

    // ---- the field
    const field = g.createLinearGradient(0, 0, 0, H);
    field.addColorStop(0, mix(pal.deep, "#000000", 0.2));
    field.addColorStop(1, mix(pal.deep, "#000000", 0.55));
    g.fillStyle = field;
    g.fillRect(0, 0, W, H);
    // the playable field, marked out so the walls are somewhere you can see
    g.fillStyle = hexA("#000000", 0.28);
    g.fillRect(gx, gy, cell * COLS, cell * ROWS);
    g.strokeStyle = hexA(pal.glow, 0.35);
    g.lineWidth = 2;
    g.strokeRect(gx, gy, cell * COLS, cell * ROWS);
    g.fillStyle = hexA(pal.glow, 0.05);
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++)
        if ((c + r) % 2 === 0) g.fillRect(gx + c * cell, gy + r * cell, cell, cell);

    fx.begin(g);
    fx.drawUnder(g);

    // ---- food: a berry that breathes and glows
    const fx0 = gx + food.x * cell + cell / 2;
    const fy0 = gy + food.y * cell + cell / 2;
    const age = clock - foodBorn;
    const fr = cell * 0.34 * clamp(age * 6, 0.3, 1) + Math.sin(clock * 5) * cell * 0.04;
    halo(g, fx0, fy0, cell * 1.3, pal.prize, 0.4 + pulse(clock, 1.1) * 0.2);
    g.beginPath();
    g.arc(fx0, fy0, fr, 0, Math.PI * 2);
    g.fillStyle = pal.prize;
    g.fill();
    g.beginPath();
    g.arc(fx0 - fr * 0.3, fy0 - fr * 0.32, fr * 0.28, 0, Math.PI * 2);
    g.fillStyle = "rgba(255,255,255,.75)";
    g.fill();
    g.fillStyle = pal.glow;
    g.fillRect(fx0 - 1.5, fy0 - fr - 4, 3, 5);

    // ---- snake: interpolated between steps, brightest at the head
    const pos = (i: number) => {
      const a = prev[Math.min(i, prev.length - 1)] ?? snake[i];
      const b = snake[i];
      return {
        x: gx + lerp(a.x, b.x, k) * cell + cell / 2,
        y: gy + lerp(a.y, b.y, k) * cell + cell / 2,
      };
    };

    for (let i = snake.length - 1; i >= 0; i--) {
      const p = pos(i);
      const t = 1 - i / Math.max(1, snake.length);
      const size = cell * (i === 0 ? 0.92 : 0.78) * (i === snake.length - 1 ? 0.8 : 1);
      const body = over
        ? mix(pal.foe, "#000000", 0.15 + (1 - t) * 0.35)
        : mix(mix(pal.hero, pal.glow, t * 0.5), "#000000", 0.35 - t * 0.35);
      if (i === 0 && !over) halo(g, p.x, p.y, cell * 1.5, pal.hero, 0.3 + eatFlash);
      g.fillStyle = body;
      roundRect(g, p.x - size / 2, p.y - size / 2, size, size, size * 0.42);
      g.fill();
      if (i === 0) {
        g.fillStyle = hexA("#ffffff", 0.18);
        roundRect(g, p.x - size * 0.32, p.y - size * 0.38, size * 0.64, size * 0.3, size * 0.2);
        g.fill();
      }
    }

    // eyes on the head, pointing where it is going
    const head = pos(0);
    const ex = dir.x * cell * 0.16;
    const ey = dir.y * cell * 0.16;
    const ox = -dir.y * cell * 0.18;
    const oy = dir.x * cell * 0.18;
    for (const sgn of [1, -1]) {
      g.beginPath();
      g.arc(head.x + ex + ox * sgn, head.y + ey + oy * sgn, cell * 0.11, 0, Math.PI * 2);
      g.fillStyle = "#fff";
      g.fill();
      g.beginPath();
      g.arc(
        head.x + ex * 1.6 + ox * sgn,
        head.y + ey * 1.6 + oy * sgn,
        cell * 0.055,
        0,
        Math.PI * 2
      );
      g.fillStyle = "#101418";
      g.fill();
    }

    // ---- HUD
    drawCombo(g, combo, W / 2, H * 0.19, pal.prize, th.fontDisplay, clock);
    g.textAlign = "center";
    g.fillStyle = hexA(ink.main, 0.35);
    g.font = `700 12px ${th.fontBody}`;
    g.fillText(`LENGTH ${snake.length}`, W / 2, H * 0.13);
    if (score === 0 && !over) {
      g.fillStyle = hexA(ink.main, 0.35 + pulse(clock, 1.6) * 0.35);
      g.font = `700 13px ${th.fontBody}`;
      g.fillText("tap left or right to turn", W / 2, H * 0.75);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);
    vignette(g, W, H, 0.4);

    if (over) {
      resultCard(g, th, W, H, {
        title: "bitten",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `length ${snake.length} · chain ${combo.best}`,
        age: overAge,
        accent: pal.hero,
      });
    }
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
