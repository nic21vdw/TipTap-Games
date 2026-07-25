import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "black-keys",
  title: "Black Keys",
  rule: "Tap only the dark tiles",
  year: 2014,
  description: "Only the dark tiles. Ever.",
  history:
    "Homage to 2014's tile-tapper that turned pianos into reflex tests and bus rides into speedruns.",
  tags: ["reflex", "oneTap", "precision"],
  palette: {
    hero: "#560bad",
    foe: "#f72585",
    prize: "#4cc9f0",
    deep: "#10002b",
    glow: "#b5179e",
  },
  intensity: 0.8,
  luck: 0.05,
  nostalgia: 0.4,
  sessionLength: 0.3,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

const LANES = 4;

interface Row {
  y: number;
  dark: number; // lane index
  hit: boolean;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const laneW = W / LANES;
  const rowH = H / 4.5;
  let rows: Row[] = [];
  let speed = H * 0.35;
  let score = 0;
  let over = false;
  let overReason = "";

  const reset = () => {
    rows = [];
    for (let i = 0; i < 5; i++)
      rows.push({ y: -i * rowH - rowH, dark: Math.floor(Math.random() * LANES), hit: false });
    speed = H * 0.35;
    score = 0;
    over = false;
    ctx.onScore(0);
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const lane = Math.floor(x / laneW);
    // find the row under the tap
    const row = rows.find((rw) => y >= rw.y && y < rw.y + rowH);
    if (!row) return;
    if (lane === row.dark && !row.hit) {
      row.hit = true;
      score += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      speed = Math.min(H * 1.1, speed + H * 0.008);
    } else {
      over = true;
      overReason = "WRONG TILE";
      ctx.haptic("fail");
      ctx.onRunEnd(score);
    }
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: clear the lowest un-hit row before it falls off
      if (auto) {
        let target: Row | null = null;
        for (const r of rows)
          if (!r.hit && r.y + rowH > 0 && (!target || r.y > target.y)) target = r;
        if (target && target.y > H * 0.35) {
          target.hit = true;
          score += 1;
          ctx.onScore(score);
          speed = Math.min(H * 1.1, speed + H * 0.008);
        }
      }
      let topY = Math.min(...rows.map((r) => r.y));
      for (const row of rows) row.y += speed * dt;
      for (const row of rows) {
        if (row.y > H) {
          if (!row.hit) {
            over = true;
            overReason = "MISSED ONE";
            ctx.haptic("fail");
            ctx.onRunEnd(score);
            break;
          }
          row.y = topY - rowH;
          row.dark = Math.floor(Math.random() * LANES);
          row.hit = false;
          topY = row.y;
        }
      }
    }

    const ground = g.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, shade(pal.deep, -0.15));
    ground.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);
    for (const row of rows) {
      for (let l = 0; l < LANES; l++) {
        if (l === row.dark && !row.hit) {
          g.fillStyle = t.ink;
          g.fillRect(l * laneW + 1, row.y + 1, laneW - 2, rowH - 2);
        } else if (l === row.dark && row.hit) {
          g.fillStyle = pal.hero;
          g.fillRect(l * laneW + 1, row.y + 1, laneW - 2, rowH - 2);
        }
      }
      g.strokeStyle = t.surface;
      g.lineWidth = 1;
      g.strokeRect(0, row.y, W, rowH);
    }
    for (let l = 1; l < LANES; l++) {
      g.fillStyle = t.surface;
      g.fillRect(l * laneW - 1, 0, 2, H);
    }

    if (over) {
      endCard(g, t, W, H, overReason);
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
