import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "tap-pet",
  title: "Nic's Tap Pet",
  rule: "Tap for combo. Freeze when it flares up.",
  year: 2010,
  description: "Poke the little guy. Build a combo. Know when to stop.",
  history:
    "Homage to the 2010 pocket virtual-pet craze that turned a single button into a whole relationship — one tap at a time, whenever your phone was in your hand.",
  tags: ["reflex", "calm", "precision"],
  palette: {
    hero: "#ff8fab",
    foe: "#e63946",
    prize: "#ffd166",
    deep: "#2b2d42",
    glow: "#5fa8d3",
  },
  intensity: 0.25,
  luck: 0.1,
  nostalgia: 0.6,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

const COMBO_WINDOW = 0.6; // taps within this window keep the combo alive
const COMBO_DECAY = 1.3; // total seconds of silence before combo fully dies
const POKE_MIN = 4;
const POKE_MAX = 8;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const cx = W / 2;
  const cy = H * 0.42;
  const baseR = Math.min(W, H) * 0.22;

  let clock = 0;
  let score = 0;
  let combo = 0;
  let lastTapClock = -999;
  let squash = 0; // 0..1, decays after each tap
  let flashFail = 0; // brief red flash when restraint is broken

  let pokeTimer = rand(POKE_MIN, POKE_MAX);
  let pokeActive = false;
  let pokeElapsed = 0;
  let pokeDuration = 0;
  let pokeBroken = false;

  const reset = () => {
    score = 0;
    combo = 0;
    lastTapClock = clock - 999;
    squash = 0;
    flashFail = 0;
    pokeActive = false;
    pokeBroken = false;
    pokeTimer = rand(POKE_MIN, POKE_MAX);
    ctx.onScore(0);
  };

  const comboMeter = () => {
    const since = clock - lastTapClock;
    return clamp(1 - since / COMBO_DECAY, 0, 1);
  };

  const tap = () => {
    if (pokeActive) {
      // restraint broken: the pet poked back mid-flare
      pokeBroken = true;
      combo = 0;
      flashFail = 0.35;
      ctx.haptic("fail");
      return;
    }
    const meter = comboMeter();
    combo = meter > 0 ? combo + 1 : 1;
    lastTapClock = clock;
    squash = 1;
    const gain = 1 + Math.floor(combo / 5);
    score += gain;
    ctx.onScore(score);
    ctx.haptic(combo > 1 && meter > 0.3 ? "hit" : "light");
  };

  const onDown = () => tap();
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoTimer = rand(0.25, 0.4);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    clock += dt;
    squash = Math.max(0, squash - dt * 3.4);
    flashFail = Math.max(0, flashFail - dt * 2);

    // combo silently expires once the meter runs dry
    if (comboMeter() <= 0 && combo > 0) combo = 0;

    if (!pokeActive) {
      pokeTimer -= dt;
      if (pokeTimer <= 0) {
        pokeActive = true;
        pokeElapsed = 0;
        pokeDuration = rand(0.5, 1.0);
        pokeBroken = false;
      }
    } else {
      pokeElapsed += dt;
      if (pokeElapsed >= pokeDuration) {
        pokeActive = false;
        pokeTimer = rand(POKE_MIN, POKE_MAX);
      }
    }

    if (auto) {
      if (pokeActive) {
        autoTimer = 0.12; // sit still through the flare, like a real player should
      } else {
        autoTimer -= dt;
        if (autoTimer <= 0) {
          tap();
          autoTimer = rand(0.25, 0.4);
        }
      }
    }

    // background
    g.fillStyle = shade(pal.deep, -0.5);
    g.fillRect(0, 0, W, H);

    // squash & stretch
    const sx = 1 + squash * 0.16;
    const sy = 1 - squash * 0.22 + Math.sin(clock * 2) * 0.01;
    const rx = baseR * sx;
    const ry = baseR * sy;

    const bodyColor = pokeActive
      ? shade(pal.foe, -0.05 + Math.sin(clock * 14) * 0.08)
      : shade(pal.hero, flashFail > 0 ? -0.3 : 0);

    // the pet you are poking is him, squashing with the same breath cycle
    g.save();
    g.translate(cx, cy);
    g.scale(1, ry / baseR);
    drawNicHead(g, {
      x: 0,
      y: 0,
      r: rx,
      skin: bodyColor,
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      gape: pokeActive ? 0.7 : 0.15,
      scowl: pokeActive ? 1 : 0,
    });
    g.restore();

    // warning tell during a flare
    if (pokeActive) {
      const blink = Math.sin(clock * 18) > 0;
      g.fillStyle = blink ? "#fff" : pal.foe;
      g.beginPath();
      g.moveTo(cx, cy - ry - baseR * 0.42);
      g.lineTo(cx - baseR * 0.14, cy - ry - baseR * 0.2);
      g.lineTo(cx + baseR * 0.14, cy - ry - baseR * 0.2);
      g.closePath();
      g.fill();
      g.fillStyle = "#101418";
      g.font = `800 14px ${t.fontDisplay}`;
      g.textAlign = "center";
      g.fillText("!", cx, cy - ry - baseR * 0.24);
    }

    // combo meter bar
    const meter = comboMeter();
    const bw = W * 0.6;
    const bx = W / 2 - bw / 2;
    const by = H * 0.78;
    g.fillStyle = t.surface;
    g.fillRect(bx, by, bw, 10);
    g.fillStyle = meter > 0 ? pal.prize : shade(pal.prize, -0.4);
    g.fillRect(bx, by, bw * meter, 10);

    g.textAlign = "center";
    g.fillStyle = t.ink;
    g.font = `700 16px ${t.fontBody}`;
    g.fillText(combo > 1 ? `combo x${combo}` : "tap the pet", W / 2, by - 12);
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
