import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";
import {
  createFx,
  createCombo,
  drawCombo,
  resultCard,
  hexA,
  mix,
  halo,
  pulse,
  approach,
  vignette,
} from "@/games/fx";

const meta = {
  slug: "cross-traffic",
  title: "Nic's Cable Run",
  rule: "Tap to step. Mind the cans and the spills",
  year: 2014,
  description: "Step. Wait. Step. Barefoot, in the dark, across eleven feet of floor.",
  history:
    "Homage to 2014's hop-across-traffic arcade — the one that made 'why did the chicken cross the road' a genre. This crossing is one basement wide.",
  tags: ["precision", "oneTap", "endurance"],
  palette: {
    hero: "#e8b48c",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#c9d3dc",
  },
  intensity: 0.6,
  luck: 0.2,
  nostalgia: 0.4,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 6,
} satisfies GameModule["meta"];

type LaneKind = "safe" | "road" | "river";

interface Lane {
  kind: LaneKind;
  dir: 1 | -1;
  speed: number;
  /** cars on a road, logs on a river */
  things: number[];
  width: number;
  /** x of a coin on this lane, or -1 */
  coin: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(5);

  const rowH = H * 0.105;
  const pR = 13;
  let lanes: Lane[] = [];
  let row = 0; // player progress (index into lanes)
  let px = W / 2; // the player drifts on rivers, so x is state
  let cam = 0; // camera row offset (smooth)
  let score = 0;
  let best = 0;
  let over = false;
  let overAge = 0;
  let clock = 0;
  let hopT = 0; // hop animation
  let coins = 0;
  let drowned = false;
  let deathX = 0;
  let deathY = 0;

  const makeLane = (i: number): Lane => {
    const coin = Math.random() < 0.22 ? rand(W * 0.15, W * 0.85) : -1;
    if (i < 2) return { kind: "safe", dir: 1, speed: 0, things: [], width: 0, coin: -1 };

    // never three hazard lanes of the same kind in a row, and never a river
    // immediately after a river until the player has some rhythm
    const prev = lanes[i - 1]?.kind;
    const prev2 = lanes[i - 2]?.kind;
    const roll = Math.random();
    let kind: LaneKind =
      roll < 0.3 ? "safe" : roll < 0.72 ? "road" : i > 6 ? "river" : "road";
    if (kind !== "safe" && prev === kind && prev2 === kind) kind = "safe";
    if (kind === "river" && prev === "river" && prev2 === "river") kind = "safe";
    if (kind === "safe") return { kind, dir: 1, speed: 0, things: [], width: 0, coin };

    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const ramp = Math.min(score, 40);
    if (kind === "river") {
      const width = rand(W * 0.3, W * 0.46);
      const speed = rand(W * 0.1, W * 0.2) + ramp * 1.2;
      const n = 2;
      const gap = (W + width) / n;
      const off = rand(0, gap);
      return {
        kind,
        dir,
        speed,
        width,
        coin,
        things: Array.from({ length: n }, (_, k) => off + k * gap),
      };
    }
    const width = rand(52, 92);
    const speed = rand(W * 0.24, W * 0.5) + ramp * 2.2;
    const n = 2 + Math.floor(Math.random() * 2);
    const gap = (W + width * 2) / n;
    const off = rand(0, gap);
    return {
      kind,
      dir,
      speed,
      width,
      coin,
      things: Array.from({ length: n }, (_, k) => off + k * gap),
    };
  };

  const grow = () => {
    while (lanes.length < row + 14) lanes.push(makeLane(lanes.length));
  };

  const reset = () => {
    lanes = [];
    row = 0;
    px = W / 2;
    cam = 0;
    score = 0;
    coins = 0;
    over = false;
    overAge = 0;
    drowned = false;
    combo.clear();
    fx.clear();
    grow();
    ctx.onScore(0);
  };

  const laneY = (i: number) => H * 0.72 - (i - cam) * rowH;

  const die = (why: "splat" | "drown") => {
    over = true;
    overAge = 0;
    drowned = why === "drown";
    deathX = px;
    deathY = laneY(row);
    best = Math.max(best, score);
    combo.break();
    ctx.haptic("fail");
    fx.shake(18);
    fx.flash(why === "drown" ? pal.glow : pal.foe, 0.36);
    fx.burst(deathX, deathY, {
      count: 26,
      colour: why === "drown" ? [pal.glow, "#ffffff"] : [pal.foe, pal.hero],
      speed: 300,
      life: 0.8,
      size: 4.5,
      gravity: why === "drown" ? -60 : 500,
    });
    ctx.onRunEnd(score);
  };

  const hop = () => {
    const th = ctx.getTheme();
    row += 1;
    hopT = 0.22;
    ctx.haptic("light");
    grow();
    if (row > score) {
      score = row;
      combo.hit();
      ctx.onScore(score);
    }
    const lane = lanes[row];
    // a coin sitting where you landed
    if (lane.coin >= 0 && Math.abs(lane.coin - px) < 30) {
      lane.coin = -1;
      coins += 1;
      const gained = 3 * combo.mult;
      score += gained;
      ctx.onScore(score);
      ctx.haptic("hit");
      fx.ring(px, laneY(row), pal.prize, 20, 4);
      fx.burst(px, laneY(row), {
        count: 14,
        colour: [pal.prize, "#ffffff"],
        speed: 200,
        life: 0.5,
        size: 3,
      });
      fx.pop(px, laneY(row) - 30, `+${gained}`, pal.prize, 20, th.fontDisplay);
    }
    fx.burst(px, laneY(row) + pR, {
      count: 5,
      colour: hexA("#ffffff", 0.6),
      speed: 80,
      life: 0.3,
      size: 3,
    });
  };

  const onDown = () => {
    if (over) {
      if (overAge > 0.3) reset();
      return;
    }
    hop();
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  reset();

  let auto = false;
  let autoCd = 0;

  const onLog = (lane: Lane): number | null => {
    for (const t of lane.things) {
      if (px > t - 6 && px < t + lane.width + 6) return t;
    }
    return null;
  };

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    clock += dt;
    fx.update(dt);
    combo.update(dt);
    hopT = Math.max(0, hopT - dt);

    if (over) {
      overAge += dt;
    } else {
      // attract mode: hop the moment the next lane offers a landing
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0) {
          const next = lanes[row + 1];
          let clear = !next || next.kind === "safe";
          if (next && next.kind === "road") {
            clear = next.things.every((cx) => {
              const ahead = next.dir === 1 ? px - (cx + next.width) : cx - px;
              return ahead > 70 || ahead < -next.width - 50;
            });
          } else if (next && next.kind === "river") {
            clear = next.things.some((t) => px > t + 10 && px < t + next.width - 10);
          }
          if (clear) {
            hop();
            autoCd = 0.3;
          }
        }
      }

      cam = approach(cam, row, 0.16, dt);

      for (const lane of lanes) {
        if (lane.kind === "safe") continue;
        const span = lane.width * 2;
        for (let i = 0; i < lane.things.length; i++) {
          lane.things[i] += lane.dir * lane.speed * dt;
          if (lane.dir === 1 && lane.things[i] > W + span) lane.things[i] = -span;
          if (lane.dir === -1 && lane.things[i] < -span) lane.things[i] = W + span;
        }
      }

      const cur = lanes[row];
      if (cur.kind === "road") {
        for (const cx of cur.things) {
          if (px + pR > cx && px - pR < cx + cur.width) {
            die("splat");
            break;
          }
        }
      } else if (cur.kind === "river") {
        const log = onLog(cur);
        if (log === null) die("drown");
        else {
          // riding: the current carries you, and the bank is a hard edge
          px += cur.dir * cur.speed * dt;
          if (px < -pR || px > W + pR) die("drown");
        }
      }
    }

    // ---- world ----
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix(pal.deep, pal.glow, 0.3));
    sky.addColorStop(1, mix(pal.deep, "#000000", 0.4));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    fx.begin(g);

    const lo = Math.max(0, Math.floor(cam) - 8);
    const hi = Math.min(lanes.length - 1, Math.floor(cam) + 12);
    for (let i = lo; i <= hi; i++) {
      const lane = lanes[i];
      const y = laneY(i);
      const top = y - rowH / 2;

      if (lane.kind === "road") {
        g.fillStyle = "#2b3038";
        g.fillRect(0, top, W, rowH);
        g.fillStyle = hexA("#ffffff", 0.06);
        g.fillRect(0, top, W, 3);
        g.fillStyle = "rgba(255,255,255,.45)";
        for (let x = 6; x < W; x += 34) g.fillRect(x, y - 1.5, 17, 3);
      } else if (lane.kind === "river") {
        const water = g.createLinearGradient(0, top, 0, top + rowH);
        water.addColorStop(0, mix(pal.glow, "#000000", 0.5));
        water.addColorStop(1, mix(pal.glow, "#000000", 0.25));
        g.fillStyle = water;
        g.fillRect(0, top, W, rowH);
        // ripples that drift with the current
        g.strokeStyle = hexA("#ffffff", 0.16);
        g.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) {
          const rx = ((clock * lane.speed * lane.dir * 0.35 + k * 90) % (W + 60)) - 30;
          g.beginPath();
          g.arc(rx, top + rowH * (0.3 + (k % 3) * 0.22), 9, 0.2, Math.PI - 0.2);
          g.stroke();
        }
      } else {
        const grass = g.createLinearGradient(0, top, 0, top + rowH);
        grass.addColorStop(0, "#488a3f");
        grass.addColorStop(1, "#356a2f");
        g.fillStyle = grass;
        g.fillRect(0, top, W, rowH);
        g.fillStyle = "rgba(255,255,255,.06)";
        g.fillRect(0, top, W, rowH * 0.45);
        // tufts, deterministic per lane so they never crawl
        g.fillStyle = "rgba(0,0,0,.14)";
        for (let k = 0; k < 5; k++) {
          const tx = ((i * 137 + k * 71) % 100) / 100 * W;
          g.fillRect(tx, y + 3, 7, 3);
        }
      }

      // cars / logs
      for (const t of lane.things) {
        if (lane.kind === "road") {
          const cw = lane.width;
          const ch = rowH * 0.58;
          const cy = y - ch / 2;
          g.fillStyle = "rgba(0,0,0,.3)";
          roundRect(g, t + 3, cy + 5, cw, ch, 7);
          g.fill();
          const body = g.createLinearGradient(0, cy, 0, cy + ch);
          body.addColorStop(0, mix(pal.foe, "#ffffff", 0.28));
          body.addColorStop(1, pal.foe);
          g.fillStyle = body;
          roundRect(g, t, cy, cw, ch, 7);
          g.fill();
          g.fillStyle = "rgba(255,255,255,.35)";
          roundRect(g, t + cw * 0.26, cy + ch * 0.16, cw * 0.44, ch * 0.42, 4);
          g.fill();
          // headlights, with a beam pointing where the car is going
          const lx = lane.dir === 1 ? t + cw - 6 : t + 2;
          g.fillStyle = "#fff6c9";
          g.fillRect(lx, cy + 3, 4, 5);
          g.fillRect(lx, cy + ch - 8, 4, 5);
          const beam = g.createLinearGradient(lx, 0, lx + lane.dir * 76, 0);
          beam.addColorStop(0, hexA("#fff6c9", 0.26));
          beam.addColorStop(1, hexA("#fff6c9", 0));
          g.fillStyle = beam;
          g.beginPath();
          g.moveTo(lx, cy + 3);
          g.lineTo(lx + lane.dir * 76, cy - 5);
          g.lineTo(lx + lane.dir * 76, cy + ch + 5);
          g.lineTo(lx, cy + ch - 3);
          g.closePath();
          g.fill();
        } else if (lane.kind === "river") {
          const lw = lane.width;
          const lh = rowH * 0.62;
          const ly = y - lh / 2;
          g.fillStyle = "rgba(0,0,0,.25)";
          roundRect(g, t + 2, ly + 4, lw, lh, 9);
          g.fill();
          const bark = g.createLinearGradient(0, ly, 0, ly + lh);
          bark.addColorStop(0, "#8a5a33");
          bark.addColorStop(1, "#5c3a1f");
          g.fillStyle = bark;
          roundRect(g, t, ly, lw, lh, 9);
          g.fill();
          g.strokeStyle = "rgba(0,0,0,.22)";
          g.lineWidth = 1.5;
          for (let k = 1; k < 4; k++) {
            g.beginPath();
            g.moveTo(t + (lw / 4) * k, ly + 3);
            g.lineTo(t + (lw / 4) * k, ly + lh - 3);
            g.stroke();
          }
        }
      }

      // the coin
      if (lane.coin >= 0) {
        const bob = Math.sin(clock * 3 + i) * 3;
        halo(g, lane.coin, y + bob, 22, pal.prize, 0.5);
        g.save();
        g.translate(lane.coin, y + bob);
        g.scale(Math.cos(clock * 3 + i) * 0.4 + 0.6, 1);
        g.fillStyle = pal.prize;
        g.beginPath();
        g.arc(0, 0, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = hexA("#000000", 0.2);
        g.beginPath();
        g.arc(0, 0, 5, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }

    fx.drawUnder(g);

    // ---- the player: a chick that squashes on landing
    const pyNow = laneY(row);
    const jump = hopT > 0 ? Math.sin((1 - hopT / 0.22) * Math.PI) : 0;
    const lift = jump * rowH * 0.55;
    if (!over || overAge < 0.2) {
      g.fillStyle = "rgba(0,0,0,.35)";
      g.beginPath();
      g.ellipse(px, pyNow + pR * 0.95, pR * (0.9 - jump * 0.3), pR * 0.35, 0, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(px, pyNow - lift);
      // stretch on the way up, squash on the landing beat
      g.scale(1 - jump * 0.12, 1 + jump * 0.18);
      drawNicHead(g, {
        x: 0,
        y: 0,
        r: pR,
        skin: over ? pal.foe : pal.hero,
        hair: shade(pal.deep, -0.4),
        eye: th.ink,
        pupil: shade(pal.deep, -0.6),
        dark: shade(pal.deep, -0.6),
        tooth: th.ink,
        // he looks where he is about to step, and winces once it goes wrong
        gaze: jump > 0.05 ? 0 : Math.sin(performance.now() / 700) * 0.6,
        scowl: over ? 1 : 0,
        gape: over ? 0.8 : 0,
      });
      g.restore();
    } else if (drowned) {
      // bubbles where the chick went under
      g.fillStyle = hexA("#ffffff", 0.4);
      for (let k = 0; k < 4; k++) {
        const t = (overAge * 40 + k * 18) % 60;
        g.beginPath();
        g.arc(deathX + Math.sin(k + overAge) * 6, deathY - t, 3 - k * 0.4, 0, Math.PI * 2);
        g.fill();
      }
    }

    // ---- HUD
    drawCombo(g, combo, W / 2, H * 0.12, pal.prize, th.fontDisplay, clock);
    g.textAlign = "center";
    if (score === 0 && !over) {
      g.fillStyle = hexA("#ffffff", 0.45 + pulse(clock, 1.5) * 0.4);
      g.font = `700 14px ${th.fontBody}`;
      g.fillText("tap to hop forward", W / 2, H * 0.9);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);
    vignette(g, W, H, 0.45);

    if (over) {
      resultCard(g, th, W, H, {
        title: drowned ? "swept away" : "splat",
        score,
        unit: meta.scoreUnit,
        best,
        sub: `${row} lanes crossed · ${coins} coins`,
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
