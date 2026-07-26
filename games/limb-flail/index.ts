import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "limb-flail",
  title: "Limb Flail",
  rule: "Alternate drag zones to shuffle forward",
  year: 2008,
  description: "Two legs, zero coordination, one faceplant.",
  history:
    "Homage to the 2008 browser wave of deliberately terrible ragdoll runners, where every limb obeyed physics and none obeyed you.",
  tags: ["chaos", "drag", "precision"],
  palette: {
    hero: "#ef476f",
    foe: "#073b4c",
    prize: "#ffd166",
    deep: "#011627",
    glow: "#06d6a0",
  },
  intensity: 0.7,
  luck: 0.2,
  nostalgia: 0.8,
  sessionLength: 0.45,
  scoreUnit: "pts",
  maxScorePerSecond: 3,
} satisfies GameModule["meta"];

interface Leg {
  hipX: number;
  footX: number; // relative to hip, forward = negative-of-body-motion offset
  extend: number; // 0..1 drag progress
  planted: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const groundY = H * 0.78;
  const zoneL = { x: 0, w: W / 2 };
  const zoneR = { x: W / 2, w: W / 2 };

  let bodyX = 0; // world-space distance traveled
  let torsoAngle = 0;
  let torsoAngleVel = 0;
  let legL: Leg = { hipX: -14, footX: -14, extend: 0, planted: true };
  let legR: Leg = { hipX: 14, footX: 14, extend: 0, planted: true };
  let score = 0;
  let over = false;
  let dragL = 0; // 0..1 pointer id tracking
  let dragR = 0;
  let ptrL = -1;
  let ptrR = -1;
  let ptrLStartY = 0;
  let ptrRStartY = 0;

  const reset = () => {
    bodyX = 0;
    torsoAngle = 0;
    torsoAngleVel = 0;
    legL = { hipX: -14, footX: -14, extend: 0, planted: true };
    legR = { hipX: 14, footX: 14, extend: 0, planted: true };
    score = 0;
    over = false;
    ptrL = -1;
    ptrR = -1;
    ctx.onScore(0);
  };

  const posY = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const p = posY(e);
    if (p.x < W / 2 && ptrL === -1) {
      ptrL = e.pointerId;
      ptrLStartY = p.y;
    } else if (p.x >= W / 2 && ptrR === -1) {
      ptrR = e.pointerId;
      ptrRStartY = p.y;
    }
  };
  const onMove = (e: PointerEvent) => {
    if (over) return;
    const p = posY(e);
    if (e.pointerId === ptrL) {
      dragL = clamp((ptrLStartY - p.y) / 90, 0, 1);
    } else if (e.pointerId === ptrR) {
      dragR = clamp((ptrRStartY - p.y) / 90, 0, 1);
    }
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId === ptrL) {
      ptrL = -1;
      // release triggers a step
      legL.extend = dragL;
      dragL = 0;
      stepLeg("L");
    } else if (e.pointerId === ptrR) {
      ptrR = -1;
      legR.extend = dragR;
      dragR = 0;
      stepLeg("R");
    }
  };

  const stepLeg = (which: "L" | "R") => {
    if (over) return;
    const leg = which === "L" ? legL : legR;
    const other = which === "L" ? legR : legL;
    const power = 0.3 + leg.extend * 1.2;
    if (!other.planted) {
      // both legs airborne = stumble risk
      torsoAngleVel += (Math.random() - 0.5) * 0.4;
    }
    leg.planted = true;
    other.planted = false;
    bodyX += power * 26;
    torsoAngleVel += (which === "L" ? -1 : 1) * (0.05 + leg.extend * 0.15);
    score = Math.floor(bodyX / 10);
    ctx.onScore(score);
    ctx.haptic("light");
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;
  let autoCd = 0;
  let autoWhich: "L" | "R" = "L";

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          stepLeg(autoWhich);
          autoWhich = autoWhich === "L" ? "R" : "L";
          autoCd = 0.42;
        }
      }
      // torso wobble physics: unplanted state destabilizes
      const bothUnplanted = !legL.planted && !legR.planted;
      torsoAngleVel += (bothUnplanted ? 1 : 0.15) * (Math.random() - 0.5) * 1.4 * dt;
      torsoAngleVel -= torsoAngle * 3.2 * dt; // spring back
      torsoAngleVel *= 0.96;
      torsoAngle += torsoAngleVel;
      if (Math.abs(torsoAngle) > 0.9) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    g.fillStyle = shade(pal.deep, -0.62);
    g.fillRect(0, 0, W, H);
    g.fillStyle = shade(pal.deep, 0.15);
    g.fillRect(0, groundY, W, H - groundY);
    // ground scroll markers
    g.strokeStyle = "rgba(255,255,255,.08)";
    for (let i = -2; i < 12; i++) {
      const x = ((i * 60 - bodyX) % (W + 60)) + (bodyX % 60 === 0 ? 0 : 0);
      const gx = ((((i * 60) - bodyX) % 700) + 700) % 700;
      g.beginPath();
      g.moveTo(gx, groundY);
      g.lineTo(gx, groundY + 8);
      g.stroke();
    }

    const cx = W * 0.5;
    const hipY = groundY - 60;
    const shoulderY = hipY - 44;
    const lean = torsoAngle * 40;

    // legs
    g.strokeStyle = over ? pal.foe : pal.hero;
    g.lineWidth = 8;
    g.lineCap = "round";
    for (const [leg, drag] of [
      [legL, dragL],
      [legR, dragR],
    ] as [Leg, number][]) {
      const ext = leg.planted ? 0.15 : drag || leg.extend;
      const footX = cx + leg.hipX + (leg.planted ? 0 : ext * 34 * (leg === legL ? -1 : 1));
      const footY = groundY - (leg.planted ? 4 : ext * 20);
      g.beginPath();
      g.moveTo(cx + lean * 0.3, hipY);
      g.lineTo(footX, footY);
      g.stroke();
    }

    // torso
    g.strokeStyle = shade(pal.hero, over ? -0.2 : 0.1);
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(cx + lean * 0.3, hipY);
    g.lineTo(cx + lean, shoulderY);
    g.stroke();
    // head
    g.fillStyle = over ? pal.foe : pal.glow;
    g.beginPath();
    g.arc(cx + lean * 1.15, shoulderY - 14, 12, 0, Math.PI * 2);
    g.fill();

    // distance marker
    g.fillStyle = t.ink;
    g.font = `700 14px ${t.fontBody}`;
    g.fillText(`${score}m`, 14, 26);

    if (over) endCard(g, t, W, H, "FACEPLANT");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointermove", onMove);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
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
