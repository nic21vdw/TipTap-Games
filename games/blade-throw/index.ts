import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "blade-throw",
  title: "Nic's Blade Throw",
  rule: "Tap to stick a blade in the clean gap",
  year: 2018,
  description: "Stick the spinning log. Miss the blades already there.",
  history:
    "Homage to the 2018 wave of one-tap timing games where you feed a spinning target one blade at a time and the rotation never forgives you.",
  tags: ["reflex", "precision", "oneTap"],
  palette: {
    hero: "#c9ada7",
    foe: "#7a2e2e",
    prize: "#e0a458",
    deep: "#22181c",
    glow: "#f2d0a4",
  },
  intensity: 0.75,
  luck: 0.1,
  nostalgia: 0.2,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

const TWO_PI = Math.PI * 2;
const SLOTS = 12;
const LANDING_ANGLE = Math.PI / 2; // bottom of the log, where thrown blades arrive

const norm = (a: number) => {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
};

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const logX = W / 2;
  const logY = H * 0.4;
  const logR = Math.min(W * 0.42, H * 0.24);

  let rotation = 0;
  let rotSpeed = 1.1;
  let elapsed = 0;
  let stuck: Set<number> = new Set();
  let fruitSlot: number | null = null;
  let fruitT = 0;
  let flying: { y: number; from: number } | null = null;
  let score = 0;
  let over = false;

  const slotAtLanding = () => {
    const rel = norm(LANDING_ANGLE - rotation);
    return Math.round(rel / (TWO_PI / SLOTS)) % SLOTS;
  };

  const reset = () => {
    rotation = 0;
    rotSpeed = 1.1;
    elapsed = 0;
    stuck = new Set();
    fruitSlot = null;
    fruitT = rand(1.5, 3);
    flying = null;
    score = 0;
    over = false;
    ctx.onScore(0);
  };

  const throwBlade = () => {
    if (flying || over) return;
    flying = { y: H + 10, from: H };
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    throwBlade();
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      elapsed += dt;
      rotSpeed = Math.min(6, 1.1 + elapsed * 0.045);
      rotation = norm(rotation + rotSpeed * dt);

      fruitT -= dt;
      if (fruitT <= 0 && fruitSlot === null) {
        const free = [...Array(SLOTS).keys()].filter((i) => !stuck.has(i));
        if (free.length) fruitSlot = free[Math.floor(rand(0, free.length))];
        fruitT = rand(2.5, 4.5);
      }

      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0 && !flying) {
          const upcoming = slotAtLanding();
          const safe = !stuck.has(upcoming);
          if (safe) throwBlade();
          autoCd = 0.5;
        }
      }

      if (flying) {
        flying.y -= 620 * dt;
        const targetY = logY + logR;
        if (flying.y <= targetY) {
          flying = null;
          const slot = slotAtLanding();
          if (stuck.has(slot)) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          } else {
            stuck.add(slot);
            score += 1;
            if (fruitSlot === slot) {
              score += 3;
              fruitSlot = null;
              ctx.haptic("hit");
            } else {
              ctx.haptic("light");
            }
            ctx.onScore(score);
          }
        }
      }
    }

    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    // landing guide
    g.strokeStyle = "rgba(255,255,255,.12)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(logX, logY + logR + 4);
    g.lineTo(logX, H - 12);
    g.stroke();

    // log
    g.beginPath();
    g.arc(logX, logY, logR, 0, TWO_PI);
    g.fillStyle = shade(pal.hero, -0.2);
    g.fill();
    g.beginPath();
    g.arc(logX, logY, logR * 0.55, 0, TWO_PI);
    g.fillStyle = shade(pal.hero, -0.4);
    g.fill();

    // rings
    for (let ring = 0; ring < 3; ring++) {
      g.beginPath();
      g.arc(logX, logY, logR * (0.7 + ring * 0.15), 0, TWO_PI);
      g.strokeStyle = shade(pal.hero, -0.5);
      g.lineWidth = 1;
      g.stroke();
    }

    // stuck blades
    for (const slot of stuck) {
      const a = (slot / SLOTS) * TWO_PI + rotation;
      const x1 = logX + Math.cos(a) * logR * 0.5;
      const y1 = logY + Math.sin(a) * logR * 0.5;
      const x2 = logX + Math.cos(a) * logR * 1.12;
      const y2 = logY + Math.sin(a) * logR * 1.12;
      g.strokeStyle = pal.foe;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }

    // fruit
    if (fruitSlot !== null) {
      const a = (fruitSlot / SLOTS) * TWO_PI + rotation;
      const fx = logX + Math.cos(a) * logR * 0.8;
      const fy = logY + Math.sin(a) * logR * 0.8;
      g.beginPath();
      g.arc(fx, fy, 6, 0, TWO_PI);
      g.fillStyle = pal.prize;
      g.fill();
    }

    // flying blade
    if (flying) {
      g.fillStyle = pal.glow;
      g.fillRect(logX - 2.5, flying.y - 22, 5, 22);
    }

    if (over) endCard(g, t, W, H, "BLADE JAMMED");
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
