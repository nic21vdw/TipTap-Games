import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, shade } from "@/games/engine";

const meta = {
  slug: "mote-absorb",
  title: "Nic's Mote Absorb",
  rule: "Drag away from motes to recoil toward smaller ones",
  year: 2009,
  description: "Eject mass, drift free, absorb the small ones.",
  history:
    "Homage to the 2009 browser sensation about cellular growth in a drifting void, where every move cost you a piece of yourself.",
  tags: ["drag", "luck", "calm"],
  palette: {
    hero: "#7209b7",
    foe: "#f72585",
    prize: "#4cc9f0",
    deep: "#10002b",
    glow: "#b5179e",
  },
  intensity: 0.3,
  luck: 0.5,
  nostalgia: 0.8,
  sessionLength: 0.7,
  scoreUnit: "pts",
  maxScorePerSecond: 1,
} satisfies GameModule["meta"];

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  let player: Mote = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 16 };
  let motes: Mote[] = [];
  let score = 0;
  let over = false;
  let dragging = false;
  let dragStart = { x: 0, y: 0 };

  const spawnMote = () => {
    const angle = rand(0, Math.PI * 2);
    const dist = rand(W * 0.35, Math.hypot(W, H) * 0.55);
    const r = rand(6, 26);
    motes.push({
      x: player.x + Math.cos(angle) * dist,
      y: player.y + Math.sin(angle) * dist,
      vx: rand(-14, 14),
      vy: rand(-14, 14),
      r,
    });
  };

  const reset = () => {
    player = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 16 };
    motes = [];
    for (let i = 0; i < 9; i++) spawnMote();
    score = 0;
    over = false;
    ctx.onScore(0);
  };

  const posOf = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    dragging = true;
    dragStart = posOf(e);
  };
  const onMove = () => {};
  const onUp = (e: PointerEvent) => {
    if (!dragging || over) return;
    dragging = false;
    const p = posOf(e);
    const dx = dragStart.x - p.x;
    const dy = dragStart.y - p.y;
    const dragDist = Math.hypot(dx, dy);
    if (dragDist < 8 || player.r < 6) return;
    // ejecting mass: shrink player, recoil opposite the drag direction
    const lost = Math.min(player.r * 0.18, 3.5);
    player.r -= lost;
    const power = Math.min(340, dragDist * 2.4);
    player.vx += (dx / dragDist) * power;
    player.vy += (dy / dragDist) * power;
    ctx.haptic("light");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointermove", onMove);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          let target: Mote | null = null;
          let bestD = Infinity;
          for (const m of motes) {
            if (m.r >= player.r) continue;
            const d = Math.hypot(m.x - player.x, m.y - player.y);
            if (d < bestD) {
              bestD = d;
              target = m;
            }
          }
          if (target) {
            const dx = player.x - target.x;
            const dy = player.y - target.y;
            const d = Math.hypot(dx, dy) || 1;
            const lost = Math.min(player.r * 0.18, 3.5);
            player.r = Math.max(4, player.r - lost);
            player.vx += (dx / d) * 220;
            player.vy += (dy / d) * 220;
          }
          autoCd = 0.5;
        }
      }
      player.vx *= 0.985;
      player.vy *= 0.985;
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      player.x = Math.max(player.r, Math.min(W - player.r, player.x));
      player.y = Math.max(player.r, Math.min(H - player.r, player.y));

      for (const m of motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.x < m.r || m.x > W - m.r) m.vx *= -1;
        if (m.y < m.r || m.y > H - m.r) m.vy *= -1;
      }

      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        const d = Math.hypot(m.x - player.x, m.y - player.y);
        if (d < (m.r + player.r) * 0.75) {
          if (m.r < player.r) {
            player.r = Math.min(60, player.r + m.r * 0.4);
            score += 1;
            ctx.onScore(score);
            ctx.haptic("hit");
            motes.splice(i, 1);
            spawnMote();
          } else {
            over = true;
            ctx.haptic("fail");
            ctx.onRunEnd(score);
          }
        }
      }
      if (player.r < 4) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, H);

    for (const m of motes) {
      g.fillStyle = m.r < player.r ? pal.prize : pal.foe;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(player.x, player.y, Math.max(3, player.r), 0, Math.PI * 2);
    g.fill();
    g.fillStyle = pal.glow;
    g.globalAlpha = 0.5;
    g.beginPath();
    g.arc(player.x, player.y, Math.max(3, player.r) + 5, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;

    if (dragging) {
      g.strokeStyle = "rgba(255,255,255,.4)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(player.x, player.y);
      g.lineTo(dragStart.x, dragStart.y);
      g.stroke();
    }

    if (over) endCard(g, t, W, H, "ABSORBED");
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
