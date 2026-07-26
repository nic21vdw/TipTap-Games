import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, clamp, shade } from "@/games/engine";
import { drawCan, drawRoom, drawBubbles, skins } from "@/games/nic-art";

const meta = {
  slug: "reflex-gate",
  title: "Perfect Pour",
  rule: "Tap when the pour hits the line",
  year: 2026,
  description: "Pure timing. The fill line shrinks every single hit.",
  history:
    "An original for the feed — the timing-bar tension of arcade bonus rounds, distilled to one tap, one glass, and an ever-crueller window.",
  tags: ["reflex", "precision", "oneTap"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#f0b429",
    deep: "#141821",
    glow: "#c9d3dc",
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
    drawRoom(g, W, H, pal.deep, pal.glow);

    const trackY = H * 0.5;
    const trackX = W * 0.12;
    const trackW = W * 0.76;
    const barH = 18;
    const sk = skins(pal);

    // the glass: same rect the track always occupied, given walls and a base
    g.fillStyle = t.surface;
    g.fillRect(trackX, trackY - barH / 2, trackW, barH);
    g.strokeStyle = shade(pal.glow, -0.35);
    g.lineWidth = 2;
    g.strokeRect(trackX, trackY - barH / 2, trackW, barH);

    // the fill line you are pouring to, with foam sitting on top of it
    g.fillStyle = flash > 0 ? pal.hero : pal.prize;
    g.fillRect(
      trackX + (zoneC - zoneW / 2) * trackW,
      trackY - barH / 2 - 6,
      zoneW * trackW,
      barH + 12
    );
    drawBubbles(
      g,
      trackX + zoneC * trackW,
      trackY,
      (zoneW * trackW) / 2,
      6,
      shade(pal.prize, 0.5),
      score
    );

    // the pour: a tilted can with a stream falling into the glass
    const px = trackX + pos * trackW;
    g.fillStyle = over ? pal.foe : shade(pal.foe, -0.15);
    g.fillRect(px - 3, trackY - barH / 2 - 18, 6, barH + 24);
    drawCan(g, px, trackY - barH / 2 - 44, 26, 46, sk.cola, "cola");
    if (flash > 0) {
      drawBubbles(g, px, trackY + barH, 22, 8, shade(pal.glow, 0.4), score);
    }

    g.fillStyle = t.inkDim;
    g.font = `600 16px ${t.fontBody}`;
    g.textAlign = "center";
    g.fillText(`fizz x${(speed / 0.6).toFixed(1)}`, W / 2, trackY + 64);

    if (over) {
      endCard(g, t, W, H, "OVERFLOWED");
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
