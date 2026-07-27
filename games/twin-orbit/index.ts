import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "twin-orbit",
  title: "Nic's Twin Orbit",
  rule: "Tap to flip the spin, thread the gate",
  year: 2013,
  description: "Flip the spin, thread the gate. Miss the gap once and it's over.",
  history:
    "Homage to the 2013 twin-orbit reflex toys that spun two linked dots around a center and dared you to time a single flip.",
  tags: ["precision", "reflex", "chaos"],
  palette: {
    hero: "#f72585",
    foe: "#480ca8",
    prize: "#4cc9f0",
    deep: "#240046",
    glow: "#7209b7",
  },
  intensity: 0.8,
  luck: 0.05,
  nostalgia: 0.6,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

interface Wall {
  x: number;
  targetSin: number;
  gapH: number;
  passed: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const center = { x: W * 0.32, y: H * 0.5 };
  const radius = Math.min(W, H) * 0.16;
  const orbR = 9;
  const chunkW = 14;

  let angle = 0;
  let dirSign: 1 | -1 = 1;
  let walls: Wall[] = [];
  let spawnTimer = 0;
  let score = 0;
  let over = false;

  const reset = () => {
    angle = 0;
    dirSign = 1;
    walls = [];
    spawnTimer = 0;
    score = 0;
    over = false;
    ctx.onScore(0);
  };
  reset();

  const onDown = () => {
    if (over) {
      reset();
      return;
    }
    dirSign = dirSign === 1 ? -1 : 1;
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  let auto = false;

  const autoSteer = (angularSpeed: number, wallSpeed: number) => {
    let target: Wall | null = null;
    for (const w of walls) {
      if (w.x > center.x) {
        if (!target || w.x < target.x) target = w;
      }
    }
    if (!target) return;
    const timeToArrival = Math.max(0, (target.x - center.x) / wallSpeed);
    const noFlip = angle + dirSign * angularSpeed * timeToArrival;
    const flip = angle - dirSign * angularSpeed * timeToArrival;
    const errNoFlip = Math.abs(Math.sin(noFlip) - target.targetSin);
    const errFlip = Math.abs(Math.sin(flip) - target.targetSin);
    if (errFlip + 0.05 < errNoFlip) dirSign = dirSign === 1 ? -1 : 1;
  };

  const loop = makeLoop((dt) => {
    const theme = ctx.getTheme();

    const angularSpeed = clamp(2.2 + score * 0.05, 2.2, 5.5);
    const wallSpeed = clamp(150 + score * 6, 150, 420);

    if (!over) {
      if (auto) autoSteer(angularSpeed, wallSpeed);

      angle += dirSign * angularSpeed * dt;

      spawnTimer += dt;
      const interval = clamp(1.4 - score * 0.02, 0.7, 1.4);
      if (spawnTimer >= interval) {
        spawnTimer = 0;
        const gapH = clamp(H * 0.3 - score * 1.5, H * 0.15, H * 0.3);
        walls.push({
          x: W + 30,
          targetSin: rand(-0.55, 0.55),
          gapH,
          passed: false,
        });
      }

      for (const w of walls) w.x -= wallSpeed * dt;

      const orb1 = {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      };
      const orb2 = {
        x: center.x + radius * Math.cos(angle + Math.PI),
        y: center.y + radius * Math.sin(angle + Math.PI),
      };

      for (const w of walls) {
        const holeAY = clamp(
          center.y + radius * w.targetSin,
          w.gapH / 2 + 6,
          H - w.gapH / 2 - 6
        );
        const holeBY = clamp(
          center.y - radius * w.targetSin,
          w.gapH / 2 + 6,
          H - w.gapH / 2 - 6
        );
        for (const orb of [orb1, orb2]) {
          const overlapX = orb.x + orbR > w.x && orb.x - orbR < w.x + chunkW;
          if (!overlapX) continue;
          const inHoleA = Math.abs(orb.y - holeAY) < w.gapH / 2 - orbR * 0.4;
          const inHoleB = Math.abs(orb.y - holeBY) < w.gapH / 2 - orbR * 0.4;
          if (!inHoleA && !inHoleB) {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          }
        }
        if (!over && !w.passed && w.x + chunkW < center.x - radius) {
          w.passed = true;
          score += 1;
          ctx.onScore(score);
          ctx.haptic("hit");
        }
      }
      walls = walls.filter((w) => w.x + chunkW > -20);
    }

    // background
    g.fillStyle = shade(pal.deep, -0.6);
    g.fillRect(0, 0, W, H);

    // walls
    for (const w of walls) {
      const holeAY = clamp(
        center.y + radius * w.targetSin,
        w.gapH / 2 + 6,
        H - w.gapH / 2 - 6
      );
      const holeBY = clamp(
        center.y - radius * w.targetSin,
        w.gapH / 2 + 6,
        H - w.gapH / 2 - 6
      );
      const holeMinY = Math.min(holeAY, holeBY);
      const holeMaxY = Math.max(holeAY, holeBY);
      const topBlocked = Math.max(0, holeMinY - w.gapH / 2);
      const midTop = holeMinY + w.gapH / 2;
      const midBottom = holeMaxY - w.gapH / 2;
      const midBlocked = Math.max(0, midBottom - midTop);
      const bottomStart = holeMaxY + w.gapH / 2;
      const bottomBlocked = Math.max(0, H - bottomStart);

      g.fillStyle = pal.foe;
      if (topBlocked > 0) g.fillRect(w.x, 0, chunkW, topBlocked);
      if (midBlocked > 0) g.fillRect(w.x, midTop, chunkW, midBlocked);
      if (bottomBlocked > 0) g.fillRect(w.x, bottomStart, chunkW, bottomBlocked);
    }

    // orbit rig
    const orb1 = {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
    const orb2 = {
      x: center.x + radius * Math.cos(angle + Math.PI),
      y: center.y + radius * Math.sin(angle + Math.PI),
    };

    g.strokeStyle = pal.glow;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(orb1.x, orb1.y);
    g.lineTo(orb2.x, orb2.y);
    g.stroke();

    g.fillStyle = pal.prize;
    g.beginPath();
    g.arc(center.x, center.y, 4, 0, Math.PI * 2);
    g.fill();

    // both orbiting bodies are him, staring each other down across the centre
    for (const orb of [orb1, orb2]) {
      drawNicHead(g, {
        x: orb.x,
        y: orb.y,
        r: orbR,
        skin: over ? pal.foe : pal.hero,
        hair: shade(pal.deep, -0.4),
        eye: theme.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: theme.ink,
        gape: over ? 0.9 : 0,
        scowl: over ? 1 : 0,
      });
    }

    if (over) endCard(g, theme, W, H, "COLLISION");
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
