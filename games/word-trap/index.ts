import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, pick } from "@/games/engine";
import { drawCanTop, drawRoom, skins } from "@/games/nic-art";

const meta = {
  slug: "word-trap",
  title: "Label Trap",
  rule: "Tap only if the label matches the colour",
  year: 1935,
  description: "The Stroop test, run on the contents of one fridge.",
  history:
    "John Ridley Stroop published the colour-word interference effect in 1935. Ninety years later it still short-circuits brains — now it is doing it with a label and a countdown.",
  tags: ["precision", "calm"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#ded3b6",
  },
  intensity: 0.35,
  luck: 0.1,
  nostalgia: 0.5,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

// Label names map onto palette roles, so a theme switch recolours the trap
// without changing which label is the honest one.
const ROLES = ["COLA", "ENERGY", "BUTTER", "OATS"] as const;
type Role = (typeof ROLES)[number];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  let score = 0;
  let lives = 3;
  let over = false;
  let word: Role = "COLA";
  let colour: Role = "COLA";
  let timer = 2.2;
  let window_ = 2.2;

  const roleColour = (role: Role): string => {
    const t = ctx.getTheme();
    switch (role) {
      case "ENERGY":
        return pal.hero;
      case "OATS":
        return pal.glow;
      case "BUTTER":
        return pal.prize;
      case "COLA":
        return pal.foe;
    }
  };

  const nextPrompt = () => {
    word = pick(ROLES);
    colour = Math.random() < 0.42 ? word : pick(ROLES.filter((r) => r !== word));
    window_ = Math.max(0.85, 2.2 - score * 0.06);
    timer = window_;
  };

  const loseLife = () => {
    lives -= 1;
    ctx.haptic("fail");
    if (lives <= 0) {
      over = true;
      ctx.onRunEnd(score);
    } else {
      nextPrompt();
    }
  };

  const reset = () => {
    score = 0;
    lives = 3;
    over = false;
    ctx.onScore(0);
    nextPrompt();
  };

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    if (word === colour) {
      score += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      nextPrompt();
    } else {
      loseLife();
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  nextPrompt();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: answer with a believable beat of hesitation
      if (auto && timer < window_ - 0.45) {
        if (word === colour) {
          score += 1;
          ctx.onScore(score);
          nextPrompt();
        } else if (timer < window_ - 0.9) {
          nextPrompt();
        }
      }
      timer -= dt;
      if (timer <= 0) {
        if (word === colour) loseLife();
        else nextPrompt();
      }
    }

    drawRoom(g, W, H, pal.deep, pal.glow);
    g.textAlign = "center";

    // the label, printed in the (possibly lying) colour of the contents
    g.fillStyle = roleColour(colour);
    g.font = `800 56px ${t.fontDisplay}`;
    g.fillText(word, W / 2, H * 0.45);

    // countdown bar
    const bw = W * 0.6;
    g.fillStyle = t.surface;
    g.fillRect(W / 2 - bw / 2, H * 0.55, bw, 10);
    g.fillStyle = timer / window_ < 0.3 ? pal.foe : t.ink;
    g.fillRect(W / 2 - bw / 2, H * 0.55, bw * Math.max(0, timer / window_), 10);

    // lives, as cans still left in the fridge
    const sk = skins(pal);
    for (let i = 0; i < 3; i++) {
      const x = W / 2 - 28 + i * 28;
      if (i < lives) {
        drawCanTop(g, x, H * 0.09, 8, sk.cola);
      } else {
        g.beginPath();
        g.arc(x, H * 0.09, 7, 0, Math.PI * 2);
        g.fillStyle = t.surface;
        g.fill();
      }
    }

    if (over) {
      endCard(g, t, W, H, "MISLABELLED");
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
