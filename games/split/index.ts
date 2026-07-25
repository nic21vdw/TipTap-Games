import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop } from "@/games/engine";

const meta = {
  slug: "split",
  title: "Split",
  rule: "Chop left or right, dodge the branches",
  year: 2014,
  description: "Chop fast. Watch the branches. Feed the timer.",
  history:
    "Homage to the 2014 side-switching lumberjack sprint — the purest speed test the app stores ever produced.",
  tags: ["reflex", "oneTap", "chaos"],
  intensity: 0.85,
  luck: 0.05,
  nostalgia: 0.4,
  sessionLength: 0.25,
  scoreUnit: "pts",
  maxScorePerSecond: 8,
} satisfies GameModule["meta"];

type Branch = -1 | 0 | 1; // left, none, right

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
  const segH = H * 0.11;
  const trunkW = W * 0.2;
  let segs: Branch[] = [];
  let side: -1 | 1 = -1;
  let score = 0;
  let over = false;
  let fuel = 1; // depletes; chops refill

  const nextBranch = (prev: Branch): Branch => {
    // never two branches in a row on random side-traps; keep it fair but mean
    if (prev !== 0) return 0;
    const r = Math.random();
    return r < 0.4 ? -1 : r < 0.8 ? 1 : 0;
  };

  const reset = () => {
    segs = [0, 0, 0];
    while (segs.length < 8) segs.push(nextBranch(segs[segs.length - 1]));
    side = -1;
    score = 0;
    fuel = 1;
    over = false;
    ctx.onScore(0);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    side = e.clientX - r.left < W / 2 ? -1 : 1;
    // chop: bottom segment leaves, everything drops
    segs.shift();
    segs.push(nextBranch(segs[segs.length - 1]));
    if (segs[0] === side) {
      over = true;
      ctx.haptic("fail");
      ctx.onRunEnd(score);
      return;
    }
    score += 1;
    fuel = Math.min(1, fuel + 0.09);
    ctx.onScore(score);
    ctx.haptic("hit");
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: always chop from the branch-free side
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          const safe: -1 | 1 = segs[0] === -1 ? 1 : -1;
          side = safe;
          segs.shift();
          segs.push(nextBranch(segs[segs.length - 1]));
          if (segs[0] !== side) {
            score += 1;
            fuel = Math.min(1, fuel + 0.09);
            ctx.onScore(score);
          }
          autoCd = 0.18;
        }
      }
      fuel -= dt * (0.1 + score * 0.0022);
      if (fuel <= 0) {
        over = true;
        ctx.haptic("fail");
        ctx.onRunEnd(score);
      }
    }

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);

    const baseY = H * 0.82;
    // trunk + branches
    for (let i = 0; i < segs.length; i++) {
      const y = baseY - (i + 1) * segH;
      g.fillStyle = t.surface;
      g.fillRect(W / 2 - trunkW / 2, y, trunkW, segH - 3);
      if (segs[i] !== 0) {
        g.fillStyle = t.accentAlt;
        const bw = W * 0.24;
        const bx = segs[i] === -1 ? W / 2 - trunkW / 2 - bw : W / 2 + trunkW / 2;
        g.fillRect(bx, y + segH * 0.22, bw, segH * 0.34);
      }
    }
    // player
    const px = side === -1 ? W / 2 - trunkW / 2 - W * 0.14 : W / 2 + trunkW / 2 + W * 0.14;
    g.fillStyle = over ? t.danger : t.accent;
    g.beginPath();
    g.arc(px, baseY - segH * 0.45, 17, 0, Math.PI * 2);
    g.fill();
    g.fillRect(px - 9, baseY - segH * 0.45 + 12, 18, 26);

    // fuel bar
    const fw = W * 0.5;
    g.fillStyle = t.surface;
    g.fillRect(W / 2 - fw / 2, H * 0.9, fw, 10);
    g.fillStyle = fuel < 0.3 ? t.danger : t.success;
    g.fillRect(W / 2 - fw / 2, H * 0.9, fw * Math.max(0, fuel), 10);

    g.textAlign = "center";
    g.fillStyle = t.inkDim;
    g.font = `500 13px ${t.fontBody}`;
    g.fillText("tap a side to chop from it", W / 2, H * 0.9 + 30);
    if (over) {
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText(fuel <= 0 ? "TOO SLOW" : "BRANCHED", W / 2, H * 0.12);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, H * 0.12 + 32);
    }
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
