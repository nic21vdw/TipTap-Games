import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "combo-punch",
  title: "Combo Punch",
  rule: "Tap in rhythm to punch enemies before impact",
  year: 2012,
  description: "Auto-run, timed taps, don't let combos drop.",
  history:
    "Homage to the 2012 side-scrolling brawlers where a hero fought forward automatically and your only job was timing every hit.",
  tags: ["reflex", "oneTap", "endurance"],
  palette: {
    hero: "#ff9f1c",
    foe: "#e71d36",
    prize: "#2ec4b6",
    deep: "#14213d",
    glow: "#fdffb6",
  },
  intensity: 0.75,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.5,
  scoreUnit: "pts",
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Enemy {
  x: number;
  hit: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const heroX = W * 0.24;
  const groundY = H * 0.72;

  let enemies: Enemy[] = [];
  let health = 3;
  let score = 0;
  let over = false;
  let speed = 90;
  let punchT = 0;
  let comboFlash = 0;
  let spawnCd = 1.2;

  const reset = () => {
    enemies = [];
    health = 3;
    score = 0;
    speed = 90;
    spawnCd = 1.2;
    punchT = 0;
    over = false;
    ctx.onScore(0);
  };

  const punch = () => {
    if (over) {
      reset();
      return;
    }
    punchT = 0.14;
    // hit nearest enemy within range
    let nearest: Enemy | null = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (e.hit) continue;
      const d = e.x - heroX;
      if (d > -10 && d < 70 && d < bestD) {
        bestD = d;
        nearest = e;
      }
    }
    if (nearest) {
      nearest.hit = true;
      score += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      comboFlash = 0.2;
    } else {
      ctx.haptic("light");
    }
  };
  const onDown = () => punch();
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      speed = Math.min(210, speed + dt * 2.2);
      spawnCd -= dt;
      if (spawnCd <= 0) {
        enemies.push({ x: W + 30, hit: false });
        spawnCd = Math.max(0.65, 1.3 - score * 0.01);
      }
      for (const e of enemies) if (!e.hit) e.x -= speed * dt;
      else e.x -= speed * 2.4 * dt; // hit enemies get knocked back fast

      if (auto) {
        autoCd -= dt;
        const target = enemies.find((e) => !e.hit && e.x - heroX < 75 && e.x - heroX > -10);
        if (target && autoCd <= 0) {
          punch();
          autoCd = 0.12;
        }
      }

      for (const e of enemies) {
        if (!e.hit && e.x - heroX < 6) {
          health -= 1;
          ctx.haptic("fail");
          e.hit = true; // enemy passes through after chipping health
          if (health <= 0) {
            over = true;
            ctx.onRunEnd(score);
          }
        }
      }
      enemies = enemies.filter((e) => e.x > -40);
      punchT = Math.max(0, punchT - dt);
      comboFlash = Math.max(0, comboFlash - dt);
    }

    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.deep, 0.15);
    g.fillRect(0, groundY, W, H - groundY);

    for (const e of enemies) {
      g.fillStyle = e.hit ? shade(pal.foe, 0.3) : pal.foe;
      roundRect(g, e.x - 15, groundY - 34, 30, 34, 6);
      g.fill();
    }

    // hero
    const punchOut = punchT > 0 ? 14 : 0;
    g.fillStyle = over ? pal.foe : pal.hero;
    roundRect(g, heroX - 16, groundY - 38, 32, 38, 8);
    g.fill();
    g.fillStyle = pal.glow;
    g.fillRect(heroX + 14, groundY - 26, 18 + punchOut, 8);

    if (comboFlash > 0) {
      g.fillStyle = `rgba(255,255,255,${comboFlash * 2})`;
      g.beginPath();
      g.arc(heroX + 30, groundY - 22, 20, 0, Math.PI * 2);
      g.fill();
    }

    // health pips
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < health ? pal.prize : "rgba(255,255,255,.15)";
      g.beginPath();
      g.arc(16 + i * 20, 20, 6, 0, Math.PI * 2);
      g.fill();
    }

    if (over) endCard(g, t, W, H, "KNOCKED OUT");
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
