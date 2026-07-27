import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "sprint-relay",
  title: "Nic's Sprint Relay",
  rule: "Alternate left/right taps to sprint, tap to hop hurdles",
  year: 2013,
  description: "Left, right, left, right. Don't trip on the hurdle.",
  history:
    "Homage to the 2013 arcade sprint craze built around alternating left-right taps to pump your runner's legs across a track full of hurdles.",
  tags: ["reflex", "endurance", "precision"],
  palette: {
    hero: "#ef6461",
    foe: "#5b5f97",
    prize: "#ffe066",
    deep: "#2d3142",
    glow: "#bfc0c0",
  },
  intensity: 0.7,
  luck: 0.15,
  nostalgia: 0.6,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 5,
} satisfies GameModule["meta"];

const RACE_DIST = 300;
const HURDLES = [70, 150, 225];
const LANES = 4; // 0 = player

interface Hurdle {
  pos: number;
  resolved: boolean;
  failed: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const trackX0 = W * 0.06;
  const trackW = W * 0.82;
  const laneY = (i: number) => H * 0.28 + i * (H * 0.16);

  let dist: number[] = [];
  let speed: number[] = [];
  let botWobble: number[] = [];
  let lastSide: -1 | 1 | 0 = 0;
  let hurdles: Hurdle[] = [];
  let stumbleT = 0;
  let score = 0;
  let place = 0;
  let raceTime = 0;
  let over = false;
  let auto = false;
  let autoSide: -1 | 1 = -1;
  let legPhase = 0;

  const reset = () => {
    dist = [0, 0, 0, 0];
    speed = [0, rand(28, 34), rand(27, 35), rand(26, 33)];
    botWobble = [0, rand(0, 10), rand(0, 10), rand(0, 10)];
    lastSide = 0;
    hurdles = HURDLES.map((pos) => ({ pos, resolved: false, failed: false }));
    stumbleT = 0;
    score = 0;
    place = 0;
    raceTime = 0;
    over = false;
    ctx.onScore(0);
  };
  reset();

  const activeHurdle = () =>
    hurdles.find(
      (h) => !h.resolved && dist[0] >= h.pos - 16 && dist[0] <= h.pos + 6
    );

  const doTap = (side: -1 | 1) => {
    const h = activeHurdle();
    if (h) {
      h.resolved = true;
      ctx.haptic("hit");
      speed[0] = Math.max(speed[0], 30);
      return;
    }
    if (lastSide !== 0 && side !== lastSide) {
      speed[0] = Math.min(70, speed[0] + 14);
      ctx.haptic("light");
    } else {
      speed[0] = Math.min(70, speed[0] + 3);
    }
    lastSide = side;
  };

  const finish = () => {
    over = true;
    let finishedAhead = 0;
    for (let i = 1; i < LANES; i++) if (dist[i] >= RACE_DIST) finishedAhead++;
    place = finishedAhead + 1;
    const base = place === 1 ? 100 : place === 2 ? 70 : place === 3 ? 40 : 10;
    const factor = place === 1 ? 1 : place === 2 ? 0.6 : place === 3 ? 0.3 : 0;
    const timeBonus = Math.round(Math.max(0, 24 - raceTime) * 3 * factor);
    score = base + timeBonus;
    ctx.onScore(score);
    ctx.haptic(place === 1 ? "hit" : "fail");
    ctx.onRunEnd(score);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const side: -1 | 1 = e.clientX - r.left < W / 2 ? -1 : 1;
    doTap(side);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      raceTime += dt;
      legPhase += dt * (2 + speed[0] * 0.08);

      if (auto) {
        const h = activeHurdle();
        if (h) doTap(autoSide);
        else if (Math.random() < 0.22) {
          autoSide = autoSide === -1 ? 1 : -1;
          doTap(autoSide);
        }
      }

      // player: friction decay
      speed[0] = Math.max(0, speed[0] - speed[0] * 0.9 * dt);
      if (stumbleT > 0) stumbleT -= dt;

      const h = activeHurdle();
      if (h && dist[0] > h.pos + 5 && !h.resolved) {
        h.resolved = true;
        h.failed = true;
        speed[0] *= 0.35;
        stumbleT = 0.4;
        ctx.haptic("fail");
      }

      dist[0] = Math.min(RACE_DIST, dist[0] + speed[0] * dt);

      // bots: gentle speed wobble, no hurdles (they just run)
      for (let i = 1; i < LANES; i++) {
        botWobble[i] += dt;
        const wob = Math.sin(botWobble[i] * 1.7) * 4;
        dist[i] = Math.min(RACE_DIST, dist[i] + (speed[i] + wob) * dt);
      }

      const liveScore = Math.floor(
        (dist[0] / RACE_DIST) * 60 +
          (LANES - 1 - dist.filter((d, i) => i > 0 && d > dist[0]).length) * 10
      );
      ctx.onScore(Math.max(0, liveScore));

      if (dist[0] >= RACE_DIST) finish();
    }

    // track
    g.fillStyle = shade(pal.deep, -0.55);
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < LANES; i++) {
      g.strokeStyle = "rgba(255,255,255,.08)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, laneY(i) + H * 0.09);
      g.lineTo(W, laneY(i) + H * 0.09);
      g.stroke();
    }
    // finish line
    const finishX = trackX0 + trackW;
    g.fillStyle = pal.prize;
    for (let yy = 0; yy < H; yy += 10) g.fillRect(finishX - 2, yy, 4, 5);

    // hurdles (player's lane only)
    for (const h of hurdles) {
      if (h.resolved && !h.failed) continue;
      const hx = trackX0 + (h.pos / RACE_DIST) * trackW;
      g.fillStyle = h.failed ? shade(pal.foe, 0.2) : pal.foe;
      g.fillRect(hx - 3, laneY(0) - 14, 6, 24);
    }

    // runners
    const labels = ["YOU", "A", "B", "C"];
    for (let i = 0; i < LANES; i++) {
      const rx = trackX0 + (dist[i] / RACE_DIST) * trackW;
      const ry = laneY(i);
      const bob = Math.abs(Math.sin(legPhase + i)) * 4;
      const wobbling = i === 0 && stumbleT > 0;
      g.fillStyle = i === 0 ? (wobbling ? pal.foe : pal.hero) : shade(pal.glow, -0.1);
      g.fillRect(rx - 5, ry - bob + 6, 10, 14);
      // every runner in every lane is him
      drawNicHead(g, {
        x: rx,
        y: ry - bob,
        r: 9,
        skin: i === 0 ? (wobbling ? pal.foe : pal.hero) : shade(pal.glow, -0.1),
        hair: shade(pal.deep, -0.4),
        eye: t.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: t.ink,
        gape: 0.4,
        scowl: wobbling ? 1 : 0.3,
      });
      g.fillStyle = t.inkDim;
      g.font = `600 10px ${t.fontBody}`;
      g.textAlign = "center";
      g.fillText(labels[i], rx, ry - bob - 14);
      g.textAlign = "left";
    }

    if (over) {
      const msg =
        place === 1
          ? "1ST PLACE!"
          : place === 2
            ? "2ND PLACE"
            : place === 3
              ? "3RD PLACE"
              : "4TH PLACE";
      endCard(g, t, W, H, msg);
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
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
