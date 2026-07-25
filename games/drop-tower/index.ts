import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";

const meta = {
  slug: "drop-tower",
  title: "Drop Tower",
  rule: "Tap to drop the block on the stack",
  year: 2016,
  description: "Stack it clean or lose the edge.",
  history:
    "Homage to 2016's hypnotic block-stacker — towers of near-misses, shaved thinner with every sloppy drop.",
  tags: ["precision", "oneTap", "calm"],
  palette: {
    hero: "#4361ee",
    foe: "#f72585",
    prize: "#4cc9f0",
    deep: "#1b263b",
    glow: "#4cc9f0",
  },
  intensity: 0.35,
  luck: 0.05,
  nostalgia: 0.4,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const blockH = 26;
  let towerX = W * 0.25;
  let towerW = W * 0.5;
  let layers = 0; // score
  let curX = 0;
  let dir = 1;
  let speed = W * 0.5;
  let over = false;
  let flash = 0;

  const reset = () => {
    towerX = W * 0.25;
    towerW = W * 0.5;
    layers = 0;
    curX = 0;
    dir = 1;
    speed = W * 0.5;
    over = false;
    ctx.onScore(0);
  };

  let auto = false;

  const drop = () => {
    if (over) {
      reset();
      return;
    }
    // drop: intersect the moving block with the tower top
    const left = Math.max(curX, towerX);
    const right = Math.min(curX + towerW, towerX + towerW);
    const overlap = right - left;
    if (overlap <= 4) {
      over = true;
      ctx.haptic("fail");
      ctx.onRunEnd(layers, "OFF THE EDGE");
      return;
    }
    if (overlap > towerW * 0.95) flash = 0.3; // clean drop
    towerX = left;
    towerW = overlap;
    layers += 1;
    ctx.onScore(layers);
    ctx.haptic("hit");
    speed = Math.min(W * 1.4, speed * 1.05);
    curX = Math.random() < 0.5 ? -towerW : W;
    dir = curX < 0 ? 1 : -1;
  };
  const onDown = () => drop();
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) {
      // attract mode: release when the block is nearly flush with the stack
      if (auto && Math.abs(curX - towerX) < towerW * 0.08) drop();
      curX += dir * speed * dt;
      if (curX < -towerW * 0.2) dir = 1;
      if (curX + towerW > W + towerW * 0.2) dir = -1;
      flash = Math.max(0, flash - dt);
    }

    const ground = g.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, shade(pal.deep, -0.15));
    ground.addColorStop(1, shade(pal.deep, -0.55));
    g.fillStyle = ground;
    g.fillRect(0, 0, W, H);

    const baseY = H * 0.78;
    // stacked layers (draw the visible recent ones)
    const visible = Math.min(layers, Math.floor((baseY - H * 0.3) / blockH));
    for (let i = 0; i < visible; i++) {
      g.fillStyle = i === visible - 1 && flash > 0 ? pal.hero : t.surface;
      g.fillRect(towerX, baseY - (i + 1) * blockH, towerW, blockH - 2);
    }
    // ground
    g.fillStyle = t.inkDim;
    g.fillRect(0, baseY, W, 3);
    // moving block
    const movY = baseY - (visible + 1) * blockH;
    g.fillStyle = over ? pal.foe : pal.hero;
    g.fillRect(curX, movY, towerW, blockH - 2);

    g.textAlign = "center";
    if (flash > 0) {
      g.fillStyle = pal.prize;
      g.font = `800 20px ${t.fontDisplay}`;
      g.fillText("CLEAN", W / 2, movY - 18);
    }
    if (over) {
      endCard(g, t, W, H, "OFF THE EDGE");
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
