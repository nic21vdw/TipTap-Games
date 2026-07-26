import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "dash-horn",
  title: "Dash Horn",
  rule: "Tap to jump, tap again to double jump",
  year: 2010,
  description:
    "A horned little sprinter, an endless neon track, and a speed that never lets up.",
  history:
    "Homage to the 2010 one-button endless runners that turned a single tap into jump, double jump and everything in between — the genre that proved a phone screen only needed one gesture to be addictive.",
  tags: ["reflex", "endurance", "oneTap"],
  palette: {
    hero: "#ff9f1c",
    foe: "#2b2d42",
    prize: "#8ac926",
    deep: "#0b132b",
    glow: "#ff6392",
  },
  intensity: 0.7,
  luck: 0.15,
  nostalgia: 0.8,
  sessionLength: 0.55,
  scoreUnit: "pts",
  maxScorePerSecond: 8,
} satisfies GameModule["meta"];

interface Obstacle {
  x: number;
  w: number;
  h: number;
  kind: "spike" | "block";
}
interface Orb {
  x: number;
  y: number;
  taken: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const groundY = H * 0.78;
  const heroX = W * 0.22;
  const heroW = 34;
  const heroH = 34;
  const GRAVITY = 1500;
  const JUMP_V = -520;

  let heroY = groundY - heroH;
  let vy = 0;
  let jumpCount = 0;
  let grounded = true;

  let obstacles: Obstacle[] = [];
  let orbs: Orb[] = [];
  let spawnCd = 1.0;
  let scrollSpeed = 220;
  let elapsed = 0;
  let score = 0;
  let scoreShown = -1;
  let over = false;
  let legPhase = 0;
  let hillOffset = 0;

  const reset = () => {
    heroY = groundY - heroH;
    vy = 0;
    jumpCount = 0;
    grounded = true;
    obstacles = [];
    orbs = [];
    spawnCd = 1.0;
    scrollSpeed = 220;
    elapsed = 0;
    score = 0;
    scoreShown = -1;
    over = false;
    ctx.onScore(0);
  };

  const doJump = () => {
    if (jumpCount >= 2) return;
    vy = JUMP_V;
    jumpCount += 1;
    grounded = false;
    ctx.haptic("light");
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    doJump();
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoDoubleCd = 0;

  const nearestObstacle = () => {
    let best: Obstacle | null = null;
    for (const o of obstacles) {
      if (o.x + o.w > heroX && (!best || o.x < best.x)) best = o;
    }
    return best;
  };

  const autoTick = (dt: number) => {
    if (autoDoubleCd > 0) {
      autoDoubleCd -= dt;
      if (autoDoubleCd <= 0) {
        autoDoubleCd = 0;
        doJump();
      }
    }
    if (!grounded) return;
    const o = nearestObstacle();
    if (!o) return;
    const dist = o.x - heroX;
    const triggerDist = scrollSpeed * 0.42;
    if (dist < triggerDist && dist > 0) {
      doJump();
      if (o.kind === "block") autoDoubleCd = 0.09;
    }
  };

  const loop = makeLoop((dt, t) => {
    const theme = ctx.getTheme();

    if (!over) {
      elapsed += dt;
      scrollSpeed = clamp(220 + elapsed * 6, 220, 520);

      // physics
      vy += GRAVITY * dt;
      heroY += vy * dt;
      if (heroY >= groundY - heroH) {
        heroY = groundY - heroH;
        vy = 0;
        if (!grounded) {
          grounded = true;
          jumpCount = 0;
        }
      }

      if (auto) autoTick(dt);

      // spawn
      spawnCd -= dt;
      if (spawnCd <= 0) {
        spawnCd = rand(0.9, 1.5) * (220 / scrollSpeed);
        if (Math.random() < 0.55) {
          obstacles.push({
            x: W + 40,
            w: Math.random() < 0.5 ? 20 : 30,
            h: Math.random() < 0.5 ? 32 : 48,
            kind: Math.random() < 0.5 ? "spike" : "block",
          });
        } else {
          orbs.push({ x: W + 40, y: rand(groundY - 140, groundY - 40), taken: false });
        }
      }

      // move + collide
      const heroBox = { x: heroX, y: heroY, w: heroW, h: heroH };
      for (const o of obstacles) o.x -= scrollSpeed * dt;
      obstacles = obstacles.filter((o) => o.x + o.w > -10);
      for (const orb of orbs) orb.x -= scrollSpeed * dt;
      orbs = orbs.filter((orb) => orb.x > -20 && !orb.taken);

      for (const o of obstacles) {
        const oy = groundY - o.h;
        const overlap =
          heroBox.x < o.x + o.w &&
          heroBox.x + heroBox.w > o.x &&
          heroBox.y < oy + o.h &&
          heroBox.y + heroBox.h > oy;
        if (overlap) {
          over = true;
          ctx.haptic("fail");
          ctx.onRunEnd(Math.floor(score));
          break;
        }
      }

      for (const orb of orbs) {
        if (orb.taken) continue;
        const dx = heroX + heroW / 2 - orb.x;
        const dy = heroY + heroH / 2 - orb.y;
        if (Math.hypot(dx, dy) < 22) {
          orb.taken = true;
          score += 8;
          ctx.haptic("hit");
        }
      }
      orbs = orbs.filter((o) => !o.taken);

      score += scrollSpeed * dt * 0.02;
      const shown = Math.floor(score);
      if (shown !== scoreShown) {
        scoreShown = shown;
        ctx.onScore(shown);
      }

      legPhase += dt * (grounded ? 14 : 4);
      hillOffset += scrollSpeed * dt * 0.3;
    }

    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.12));
    sky.addColorStop(1, shade(pal.deep, -0.5));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // parallax hills
    for (let layer = 0; layer < 2; layer++) {
      const speed = layer === 0 ? 0.5 : 1;
      const baseY = groundY - 10 - layer * 30;
      const amp = 18 + layer * 14;
      g.fillStyle = shade(pal.deep, layer === 0 ? -0.15 : -0.3);
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) {
        const y = baseY - Math.sin((x + hillOffset * speed) * 0.02) * amp;
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fill();
    }

    // ground
    g.fillStyle = shade(pal.glow, -0.5);
    g.fillRect(0, groundY, W, H - groundY);
    g.fillStyle = pal.glow;
    g.globalAlpha = 0.5;
    g.fillRect(0, groundY, W, 3);
    g.globalAlpha = 1;

    // orbs
    for (const orb of orbs) {
      g.beginPath();
      g.arc(orb.x, orb.y, 12, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,.25)";
      g.fill();
      g.beginPath();
      g.arc(orb.x, orb.y, 8, 0, Math.PI * 2);
      g.fillStyle = pal.prize;
      g.fill();
    }

    // obstacles
    for (const o of obstacles) {
      const oy = groundY - o.h;
      if (o.kind === "spike") {
        g.fillStyle = pal.foe;
        g.beginPath();
        g.moveTo(o.x, groundY);
        g.lineTo(o.x + o.w / 2, oy);
        g.lineTo(o.x + o.w, groundY);
        g.closePath();
        g.fill();
      } else {
        g.fillStyle = pal.foe;
        roundRect(g, o.x, oy, o.w, o.h, 6);
        g.fill();
      }
    }

    // hero: blob body, horns, legs
    const bx = heroX + heroW / 2;
    const by = heroY + heroH / 2;
    if (grounded) {
      const swing = Math.sin(legPhase) * 8;
      g.strokeStyle = shade(pal.hero, -0.4);
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(bx - 6, by + heroH / 2 - 4);
      g.lineTo(bx - 6 + swing, groundY);
      g.moveTo(bx + 6, by + heroH / 2 - 4);
      g.lineTo(bx + 6 - swing, groundY);
      g.stroke();
    }
    g.fillStyle = over ? shade(pal.hero, -0.3) : pal.hero;
    roundRect(g, heroX, heroY, heroW, heroH, 12);
    g.fill();
    // horns
    g.fillStyle = pal.glow;
    g.beginPath();
    g.moveTo(bx - 10, heroY + 4);
    g.lineTo(bx - 15, heroY - 10);
    g.lineTo(bx - 3, heroY + 2);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(bx + 10, heroY + 4);
    g.lineTo(bx + 15, heroY - 10);
    g.lineTo(bx + 3, heroY + 2);
    g.closePath();
    g.fill();
    // eye
    g.fillStyle = "#101418";
    g.beginPath();
    g.arc(bx + 8, by - 2, 3, 0, Math.PI * 2);
    g.fill();

    g.textAlign = "left";
    g.fillStyle = theme.inkDim;
    g.font = `700 14px ${theme.fontBody}`;
    g.fillText(`SCORE ${Math.floor(score)}`, 16, 26);

    if (over) endCard(g, theme, W, H, "WIPED OUT");
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
