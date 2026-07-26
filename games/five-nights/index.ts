import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { endCard, makeLoop, rand, roundRect, shade } from "@/games/engine";
import { drawNicHead } from "@/games/nic";

const meta = {
  slug: "five-nights",
  title: "Five Nights at Nic's Basement",
  rule: "Shut the doors, flash the dark, hold the pump",
  year: 2014,
  description: "Six hours. One basement. Three of him.",
  history:
    "Homage to the 2014 sit-still-and-survive horror sim: a fixed chair, a finite battery, and a monster that only moves when you stop looking. The basement, the swoop and the stare are all Nic's own.",
  tags: ["reflex", "endurance", "oneTap", "chaos"],
  palette: {
    hero: "#8fd8ff",
    foe: "#c9705f",
    prize: "#ffcf5c",
    deep: "#120d16",
    glow: "#ff3b3b",
  },
  intensity: 0.82,
  speed: 0.6,
  difficulty: 0.78,
  luck: 0.3,
  nostalgia: 0.35,
  realism: 0.75,
  kidSafe: true,
  sessionLength: 0.7,
  scoreUnit: "pts",
  maxScorePerSecond: 30,
} satisfies GameModule["meta"];

/** Each of him takes a different way in. */
type Route = "stairs" | "vent" | "drain";

interface Stalker {
  route: Route;
  name: string;
  step: number; // 0 = far away, 3 = at the threshold
  timer: number; // seconds until the next move roll
  lunge: number; // counting down to the end of your run
  seed: number;
  bang: number; // door-hit flash
  gaze: number;
}

const HOUR = 15; // seconds per in-game hour
const HOURS = 6; // 12 AM -> 6 AM
const STEPS = 3;

const ROUTES: { route: Route; name: string; hint: string }[] = [
  { route: "stairs", name: "NIC", hint: "the stairs" },
  { route: "vent", name: "SPARE NIC", hint: "the laundry" },
  { route: "drain", name: "CRAWL NIC", hint: "the floor" },
];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;

  // --- layout ------------------------------------------------------------
  // The feed owns the edges: its caption sits bottom-left, its rail runs up
  // the right. So the whole panel — doors, pump, buttons — lives in the band
  // between the score HUD and the caption, and never hides under either.
  const hudY = H * 0.135;
  const barH = Math.min(84, Math.max(66, H * 0.1));
  const barY = H * 0.655;
  const roomTop = hudY + 22;
  const roomH = barY - 10;
  // the bar stops short of the rail's column, and well above the caption
  const barRight = W * 0.79;
  const btnW = (barRight - 12 - 16) / 3;
  const buttons = [
    { id: "stairs" as const, label: "STAIRS", x: 12, y: barY, w: btnW, h: barH },
    { id: "flash" as const, label: "FLASH", x: 20 + btnW, y: barY, w: btnW, h: barH },
    { id: "vent" as const, label: "VENT", x: 28 + btnW * 2, y: barY, w: btnW, h: barH },
  ];
  // the pump hugs the left wall — the right belongs to the feed's rail
  const pump = { x: 12, y: roomH - 100, w: 46, h: 88 };

  let night = 1;
  let clock = 0; // seconds into the night
  let power = 100;
  let pumpLevel = 100;
  let doorL = false;
  let doorR = false;
  let cranking = false;
  let flash = 0; // seconds of beam left
  let flashCd = 0;
  let blackout = 0; // seconds of no-power darkness before he arrives
  let stalkers: Stalker[] = [];
  let score = 0;
  let over = false;
  let caught: Stalker | null = null;
  let scare = 0; // jumpscare timer, counts up
  let shake = 0;
  let hallucination = 0;
  let halluX = 0;
  let halluY = 0;
  let bulb = 1; // lamp brightness, flickers on its own
  let elapsed = 0;
  let toast = "";
  let toastT = 0;
  let clearedHours = 0;

  const say = (msg: string) => {
    toast = msg;
    toastT = 1.9;
  };

  const makeStalkers = () =>
    ROUTES.map((r) => ({
      route: r.route,
      name: r.name,
      step: 0,
      timer: rand(3, 7),
      lunge: 0,
      seed: rand(0, 10),
      bang: 0,
      gaze: 0,
    }));

  const reset = () => {
    night = 1;
    clock = 0;
    power = 100;
    pumpLevel = 100;
    doorL = doorR = false;
    cranking = false;
    flash = flashCd = 0;
    blackout = 0;
    stalkers = makeStalkers();
    score = 0;
    clearedHours = 0;
    over = false;
    caught = null;
    scare = 0;
    shake = 0;
    hallucination = 0;
    elapsed = 0;
    toastT = 0;
    ctx.onScore(0);
  };

  const hour = () => Math.min(HOURS, Math.floor(clock / HOUR));
  const hourLabel = () => {
    const h = hour();
    return h === 0 ? "12 AM" : `${h} AM`;
  };

  /** How hard he is pushing right now: later nights, later hours. */
  const heat = () => 0.28 + (night - 1) * 0.16 + (clock / (HOUR * HOURS)) * 0.4;

  const doorFor = (r: Route) => (r === "stairs" ? doorL : r === "vent" ? doorR : false);

  const end = (by: Stalker | null, reason: string) => {
    if (over) return;
    over = true;
    caught = by;
    scare = 0;
    shake = 1;
    ctx.haptic("fail");
    ctx.onRunEnd(score, reason);
  };

  const bankHour = () => {
    clearedHours++;
    score = clearedHours * 100 + (night - 1) * 400;
    ctx.onScore(score);
  };

  const surviveNight = () => {
    night++;
    clock = 0;
    power = 100;
    pumpLevel = Math.max(pumpLevel, 70);
    doorL = doorR = false;
    stalkers = makeStalkers();
    score = clearedHours * 100 + (night - 1) * 400;
    ctx.onScore(score);
    say(`NIGHT ${night}`);
    ctx.haptic("light");
  };

  // --- input -------------------------------------------------------------
  const posOf = (e: PointerEvent) => {
    const r = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inBox = (
    p: { x: number; y: number },
    b: { x: number; y: number; w: number; h: number }
  ) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  const doFlash = () => {
    if (flashCd > 0 || power <= 0) return;
    flash = 0.85;
    flashCd = 1.1;
    power = Math.max(0, power - 1.0);
    ctx.haptic("light");
    // the beam is the only thing that sends the floor one back down
    const crawl = stalkers.find((s) => s.route === "drain");
    if (crawl && crawl.step > 0) {
      crawl.step = 0;
      crawl.lunge = 0;
      crawl.timer = rand(3, 5.5);
      say("he went back down");
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      if (scare > 1.5) reset();
      return;
    }
    const p = posOf(e);
    if (inBox(p, pump)) {
      cranking = true;
      ctx.haptic("light");
      return;
    }
    for (const b of buttons) {
      if (!inBox(p, b)) continue;
      if (b.id === "flash") doFlash();
      else if (b.id === "stairs") {
        if (power > 0) {
          doorL = !doorL;
          ctx.haptic("hit");
        }
      } else if (power > 0) {
        doorR = !doorR;
        ctx.haptic("hit");
      }
      return;
    }
  };
  const onUp = () => {
    cranking = false;
  };
  ctx.canvas.addEventListener("pointerdown", onDown);
  ctx.canvas.addEventListener("pointerup", onUp);
  ctx.canvas.addEventListener("pointercancel", onUp);

  reset();

  // --- attract mode ------------------------------------------------------
  let auto = false;
  let autoT = 0;

  const autoPlay = () => {
    const threat = (r: Route) => stalkers.find((s) => s.route === r)!;
    const stairs = threat("stairs");
    const vent = threat("vent");
    const drain = threat("drain");
    // shut only what is actually at the door: power is the real enemy
    doorL = stairs.step >= STEPS;
    doorR = vent.step >= STEPS;
    if (drain.step >= 2 && flashCd <= 0) doFlash();
    cranking = pumpLevel < 34 && stairs.step < STEPS && vent.step < STEPS;
  };

  // --- simulation --------------------------------------------------------
  const step = (dt: number) => {
    elapsed += dt;
    if (toastT > 0) toastT -= dt;
    flash = Math.max(0, flash - dt);
    flashCd = Math.max(0, flashCd - dt);
    shake = Math.max(0, shake - dt * 2.2);
    if (hallucination > 0) hallucination -= dt;

    // the lamp is old and the house is older
    bulb += (1 - bulb) * dt * 3;
    if (Math.random() < dt * (0.5 + heat() * 1.2)) bulb = rand(0.15, 0.55);

    if (auto) {
      autoT -= dt;
      if (autoT <= 0) {
        autoPlay();
        // attract mode plays like a person, not a solver: it looks, it hesitates
        autoT = rand(0.3, 0.75);
      }
    }

    // clock
    const before = hour();
    clock += dt;
    if (hour() > before) {
      bankHour();
      ctx.haptic("light");
    }
    if (clock >= HOUR * HOURS) {
      surviveNight();
      return;
    }

    // power
    const closed = (doorL ? 1 : 0) + (doorR ? 1 : 0);
    // budget: sitting still costs about half a battery a night, so the other
    // half is exactly how much door you can afford. Later nights eat into it.
    const drain = 0.55 + (night - 1) * 0.06 + closed * 2.6;
    power = Math.max(0, power - drain * dt);
    if (power <= 0) {
      doorL = doorR = false;
      blackout += dt;
      if (blackout > 3.4) {
        end(stalkers[0], "POWER OUT");
        return;
      }
    }

    // the sump pump: it keeps the lights honest, and it never stops draining
    if (cranking) {
      pumpLevel = Math.min(100, pumpLevel + dt * 46);
    } else {
      pumpLevel = Math.max(0, pumpLevel - dt * (2.6 + (night - 1) * 0.4));
    }
    if (pumpLevel <= 0) {
      // water on the slab, and something wading through it
      const s = stalkers[2];
      if (s.lunge <= 0) {
        say("water on the slab");
        shake = Math.max(shake, 0.6);
        ctx.haptic("hit");
      }
      s.step = STEPS;
      s.lunge = Math.max(s.lunge, 0.01);
    }

    // him, three times over
    for (const s of stalkers) {
      s.bang = Math.max(0, s.bang - dt * 2.4);
      s.gaze = Math.sin(elapsed * 1.4 + s.seed * 3);

      if (s.lunge > 0) {
        s.lunge += dt;
        // still open? he is coming through it
        const grace = s.route === "drain" ? 2.6 : 2.2;
        if (s.lunge > grace) {
          end(s, s.route === "drain" ? "UNDER THE CHAIR" : "HE GOT IN");
          return;
        }
        // you get one beat to shut it in his face. Miss the beat and the
        // door behind him is just a door — he is already on your side of it.
        if (doorFor(s.route) && s.lunge < 1.35) {
          s.lunge = 0;
          s.step = 0;
          s.timer = rand(3.5, 6);
          s.bang = 1;
          ctx.haptic("hit");
        }
        continue;
      }

      s.timer -= dt;
      if (s.timer > 0) continue;
      const h = heat() * (s.route === "drain" ? 0.8 : 1);
      s.timer = rand(2.6, 5.2) / (0.7 + h);
      if (Math.random() > 0.35 + h * 0.5) continue;

      s.step++;
      if (s.step >= STEPS) {
        s.step = STEPS;
        if (doorFor(s.route)) {
          // he tries the handle, finds steel, walks it off
          s.bang = 1;
          s.step = 0;
          s.timer = rand(3.5, 6);
          ctx.haptic("hit");
        } else {
          s.lunge = 0.01;
          shake = Math.max(shake, 0.5);
          ctx.haptic("hit");
        }
      } else if (s.step === STEPS - 1 && Math.random() < 0.5) {
        // a face where a face should not be
        hallucination = 0.22;
        halluX = rand(W * 0.25, W * 0.75);
        halluY = rand(roomH * 0.25, roomH * 0.7);
        shake = Math.max(shake, 0.35);
        ctx.haptic("hit");
      }
    }
  };

  // --- drawing -----------------------------------------------------------
  const wall = () => shade(pal.deep, 0.06 + bulb * 0.1);

  /** Concrete, joists, junk. Everything you own, in the dark. */
  const drawRoom = (t: ReturnType<typeof ctx.getTheme>) => {
    const lit = power <= 0 ? 0.12 : 0.35 + bulb * 0.65;
    // back wall
    const sky = g.createLinearGradient(0, 0, 0, roomH);
    sky.addColorStop(0, shade(pal.deep, 0.02));
    sky.addColorStop(0.55, shade(pal.deep, 0.03 + lit * 0.12));
    sky.addColorStop(1, shade(pal.deep, -0.3));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, roomH);

    // the bulb's pool of light — soft, small, and losing
    const sway0 = Math.sin(elapsed * 0.9) * 10;
    g.globalAlpha = 0.42 * lit;
    const pool = g.createRadialGradient(
      W / 2 + sway0,
      roomH * 0.34,
      4,
      W / 2 + sway0,
      roomH * 0.34,
      W * 0.52
    );
    pool.addColorStop(0, shade(pal.prize, 0.25));
    pool.addColorStop(0.45, shade(pal.prize, -0.55));
    pool.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = pool;
    g.fillRect(0, 0, W, roomH);
    g.globalAlpha = 1;

    // cinder block courses
    g.strokeStyle = shade(pal.deep, 0.14);
    g.lineWidth = 1;
    g.globalAlpha = 0.5 * lit;
    for (let y = roomH * 0.12; y < roomH * 0.72; y += 26) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    for (let x = 0; x < W; x += 52) {
      g.beginPath();
      g.moveTo(x, roomH * 0.12);
      g.lineTo(x, roomH * 0.72);
      g.stroke();
    }
    g.globalAlpha = 1;

    // joists overhead — the ceiling is somebody's floor
    g.fillStyle = shade(pal.deep, -0.4);
    g.fillRect(0, 0, W, roomH * 0.1);
    g.fillStyle = shade(pal.deep, 0.1);
    for (let i = 0; i < 7; i++) {
      g.fillRect((i * W) / 6.2 + 4, 0, 10, roomH * 0.1);
    }

    // the swinging bulb
    const sway = Math.sin(elapsed * 0.9) * 10;
    g.strokeStyle = shade(pal.deep, 0.22);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(W / 2, roomH * 0.1);
    g.lineTo(W / 2 + sway, roomH * 0.22);
    g.stroke();
    if (power > 0) {
      g.shadowColor = shade(pal.prize, 0.2);
      g.shadowBlur = 26 * bulb;
    }
    g.fillStyle = power > 0 ? shade(pal.prize, bulb * 0.5) : shade(pal.deep, 0.2);
    g.beginPath();
    g.arc(W / 2 + sway, roomH * 0.235, 7, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;

    // pipes, running the length of the ceiling to somewhere you can't see
    g.strokeStyle = shade(pal.deep, 0.2);
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, roomH * 0.135);
    g.lineTo(W, roomH * 0.115);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, roomH * 0.16);
    g.lineTo(W, roomH * 0.185);
    g.stroke();

    // floor
    g.fillStyle = shade(pal.deep, -0.15);
    g.fillRect(0, roomH * 0.72, W, roomH * 0.28);
    g.strokeStyle = shade(pal.deep, 0.16);
    g.globalAlpha = 0.6 * lit;
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.moveTo(W / 2 + i * 30, roomH * 0.72);
      g.lineTo(W / 2 + i * 150, roomH);
      g.stroke();
    }
    g.globalAlpha = 1;

    // the junk: water heater, washer, boxes
    const junk = shade(pal.deep, 0.16);
    g.fillStyle = junk;
    roundRect(g, W * 0.12, roomH * 0.42, 44, roomH * 0.3, 18);
    g.fill();
    g.fillStyle = shade(pal.deep, 0.24);
    roundRect(g, W * 0.62, roomH * 0.52, 62, roomH * 0.2, 6);
    g.fill();
    g.fillStyle = shade(pal.deep, 0.1);
    g.beginPath();
    g.arc(W * 0.62 + 31, roomH * 0.62, 17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(pal.deep, 0.2);
    roundRect(g, W * 0.3, roomH * 0.58, 52, 44, 3);
    g.fill();
    roundRect(g, W * 0.34, roomH * 0.5, 40, 34, 3);
    g.fill();

    // the floor drain, dead centre, and whatever is climbing it
    const dr = stalkers[2];
    const drainY = roomH * 0.93;
    const drainW = 40;
    g.fillStyle = shade(pal.deep, -0.6);
    g.beginPath();
    g.ellipse(W / 2, drainY, drainW, 15, 0, 0, Math.PI * 2);
    g.fill();

    if (dr && dr.step > 0) {
      // the swoop first, then the eyes, then the rest of him — and never
      // more of him than the hole can hold
      const rise = dr.lunge > 0 ? 1 : dr.step / STEPS;
      const r = drainW * (0.7 + rise * 0.55);
      g.save();
      g.beginPath();
      g.ellipse(W / 2, drainY, drainW + rise * 26, roomH, 0, 0, Math.PI * 2);
      g.rect(0, drainY, W, roomH);
      g.clip("evenodd");
      drawNicHead(g, {
        x: W / 2,
        y: drainY + r * 0.85 - rise * r * 1.5,
        r,
        skin: shade(pal.foe, -0.5 + rise * 0.35 + (flash > 0 ? 0.2 : 0)),
        hair: shade(pal.deep, 0.05),
        eye: shade(pal.prize, 0.5),
        pupil: shade(pal.deep, -0.5),
        dark: shade(pal.deep, -0.6),
        tooth: shade(pal.prize, 0.7),
        lean: Math.sin(elapsed * 2.1 + dr.seed) * 0.09,
        gaze: dr.gaze,
        gape: dr.lunge > 0 ? 0.85 : 0.15,
        scowl: 1,
        glowEyes: dr.lunge > 0 || flash <= 0 ? pal.glow : undefined,
        shadowed: flash > 0 ? 0 : 0.3 - rise * 0.25,
      });
      g.restore();
    }

    // the grate goes over the top of him: you watch him through the bars
    g.strokeStyle = shade(pal.deep, 0.3);
    g.lineWidth = 3;
    for (let i = -3; i <= 3; i++) {
      const bx = W / 2 + i * (drainW / 3.4);
      const k = 1 - Math.abs(i) / 4;
      g.beginPath();
      g.moveTo(bx, drainY - 15 * k);
      g.lineTo(bx, drainY + 15 * k);
      g.stroke();
    }
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(W / 2, drainY, drainW, 15, 0, 0, Math.PI * 2);
    g.stroke();

    // water on the slab once the pump gives up
    if (pumpLevel < 34) {
      g.globalAlpha = (1 - pumpLevel / 34) * 0.4;
      g.fillStyle = shade(pal.hero, -0.6);
      g.beginPath();
      g.ellipse(W / 2, roomH * 0.95, W * 0.5, roomH * 0.06, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  };

  /** Shoulders under the head, so it is a person and not a mask. */
  const drawBody = (x: number, headY: number, r: number, shirt: string, skin: string) => {
    g.fillStyle = skin;
    g.fillRect(x - r * 0.24, headY + r * 0.7, r * 0.48, r * 0.5);
    g.fillStyle = shirt;
    g.beginPath();
    g.moveTo(x - r * 1.5, headY + r * 3.2);
    g.quadraticCurveTo(x - r * 1.3, headY + r * 1.02, x, headY + r * 1.0);
    g.quadraticCurveTo(x + r * 1.3, headY + r * 1.02, x + r * 1.5, headY + r * 3.2);
    g.closePath();
    g.fill();
  };

  /** One doorway: the stairs on the left, the laundry vent on the right. */
  const drawOpening = (side: "L" | "R", s: Stalker, t: ReturnType<typeof ctx.getTheme>) => {
    const left = side === "L";
    const w = W * 0.24;
    // the right opening stops short of the rail's column, so the thing
    // standing in it is never hidden behind a heart icon
    const x = left ? 0 : barRight - w;
    const top = roomH * 0.16;
    const h = roomH * 0.68;
    const closed = left ? doorL : doorR;

    // the hole
    g.fillStyle = shade(pal.deep, -0.65);
    roundRect(g, x, top, w, h, 6);
    g.fill();

    g.save();
    roundRect(g, x, top, w, h, 6);
    g.clip();

    // what's behind it: stairs going up, or slats you can't see through
    g.strokeStyle = shade(pal.deep, 0.14);
    g.lineWidth = 2;
    if (left) {
      for (let i = 0; i < 8; i++) {
        const yy = top + h * 0.12 + i * (h * 0.1);
        const inset = w * 0.06 * (8 - i) * 0.12;
        g.beginPath();
        g.moveTo(x + inset, yy);
        g.lineTo(x + w - inset, yy + 4);
        g.stroke();
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const yy = top + h * 0.06 + i * (h * 0.075);
        g.beginPath();
        g.moveTo(x + w * 0.12, yy);
        g.lineTo(x + w * 0.88, yy);
        g.stroke();
      }
    }

    // what is standing in it
    if (s.step > 0) {
      const near = s.lunge > 0 ? 1 : s.step / STEPS;
      const seen = flash > 0 || s.lunge > 0;
      // he does not walk closer so much as fill more of the doorway
      const r = w * (0.18 + near * 0.42) * (s.lunge > 0 ? 1.15 : 1);
      const hy = top + h * (0.62 - near * 0.22);
      const skin = shade(pal.foe, -0.55 + (seen ? 0.5 : 0) + near * 0.12);
      drawBody(x + w / 2, hy, r, shade(pal.deep, seen ? 0.16 : 0.05), skin);
      drawNicHead(g, {
        x: x + w / 2,
        y: hy,
        r,
        skin,
        hair: shade(pal.deep, 0.04),
        eye: shade(pal.prize, 0.5),
        pupil: shade(pal.deep, -0.5),
        dark: shade(pal.deep, -0.6),
        tooth: shade(pal.prize, 0.7),
        lean: Math.sin(elapsed * 1.1 + s.seed) * 0.05,
        gaze: s.gaze,
        gape: s.lunge > 0 ? 0.7 + Math.sin(elapsed * 22) * 0.2 : 0.1,
        scowl: 1,
        glowEyes: seen ? undefined : pal.glow,
        shadowed: seen ? 0 : 0.42,
      });
    }
    g.restore();

    // the doorway goes red the moment he is actually in it
    if (s.lunge > 0) {
      g.globalAlpha = 0.25 + Math.abs(Math.sin(elapsed * 9)) * 0.4;
      g.strokeStyle = pal.glow;
      g.lineWidth = 5;
      roundRect(g, x, top, w, h, 6);
      g.stroke();
      g.globalAlpha = 1;
    }

    // once he is past the frame the shutter is scrap — it draws no more
    const through = s.lunge >= 1.35;

    // the door: corrugated steel, dropped fast
    if (closed && !through) {
      g.fillStyle = shade(pal.deep, 0.26);
      roundRect(g, x - 2, top - 4, w + 4, h + 8, 4);
      g.fill();
      g.strokeStyle = shade(pal.deep, 0.4);
      g.lineWidth = 1.5;
      for (let y = top; y < top + h; y += 12) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y);
        g.stroke();
      }
      if (s.bang > 0) {
        g.globalAlpha = s.bang * 0.75;
        g.fillStyle = pal.glow;
        roundRect(g, x - 2, top - 4, w + 4, h + 8, 4);
        g.fill();
        g.globalAlpha = 1;
      }
    }

    // frame
    g.strokeStyle = shade(pal.deep, 0.3);
    g.lineWidth = 4;
    roundRect(g, x, top, w, h, 6);
    g.stroke();

    // the beam, when you spend it
    if (flash > 0 && power > 0) {
      g.globalAlpha = Math.min(0.4, flash * 0.5);
      const beam = g.createLinearGradient(left ? 0 : W, 0, left ? w * 1.6 : W - w * 1.6, 0);
      beam.addColorStop(0, pal.hero);
      beam.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = beam;
      g.fillRect(left ? 0 : W - w * 1.6, top - 8, w * 1.6, h + 16);
      g.globalAlpha = 1;
    }
  };

  const drawPump = (t: ReturnType<typeof ctx.getTheme>) => {
    const low = pumpLevel < 34;
    g.fillStyle = shade(pal.deep, cranking ? 0.34 : 0.22);
    roundRect(g, pump.x, pump.y, pump.w, pump.h, 8);
    g.fill();
    g.strokeStyle = low ? pal.glow : shade(pal.deep, 0.42);
    g.lineWidth = 2;
    roundRect(g, pump.x, pump.y, pump.w, pump.h, 8);
    g.stroke();
    // the level
    const ih = pump.h - 30;
    g.fillStyle = shade(pal.deep, -0.4);
    roundRect(g, pump.x + 8, pump.y + 8, pump.w - 16, ih, 4);
    g.fill();
    const fh = (ih * pumpLevel) / 100;
    g.fillStyle = low ? pal.glow : pal.hero;
    roundRect(g, pump.x + 8, pump.y + 8 + (ih - fh), pump.w - 16, fh, 4);
    g.fill();
    g.textAlign = "center";
    g.fillStyle = low ? pal.glow : shade(pal.hero, -0.2);
    g.font = `800 9px ${t.fontBody}`;
    g.fillText(cranking ? "PUMPING" : "HOLD", pump.x + pump.w / 2, pump.y + pump.h - 8);
    g.textAlign = "left";
  };

  const drawHud = (t: ReturnType<typeof ctx.getTheme>) => {
    g.textAlign = "left";
    g.fillStyle = shade(pal.prize, 0.1);
    g.font = `800 15px ${t.fontDisplay}`;
    g.fillText(hourLabel(), 14, hudY);
    g.fillStyle = shade(pal.hero, -0.15);
    g.font = `700 11px ${t.fontBody}`;
    g.fillText(`NIGHT ${night}`, 14, hudY + 16);

    // power
    const pw = Math.min(120, W * 0.36);
    const px = W - pw - 14;
    g.fillStyle = shade(pal.deep, 0.2);
    roundRect(g, px, hudY - 12, pw, 12, 6);
    g.fill();
    const crit = power < 25;
    g.fillStyle = crit ? pal.glow : pal.prize;
    if (crit && Math.sin(elapsed * 9) > 0) g.globalAlpha = 0.55;
    roundRect(g, px, hudY - 12, (pw * power) / 100, 12, 6);
    g.fill();
    g.globalAlpha = 1;
    g.textAlign = "right";
    g.fillStyle = crit ? pal.glow : shade(pal.prize, -0.1);
    g.font = `800 11px ${t.fontBody}`;
    g.fillText(`${Math.ceil(power)}% POWER`, W - 14, hudY + 16);
    g.textAlign = "left";
  };

  const drawButtons = (t: ReturnType<typeof ctx.getTheme>) => {
    for (const b of buttons) {
      const on = b.id === "stairs" ? doorL : b.id === "vent" ? doorR : flash > 0;
      const cool = b.id === "flash" && flashCd > 0;
      g.fillStyle = on ? shade(pal.hero, -0.55) : shade(pal.deep, 0.14);
      roundRect(g, b.x, b.y, b.w, b.h, Math.max(10, t.radius * 0.7));
      g.fill();
      g.strokeStyle = on ? pal.hero : shade(pal.deep, 0.3);
      g.lineWidth = 2;
      roundRect(g, b.x, b.y, b.w, b.h, Math.max(10, t.radius * 0.7));
      g.stroke();

      const cx = b.x + b.w / 2;
      g.textAlign = "center";
      // glyph
      g.strokeStyle = cool ? shade(pal.hero, -0.5) : on ? pal.hero : shade(pal.hero, -0.25);
      g.lineWidth = 2.5;
      const gy = b.y + b.h * 0.36;
      if (b.id === "flash") {
        g.beginPath();
        g.moveTo(cx - 9, gy + 7);
        g.lineTo(cx + 2, gy - 8);
        g.lineTo(cx - 1, gy);
        g.lineTo(cx + 9, gy - 1);
        g.lineTo(cx - 3, gy + 9);
        g.closePath();
        g.stroke();
      } else {
        g.beginPath();
        g.rect(cx - 10, gy - 9, 20, 18);
        g.stroke();
        if (on) {
          g.fillStyle = shade(pal.hero, -0.3);
          g.fillRect(cx - 10, gy - 9, 20, 18);
        }
      }
      g.fillStyle = on ? pal.hero : shade(pal.hero, -0.3);
      g.font = `800 12px ${t.fontBody}`;
      g.fillText(b.label, cx, b.y + b.h * 0.72);
      g.fillStyle = on ? shade(pal.hero, 0.35) : shade(pal.hero, -0.45);
      g.font = `600 9px ${t.fontBody}`;
      g.fillText(
        b.id === "flash" ? (cool ? "…" : "look") : on ? "SHUT" : "open",
        cx,
        b.y + b.h * 0.88
      );
    }
    g.textAlign = "left";
  };

  /** Grain, scanlines, and the dark closing in. The room is never clean. */
  const drawGrain = (amount: number) => {
    g.globalAlpha = 0.05 + amount * 0.09;
    g.fillStyle = pal.hero;
    for (let i = 0; i < 40; i++) {
      g.fillRect(rand(0, W), rand(0, roomH), rand(1, 40), 1);
    }
    g.globalAlpha = 1;
    g.globalAlpha = 0.06;
    g.fillStyle = "#000";
    for (let y = 0; y < roomH; y += 3) g.fillRect(0, y, W, 1);
    g.globalAlpha = 1;
    const vig = g.createRadialGradient(W / 2, roomH * 0.45, roomH * 0.2, W / 2, roomH * 0.45, roomH * 0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, `rgba(0,0,0,${0.55 + amount * 0.4})`);
    g.fillStyle = vig;
    g.fillRect(0, 0, W, roomH);
  };

  const drawScare = (t: ReturnType<typeof ctx.getTheme>) => {
    const k = scare;
    // static
    g.fillStyle = shade(pal.deep, -0.8);
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.35;
    g.fillStyle = pal.glow;
    for (let i = 0; i < 60; i++) {
      g.fillRect(0, rand(0, H), W, rand(1, 5));
    }
    g.globalAlpha = 1;
    if (k < 1.25) {
      const punch = Math.min(1, k * 5);
      const r = Math.min(W, H) * (0.28 + punch * 0.42) + Math.sin(k * 40) * 6;
      g.globalAlpha = 0.5 + Math.sin(k * 30) * 0.3;
      g.fillStyle = pal.glow;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      drawNicHead(g, {
        x: W / 2 + Math.sin(k * 47) * 10,
        y: H * 0.44 + Math.cos(k * 39) * 8,
        r,
        skin: shade(pal.foe, 0.1),
        hair: shade(pal.deep, 0.05),
        eye: "#ffffff",
        pupil: shade(pal.deep, -0.6),
        dark: shade(pal.glow, -0.78), // the throat, not a hole
        tooth: "#ffffff",
        lean: Math.sin(k * 26) * 0.08,
        gaze: 0,
        gape: 1,
        scowl: 1,
        glowEyes: pal.glow,
      });
      g.textAlign = "center";
      g.fillStyle = "#ffffff";
      g.font = `900 22px ${t.fontDisplay}`;
      g.shadowColor = pal.glow;
      g.shadowBlur = 18;
      g.globalAlpha = Math.sin(k * 24) > 0 ? 1 : 0.25;
      g.fillText(caught ? caught.name : "NIC", W / 2, H * 0.9);
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      g.textAlign = "left";
    } else {
      endCard(g, t, W, H, caught?.route === "drain" ? "UNDER THE CHAIR" : "HE GOT IN");
      g.textAlign = "center";
      g.fillStyle = t.inkDim;
      g.font = `600 12px ${t.fontBody}`;
      g.fillText(
        `night ${night} · ${hourLabel()} · ${clearedHours} hour${clearedHours === 1 ? "" : "s"} survived`,
        W / 2,
        H * 0.33 + 132
      );
      g.textAlign = "left";
    }
  };

  const loop = makeLoop((dt) => {
    const t = ctx.getTheme();
    if (!over) step(dt);
    else scare += dt;

    g.save();
    if (shake > 0) {
      g.translate(rand(-1, 1) * shake * 9, rand(-1, 1) * shake * 9);
    }

    g.fillStyle = shade(pal.deep, -0.1);
    g.fillRect(-20, -20, W + 40, H + 40);

    if (over && scare > 0.08) {
      g.restore();
      drawScare(t);
      return;
    }

    drawRoom(t);
    drawOpening("L", stalkers[0], t);
    drawOpening("R", stalkers[1], t);
    drawPump(t);
    drawGrain(power <= 0 ? 1 : 1 - bulb);

    if (power <= 0) {
      g.fillStyle = `rgba(0,0,0,${Math.min(0.92, 0.4 + blackout * 0.2)})`;
      g.fillRect(0, 0, W, roomH);
      g.textAlign = "center";
      g.fillStyle = pal.glow;
      g.font = `900 20px ${t.fontDisplay}`;
      g.globalAlpha = Math.sin(elapsed * 8) > 0 ? 1 : 0.2;
      g.fillText("POWER OUT", W / 2, roomH * 0.5);
      g.globalAlpha = 1;
      g.textAlign = "left";
    }

    // the face that isn't there
    if (hallucination > 0) {
      g.globalAlpha = Math.min(1, hallucination * 5);
      drawNicHead(g, {
        x: halluX,
        y: halluY,
        r: Math.min(W, roomH) * 0.3,
        skin: shade(pal.foe, 0.2),
        hair: shade(pal.deep, 0.1),
        eye: "#ffffff",
        pupil: shade(pal.deep, -0.6),
        dark: shade(pal.deep, -0.7),
        tooth: "#ffffff",
        gape: 0.9,
        scowl: 1,
        glowEyes: pal.glow,
      });
      g.globalAlpha = 1;
    }

    drawHud(t);
    drawButtons(t);

    if (toastT > 0) {
      g.textAlign = "center";
      g.globalAlpha = Math.min(1, toastT * 1.6);
      g.fillStyle = shade(pal.prize, 0.2);
      g.font = `800 16px ${t.fontDisplay}`;
      g.fillText(toast, W / 2, roomTop + 26);
      g.globalAlpha = 1;
      g.textAlign = "left";
    } else if (clearedHours === 0 && night === 1 && elapsed < 6) {
      g.textAlign = "center";
      g.fillStyle = shade(pal.hero, -0.3);
      g.font = `600 12px ${t.fontBody}`;
      g.fillText(
        "shut a door only when he's in it — power is the clock",
        W / 2,
        roomTop + 26
      );
      g.textAlign = "left";
    }

    g.restore();
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
      if (!on) reset();
      else autoT = 0.2;
    },
  };
}

const mod: GameModule = { meta, mount };
export default mod;
