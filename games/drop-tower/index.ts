import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { clamp, makeLoop, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";
import { drawCanTop, skins } from "@/games/nic-art";
import {
  createFx,
  createCombo,
  drawBackdrop,
  drawCombo,
  resultCard,
  hexA,
  mix,
  halo,
  pulse,
  approach,
  easeOutCubic,
  groundInk,
} from "@/games/fx";

const meta = {
  slug: "drop-tower",
  title: "Nic's Can Stack",
  rule: "Tap to drop. Perfect rows grow it back",
  year: 2016,
  description: "Stack it clean or shave it thin. Perfect drops pay you back.",
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
  maxScorePerSecond: 4,
} satisfies GameModule["meta"];

interface Layer {
  x: number;
  w: number;
  perfect: boolean;
}

interface Shard {
  x: number;
  y: number;
  w: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  life: number;
  colour: string;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(3);

  const blockH = 26;
  const baseY = H * 0.72;
  const START_W = W * 0.52;

  let stack: Layer[] = [];
  let towerX = W / 2 - START_W / 2;
  let towerW = START_W;
  let score = 0;
  let best = 0;
  let curX = 0;
  let dir = 1;
  let speed = W * 0.52;
  let over = false;
  let overAge = 0;
  let flash = 0;
  let shards: Shard[] = [];
  let cam = 0; // how far the camera has climbed, px
  let camTarget = 0;
  let clock = 0;
  let perfects = 0;
  let sway = 0;

  const layerColour = (i: number) => {
    const p = (i * 0.055) % 2;
    return p < 1 ? mix(pal.hero, pal.glow, p) : mix(pal.glow, pal.prize, p - 1);
  };

  const reset = () => {
    stack = [];
    towerX = W / 2 - START_W / 2;
    towerW = START_W;
    score = 0;
    curX = -START_W;
    dir = 1;
    speed = W * 0.52;
    over = false;
    overAge = 0;
    shards = [];
    cam = camTarget = 0;
    perfects = 0;
    combo.clear();
    fx.clear();
    ctx.onScore(0);
  };

  let auto = false;

  /** y of the top of layer `i` in world space (0 = ground) */
  const layerY = (i: number) => baseY - (i + 1) * blockH;

  const drop = () => {
    if (over) {
      if (overAge > 0.25) reset();
      return;
    }
    const th = ctx.getTheme();
    const left = Math.max(curX, towerX);
    const right = Math.min(curX + towerW, towerX + towerW);
    const overlap = right - left;
    const y = layerY(stack.length) + cam;

    if (overlap <= 2) {
      over = true;
      overAge = 0;
      best = Math.max(best, score);
      combo.break();
      ctx.haptic("fail");
      fx.shake(16);
      fx.flash(pal.foe, 0.3);
      // the whole block tumbles away
      shards.push({
        x: curX,
        y,
        w: towerW,
        vx: dir * 90,
        vy: -60,
        rot: 0,
        spin: dir * 3,
        life: 2,
        colour: pal.foe,
      });
      ctx.onRunEnd(score);
      return;
    }

    const perfect = overlap > towerW - 4;
    if (perfect) {
      perfects += 1;
      const mult = combo.hit();
      score += 2 * mult;
      flash = 0.4;
      ctx.haptic("hit");
      fx.shake(4);
      fx.flash(pal.prize, 0.14);
      fx.ring(left + overlap / 2, y + blockH / 2, pal.prize, 26, 5);
      fx.burst(left + overlap / 2, y + blockH / 2, {
        count: 20,
        colour: [pal.prize, "#ffffff"],
        speed: 240,
        life: 0.6,
        size: 4,
        kind: "spark",
      });
      fx.pop(W / 2, y - 26, `PERFECT +${2 * mult}`, pal.prize, 22, th.fontDisplay);
      // the reward that keeps a good run alive: the tower grows back
      towerW = Math.min(START_W, towerW + 7);
      towerX = clamp(left - 3.5, 0, W - towerW);
    } else {
      combo.break();
      score += 1;
      ctx.haptic("light");
      // the shaved overhang falls off — the signature of the genre
      const cutW = towerW - overlap;
      const cutX = curX < towerX ? curX : left + overlap;
      shards.push({
        x: cutX,
        y,
        w: cutW,
        vx: (curX < towerX ? -1 : 1) * 60,
        vy: -30,
        rot: 0,
        spin: (curX < towerX ? -1 : 1) * 2.5,
        life: 1.6,
        colour: layerColour(stack.length),
      });
      fx.burst(cutX + cutW / 2, y + blockH / 2, {
        count: 8,
        colour: layerColour(stack.length),
        speed: 130,
        life: 0.5,
        size: 3,
        gravity: 500,
      });
      towerX = left;
      towerW = overlap;
    }

    stack.push({ x: towerX, w: towerW, perfect });
    ctx.onScore(score);
    sway = perfect ? 0.4 : 1.4;

    speed = Math.min(W * 1.5, speed * 1.045);
    // the camera keeps the action at a constant height once the tower is tall
    camTarget = Math.max(0, (stack.length - 5) * blockH);
    curX = Math.random() < 0.5 ? -towerW : W;
    dir = curX < 0 ? 1 : -1;
  };

  const onDown = () => drop();
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const ink = groundInk(th, pal.deep);
    clock += dt;
    fx.update(dt);
    combo.update(dt);
    cam = approach(cam, camTarget, 0.12, dt);
    sway = Math.max(0, sway - dt * 1.6);

    if (over) {
      overAge += dt;
    } else {
      // attract mode: release when the block is nearly flush with the stack
      if (auto && Math.abs(curX - towerX) < towerW * 0.05) drop();
      curX += dir * speed * dt;
      if (curX < -towerW * 0.25) dir = 1;
      if (curX + towerW > W + towerW * 0.25) dir = -1;
      flash = Math.max(0, flash - dt);
    }

    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.life -= dt;
      s.vy += 1200 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.spin * dt;
      if (s.life <= 0 || s.y > H + 200) shards.splice(i, 1);
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "stars",
      intensity: 0.9,
      scroll: -cam * 0.35,
      vignette: 0.55,
    });

    fx.begin(g);
    fx.drawUnder(g);

    // ground plane, drops away as the camera climbs
    const gy = baseY + cam;
    if (gy < H + 20) {
      const gg = g.createLinearGradient(0, gy, 0, H);
      gg.addColorStop(0, hexA(pal.glow, 0.4));
      gg.addColorStop(1, hexA(pal.deep, 0));
      g.fillStyle = gg;
      g.fillRect(0, gy, W, H - gy);
      g.fillStyle = hexA(ink.main, 0.5);
      g.fillRect(0, gy, W, 2);
    }

    // the tower — the whole stack sways a hair after a sloppy drop
    const swayAmt = Math.sin(clock * 9) * sway;
    const sk = skins(pal);
    /** Lays can lids across a row, alternating drink by row. */
    const lids = (x: number, y: number, w: number, row: number) => {
      const r = (blockH - 8) / 2;
      if (r < 3) return;
      const step = r * 2 + 3;
      const n = Math.floor(w / step);
      if (n < 1) return;
      const pad = (w - n * step) / 2;
      const skin = sk[row % 2 === 0 ? "cola" : "energy"];
      for (let i = 0; i < n; i++) {
        drawCanTop(g, x + pad + step * i + step / 2, y + (blockH - 2) / 2, r, skin);
      }
    };

    for (let i = 0; i < stack.length; i++) {
      const L = stack[i];
      const y = layerY(i) + cam;
      if (y > H + blockH || y < -blockH * 2) continue;
      const lean = swayAmt * (i / Math.max(1, stack.length)) * 3;
      const col = layerColour(i);
      g.fillStyle = hexA("#000000", 0.28);
      roundRect(g, L.x + lean + 2, y + 3, L.w, blockH - 2, 5);
      g.fill();
      const face = g.createLinearGradient(L.x, y, L.x + L.w, y + blockH);
      face.addColorStop(0, mix(col, "#ffffff", 0.22));
      face.addColorStop(1, col);
      g.fillStyle = face;
      roundRect(g, L.x + lean, y, L.w, blockH - 2, 5);
      g.fill();
      if (L.perfect) {
        g.strokeStyle = hexA(pal.prize, 0.85);
        g.lineWidth = 1.5;
        roundRect(g, L.x + lean + 0.75, y + 0.75, L.w - 1.5, blockH - 3.5, 4.5);
        g.stroke();
      }
      // top highlight, so the stack reads as solid
      g.fillStyle = hexA("#ffffff", 0.22);
      g.fillRect(L.x + lean + 3, y + 1.5, L.w - 6, 2);
      // the row is a flat of cans, lids up
      lids(L.x + lean, y, L.w, i);
    }

    // falling debris
    for (const s of shards) {
      g.save();
      g.translate(s.x + s.w / 2, s.y + blockH / 2);
      g.rotate(s.rot);
      g.globalAlpha = clamp(s.life, 0, 1);
      g.fillStyle = s.colour;
      roundRect(g, -s.w / 2, -blockH / 2, s.w, blockH - 2, 5);
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;

    // the block in play, swinging above the stack
    const movY = layerY(stack.length) + cam;
    if (!over) {
      const col = layerColour(stack.length);
      halo(g, curX + towerW / 2, movY + blockH / 2, towerW * 0.9, col, 0.28);
      // a guide line down to the landing zone
      g.strokeStyle = hexA(col, 0.28);
      g.lineWidth = 1;
      g.setLineDash([4, 6]);
      g.beginPath();
      g.moveTo(curX + towerW / 2, movY + blockH);
      g.lineTo(curX + towerW / 2, movY + blockH * 3);
      g.stroke();
      g.setLineDash([]);

      const face = g.createLinearGradient(curX, movY, curX + towerW, movY + blockH);
      face.addColorStop(0, mix(col, "#ffffff", 0.3));
      face.addColorStop(1, col);
      g.fillStyle = face;
      roundRect(g, curX, movY, towerW, blockH - 2, 5);
      g.fill();
      g.fillStyle = hexA("#ffffff", 0.25);
      g.fillRect(curX + 3, movY + 1.5, towerW - 6, 2);
      // the slab swinging overhead has him riding it
      drawNicHead(g, {
        x: curX + towerW / 2,
        y: movY + blockH / 2,
        r: Math.min(towerW * 0.2, blockH * 0.42),
        skin: col,
        hair: shade(pal.deep, -0.4),
        eye: th.ink,
        pupil: shade(pal.deep, -0.65),
        dark: shade(pal.deep, -0.65),
        tooth: th.ink,
        gape: 0.3,
      });
      lids(curX, movY, towerW, stack.length);
    }

    // ---- HUD
    if (flash > 0) {
      const k = easeOutCubic(flash / 0.4);
      g.textAlign = "center";
      g.globalAlpha = k;
      g.fillStyle = pal.prize;
      g.font = `900 ${Math.round(20 + k * 6)}px ${th.fontDisplay}`;
      g.fillText("CLEAN", W / 2, movY - 22);
      g.globalAlpha = 1;
      g.textAlign = "left";
    }
    drawCombo(g, combo, W / 2, H * 0.23, pal.prize, th.fontDisplay, clock);

    g.textAlign = "center";
    g.fillStyle = hexA(ink.main, 0.45);
    g.font = `700 13px ${th.fontBody}`;
    g.fillText(
      `${stack.length} HIGH · ${Math.round((towerW / START_W) * 100)}% WIDE`,
      W / 2,
      H * 0.17
    );
    if (stack.length === 0 && !over) {
      g.fillStyle = hexA(ink.main, 0.35 + pulse(clock, 1.6) * 0.35);
      g.font = `700 14px ${th.fontBody}`;
      g.fillText("tap to drop it flush", W / 2, H * 0.78);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: "off the edge",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `${stack.length} storeys · ${perfects} perfect`,
        age: overAge,
        accent: pal.hero,
      });
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
