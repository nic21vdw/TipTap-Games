import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop } from "@/games/engine";

const meta = {
  slug: "drop-tower",
  title: "Drop Tower",
  rule: "Tap to drop the block on the stack",
  year: 2016,
  description: "Stack it clean or lose the edge.",
  history:
    "Homage to 2016's hypnotic block-stacker — towers of near-misses, shaved thinner with every sloppy drop.",
  tags: ["precision", "oneTap", "calm"],
  intensity: 0.35,
  luck: 0.05,
  nostalgia: 0.4,
  sessionLength: 0.35,
  scoreUnit: "pts",
  maxScorePerSecond: 2,
} satisfies GameModule["meta"];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H } = ctx;
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
      ctx.onRunEnd(layers);
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

    g.fillStyle = t.bg;
    g.fillRect(0, 0, W, H);

    const baseY = H * 0.78;
    // stacked layers (draw the visible recent ones)
    const visible = Math.min(layers, Math.floor((baseY - H * 0.3) / blockH));
    for (let i = 0; i < visible; i++) {
      g.fillStyle = i === visible - 1 && flash > 0 ? t.accent : t.surface;
      g.fillRect(towerX, baseY - (i + 1) * blockH, towerW, blockH - 2);
    }
    // ground
    g.fillStyle = t.inkDim;
    g.fillRect(0, baseY, W, 3);
    // moving block
    const movY = baseY - (visible + 1) * blockH;
    g.fillStyle = over ? t.danger : t.accent;
    g.fillRect(curX, movY, towerW, blockH - 2);

    g.textAlign = "center";
    if (flash > 0) {
      g.fillStyle = t.success;
      g.font = `800 20px ${t.fontDisplay}`;
      g.fillText("CLEAN", W / 2, movY - 18);
    }
    if (over) {
      g.fillStyle = t.ink;
      g.font = `800 34px ${t.fontDisplay}`;
      g.fillText("OFF THE EDGE", W / 2, H * 0.16);
      g.font = `500 17px ${t.fontBody}`;
      g.fillStyle = t.inkDim;
      g.fillText("tap to go again", W / 2, H * 0.16 + 34);
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
