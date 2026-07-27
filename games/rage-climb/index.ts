import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "rage-climb",
  title: "Nic's Rage Climb",
  rule: "Swing the lever. Vault up the slope. Don't slip.",
  year: 2017,
  description: "One pot, one hammer, one brutal hill. Rage-quit not included.",
  history:
    "Homage to the 2017 deliberately-punishing physics-climber craze that turned a wobbly lever and a jagged hill into internet-famous rage.",
  tags: ["precision", "chaos", "endurance"],
  palette: {
    hero: "#e8871e",
    foe: "#6b4226",
    prize: "#ffd23f",
    deep: "#2b1d0e",
    glow: "#8ac926",
  },
  intensity: 0.6,
  luck: 0.1,
  nostalgia: 0.2,
  sessionLength: 0.6,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

const TIME_LIMIT = 45;
const LEVER_LEN = 46;
const GRAVITY = 220;
const SLOPE_RISE = 0.55;

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const anchorX = W * 0.38;
  const anchorY = H * 0.68;

  // fixed jagged-hill parameters, seeded once per mount
  const jag = [
    { amp: rand(14, 22), freq: rand(0.015, 0.025), phase: rand(0, 10) },
    { amp: rand(7, 12), freq: rand(0.04, 0.06), phase: rand(0, 10) },
    { amp: rand(3, 6), freq: rand(0.09, 0.13), phase: rand(0, 10) },
  ];
  const terrainYAt = (x: number) => {
    let y = x * SLOPE_RISE;
    for (const j of jag) y += j.amp * Math.sin(x * j.freq + j.phase);
    return y;
  };
  const slopeDerivAt = (x: number) => {
    const e = 2;
    return (terrainYAt(x + e) - terrainYAt(x - e)) / (2 * e);
  };

  let charX = 0;
  let charY = 0;
  let vx = 0;
  let vy = 0;
  let angle = -0.6; // lever angle, 0 = pointing +x (right)
  let angVel = 0;
  let dragAngle = angle;
  let dragging = false;
  let wasEmbedded = false;
  let maxHeight = 0;
  let score = 0;
  let elapsed = 0;
  let over = false;
  let badFlash = 0;
  let goodFlash = 0;

  const reset = () => {
    charX = 0;
    charY = terrainYAt(0) + 4;
    vx = 0;
    vy = 0;
    angle = -0.6;
    angVel = 0;
    dragAngle = angle;
    wasEmbedded = false;
    maxHeight = charY;
    score = 0;
    elapsed = 0;
    over = false;
    ctx.onScore(0);
  };

  const worldToScreenX = (wx: number) => wx - charX + anchorX;
  const worldToScreenY = (wy: number) => anchorY - (wy - charY);

  const pointerAngleToChar = (clientX: number, clientY: number, r: DOMRect) => {
    const px = clientX - r.left;
    const py = clientY - r.top;
    return Math.atan2(py - anchorY, px - anchorX);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    dragging = true;
    dragAngle = pointerAngleToChar(e.clientX, e.clientY, r);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || over) return;
    const r = ctx.canvas.getBoundingClientRect();
    dragAngle = pointerAngleToChar(e.clientX, e.clientY, r);
  };
  const onUp = () => {
    dragging = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;
  let autoT = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();

    if (!over) {
      elapsed += dt;
      if (elapsed >= TIME_LIMIT) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    if (!over) {
      // lever control: spring toward drag target, or auto-swing
      if (auto) {
        autoT += dt;
        dragAngle = Math.sin(autoT * 2.4) * 1.4 - 0.5;
        angVel += shortestDiff(dragAngle, angle) * 26 * dt;
      } else if (dragging) {
        angVel += shortestDiff(dragAngle, angle) * 22 * dt;
      }
      // gravity torque on the lever itself (like a pendulum)
      angVel += Math.cos(angle) * 3.2 * dt;
      angVel *= 1 - Math.min(1, 1.2 * dt);
      angle += angVel * dt;

      // lever tip world position
      const tipX = charX + Math.cos(angle) * LEVER_LEN;
      const tipY = charY + Math.sin(angle) * LEVER_LEN;
      const groundAtTip = terrainYAt(tipX);
      const embedded = tipY <= groundAtTip;

      if (embedded && !wasEmbedded && Math.abs(angVel) > 1.4) {
        const tipVX = -Math.sin(angle) * angVel * LEVER_LEN;
        const tipVY = Math.cos(angle) * angVel * LEVER_LEN;
        const strength = clamp(Math.abs(tipVY) * 0.018, 0, 3.2);
        if (tipVX < 0) {
          // good strike: planted behind, vaults the pot forward and up
          vx += strength * 46;
          vy += strength * 60;
          ctx.haptic("hit");
          goodFlash = 1;
        } else {
          // bad strike: faceplant, kicks the pot backward
          vx -= strength * 30;
          ctx.haptic("fail");
          badFlash = 1;
        }
        angVel *= 0.25;
      }
      wasEmbedded = embedded;

      // gravity + slope drag on the pot
      vy -= GRAVITY * dt;
      const slope = slopeDerivAt(charX);
      vx -= slope * 34 * dt; // steeper slope pulls harder backward without propulsion
      vx *= 1 - Math.min(1, 0.6 * dt);

      charX += vx * dt;
      charY += vy * dt;

      const groundAtChar = terrainYAt(charX);
      if (charY <= groundAtChar) {
        charY = groundAtChar;
        vy = Math.max(0, vy) * 0.2;
      }
      // fell way back below the start: reset the attempt
      if (charX < -160) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }

      if (charY > maxHeight) {
        maxHeight = charY;
        score = Math.max(0, Math.round(maxHeight * 0.4));
        ctx.onScore(score);
      }
    }

    badFlash = Math.max(0, badFlash - dt * 2);
    goodFlash = Math.max(0, goodFlash - dt * 2);

    // sky
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, shade(pal.deep, 0.35));
    sky.addColorStop(1, shade(pal.deep, -0.5));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // terrain silhouette
    g.beginPath();
    g.moveTo(0, H);
    const step = 8;
    for (let sx = 0; sx <= W; sx += step) {
      const wx = sx + charX - anchorX;
      const sy = worldToScreenY(terrainYAt(wx));
      g.lineTo(sx, sy);
    }
    g.lineTo(W, H);
    g.closePath();
    const groundGrad = g.createLinearGradient(0, H * 0.3, 0, H);
    groundGrad.addColorStop(0, shade(pal.foe, 0.1));
    groundGrad.addColorStop(1, shade(pal.foe, -0.35));
    g.fillStyle = groundGrad;
    g.fill();
    g.strokeStyle = pal.glow;
    g.lineWidth = 2;
    g.stroke();

    // height marker (high-water line)
    const markerScreenY = worldToScreenY(maxHeight);
    g.strokeStyle = `${pal.prize}88`;
    g.setLineDash([5, 5]);
    g.beginPath();
    g.moveTo(0, markerScreenY);
    g.lineTo(W, markerScreenY);
    g.stroke();
    g.setLineDash([]);

    // lever
    const cx = worldToScreenX(charX);
    const cy = worldToScreenY(charY);
    const tipX = cx + Math.cos(angle) * LEVER_LEN;
    const tipY = cy - Math.sin(angle) * LEVER_LEN;
    g.strokeStyle = shade(pal.hero, -0.2);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(tipX, tipY);
    g.stroke();
    g.beginPath();
    g.arc(tipX, tipY, 7, 0, Math.PI * 2);
    g.fillStyle = badFlash > 0 ? pal.foe : goodFlash > 0 ? pal.glow : shade(pal.hero, 0.2);
    g.fill();

    // pot + character
    g.fillStyle = pal.hero;
    roundRect(g, cx - 16, cy - 14, 32, 22, 8);
    g.fill();
    drawNicHead(g, {
      x: cx,
      y: cy - 20,
      r: 10,
      skin: shade(pal.hero, 0.3),
      hair: shade(pal.deep, -0.4),
      eye: t.ink,
      pupil: shade(pal.deep, -0.65),
      dark: shade(pal.deep, -0.65),
      tooth: t.ink,
      // the whole point of the game is that he is furious
      scowl: 1,
      gape: 0.4,
    });

    // time bar
    const barW = W * 0.7;
    g.fillStyle = "rgba(255,255,255,.15)";
    g.fillRect(W / 2 - barW / 2, 14, barW, 8);
    g.fillStyle = pal.prize;
    g.fillRect(W / 2 - barW / 2, 14, barW * clamp(1 - elapsed / TIME_LIMIT, 0, 1), 8);

    if (over) {
      endCard(g, t, W, H, elapsed >= TIME_LIMIT ? "TIME'S UP" : "SLIPPED");
    }
  });
  loop.start();

  function shortestDiff(target: number, current: number) {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

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
