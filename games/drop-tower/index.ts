import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, shade } from "@/games/engine";
import { drawCanTop, drawRoom, skins } from "@/games/nic-art";

const meta = {
  slug: "drop-tower",
  title: "Can Stack",
  rule: "Tap to land the row on the stack",
  year: 2016,
  description: "Stack it clean or lose the edge of the desk.",
  history:
    "Homage to 2016's hypnotic block-stacker — towers of near-misses, shaved thinner with every sloppy drop. This one is built out of the recycling.",
  tags: ["precision", "oneTap", "calm"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#c9d3dc",
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

    drawRoom(g, W, H, pal.deep, pal.glow);
    const sk = skins(pal);

    /** A row of cans filling the rect a plain block used to occupy. */
    const drawRow = (x: number, y: number, w: number, lit: boolean, row: number) => {
      const kind = row % 2 === 0 ? "cola" : "energy";
      const skin = lit ? { ...sk[kind], body: shade(sk[kind].body, 0.4) } : sk[kind];
      g.fillStyle = shade(skin.rim, -0.4);
      g.fillRect(x, y, w, blockH - 2);
      const r = (blockH - 6) / 2;
      const step = r * 2 + 2;
      const n = Math.max(1, Math.floor(w / step));
      const pad = (w - n * step) / 2;
      for (let i = 0; i < n; i++) {
        drawCanTop(g, x + pad + step * i + step / 2, y + (blockH - 2) / 2, r, skin);
      }
    };

    const baseY = H * 0.78;
    // stacked layers (draw the visible recent ones)
    const visible = Math.min(layers, Math.floor((baseY - H * 0.3) / blockH));
    for (let i = 0; i < visible; i++) {
      drawRow(
        towerX,
        baseY - (i + 1) * blockH,
        towerW,
        i === visible - 1 && flash > 0,
        layers - visible + i
      );
    }
    // the desk
    g.fillStyle = t.inkDim;
    g.fillRect(0, baseY, W, 3);
    // the row still swinging
    const movY = baseY - (visible + 1) * blockH;
    if (over) {
      g.fillStyle = pal.foe;
      g.fillRect(curX, movY, towerW, blockH - 2);
    } else {
      drawRow(curX, movY, towerW, false, layers);
    }

    g.textAlign = "center";
    if (flash > 0) {
      g.fillStyle = pal.prize;
      g.font = `800 20px ${t.fontDisplay}`;
      g.fillText("CLEAN", W / 2, movY - 18);
    }
    if (over) {
      endCard(g, t, W, H, "OFF THE DESK");
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
