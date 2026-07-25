import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, pick, clamp, shade, roundRect } from "@/games/engine";

const meta = {
  slug: "ice-line",
  title: "Ice Line",
  rule: "Walk the ice. Tap when the rod tugs.",
  year: 2026,
  description: "Drill in, drop a line, and wait for the rod to twitch.",
  history:
    "Ice fishing is one of the oldest ways there is to catch a fish: cut a hole, drop a line, and out-wait whatever is down there. The whole sport is patience punctuated by one half-second of reaction — which is exactly the shape of a good tap game.",
  tags: ["calm", "precision", "reflex", "endurance"],
  palette: {
    hero: "#ff6b35",
    foe: "#e63946",
    prize: "#ffd166",
    deep: "#0b2545",
    glow: "#9fd8ef",
  },
  intensity: 0.35,
  speed: 0.3,
  difficulty: 0.45,
  luck: 0.35,
  nostalgia: 0.2,
  realism: 0.8,
  kidSafe: true,
  sessionLength: 0.7,
  scoreUnit: "pts",
  maxScorePerSecond: 30,
} satisfies GameModule["meta"];

type Mode = "walk" | "idle" | "fish" | "bite" | "fight" | "land";
type IdleAct = "look" | "warm" | "stomp" | "stretch" | "gaze";

interface Print {
  x: number;
  y: number;
  dir: number;
  age: number;
  deep: number;
}

interface Flake {
  x: number;
  y: number;
  z: number; // 0 far .. 1 near
  ph: number;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number; // 0..1
  dir: number;
  tail: number;
  interest: number; // 0..1, how badly it wants the lure
  state: "roam" | "approach" | "nibble" | "flee";
  patience: number;
}

interface Hole {
  x: number;
  r: number;
}

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  // ---- world layout ----------------------------------------------------
  const SKY_Y = H * 0.3; // horizon / treeline
  const ICE_Y = H * 0.52; // where the ice slab is cut away
  const SLAB = Math.max(14, H * 0.028); // thickness of the ice we see edge-on
  const WATER_Y = ICE_Y + SLAB;
  const GROUND = ICE_Y - 4; // the guy's boots rest here
  const LURE_REST = WATER_Y + (H - WATER_Y) * 0.55;
  const PRINT_LIFE = 26; // seconds before blown snow fills a boot print in

  const HOLES: Hole[] = [0.16, 0.38, 0.62, 0.85].map((f) => ({
    x: W * f,
    r: Math.max(13, W * 0.042),
  }));

  // ---- persistent scene state -----------------------------------------
  const flakes: Flake[] = Array.from({ length: 110 }, () => ({
    x: rand(0, W),
    y: rand(0, H),
    z: rand(0.15, 1),
    ph: rand(0, Math.PI * 2),
  }));
  let prints: Print[] = [];
  let puffs: Puff[] = [];
  let bits: Bit[] = [];
  let fish: Fish[] = [];

  // ---- the guy ---------------------------------------------------------
  let guyX = W * 0.38;
  let targetX = guyX;
  let face = 1; // -1 left, 1 right
  let turn = 1; // eased toward `face` — this is what actually draws
  let step = 0; // walk cycle phase
  let lastStep = 0; // for stamping prints on the down-beat
  let bob = 0;
  let headTilt = 0;
  let headTarget = 0;
  let armRaise = 0; // 0 rod down .. 1 fish held overhead
  let breathT = 1.4;

  let mode: Mode = "idle";
  let idleAct: IdleAct = "look";
  let idleT = 0;
  let actT = 0;
  let wanderT = rand(5, 9); // left alone, he goes for a stroll
  let wandering = false;

  // ---- rod + line ------------------------------------------------------
  let hole: Hole = HOLES[1];
  let rodBend = 0; // signed curvature
  let rodVel = 0;
  let lureY = WATER_Y;
  let lureSwing = 0;
  let jigCd = 0;
  let lineTaut = 0; // 0 slack .. 1 singing

  // ---- the fight -------------------------------------------------------
  let hooked: Fish | null = null;
  let tension = 0;
  let reeling = false;
  let surgeCd = 0;
  let slackT = 0;
  let biteT = 0; // countdown of the strike window
  let biteWin = 0.9;

  // ---- run state -------------------------------------------------------
  let score = 0;
  let lines = 3; // spare leaders — snap or lose a fish and one goes
  let caught = 0;
  let over = false;
  let auto = false;

  // ---- presentation ----------------------------------------------------
  let shake = 0;
  let vign = 0; // red-ish pulse on a bite
  let banner = ""; // sliding status card
  let bannerT = 0;
  let landT = 0; // catch celebration timer
  let landPts = 0;
  let landSize = 0;
  let dusk = 0; // sky slowly deepens across a run
  let clock = 0;

  // Sheet-style ease, same curve the app's transitions use.
  const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
  const wind = () => Math.sin(clock * 0.31) * 0.7 + Math.sin(clock * 0.13) * 0.35;

  const say = (msg: string) => {
    banner = msg;
    bannerT = 1.5;
  };

  const emitPuff = (x: number, y: number, r: number, n = 1, up = -14) => {
    for (let i = 0; i < n; i++)
      puffs.push({
        x: x + rand(-3, 3),
        y: y + rand(-3, 3),
        r,
        vx: rand(-6, 6) + wind() * 9,
        vy: rand(up - 6, up + 6),
        life: 1,
        max: rand(0.9, 1.5),
      });
  };

  const emitBits = (x: number, y: number, n: number, spread: number) => {
    for (let i = 0; i < n; i++)
      bits.push({
        x,
        y,
        vx: rand(-spread, spread),
        vy: rand(-spread * 1.4, -spread * 0.2),
        life: rand(0.4, 0.9),
        size: rand(1.5, 3.4),
      });
  };

  const makeFish = (): Fish => {
    const dir = Math.random() < 0.5 ? -1 : 1;
    return {
      x: dir > 0 ? -30 : W + 30,
      y: rand(WATER_Y + 34, H - 30),
      vx: dir * rand(16, 34),
      vy: 0,
      size: Math.random() < 0.16 ? rand(0.75, 1) : rand(0.22, 0.7),
      dir,
      tail: rand(0, Math.PI * 2),
      interest: 0,
      state: "roam",
      patience: rand(2.5, 6),
    };
  };

  const nearestHole = (x: number) =>
    HOLES.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));

  const dropLine = () => {
    mode = "fish";
    lureY = WATER_Y + 6;
    lineTaut = 0;
    rodVel = -6;
    emitBits(hole.x, ICE_Y - 2, 8, 40);
  };

  const spookAll = (radius: number) => {
    for (const f of fish) {
      if (Math.abs(f.x - hole.x) < radius) {
        f.state = "flee";
        f.interest = 0;
        f.patience = rand(2, 4);
        f.dir = f.x < hole.x ? -1 : 1;
      }
    }
  };

  const loseFish = (why: string) => {
    if (hooked) {
      hooked.state = "flee";
      hooked.interest = 0;
      hooked.patience = 3;
      hooked = null;
    }
    lines -= 1;
    tension = 0;
    reeling = false;
    ctx.haptic("fail");
    shake = Math.max(shake, 7);
    say(why);
    if (lines <= 0) {
      over = true;
      ctx.onRunEnd(score);
    } else {
      mode = "fish";
      lureY = WATER_Y + 8;
    }
  };

  const land = (f: Fish) => {
    hooked = null;
    mode = "land";
    landT = 1.9;
    landSize = f.size;
    landPts = Math.round(20 + f.size * 130);
    score += landPts;
    caught += 1;
    ctx.onScore(score);
    ctx.haptic("hit");
    shake = Math.max(shake, 4);
    fish = fish.filter((x) => x !== f);
    emitBits(hole.x, ICE_Y, 16, 90);
    emitPuff(hole.x, ICE_Y - 10, 8, 4, -26);
    biteWin = Math.max(0.32, biteWin - 0.035); // the fish get warier
  };

  const reset = () => {
    guyX = targetX = W * 0.38;
    face = turn = 1;
    step = lastStep = 0;
    mode = "idle";
    idleT = 0;
    actT = 0;
    wanderT = rand(5, 9);
    wandering = false;
    hole = HOLES[1];
    rodBend = rodVel = 0;
    lureY = WATER_Y;
    hooked = null;
    tension = 0;
    reeling = false;
    biteT = 0;
    biteWin = 0.9;
    score = 0;
    lines = 3;
    caught = 0;
    over = false;
    landT = 0;
    dusk = 0;
    prints = [];
    puffs = [];
    bits = [];
    fish = Array.from({ length: 5 }, () => {
      const f = makeFish();
      f.x = rand(0, W);
      return f;
    });
    ctx.onScore(0);
    say("find a hole");
  };

  // ---- input -----------------------------------------------------------
  const local = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      reset();
      return;
    }
    if (auto) return;
    ctx.canvas.setPointerCapture(e.pointerId);
    const p = local(e);

    if (mode === "fight") {
      reeling = true;
      return;
    }
    if (mode === "bite") {
      // the hookset
      const f = hooked;
      if (f) {
        f.state = "nibble";
        mode = "fight";
        tension = 0.22;
        rodVel = -46;
        surgeCd = rand(0.7, 1.4);
        slackT = 0;
        reeling = true;
        ctx.haptic("hit");
        shake = Math.max(shake, 5);
        say("fish on!");
      }
      return;
    }
    if (mode === "land") return;

    if (p.y < ICE_Y + SLAB) {
      // walk: snap to whichever hole the tap is closest to
      const h = nearestHole(p.x);
      const snap = Math.abs(p.x - h.x) < h.r * 1.8;
      // stand beside the hole, on the side he is already coming from
      const side = Math.sign(guyX - h.x) || 1;
      targetX = clamp(snap ? h.x + side * (h.r + 11) : p.x, 16, W - 16);
      if (mode === "fish") lineTaut = 0;
      wandering = false;
      mode = "walk";
    } else if (mode === "fish") {
      // jig: hop the lure, wake the neighbours up
      if (jigCd <= 0) {
        jigCd = 0.28;
        lureY -= 16;
        lureSwing = 2.6;
        rodVel = -26;
        ctx.haptic("light");
        for (const f of fish) {
          const d = Math.hypot(f.x - hole.x, f.y - lureY);
          if (d < W * 0.5 && f.state !== "flee")
            f.interest = clamp(f.interest + 0.34 * (1 - d / (W * 0.5)), 0, 1);
        }
      }
    }
  };

  const onUp = () => {
    reeling = false;
  };

  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  // ---- drawing ---------------------------------------------------------
  const snowWhite = shade(pal.glow, 0.86);
  const snowShade = shade(pal.glow, -0.32); // the blue a hollow in snow goes

  function drawSky(t: ReturnType<GameContext["getTheme"]>) {
    const sky = g.createLinearGradient(0, 0, 0, ICE_Y);
    sky.addColorStop(0, shade(pal.deep, -0.42 + dusk * -0.2));
    sky.addColorStop(0.62, shade(pal.deep, 0.1 - dusk * 0.24));
    sky.addColorStop(1, shade(pal.glow, 0.45 - dusk * 0.3));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, ICE_Y);

    // stars — deterministic so they never shimmer
    g.fillStyle = t.ink;
    for (let i = 0; i < 46; i++) {
      const sx = (((i * 733) % 997) / 997) * W;
      const sy = (((i * 419) % 599) / 599) * SKY_Y * 0.92;
      g.globalAlpha = (0.12 + dusk * 0.4) * (0.4 + 0.6 * Math.sin(clock * 1.6 + i));
      g.fillRect(sx, sy, 1.6, 1.6);
    }
    g.globalAlpha = 1;

    // aurora: three ribbons, each a soft vertical gradient along a sine
    for (let r = 0; r < 3; r++) {
      const amp = 12 + r * 7;
      const base = SKY_Y * (0.26 + r * 0.16);
      const hgt = 46 + r * 16;
      const grad = g.createLinearGradient(0, base - hgt, 0, base + hgt);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, r === 1 ? pal.glow : shade(pal.glow, -0.2));
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = (0.1 + dusk * 0.16) * (0.7 + 0.3 * Math.sin(clock * 0.6 + r));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, base);
      for (let x = 0; x <= W; x += 14)
        g.lineTo(x, base + Math.sin(x * 0.011 + clock * 0.35 + r * 1.7) * amp);
      g.lineTo(W, base + hgt);
      for (let x = W; x >= 0; x -= 14)
        g.lineTo(x, base + hgt + Math.sin(x * 0.011 + clock * 0.35 + r * 1.7) * amp);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function drawTreeline() {
    // two parallax bands of firs, drifting a touch with the guy
    for (let band = 0; band < 2; band++) {
      const off = (guyX - W / 2) * (band === 0 ? 0.02 : 0.05);
      const yBase = SKY_Y + band * 12;
      const scale = band === 0 ? 0.7 : 1;
      g.fillStyle = band === 0 ? shade(pal.deep, 0.28) : shade(pal.deep, 0.04);
      g.beginPath();
      g.moveTo(-40, yBase + 40);
      for (let i = -1; i < 26; i++) {
        const tx = i * (W / 22) - off + (band === 0 ? 9 : 0);
        const th = (18 + ((i * 37) % 17)) * scale;
        g.lineTo(tx - 8 * scale, yBase);
        g.lineTo(tx, yBase - th);
        g.lineTo(tx + 8 * scale, yBase);
      }
      g.lineTo(W + 40, yBase + 40);
      g.closePath();
      g.fill();
    }

    // a lone hut on the far bank, because someone else is out here too
    const hx = W * 0.78 - (guyX - W / 2) * 0.05;
    const hy = SKY_Y + 12;
    g.fillStyle = shade(pal.deep, -0.1);
    g.fillRect(hx - 13, hy - 15, 26, 15);
    g.beginPath();
    g.moveTo(hx - 17, hy - 15);
    g.lineTo(hx, hy - 25);
    g.lineTo(hx + 17, hy - 15);
    g.closePath();
    g.fill();
    g.fillStyle = pal.prize;
    g.globalAlpha = 0.55 + 0.2 * Math.sin(clock * 3);
    g.fillRect(hx - 4, hy - 10, 7, 6);
    g.globalAlpha = 1;
    // chimney smoke
    for (let i = 0; i < 4; i++) {
      const p = ((clock * 0.4 + i * 0.25) % 1);
      g.globalAlpha = (1 - p) * 0.2;
      g.fillStyle = snowWhite;
      g.beginPath();
      g.arc(hx + 9 + p * wind() * 14, hy - 26 - p * 26, 2 + p * 6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function drawSnowfield() {
    const snow = g.createLinearGradient(0, SKY_Y, 0, ICE_Y);
    snow.addColorStop(0, shade(pal.glow, 0.55 - dusk * 0.25));
    snow.addColorStop(1, snowWhite);
    g.fillStyle = snow;
    g.fillRect(0, SKY_Y, W, ICE_Y - SKY_Y);

    // wind-carved drifts
    g.strokeStyle = snowShade;
    g.globalAlpha = 0.16;
    g.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) {
      const y = SKY_Y + 14 + i * ((ICE_Y - SKY_Y - 14) / 5);
      g.beginPath();
      for (let x = 0; x <= W; x += 12)
        g.lineTo(x, y + Math.sin(x * 0.02 + i * 2.1) * (2 + i));
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawPrints() {
    for (const p of prints) {
      // prints fill back in with blown snow rather than simply fading out
      const a = clamp(1 - p.age / PRINT_LIFE, 0, 1) * p.deep;
      if (a <= 0.03) continue;
      // the lip of snow kicked up ahead of the boot
      g.globalAlpha = a * 0.55;
      g.fillStyle = shade(pal.glow, 0.99);
      g.beginPath();
      g.ellipse(p.x + p.dir * 4, p.y - 1.7, 4, 1.8, 0, 0, Math.PI * 2);
      g.fill();
      // the hollow itself
      g.globalAlpha = a * 0.42;
      g.fillStyle = snowShade;
      g.beginPath();
      g.ellipse(p.x, p.y, 6, 3.1, 0, 0, Math.PI * 2);
      g.fill();
      // heel bites deepest
      g.globalAlpha = a * 0.5;
      g.fillStyle = shade(pal.glow, -0.5);
      g.beginPath();
      g.ellipse(p.x - p.dir * 1.6, p.y + 0.5, 3.4, 1.9, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  /** His kit, left where he dropped it. Fills the ice and sells the scene. */
  function drawGear() {
    const sledX = W * 0.5;
    // sled: a shallow tub with a turned-up nose and a tow rope
    g.fillStyle = shade(pal.foe, -0.12);
    g.beginPath();
    g.moveTo(sledX - 24, GROUND - 4);
    g.quadraticCurveTo(sledX - 27, GROUND - 13, sledX - 18, GROUND - 12);
    g.lineTo(sledX + 20, GROUND - 12);
    g.quadraticCurveTo(sledX + 25, GROUND - 12, sledX + 23, GROUND - 3);
    g.quadraticCurveTo(sledX, GROUND + 1, sledX - 24, GROUND - 4);
    g.closePath();
    g.fill();
    g.fillStyle = shade(pal.foe, -0.42);
    roundRect(g, sledX - 20, GROUND - 12, 40, 3, 1.5);
    g.fill();
    g.strokeStyle = shade(pal.glow, 0.3);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(sledX - 26, GROUND - 12);
    g.quadraticCurveTo(sledX - 34, GROUND - 4, sledX - 42, GROUND - 1);
    g.stroke();
    g.globalAlpha = 0.26;
    g.fillStyle = snowShade;
    g.beginPath();
    g.ellipse(sledX, GROUND + 2, 24, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;

    // the auger, stuck upright in the ice next to the first hole
    const ax = HOLES[0].x - HOLES[0].r - 16;
    g.strokeStyle = shade(pal.deep, 0.5);
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(ax, GROUND + 1);
    g.lineTo(ax + 2, GROUND - 34);
    g.lineTo(ax + 11, GROUND - 38);
    g.stroke();
    g.strokeStyle = pal.prize;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      g.moveTo(ax - 3, GROUND - 3 - i * 5);
      g.lineTo(ax + 4, GROUND - 6 - i * 5);
    }
    g.stroke();

    // bucket by the last hole
    const bx = HOLES[3].x + HOLES[3].r + 14;
    g.fillStyle = shade(pal.glow, -0.25);
    g.beginPath();
    g.moveTo(bx - 8, GROUND - 14);
    g.lineTo(bx + 8, GROUND - 14);
    g.lineTo(bx + 6, GROUND);
    g.lineTo(bx - 6, GROUND);
    g.closePath();
    g.fill();
    g.strokeStyle = shade(pal.deep, 0.4);
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(bx, GROUND - 14, 8, Math.PI, 0);
    g.stroke();
    // one fish per catch, stacked in the bucket
    for (let i = 0; i < Math.min(caught, 4); i++) {
      g.fillStyle = shade(pal.deep, 0.55 + i * 0.05);
      g.beginPath();
      g.ellipse(bx - 2 + i * 1.4, GROUND - 12 - i * 2.6, 6, 2, -0.16 + i * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawHoles() {
    for (const h of HOLES) {
      const live = h === hole && mode !== "walk" && mode !== "idle";
      // shovelled snow ring — soft, not a painted line
      g.globalAlpha = 0.7;
      g.fillStyle = shade(pal.glow, 0.99);
      g.beginPath();
      g.ellipse(h.x, GROUND + 3.5, h.r + 5, h.r * 0.42 + 3.5, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.28;
      g.fillStyle = snowShade;
      g.beginPath();
      g.ellipse(h.x, GROUND + 4, h.r + 2, h.r * 0.42 + 1.6, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      // the water in the hole
      const wg = g.createLinearGradient(0, GROUND - h.r * 0.4, 0, GROUND + h.r * 0.4);
      wg.addColorStop(0, shade(pal.deep, -0.2));
      wg.addColorStop(1, shade(pal.deep, 0.25));
      g.fillStyle = wg;
      g.beginPath();
      g.ellipse(h.x, GROUND + 3, h.r, h.r * 0.4, 0, 0, Math.PI * 2);
      g.fill();
      // ripple rings when something is happening down there
      if (live) {
        const rip = (clock * 0.9) % 1;
        g.strokeStyle = pal.glow;
        g.globalAlpha = (1 - rip) * (0.25 + lineTaut * 0.5);
        g.lineWidth = 1.4;
        g.beginPath();
        g.ellipse(h.x, GROUND + 3, h.r * rip, h.r * 0.4 * rip, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }

  function drawIceAndWater() {
    // the cut edge of the slab
    const ice = g.createLinearGradient(0, ICE_Y, 0, WATER_Y);
    ice.addColorStop(0, shade(pal.glow, 0.7));
    ice.addColorStop(1, shade(pal.glow, -0.15));
    g.fillStyle = ice;
    g.fillRect(0, ICE_Y, W, SLAB);

    const water = g.createLinearGradient(0, WATER_Y, 0, H);
    water.addColorStop(0, shade(pal.deep, 0.42));
    water.addColorStop(0.55, shade(pal.deep, -0.05));
    water.addColorStop(1, shade(pal.deep, -0.6));
    g.fillStyle = water;
    g.fillRect(0, WATER_Y, W, H - WATER_Y);

    // shafts of daylight falling through each hole
    for (const h of HOLES) {
      const shaft = g.createLinearGradient(0, WATER_Y, 0, H * 0.95);
      shaft.addColorStop(0, pal.glow);
      shaft.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.14;
      g.fillStyle = shaft;
      g.beginPath();
      g.moveTo(h.x - h.r * 0.7, WATER_Y);
      g.lineTo(h.x + h.r * 0.7, WATER_Y);
      g.lineTo(h.x + h.r * 2.6, H);
      g.lineTo(h.x - h.r * 2.6, H);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;

    // underside of the ice: bubbles trapped against the ceiling
    g.fillStyle = pal.glow;
    for (let i = 0; i < 22; i++) {
      const bx = (((i * 617) % 991) / 991) * W;
      g.globalAlpha = 0.16;
      g.beginPath();
      g.arc(bx, WATER_Y + 3 + ((i * 13) % 5), 1.4 + ((i * 7) % 3), 0, Math.PI * 2);
      g.fill();
    }
    // weed on the bottom, swaying
    g.globalAlpha = 0.3;
    g.strokeStyle = shade(pal.deep, 0.5);
    g.lineWidth = 2.4;
    for (let i = 0; i < 14; i++) {
      const wx = (((i * 383) % 977) / 977) * W;
      const hgt = 16 + ((i * 29) % 22);
      g.beginPath();
      g.moveTo(wx, H);
      g.quadraticCurveTo(
        wx + Math.sin(clock * 0.8 + i) * 6,
        H - hgt * 0.6,
        wx + Math.sin(clock * 0.8 + i) * 11,
        H - hgt
      );
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawFish(f: Fish) {
    const s = 9 + f.size * 22;
    const fighting = f === hooked;
    const depthFade = fighting
      ? 1
      : clamp(1 - ((f.y - WATER_Y) / (H - WATER_Y)) * 0.45, 0.5, 1);
    g.save();
    g.translate(f.x, f.y);
    // a hooked fish rolls and thrashes against the line instead of swimming
    if (fighting) g.rotate(Math.sin(clock * 11) * 0.55 - 0.3);
    g.scale(f.dir, 1);
    const wag = fighting
      ? Math.sin(f.tail * 2.6) * 1.1
      : Math.sin(f.tail) * (0.3 + Math.abs(f.vx) / 90);

    g.globalAlpha = depthFade;
    // tail
    g.fillStyle = shade(pal.deep, 0.55);
    g.beginPath();
    g.moveTo(-s * 0.75, 0);
    g.lineTo(-s * 1.25, -s * 0.4 + wag * s * 0.35);
    g.lineTo(-s * 1.1, 0);
    g.lineTo(-s * 1.25, s * 0.4 + wag * s * 0.35);
    g.closePath();
    g.fill();
    // body
    const bg = g.createLinearGradient(0, -s * 0.4, 0, s * 0.4);
    bg.addColorStop(0, shade(pal.glow, 0.1));
    bg.addColorStop(0.55, shade(pal.deep, 0.6));
    bg.addColorStop(1, shade(pal.deep, 0.2));
    g.fillStyle = bg;
    g.beginPath();
    g.ellipse(0, 0, s * 0.8, s * 0.36, wag * 0.16, 0, Math.PI * 2);
    g.fill();
    // dorsal + pectoral
    g.fillStyle = shade(pal.deep, 0.42);
    g.beginPath();
    g.moveTo(-s * 0.1, -s * 0.3);
    g.lineTo(s * 0.16, -s * 0.62);
    g.lineTo(s * 0.32, -s * 0.26);
    g.closePath();
    g.fill();
    g.beginPath();
    g.ellipse(s * 0.1, s * 0.2, s * 0.2, s * 0.1, -0.4 + wag * 0.4, 0, Math.PI * 2);
    g.fill();
    // eye
    g.fillStyle = pal.prize;
    g.beginPath();
    g.arc(s * 0.5, -s * 0.08, s * 0.08, 0, Math.PI * 2);
    g.fill();
    // hungry fish glint
    if (f.interest > 0.5 && f.state !== "flee" && !fighting) {
      g.globalAlpha = (f.interest - 0.5) * 1.4 * depthFade;
      g.strokeStyle = pal.prize;
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(0, 0, s * 0.95, s * 0.5, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  /** Rod tip in world space, given the hand position. Bend is the whole point. */
  function rodTip(hx: number, hy: number) {
    const len = 46;
    const ang = -0.55 * turn + rodBend * 0.05 * turn;
    return {
      x: hx + Math.cos(ang) * len * turn,
      y: hy + Math.sin(ang) * len + rodBend * 0.42,
      cx: hx + Math.cos(ang * 0.4) * len * 0.55 * turn,
      cy: hy + Math.sin(ang * 0.4) * len * 0.55 + rodBend * 0.12,
    };
  }

  function drawGuy(t: ReturnType<GameContext["getTheme"]>) {
    const walking = mode === "walk";
    const swing = walking ? Math.sin(step) : 0;
    const lift = walking ? Math.abs(Math.cos(step)) : 0;
    const y = GROUND - bob;
    const s = 1; // one scale knob if the layout ever changes

    g.save();
    g.translate(guyX, y);
    g.scale(turn, 1);

    // shadow on the snow
    g.globalAlpha = 0.3;
    g.fillStyle = snowShade;
    g.beginPath();
    g.ellipse(0, 2, 13, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;

    const stomping = mode === "idle" && idleAct === "stomp";
    const stompLift = stomping ? Math.max(0, Math.sin(actT * 9)) * 6 : 0;

    // ---- legs ----
    const stance = walking ? 0 : 3.2;
    const drawLeg = (ph: number, shade1: string, tuck: number) => {
      const kx = swing * 6 * ph + stance * ph;
      const ky = -Math.max(0, swing * ph) * 4 - tuck;
      g.strokeStyle = shade1;
      g.lineWidth = 6 * s;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(0, -22);
      g.quadraticCurveTo(kx * 0.6, -12 + ky * 0.4, kx, -2 + ky);
      g.stroke();
      // boot
      g.fillStyle = shade(pal.deep, 0.1);
      roundRect(g, kx - 4, -4 + ky, 11, 5, 2);
      g.fill();
    };
    drawLeg(-1, shade(pal.deep, 0.34), 0);
    drawLeg(1, shade(pal.deep, 0.22), stompLift);

    // ---- parka ----
    const bodyLean = walking ? 1.2 : mode === "fight" ? 3.5 * (1 - tension) - 2 : 0;
    g.save();
    g.rotate(bodyLean * 0.02);
    const coat = g.createLinearGradient(-10, -46, 10, -22);
    coat.addColorStop(0, shade(pal.hero, 0.22));
    coat.addColorStop(1, shade(pal.hero, -0.22));
    g.fillStyle = coat;
    roundRect(g, -10, -46, 20, 26, 8);
    g.fill();
    // hem trim
    g.fillStyle = shade(pal.hero, -0.42);
    roundRect(g, -10, -25, 20, 5, 3);
    g.fill();

    // ---- arms ----
    const warming = mode === "idle" && idleAct === "warm";
    const stretching = mode === "idle" && idleAct === "stretch";
    const holdY = -38 - armRaise * 16 + (warming ? -4 : 0);
    const handX = warming ? 5 : stretching ? 4 : 9 + armRaise * 2;
    const backArm = -swing * 5;
    g.strokeStyle = shade(pal.hero, -0.3);
    g.lineWidth = 5.4 * s;
    g.beginPath();
    g.moveTo(-2, -42);
    g.quadraticCurveTo(-8 + backArm, -34, -7 + backArm * 1.6, -26 - (stretching ? 16 : 0));
    g.stroke();
    g.strokeStyle = shade(pal.hero, 0.05);
    g.beginPath();
    g.moveTo(2, -42);
    g.quadraticCurveTo(handX * 0.7, -40, handX, holdY);
    g.stroke();
    // mitten
    g.fillStyle = shade(pal.deep, 0.3);
    g.beginPath();
    g.arc(handX, holdY, 3.6, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // ---- head ----
    g.save();
    g.translate(0, -52 - armRaise * 2);
    g.rotate(headTilt * 0.5);
    // scarf, trailing downwind
    g.fillStyle = pal.foe;
    roundRect(g, -7, -1, 14, 6, 3);
    g.fill();
    const sw = wind() * 10 + swing * 4;
    g.beginPath();
    g.moveTo(-4, 1);
    g.quadraticCurveTo(-9 - sw * 0.4, 5 + Math.sin(clock * 4) * 2, -12 - sw, 3 + Math.sin(clock * 4 + 1) * 3);
    g.lineTo(-11 - sw, 7 + Math.sin(clock * 4 + 1) * 3);
    g.quadraticCurveTo(-8 - sw * 0.4, 8, -4, 5);
    g.closePath();
    g.fill();
    // face
    g.fillStyle = shade(pal.prize, 0.28);
    g.beginPath();
    g.arc(0, -6, 7.4, 0, Math.PI * 2);
    g.fill();
    // eye + a puff of beard
    g.fillStyle = t.ink;
    g.beginPath();
    g.arc(3.6, -7, 1.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(pal.glow, 0.7);
    g.beginPath();
    g.arc(1.5, -1.5, 4.6, 0, Math.PI);
    g.fill();
    // beanie + pom, pom bounces on the walk
    g.fillStyle = shade(pal.foe, -0.2);
    g.beginPath();
    g.arc(0, -8, 7.8, Math.PI, 0);
    g.fill();
    roundRect(g, -8, -9, 16, 3.4, 1.6);
    g.fill();
    g.fillStyle = shade(pal.glow, 0.8);
    g.beginPath();
    g.arc(-1 + sw * 0.12, -17 - lift * 1.4, 3.2, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.restore();

    // ---- rod + line, drawn in world space so the line can reach the hole ----
    const handWX = guyX + turn * (9 + armRaise * 2);
    const handWY = y - 38 - armRaise * 16;
    if (mode !== "land") drawRod(handWX, handWY, t);
    else drawTrophy(guyX, y - 74);
  }

  function drawRod(hx: number, hy: number, t: ReturnType<GameContext["getTheme"]>) {
    const tip = rodTip(hx, hy);
    g.strokeStyle = shade(pal.deep, 0.55);
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(hx - turn * 8, hy + 4);
    g.quadraticCurveTo(tip.cx, tip.cy, tip.x, tip.y);
    g.stroke();
    // tip is thinner and lighter, so the bend reads
    g.strokeStyle = shade(pal.glow, 0.2);
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(tip.cx, tip.cy);
    g.quadraticCurveTo((tip.cx + tip.x) / 2, (tip.cy + tip.y) / 2 + rodBend * 0.2, tip.x, tip.y);
    g.stroke();

    if (mode === "walk" || mode === "idle") return;

    // line: rod tip -> hole -> lure. Slack line sags, taut line is a wire.
    const sag = (1 - lineTaut) * 16;
    g.strokeStyle = t.ink;
    g.globalAlpha = 0.55 + lineTaut * 0.4;
    g.lineWidth = 1 + lineTaut * 0.6;
    g.beginPath();
    g.moveTo(tip.x, tip.y);
    g.quadraticCurveTo((tip.x + hole.x) / 2, Math.max(tip.y, GROUND) + sag, hole.x, GROUND + 2);
    const lx = hole.x + Math.sin(lureSwing) * 6 * (1 - lineTaut);
    g.moveTo(hole.x, GROUND + 2);
    g.quadraticCurveTo(hole.x + Math.sin(lureSwing) * 4, (GROUND + lureY) / 2, lx, lureY);
    g.stroke();
    g.globalAlpha = 1;

    // the lure itself
    g.fillStyle = pal.prize;
    g.beginPath();
    g.ellipse(lx, lureY, 2.6, 4.2, Math.sin(lureSwing) * 0.4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = shade(pal.prize, -0.4);
    g.lineWidth = 1;
    g.beginPath();
    g.arc(lx, lureY + 5, 2.4, 0, Math.PI);
    g.stroke();
  }

  function drawTrophy(x: number, y: number) {
    // the held-up fish, swinging as he shows it off
    const p = 1 - landT / 1.9;
    const rise = easeOut(p * 3);
    const s = 9 + landSize * 22;
    g.save();
    g.translate(x + turn * 15, y + (1 - rise) * 34);
    g.rotate(Math.sin(clock * 6) * 0.12 * (1 - p));
    g.scale(turn, 1);
    g.fillStyle = shade(pal.deep, 0.62);
    g.beginPath();
    g.ellipse(0, 0, s * 0.8, s * 0.36, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(pal.deep, 0.45);
    g.beginPath();
    g.moveTo(-s * 0.75, 0);
    g.lineTo(-s * 1.25, -s * 0.4);
    g.lineTo(-s * 1.1, 0);
    g.lineTo(-s * 1.25, s * 0.4);
    g.closePath();
    g.fill();
    g.fillStyle = pal.prize;
    g.beginPath();
    g.arc(s * 0.5, -s * 0.08, s * 0.08, 0, Math.PI * 2);
    g.fill();
    // droplets
    g.globalAlpha = 0.6 * (1 - p);
    g.fillStyle = pal.glow;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(-s * 0.4 + i * s * 0.3, s * 0.4 + ((clock * 60 + i * 12) % 14), 1.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  function drawTension(t: ReturnType<GameContext["getTheme"]>) {
    if (mode !== "fight") return;
    const bw = 8;
    const bh = H * 0.26;
    const bx = W - 30;
    const by = H * 0.3;
    g.fillStyle = t.surface;
    g.globalAlpha = 0.7;
    roundRect(g, bx, by, bw, bh, 4);
    g.fill();
    g.globalAlpha = 1;
    // danger band at the top
    g.fillStyle = pal.foe;
    g.globalAlpha = 0.25;
    roundRect(g, bx, by, bw, bh * 0.22, 4);
    g.fill();
    g.globalAlpha = 1;
    const fillH = bh * clamp(tension, 0, 1);
    g.fillStyle = tension > 0.78 ? pal.foe : tension > 0.5 ? pal.prize : t.success;
    roundRect(g, bx, by + bh - fillH, bw, fillH, 4);
    g.fill();
    g.fillStyle = t.inkDim;
    g.font = `700 9px ${t.fontBody}`;
    g.textAlign = "center";
    g.fillText("LINE", bx + bw / 2, by - 6);
    g.textAlign = "left";
  }

  function drawHud(t: ReturnType<GameContext["getTheme"]>) {
    // spare leaders, as little hooks
    for (let i = 0; i < lines; i++) {
      const x = 18 + i * 15;
      const y = H * 0.07;
      g.strokeStyle = t.ink;
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x, y + 2);
      g.arc(x - 3, y + 2, 3, 0, Math.PI);
      g.stroke();
    }
    if (caught > 0) {
      g.fillStyle = t.inkDim;
      g.font = `700 12px ${t.fontBody}`;
      g.fillText(`${caught} on the ice`, 16, H * 0.07 + 22);
    }

    // sliding banner — same easing language as the app's sheets
    if (bannerT > 0 && !over) {
      const p = bannerT > 1.2 ? (1.5 - bannerT) / 0.3 : Math.min(1, bannerT / 0.35);
      const slide = (1 - easeOut(p)) * 26;
      g.globalAlpha = clamp(p, 0, 1);
      g.textAlign = "center";
      const bw = Math.min(W * 0.6, 230);
      g.fillStyle = t.surface;
      roundRect(g, W / 2 - bw / 2, H * 0.15 - slide, bw, 34, 17);
      g.fill();
      g.fillStyle = mode === "bite" || mode === "fight" ? pal.foe : t.ink;
      g.font = `800 15px ${t.fontDisplay}`;
      g.fillText(banner.toUpperCase(), W / 2, H * 0.15 + 22 - slide);
      g.textAlign = "left";
      g.globalAlpha = 1;
    }

    // catch card, scaling in over the ice
    if (landT > 0) {
      const p = clamp((1.9 - landT) / 0.3, 0, 1);
      g.save();
      g.translate(guyX, GROUND - 92);
      g.scale(0.6 + easeOut(p) * 0.4, 0.6 + easeOut(p) * 0.4);
      g.globalAlpha = clamp(landT / 0.4, 0, 1);
      g.textAlign = "center";
      g.fillStyle = t.surface;
      roundRect(g, -46, -20, 92, 34, 12);
      g.fill();
      g.fillStyle = t.success;
      g.font = `800 18px ${t.fontDisplay}`;
      g.fillText(`+${landPts}`, 0, 4);
      g.restore();
      g.globalAlpha = 1;
      g.textAlign = "left";
    }

    g.textAlign = "center";
    g.fillStyle = t.inkDim;
    g.font = `500 12px ${t.fontBody}`;
    if (!over) {
      const hint =
        mode === "fight"
          ? "hold to reel · let go to give line"
          : mode === "bite"
            ? "TAP!"
            : mode === "fish"
              ? "tap the water to jig · tap the snow to move"
              : mode === "land"
                ? "in the bucket"
                : mode === "walk"
                  ? "…"
                  : "tap the snow to walk to a hole";
      g.fillText(hint, W / 2, H * 0.955);
    }
    g.textAlign = "left";
  }

  // ---- the loop --------------------------------------------------------
  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    clock += dt;
    if (!over) dusk = Math.min(1, dusk + dt * 0.012);
    shake *= Math.pow(0.02, dt);
    vign *= Math.pow(0.06, dt);
    bannerT = Math.max(0, bannerT - dt);
    jigCd = Math.max(0, jigCd - dt);
    lureSwing += dt * 6;

    // ---------------- autoplay: he fishes on his own ----------------
    if (auto && !over) {
      if (mode === "idle" && idleT > 1.1) {
        const h = pick(HOLES);
        targetX = clamp(h.x + (Math.sign(guyX - h.x) || 1) * (h.r + 11), 16, W - 16);
        wandering = false;
        mode = "walk";
      }
      if (mode === "fish" && jigCd <= 0 && Math.random() < dt * 0.9) {
        jigCd = 0.5;
        lureY -= 14;
        rodVel = -22;
        for (const f of fish)
          if (Math.abs(f.x - hole.x) < W * 0.4 && f.state !== "flee")
            f.interest = clamp(f.interest + 0.3, 0, 1);
      }
      if (mode === "bite" && hooked && biteT < biteWin * 0.7) {
        hooked.state = "nibble";
        mode = "fight";
        tension = 0.22;
        rodVel = -46;
        surgeCd = rand(0.7, 1.4);
        slackT = 0;
        reeling = true;
        say("fish on!");
      }
      if (mode === "fight") reeling = tension < 0.66;
    }

    // ---------------- the guy ----------------
    if (!over) {
      const dx = targetX - guyX;
      if (mode === "walk") {
        const dir = Math.sign(dx);
        if (dir !== 0) face = dir;
        const spd = 96;
        if (Math.abs(dx) <= spd * dt) {
          guyX = targetX;
          step = 0;
          hole = nearestHole(guyX);
          if (!wandering && Math.abs(guyX - hole.x) < hole.r * 2.4) {
            face = guyX <= hole.x ? 1 : -1;
            dropLine();
            say("line's in");
          } else {
            mode = "idle";
            idleT = 0;
            actT = 0;
            wanderT = rand(5, 9);
          }
          wandering = false;
        } else {
          guyX += dir * spd * dt;
          step += dt * 9.4;
          bob = Math.abs(Math.sin(step)) * 2.2;
          // stamp a print on each footfall, and kick up snow with it
          if (Math.floor(step / Math.PI) !== lastStep) {
            lastStep = Math.floor(step / Math.PI);
            prints.push({
              x: guyX - face * 3,
              y: GROUND + rand(-1.5, 2),
              dir: face,
              age: 0,
              deep: rand(0.75, 1),
            });
            if (prints.length > 70) prints.shift();
            emitBits(guyX - face * 6, GROUND, 3, 26);
          }
        }
      } else {
        bob += (Math.sin(clock * 1.6) * 0.9 - bob) * Math.min(1, dt * 4);
      }

      // idle "hanging out" behaviours — he does not stand there like a prop
      if (mode === "idle") {
        idleT += dt;
        actT += dt;
        wanderT -= dt;
        if (wanderT <= 0 && !auto) {
          // nobody has told him to do anything, so he wanders a few steps,
          // the way anyone waiting on a lake eventually does
          wandering = true;
          targetX = clamp(guyX + rand(-1, 1) * rand(34, 96), 24, W - 24);
          mode = "walk";
          wanderT = rand(5, 9);
        }
        if (actT > rand(2.6, 3.4) || actT === 0) {
          actT = 0;
          idleAct = pick(["look", "warm", "stomp", "stretch", "gaze"] as IdleAct[]);
          if (idleAct === "look") face = -face; // turns right around
          if (idleAct === "warm") breathT = 0.2;
          if (idleAct === "gaze") headTarget = -0.5;
          else headTarget = 0;
        }
        if (idleAct === "look") headTarget = Math.sin(actT * 1.6) * 0.25;
        if (idleAct === "stomp" && Math.floor(actT * 9 / Math.PI) % 2 === 0 && Math.random() < dt * 6) {
          emitBits(guyX + face * 4, GROUND, 2, 20);
          prints.push({ x: guyX + face * 4, y: GROUND, dir: face, age: 0, deep: 0.6 });
        }
      } else if (mode === "fish") {
        actT += dt;
        headTarget = Math.sin(clock * 0.7) * 0.12;
        if (actT > 4.5) {
          actT = 0;
          breathT = 0.1;
        }
      }

      headTilt += (headTarget - headTilt) * Math.min(1, dt * 5);
      turn += (face - turn) * Math.min(1, dt * 9); // the actual turn-around
      armRaise += ((mode === "land" ? 1 : 0) - armRaise) * Math.min(1, dt * 7);

      // breath in the cold
      breathT -= dt;
      if (breathT <= 0) {
        breathT = rand(2.2, 4);
        emitPuff(guyX + turn * 7, GROUND - 56, 3.5, 2, -8);
      }
    }

    // ---------------- rod spring ----------------
    // rodBend is a damped spring; everything below pulls on it.
    let rodForce = -rodBend * 42;
    if (mode === "fish") rodForce += Math.sin(clock * 1.3) * 1.2;
    if (mode === "bite") rodForce += Math.sin(clock * 34) * 46 + 24;
    if (mode === "fight" && hooked) {
      rodForce += tension * 130 + Math.sin(clock * 12) * 16 * tension;
    }
    rodVel += rodForce * dt;
    rodVel *= Math.pow(0.02, dt);
    rodBend = clamp(rodBend + rodVel * dt, -12, 26);
    lineTaut +=
      ((mode === "fight" ? clamp(tension * 1.5, 0.3, 1) : mode === "bite" ? 0.55 : 0.12) -
        lineTaut) *
      Math.min(1, dt * 6);

    // ---------------- fish ----------------
    if (!over) {
      if (fish.length < 6 && Math.random() < dt * 0.55) fish.push(makeFish());
      const lureX = hole.x;
      const lineOut = mode === "fish" || mode === "bite";

      for (const f of fish) {
        f.tail += dt * (6 + Math.abs(f.vx) * 0.12);
        f.patience -= dt;

        if (f === hooked) {
          // dragged along by the line
          f.x += (lureX - f.x) * Math.min(1, dt * 4);
          f.y += (lureY - f.y) * Math.min(1, dt * 6);
          f.tail += dt * 14; // thrashing on top of the base wag
          f.dir = Math.sin(clock * 2.2) > 0 ? 1 : -1;
          continue;
        }

        if (f.state === "flee") {
          f.vx = f.dir * 70;
          f.vy = Math.sin(clock * 2 + f.y) * 8;
          if (f.patience <= 0) {
            f.state = "roam";
            f.patience = rand(3, 7);
          }
        } else if (lineOut && f.interest > 0.35) {
          f.state = "approach";
          const dx = lureX - f.x;
          const dy = lureY - f.y;
          const d = Math.hypot(dx, dy) || 1;
          const spd = 26 + f.interest * 52;
          f.vx = (dx / d) * spd;
          f.vy = (dy / d) * spd * 0.7;
          if (dx !== 0) f.dir = Math.sign(dx);
          if (d < 14 && mode === "fish") {
            // the take
            hooked = f;
            mode = "bite";
            biteT = biteWin;
            rodVel = -70;
            vign = 1;
            ctx.haptic("light");
            say("tug!");
          }
        } else {
          f.state = "roam";
          f.vx += Math.sin(clock * 0.7 + f.y * 0.05) * 14 * dt;
          f.vx = clamp(f.vx, -40, 40);
          if (Math.abs(f.vx) < 6) f.vx = f.dir * 18;
          f.vy += Math.sin(clock * 1.1 + f.x * 0.03) * 10 * dt;
          f.vy = clamp(f.vy, -18, 18);
          if (f.vx !== 0) f.dir = Math.sign(f.vx);
          // curiosity builds while a line is in the water near them
          if (lineOut) {
            const d = Math.hypot(f.x - lureX, f.y - lureY);
            f.interest = clamp(
              f.interest + (d < W * 0.35 ? dt * (0.045 + 0.11 * (1 - d / (W * 0.35))) : -dt * 0.12),
              0,
              1
            );
          } else f.interest = Math.max(0, f.interest - dt * 0.4);
        }

        f.x += f.vx * dt;
        f.y = clamp(f.y + f.vy * dt, WATER_Y + 22, H - 22);
        if (f.x < -60) f.x = W + 50;
        if (f.x > W + 60) f.x = -50;
      }
      fish = fish.filter((f) => f.state !== "flee" || f.x > -80);
      if (fish.length > 8) fish.splice(0, fish.length - 8);
    }

    // ---------------- lure + the bite window ----------------
    if (mode === "fish") {
      lureY += (LURE_REST - lureY) * Math.min(1, dt * 1.6);
    }
    if (mode === "bite") {
      biteT -= dt;
      lureY += Math.sin(clock * 30) * 26 * dt;
      if (biteT <= 0) {
        // missed it — the fish spits the lure and everyone nearby bolts
        say("missed it");
        spookAll(W * 0.35);
        hooked = null;
        mode = "fish";
        ctx.haptic("fail");
      }
    }

    // ---------------- the fight ----------------
    if (mode === "fight" && hooked) {
      const strength = 0.4 + hooked.size * 0.5;
      surgeCd -= dt;
      let surge = 0;
      if (surgeCd <= 0) {
        surgeCd = rand(0.7, 1.6);
        surge = strength * 0.16;
        rodVel += 40 * strength;
        shake = Math.max(shake, 2.5 * strength);
        ctx.haptic("light");
      }
      if (reeling) {
        tension += (0.34 + strength * 0.34) * dt + surge;
        lureY -= (86 + 30 * (1 - hooked.size)) * dt;
        slackT = 0;
      } else {
        tension -= 1.35 * dt;
        tension += surge * 0.5;
        lureY += 26 * strength * dt;
        if (tension < 0.1) slackT += dt;
      }
      tension = Math.max(0, tension);
      lureY = clamp(lureY, WATER_Y + 4, H - 30);

      if (tension >= 1) {
        loseFish("line snapped");
      } else if (slackT > 1.7) {
        loseFish("threw the hook");
      } else if (lureY <= WATER_Y + 6) {
        land(hooked);
      }
    }

    if (mode === "land") {
      landT -= dt;
      if (landT <= 0) {
        mode = "fish";
        lureY = WATER_Y + 8;
        lineTaut = 0;
        say("again");
      }
    }

    // ---------------- particles ----------------
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life -= dt / p.max;
      p.x += (p.vx + wind() * 12) * dt;
      p.y += p.vy * dt;
      p.vy += 6 * dt;
      p.r += 9 * dt;
      if (p.life <= 0) puffs.splice(i, 1);
    }
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += 190 * dt;
      if (b.y > GROUND) {
        b.y = GROUND;
        b.vy *= -0.28;
        b.vx *= 0.6;
      }
      if (b.life <= 0) bits.splice(i, 1);
    }
    for (const p of prints) p.age += dt;
    if (prints.length && prints[0].age > PRINT_LIFE) prints.shift();

    for (const f of flakes) {
      f.y += (14 + f.z * 46) * dt;
      f.x += (wind() * 26 * f.z + Math.sin(clock * 1.4 + f.ph) * 8) * dt;
      if (f.y > H) {
        f.y = -6;
        f.x = rand(0, W);
      }
      if (f.x < -10) f.x = W + 8;
      if (f.x > W + 10) f.x = -8;
    }

    // ================= draw =================
    g.save();
    if (shake > 0.1)
      g.translate(rand(-shake, shake) * 0.6, rand(-shake, shake) * 0.4);

    drawSky(t);
    drawTreeline();
    drawSnowfield();
    drawPrints();
    drawIceAndWater();

    // snow that falls behind the guy
    g.fillStyle = snowWhite;
    for (const f of flakes) {
      if (f.z > 0.55) continue;
      g.globalAlpha = 0.25 + f.z * 0.4;
      g.beginPath();
      g.arc(f.x, f.y, 0.8 + f.z * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    for (const f of fish) drawFish(f);
    drawHoles();
    drawGear();

    // kicked snow
    g.fillStyle = snowWhite;
    for (const b of bits) {
      g.globalAlpha = clamp(b.life * 1.4, 0, 1);
      g.beginPath();
      g.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    drawGuy(t);

    // breath
    for (const p of puffs) {
      g.globalAlpha = p.life * 0.34;
      g.fillStyle = snowWhite;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // snow in front
    g.fillStyle = snowWhite;
    for (const f of flakes) {
      if (f.z <= 0.55) continue;
      g.globalAlpha = 0.3 + f.z * 0.45;
      g.beginPath();
      g.arc(f.x, f.y, 0.8 + f.z * 1.9, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // bite pulse — a vignette that breathes in on the strike window
    if (vign > 0.01 || mode === "bite") {
      const v = Math.max(vign, mode === "bite" ? 0.35 + Math.sin(clock * 14) * 0.15 : 0);
      const grad = g.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.62);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, pal.foe);
      g.globalAlpha = clamp(v, 0, 1) * 0.4;
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }

    g.restore();

    drawTension(t);
    drawHud(t);
    if (over) endCard(g, t, W, H, caught > 0 ? "OUT OF LINE" : "SKUNKED");
  });
  loop.start();

  return {
    destroy: () => {
      loop.destroy();
      ctx.canvas.removeEventListener("pointerdown", onDown);
      ctx.canvas.removeEventListener("pointerup", onUp);
      ctx.canvas.removeEventListener("pointercancel", onUp);
    },
    pause: loop.pause,
    resume: loop.resume,
    autoplay: (on) => {
      auto = on;
      reeling = false;
      if (!on) reset();
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
