import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "blade-duel",
  title: "Blade Duel",
  rule: "Swipe the telegraphed direction to parry",
  year: 2010,
  description: "Read the tell. Swing true. One bad guess ends it.",
  history:
    "Homage to the 2010 motion-sensing duel games that turned living rooms into arenas — read the telegraph, swing true, or eat the blade.",
  tags: ["reflex", "precision"],
  palette: {
    hero: "#5da2d5",
    foe: "#e05263",
    prize: "#f5c85a",
    deep: "#141a24",
    glow: "#7cf0d2",
  },
  intensity: 0.78,
  luck: 0.05,
  nostalgia: 0.8,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

type Dir = "left" | "right" | "overhead";
type Phase = "telegraph" | "counter";

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const playerX = W * 0.27;
  const foeX = W * 0.73;
  const baseY = H * 0.86;
  // silhouettes are drawn at a nominal ~90px tall; scale the scene to the phone
  const scene = Math.max(1, Math.min(H / 380, W / 260));

  let phase: Phase = "telegraph";
  let dir: Dir = "left";
  let windowTime = 1.1;
  let timeLeft = 1.1;
  let counterTime = 0;
  let score = 0;
  let over = false;
  let failMsg = "PARRIED WRONG";
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let autoActed = false;
  let shake = 0;

  const newTelegraph = () => {
    dir = Math.random() < 0.37 ? "left" : Math.random() < 0.5 ? "right" : "overhead";
    windowTime = Math.max(0.45, 1.1 - score * 0.02);
    timeLeft = windowTime;
    phase = "telegraph";
    autoActed = false;
  };

  const reset = () => {
    score = 0;
    over = false;
    shake = 0;
    ctx.onScore(0);
    newTelegraph();
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (phase === "counter") {
      score += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      newTelegraph();
      return;
    }
    dragging = true;
    startX = x;
    startY = y;
  };

  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (over || phase !== "telegraph") return;
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const dx = x - startX;
    const dy = y - startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    let swipe: Dir;
    if (adx > 26 && adx > ady * 1.3) {
      swipe = dx < 0 ? "left" : "right";
    } else {
      swipe = "overhead";
    }
    if (swipe === dir && timeLeft > 0) {
      score += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      phase = "counter";
      counterTime = 0.55;
      autoActed = false;
    } else {
      failMsg = "WRONG PARRY";
      over = true;
      shake = 1;
      ctx.haptic("fail");
      ctx.onRunEnd(score);
    }
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);

  newTelegraph();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    shake = Math.max(0, shake - dt * 3);

    if (!over) {
      if (phase === "telegraph") {
        timeLeft -= dt;
        if (auto && !autoActed && timeLeft < windowTime * 0.5) {
          autoActed = true;
          score += 1;
          ctx.onScore(score);
          phase = "counter";
          counterTime = 0.55;
        } else if (timeLeft <= 0) {
          failMsg = "TOO SLOW";
          over = true;
          shake = 1;
          ctx.haptic("fail");
          ctx.onRunEnd(score);
        }
      } else if (phase === "counter") {
        counterTime -= dt;
        if (auto && !autoActed && counterTime < 0.3) {
          autoActed = true;
          score += 1;
          ctx.onScore(score);
          newTelegraph();
        } else if (counterTime <= 0) {
          newTelegraph();
        }
      }
    }

    const sx = shake ? rand(-4, 4) * shake : 0;
    const sy = shake ? rand(-4, 4) * shake : 0;

    // arena background: a lit dome and pillars, so the air above the duel is
    // part of the set rather than a flat void filling most of the phone
    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);
    const dome = g.createRadialGradient(W / 2, baseY, W * 0.05, W / 2, baseY, H * 0.8);
    dome.addColorStop(0, shade(pal.deep, -0.05));
    dome.addColorStop(1, shade(pal.deep, -0.62));
    g.fillStyle = dome;
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.deep, -0.3);
    for (let i = 0; i < 5; i++) {
      const pw = W * 0.075;
      g.fillRect(i * (W / 5) + (W / 5 - pw) / 2, 0, pw, baseY);
    }
    g.fillStyle = shade(pal.deep, -0.2);
    g.fillRect(0, baseY - H * 0.035, W, H * 0.012);
    const floor = g.createLinearGradient(0, baseY, 0, H);
    floor.addColorStop(0, shade(pal.deep, -0.1));
    floor.addColorStop(1, shade(pal.deep, -0.5));
    g.fillStyle = floor;
    g.fillRect(0, baseY, W, H - baseY);

    g.save();
    g.translate(sx, sy);
    g.translate(W / 2, baseY);
    g.scale(scene, scene);
    g.translate(-W / 2, -baseY);

    // fighters: simple silhouettes
    const drawFighter = (x: number, color: string, facingLeft: boolean) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, baseY - 62, 13, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x - 10, baseY - 50, 20, 40);
      g.fillRect(x - 5, baseY - 10, 9, 26);
      g.fillRect(x + 3, baseY - 10, 9, 26);
      // blade arm
      g.strokeStyle = shade(color, 0.3);
      g.lineWidth = 4;
      g.beginPath();
      const armDir = facingLeft ? -1 : 1;
      g.moveTo(x + armDir * 8, baseY - 44);
      g.lineTo(x + armDir * 26, baseY - 30);
      g.stroke();
    };

    drawFighter(playerX, over ? shade(pal.hero, -0.25) : pal.hero, false);
    drawFighter(foeX, pal.foe, true);

    // telegraph indicator: shrinking ring + directional arrow above the foe
    if (!over && phase === "telegraph") {
      const progress = Math.max(0, timeLeft / windowTime);
      const cx = (playerX + foeX) / 2;
      const cy = baseY - 90;
      g.strokeStyle = shade(pal.foe, 0.15);
      g.lineWidth = 4;
      g.beginPath();
      g.arc(cx, cy, 26 * progress + 6, 0, Math.PI * 2);
      g.stroke();

      g.fillStyle = pal.glow;
      g.save();
      g.translate(cx, cy);
      if (dir === "overhead") {
        g.beginPath();
        g.moveTo(-10, -6);
        g.lineTo(10, -6);
        g.lineTo(0, 14);
        g.closePath();
        g.fill();
      } else {
        const s = dir === "left" ? -1 : 1;
        g.beginPath();
        g.moveTo(-8 * s, -10);
        g.lineTo(-8 * s, 10);
        g.lineTo(14 * s, 0);
        g.closePath();
        g.fill();
      }
      g.restore();
    }

    // counter window prompt
    if (!over && phase === "counter") {
      const p = Math.max(0, counterTime / 0.55);
      g.fillStyle = pal.prize;
      g.globalAlpha = 0.55 + 0.35 * Math.sin(p * 20);
      g.beginPath();
      g.arc(playerX, baseY - 90, 18 * p + 4, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = t.ink;
      g.font = `700 13px ${t.fontBody}`;
      g.textAlign = "center";
      g.fillText("TAP!", playerX, baseY - 118);
      g.textAlign = "left";
    }

    g.restore();

    if (over) endCard(g, t, W, H, failMsg);
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
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
