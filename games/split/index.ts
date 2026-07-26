import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawCanTop, drawJar, drawRoom, drawShades, skins } from "@/games/nic-art";

const meta = {
  slug: "split",
  title: "Stack Raid",
  rule: "Grab from the side with no jar",
  year: 2014,
  description: "Grab fast. Watch the jars. Feed the timer.",
  history:
    "Homage to the 2014 side-switching lumberjack sprint — the purest speed test the app stores ever produced. Same sprint, aimed at a shelf that was stacked far too high.",
  tags: ["reflex", "oneTap", "chaos"],
  palette: {
    hero: "#e8b48c",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#c9d3dc",
  },
  intensity: 0.85,
  luck: 0.05,
  nostalgia: 0.4,
  sessionLength: 0.25,
  scoreUnit: "pts",
  maxScorePerSecond: 8,
} satisfies GameModule["meta"];

type Branch = -1 | 0 | 1; // left, none, right

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
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

    drawRoom(g, W, H, pal.deep, pal.glow);
    const sk = skins(pal);

    const baseY = H * 0.82;
    // the stack, and the jars jutting out of it that will land on your head
    for (let i = 0; i < segs.length; i++) {
      const y = baseY - (i + 1) * segH;
      g.fillStyle = t.surface;
      g.fillRect(W / 2 - trunkW / 2, y, trunkW, segH - 3);
      const kind = i % 2 === 0 ? "cola" : "energy";
      const r = Math.min(trunkW * 0.2, (segH - 3) * 0.34);
      for (const s2 of [-1, 1]) {
        drawCanTop(g, W / 2 + s2 * trunkW * 0.24, y + (segH - 3) / 2, r, sk[kind]);
      }
      if (segs[i] !== 0) {
        const bw = W * 0.24;
        const bx = segs[i] === -1 ? W / 2 - trunkW / 2 - bw : W / 2 + trunkW / 2;
        g.fillStyle = shade(pal.prize, -0.45);
        g.fillRect(bx, y + segH * 0.22, bw, segH * 0.34);
        drawJar(
          g,
          bx + (segs[i] === -1 ? bw * 0.28 : bw * 0.72),
          y + segH * 0.39,
          bw * 0.42,
          segH * 0.56,
          pal.prize,
          shade(pal.prize, -0.5),
          shade(pal.prize, 0.4)
        );
      }
    }

    // you, sunglasses on, indoors, at 3am
    const px = side === -1 ? W / 2 - trunkW / 2 - W * 0.14 : W / 2 + trunkW / 2 + W * 0.14;
    const hy = baseY - segH * 0.45;
    g.fillStyle = over ? pal.foe : pal.hero;
    g.beginPath();
    g.arc(px, hy, 17, 0, Math.PI * 2);
    g.fill();
    g.fillRect(px - 9, hy + 12, 18, 26);
    drawShades(g, px, hy - 2, 26, shade(pal.deep, 0.25), t.ink);

    // stamina
    const fw = W * 0.5;
    g.fillStyle = t.surface;
    g.fillRect(W / 2 - fw / 2, H * 0.9, fw, 10);
    g.fillStyle = fuel < 0.3 ? pal.foe : pal.prize;
    g.fillRect(W / 2 - fw / 2, H * 0.9, fw * Math.max(0, fuel), 10);

    g.textAlign = "center";
    if (over) {
      endCard(g, t, W, H, fuel <= 0 ? "RAN OUT OF GAS" : "JARRED");
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
