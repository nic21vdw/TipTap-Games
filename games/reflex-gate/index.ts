import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, clamp, shade } from "@/games/engine";

const meta = {
  slug: "reflex-gate",
  title: "Reflex Gate",
  rule: "Tap when the bar hits green",
  year: 2026,
  description: "Pure timing. The green zone shrinks every single hit.",
  history:
    "An original for the feed — the timing-bar tension of arcade bonus rounds, distilled to one tap and an ever-crueller window.",
  tags: ["reflex", "precision", "oneTap"],
  palette: {
    hero: "#00b4d8",
    foe: "#ef476f",
    prize: "#06d6a0",
    deep: "#023e8a",
    glow: "#90e0ef",
  },
  intensity: 0.55,
  luck: 0.1,
  nostalgia: 0.2,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  let score = 0;
  let over = false;
  let pos = 0; // 0..1 along the track
  let dir = 1;
  let speed = 0.6; // track lengths per second
  let zoneC = rand(0.25, 0.75);
  let zoneW = 0.22;
  let flash = 0; // success flash timer

  const newZone = () => {
    zoneC = rand(0.12 + zoneW / 2, 0.88 - zoneW / 2);
  };

  const reset = () => {
    score = 0;
    over = false;
    pos = 0;
    dir = 1;
    speed = 0.6;
    zoneW = 0.22;
    newZone();
    ctx.onScore(0);
  };

  let auto = false;

  const tap = () => {
    if (over) {
      reset();
      return;
    }
    const inZone = Math.abs(pos - zoneC) <= zoneW / 2;
    if (inZone) {
      score += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      flash = 0.25;
      speed = Math.min(2.4, speed * 1.09);
      zoneW = Math.max(0.05, zoneW * 0.93);
      newZone();
    } else {
      over = true;
      ctx.haptic("fail");
      ctx.onRunEnd(score, "MISSED");
    }
  };
  const onDown = () => tap();
  ctx.canvas.addEventListener("pointerdown", onDown);

  const loop = makeLoop((dt) => {
    if (!over) {
      // attract mode: land the tap just inside the green zone
      if (auto && Math.abs(pos - zoneC) < zoneW * 0.35) tap();
      pos += dir * speed * dt;
      if (pos > 1) {
        pos = 1;
        dir = -1;
      } else if (pos < 0) {
        pos = 0;
        dir = 1;
      }
      flash = Math.max(0, flash - dt);
    }
    const t = ctx.getTheme();
    const ground = g.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, shade(pal.deep, -0.15));
    ground.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);

    // The gate is a full-height column and the marker a full-height sweeper:
    // the timing window is the same one, but it reads at a glance from
    // anywhere on the screen instead of hiding in a strip in the middle.
    const zoneX = (zoneC - zoneW / 2) * W;
    const zoneP = zoneW * W;
    g.fillStyle = flash > 0 ? pal.hero : pal.prize;
    g.globalAlpha = 0.26;
    g.fillRect(zoneX, 0, zoneP, H);
    g.globalAlpha = 1;
    g.fillRect(zoneX, 0, 3, H);
    g.fillRect(zoneX + zoneP - 3, 0, 3, H);

    // the rail the sweeper runs on, still the anchor line for the eye
    const trackY = H * 0.5;
    g.fillStyle = t.surface;
    g.fillRect(0, trackY - 1, W, 2);

    g.fillStyle = over ? pal.foe : t.ink;
    g.fillRect(pos * W - 2, 0, 4, H);
    g.fillRect(pos * W - 11, trackY - 11, 22, 22);

    g.fillStyle = t.inkDim;
    g.font = `600 16px ${t.fontBody}`;
    g.textAlign = "center";
    g.fillText(`speed x${(speed / 0.6).toFixed(1)}`, W / 2, H * 0.5 + 64);

    if (over) {
      endCard(g, t, W, H, "MISSED");
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
      if (!on) reset(); // hand the player a fresh run
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
