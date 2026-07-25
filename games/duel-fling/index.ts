import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "duel-fling",
  title: "Duel Fling",
  rule: "Drag back, release, land the shot.",
  year: 2016,
  description: "Alternating turns. One trajectory to get it right.",
  history:
    "Homage to the 2016 wave of one-on-one flick duels — arc your shot, take the hit, take your turn.",
  tags: ["precision", "chaos"],
  palette: {
    hero: "#e63946",
    foe: "#457b9d",
    prize: "#f1faee",
    deep: "#1d3557",
    glow: "#a8dadc",
  },
  intensity: 0.5,
  luck: 0.15,
  nostalgia: 0.4,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const groundY = H * 0.78;
  let playerX = W * 0.2;
  let enemyX = W * 0.8;
  let playerHp = 3;
  let enemyHp = 3;
  let turn: "player" | "enemy" = "player";
  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragCur = { x: 0, y: 0 };
  let proj: { x: number; y: number; vx: number; vy: number; from: "player" | "enemy" } | null = null;
  let score = 0;
  let over = false;
  let msgT = 0;

  const reset = () => {
    playerX = W * 0.2 + rand(-10, 10);
    enemyX = W * 0.8 + rand(-10, 10);
    playerHp = 3;
    enemyHp = 3;
    turn = "player";
    proj = null;
    score = 0;
    over = false;
    dragging = false;
    ctx.onScore(0);
  };

  const enemyThrow = () => {
    const dx = playerX - enemyX;
    const dist = Math.abs(dx);
    const vx = clamp(dx / dist, -1, 1) * rand(140, 220);
    proj = { x: enemyX, y: groundY - 40, vx, vy: -rand(220, 300), from: "enemy" };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    if (turn !== "player" || proj) return;
    const r = ctx.canvas.getBoundingClientRect();
    dragging = true;
    dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
    dragCur = { ...dragStart };
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const r = ctx.canvas.getBoundingClientRect();
    dragCur = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    const dx = dragStart.x - dragCur.x;
    const dy = dragStart.y - dragCur.y;
    if (Math.hypot(dx, dy) < 12) return;
    proj = {
      x: playerX,
      y: groundY - 40,
      vx: clamp(dx * 2.4, -400, 400),
      vy: clamp(dy * 2.4 - 60, -520, -80),
      from: "player",
    };
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);

  reset();
  let auto = false;

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();
    if (!over) {
      if (auto && turn === "player" && !proj) {
        dragStart = { x: playerX, y: groundY - 40 };
        const dx = enemyX - playerX;
        proj = { x: playerX, y: groundY - 40, vx: clamp(dx / 3, -300, 300), vy: -260, from: "player" };
      }
      if (proj) {
        proj.vy += 700 * dt;
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
        const targetX = proj.from === "player" ? enemyX : playerX;
        const hit = Math.abs(proj.x - targetX) < 26 && proj.y > groundY - 70 && proj.y < groundY - 10 && proj.vy > 0;
        if (hit) {
          if (proj.from === "player") {
            enemyHp -= 1;
            score += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
          } else {
            playerHp -= 1;
            ctx.haptic("fail");
          }
          proj = null;
          if (enemyHp <= 0 || playerHp <= 0) {
            over = true;
            ctx.onRunEnd(score);
          } else {
            turn = turn === "player" ? "enemy" : "player";
            msgT = 0.6;
            if (turn === "enemy") setTimeout(() => {}, 0);
          }
        } else if (proj.y > H + 50 || proj.x < -50 || proj.x > W + 50) {
          proj = null;
          turn = turn === "player" ? "enemy" : "player";
          msgT = 0.6;
        }
      } else if (turn === "enemy" && !over) {
        msgT -= dt;
        if (msgT <= 0) enemyThrow();
      }
    }

    g.fillStyle = shade(pal.deep, -0.3);
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, groundY, W, H - groundY);

    if (dragging) {
      g.strokeStyle = pal.glow;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(dragStart.x, dragStart.y);
      g.lineTo(dragCur.x, dragCur.y);
      g.stroke();
    }

    const drawFighter = (x: number, hp: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, groundY - 55, 14, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x - 10, groundY - 42, 20, 32);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < hp ? pal.prize : "rgba(255,255,255,.15)";
        g.fillRect(x - 18 + i * 14, groundY - 70, 10, 6);
      }
    };
    drawFighter(playerX, playerHp, pal.hero);
    drawFighter(enemyX, enemyHp, pal.foe);

    if (proj) {
      g.fillStyle = pal.prize;
      g.beginPath();
      g.arc(proj.x, proj.y, 7, 0, Math.PI * 2);
      g.fill();
    }

    if (over) endCard(g, theme, W, H, playerHp > 0 ? "YOU WIN" : "DEFEATED");
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
