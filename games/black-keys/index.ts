import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawCan, drawRoom, skins } from "@/games/nic-art";

const meta = {
  slug: "black-keys",
  title: "Zero Sugar",
  rule: "Tap only the black cans",
  year: 2014,
  description: "Only the black cans. Ever.",
  history:
    "Homage to 2014's tile-tapper that turned pianos into reflex tests and bus rides into speedruns. Same four lanes, one correct drink.",
  tags: ["reflex", "oneTap", "precision"],
  palette: {
    hero: "#e8a33d",
    foe: "#d81f2a",
    prize: "#1f6fd0",
    deep: "#12141b",
    glow: "#c9d3dc",
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
      overReason = "THAT ONE HAS SUGAR";
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
            overReason = "LET ONE GO WARM";
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

    drawRoom(g, W, H, pal.deep, pal.glow);
    const sk = skins(pal);
    // the black can is the one worth tapping; grabbing it turns it gold
    const black = { body: shade(pal.deep, 0.25), band: t.ink, rim: shade(pal.deep, 0.5) };
    const taken = { body: pal.hero, band: shade(pal.hero, -0.35), rim: shade(pal.hero, -0.2) };

    for (const row of rows) {
      for (let l = 0; l < LANES; l++) {
        const cx = l * laneW + laneW / 2;
        const cy = row.y + rowH / 2;
        if (l === row.dark) {
          g.fillStyle = row.hit ? pal.hero + "33" : t.ink;
          g.fillRect(l * laneW + 1, row.y + 1, laneW - 2, rowH - 2);
          drawCan(g, cx, cy, laneW * 0.5, rowH * 0.62, row.hit ? taken : black, "cola");
        } else {
          // the sugar ones. There to be left alone.
          drawCan(g, cx, cy, laneW * 0.34, rowH * 0.4, sk.cola, "cola");
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
