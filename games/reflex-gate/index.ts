import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand, clamp } from "@/games/engine";

const meta = {
  slug: "reflex-gate",
  title: "Reflex Gate",
  rule: "Tap when the bar hits green",
  year: 2026,
  description: "Pure timing. The green zone shrinks every single hit.",
  history:
    "An original for the feed — the timing-bar tension of arcade bonus rounds, distilled to one tap and an ever-crueller window.",
  tags: ["reflex", "precision", "oneTap"],
  intensity: 0.55,
  luck: 0.1,
  nostalgia: 0.2,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
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
      ctx.onRunEnd(score);
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
    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);

    const trackY = H * 0.5;
    const trackX = W * 0.12;
    const trackW = W * 0.76;
    const barH = 18;

    // track
    g.fillStyle = t.surface;
    g.fillRect(trackX, trackY - barH / 2, trackW, barH);
    // green zone
    g.fillStyle = flash > 0 ? t.accent : t.success;
    g.fillRect(
      trackX + (zoneC - zoneW / 2) * trackW,
      trackY - barH / 2 - 6,
      zoneW * trackW,
      barH + 12
    );
    // marker
    g.fillStyle = over ? t.danger : t.ink;
    g.fillRect(trackX + pos * trackW - 4, trackY - barH / 2 - 18, 8, barH + 36);

    // streak dots
    g.fillStyle = t.inkDim;
    g.font = `600 16px ${t.fontBody}`;
    g.textAlign = "center";
    g.fillText(`speed x${(speed / 0.6).toFixed(1)}`, W / 2, trackY + 64);

    if (over) {
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("MISSED", W / 2, trackY - 90);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, trackY - 58);
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
