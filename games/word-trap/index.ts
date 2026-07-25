import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, pick } from "@/games/engine";

const meta = {
  slug: "word-trap",
  title: "Word Trap",
  rule: "Tap only if the colour matches the word",
  year: 1935,
  description: "The Stroop test, weaponized for your feed.",
  history:
    "John Ridley Stroop published the colour-word interference effect in 1935. Ninety years later it still short-circuits brains — now with a countdown.",
  tags: ["precision", "calm"],
  intensity: 0.35,
  luck: 0.1,
  nostalgia: 0.5,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

// Colour names map onto theme token roles so every theme recolours the game.
const ROLES = ["GOLD", "BLUE", "GREEN", "RED"] as const;
type Role = (typeof ROLES)[number];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
  let score = 0;
  let lives = 3;
  let over = false;
  let word: Role = "GOLD";
  let colour: Role = "GOLD";
  let timer = 2.2;
  let window_ = 2.2;

  const roleColour = (role: Role): string => {
    const t = ctx.getTheme();
    switch (role) {
      case "GOLD":
        return t.accent;
      case "BLUE":
        return t.accentAlt;
      case "GREEN":
        return t.success;
      case "RED":
        return t.danger;
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

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);
    g.textAlign = "center";

    // the word, rendered in the (possibly trap) colour
    g.fillStyle = roleColour(colour);
    g.font = `800 64px ${t.fontDisplay}`;
    g.fillText(word, W / 2, H * 0.45);

    // countdown bar
    const bw = W * 0.6;
    g.fillStyle = t.surface;
    g.fillRect(W / 2 - bw / 2, H * 0.55, bw, 10);
    g.fillStyle = timer / window_ < 0.3 ? t.danger : t.ink;
    g.fillRect(W / 2 - bw / 2, H * 0.55, bw * Math.max(0, timer / window_), 10);

    // lives
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(W / 2 - 28 + i * 28, H * 0.09, 7, 0, Math.PI * 2);
      g.fillStyle = i < lives ? t.success : t.surface;
      g.fill();
    }

    if (over) {
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("TRAPPED", W / 2, H * 0.68);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, H * 0.68 + 34);
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
