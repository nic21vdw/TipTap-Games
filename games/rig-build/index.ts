import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, pick, rand, roundRect, shade } from "@/games/engine";

const meta = {
  slug: "rig-build",
  title: "Rig Build",
  rule: "Bolt on parts, then launch it downhill",
  year: 2012,
  description: "Build a wobbly little rig. Send it. Pray it rolls.",
  history:
    "Homage to the 2012 wave of physics tinkering toys that let you bolt spare parts onto a rickety cart and launch it across bumpy hills for distance.",
  tags: ["chaos", "precision", "retro"],
  palette: {
    hero: "#e07a5f",
    foe: "#3d405b",
    prize: "#f2cc8f",
    deep: "#81b29a",
    glow: "#f4f1de",
  },
  intensity: 0.5,
  luck: 0.35,
  nostalgia: 0.6,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

type PartType = "wheel" | "box" | "fan";
type Mount = "front" | "top" | "rear";
const MOUNTS: Mount[] = ["front", "top", "rear"];
const PART_KINDS: PartType[] = ["wheel", "box", "fan"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  const groundY = (x: number) =>
    H * 0.68 + Math.sin(x * 0.007) * 34 + Math.sin(x * 0.021) * 14;
  const groundSlope = (x: number) => (groundY(x + 4) - groundY(x - 4)) / 8;

  let phase: "build" | "run" = "build";
  let slots: PartType[] = [];
  let parts: Partial<Record<Mount, PartType>> = {};
  let carX = 0;
  let carVx = 0;
  let carAngle = 0;
  let wheelSpin = 0;
  let boostT = 0;
  let boostCd = 0;
  let stillT = 0;
  let score = 0;
  let over = false;
  let auto = false;
  let autoCd = 0;

  const rollSlots = () => {
    slots = [pick(PART_KINDS), pick(PART_KINDS), pick(PART_KINDS)];
  };

  const nextEmptyMount = (): Mount | null => {
    for (const m of MOUNTS) if (!parts[m]) return m;
    return null;
  };

  const wheelCount = () =>
    Object.values(parts).filter((p) => p === "wheel").length;
  const hasFan = () => Object.values(parts).some((p) => p === "fan");
  const boxCount = () =>
    Object.values(parts).filter((p) => p === "box").length;

  const launch = () => {
    phase = "run";
    carX = 0;
    carVx = rand(20, 40);
    carAngle = 0;
    stillT = 0;
    ctx.haptic("hit");
  };

  const attach = (slotIdx: number) => {
    const m = nextEmptyMount();
    if (!m) return;
    parts[m] = slots[slotIdx];
    slots[slotIdx] = pick(PART_KINDS);
    ctx.haptic("light");
    if (!nextEmptyMount()) launch();
  };

  const finish = () => {
    over = true;
    ctx.haptic("fail");
    ctx.onRunEnd(score);
  };

  const reset = () => {
    phase = "build";
    parts = {};
    rollSlots();
    carX = 0;
    carVx = 0;
    carAngle = 0;
    boostT = 0;
    boostCd = 0;
    stillT = 0;
    score = 0;
    over = false;
    ctx.onScore(0);
  };
  reset();

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (phase === "build") {
      const slotW = W / 3;
      if (py > H * 0.78) {
        attach(Math.min(2, Math.floor(px / slotW)));
      } else if (py < H * 0.14) {
        launch();
      }
    } else if (hasFan() && boostCd <= 0) {
      boostT = 0.6;
      boostCd = 1.6;
      ctx.haptic("hit");
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  function drawPart(x: number, y: number, p: PartType, r: number) {
    if (p === "wheel") {
      g.fillStyle = pal.foe;
      g.beginPath();
      g.arc(x, y, r * 0.55, 0, Math.PI * 2);
      g.fill();
    } else if (p === "box") {
      g.fillStyle = pal.prize;
      g.fillRect(x - r * 0.5, y - r * 0.5, r, r);
    } else {
      g.fillStyle = pal.glow;
      g.beginPath();
      g.moveTo(x, y - r * 0.55);
      g.lineTo(x + r * 0.5, y + r * 0.35);
      g.lineTo(x - r * 0.5, y + r * 0.35);
      g.closePath();
      g.fill();
    }
  }

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (phase === "build") {
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0 && nextEmptyMount()) {
          attach(Math.floor(Math.random() * 3));
          autoCd = 0.35;
        }
      }
    } else if (!over) {
      if (auto && hasFan() && boostCd <= 0 && Math.random() < 0.02) {
        boostT = 0.6;
        boostCd = 1.6;
      }
      boostCd = Math.max(0, boostCd - dt);
      const slope = groundSlope(carX);
      const drive = 6 + wheelCount() * 10;
      const friction = 0.6 + boxCount() * 0.12;
      carVx += slope * 55 * dt;
      carVx += drive * dt;
      carVx -= carVx * friction * dt;
      if (boostT > 0) {
        boostT -= dt;
        carVx += 90 * dt;
      }
      carVx = Math.max(-10, Math.min(260, carVx));
      carX += carVx * dt;
      carAngle = Math.atan2(groundY(carX + 6) - groundY(carX - 6), 12);
      wheelSpin += carVx * dt * 0.05;

      if (Math.abs(carVx) < 4) stillT += dt;
      else stillT = 0;

      score = Math.max(score, Math.floor(carX / 8));
      ctx.onScore(score);

      if (stillT > 0.9) finish();
    }

    g.fillStyle = shade(pal.deep, -0.62);
    g.fillRect(0, 0, W, H);

    const camX = phase === "run" ? carX - W * 0.28 : 0;
    g.beginPath();
    g.moveTo(0, H);
    for (let sx = 0; sx <= W; sx += 8) g.lineTo(sx, groundY(sx + camX));
    g.lineTo(W, H);
    g.closePath();
    g.fillStyle = shade(pal.deep, -0.15);
    g.fill();

    if (phase === "build") {
      const cx = W / 2;
      const cy = H * 0.45;
      g.fillStyle = pal.hero;
      roundRect(g, cx - 34, cy - 14, 68, 28, 8);
      g.fill();
      const mountPos: Record<Mount, [number, number]> = {
        front: [cx + 34, cy],
        top: [cx, cy - 14],
        rear: [cx - 34, cy],
      };
      for (const m of MOUNTS) {
        const [mx, my] = mountPos[m];
        g.strokeStyle = shade(pal.hero, 0.3);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(mx, my, 10, 0, Math.PI * 2);
        g.stroke();
        const p = parts[m];
        if (p) drawPart(mx, my, p, 12);
      }

      const slotW = W / 3;
      for (let i = 0; i < 3; i++) {
        const sx = i * slotW;
        g.fillStyle = t.surface;
        roundRect(g, sx + 8, H * 0.8, slotW - 16, H * 0.14, 12);
        g.fill();
        drawPart(sx + slotW / 2, H * 0.8 + (H * 0.14) / 2, slots[i], 14);
      }

      g.fillStyle = t.ink;
      g.font = `700 15px ${t.fontBody}`;
      g.textAlign = "center";
      g.fillText("tap parts, or tap top to launch", W / 2, H * 0.1);
      g.textAlign = "left";
    } else {
      const cx = W * 0.28;
      const cy = groundY(carX) - 16;
      g.save();
      g.translate(cx, cy);
      g.rotate(carAngle);
      g.fillStyle = over ? pal.foe : pal.hero;
      roundRect(g, -20, -12, 40, 22, 6);
      g.fill();
      g.fillStyle = shade(pal.hero, -0.4);
      for (const wx of [-14, 14]) {
        g.save();
        g.translate(wx, 12);
        g.rotate(wheelSpin);
        g.beginPath();
        g.arc(0, 0, 8, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(0,0,0,.3)";
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(8, 0);
        g.stroke();
        g.restore();
      }
      if (hasFan()) {
        g.fillStyle = boostT > 0 ? pal.glow : shade(pal.glow, -0.3);
        roundRect(g, -28, -22, 12, 12, 3);
        g.fill();
        if (boostT > 0) {
          g.fillStyle = "rgba(255,255,255,.6)";
          g.beginPath();
          g.moveTo(-28, -16);
          g.lineTo(-40 - rand(0, 12), -16);
          g.lineTo(-28, -10);
          g.fill();
        }
      }
      g.restore();

      g.fillStyle = t.ink;
      g.font = `700 16px ${t.fontBody}`;
      g.fillText(`${score}m`, 16, 28);

      if (over) endCard(g, t, W, H, "RIG STOPPED");
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
