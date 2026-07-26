import type { GameContext, GameInstance, GameModule } from "@/games/types";
import { makeLoop, pick, clamp, roundRect } from "@/games/engine";
import {
  createFx,
  createCombo,
  drawBackdrop,
  drawCombo,
  resultCard,
  pips,
  hexA,
  halo,
  pulse,
  easeOutBack,
  easeOutCubic,
  groundInk,
} from "@/games/fx";

const meta = {
  slug: "word-trap",
  title: "Label Trap",
  rule: "Does the label match the colour? Yes or no",
  year: 1935,
  description: "The Stroop test, run on one fridge. Your brain will lie to you.",
  history:
    "John Ridley Stroop published the colour-word interference effect in 1935. Ninety years later it still short-circuits brains — now it does it with a label.",
  tags: ["precision", "calm"],
  palette: {
    hero: "#1f6fd0",
    foe: "#d81f2a",
    prize: "#e8a33d",
    deep: "#171a24",
    glow: "#ded3b6",
  },
  intensity: 0.35,
  luck: 0.1,
  nostalgia: 0.5,
  sessionLength: 0.4,
  scoreUnit: "pts",
  maxScorePerSecond: 8,
} satisfies GameModule["meta"];

// Colour names map onto the game palette so every card recolours cleanly.
const ROLES = ["VIOLET", "ROSE", "AZURE", "MINT"] as const;
type Role = (typeof ROLES)[number];

function mount(ctx: GameContext): GameInstance {
  const { g, width: W, height: H, pal } = ctx;
  const fx = createFx();
  const combo = createCombo(4);

  let score = 0;
  let lives = 3;
  let over = false;
  let overAge = 0;
  let best = 0;
  let word: Role = "VIOLET";
  let colour: Role = "VIOLET";
  let timer = 2.4;
  let window_ = 2.4;
  let answered = 0;
  let cardAge = 0; // drives the prompt's entrance
  let verdict: { right: boolean; t: number; side: boolean } | null = null;
  let clock = 0;
  let fastest = Infinity;

  const roleColour = (role: Role): string => {
    switch (role) {
      case "VIOLET":
        return pal.hero;
      case "ROSE":
        return pal.foe;
      case "AZURE":
        return pal.prize;
      case "MINT":
        return pal.glow;
    }
  };

  const nextPrompt = () => {
    word = pick(ROLES);
    // a coin flip, so guessing pays nothing over a run
    colour = Math.random() < 0.5 ? word : pick(ROLES.filter((r) => r !== word));
    window_ = Math.max(0.8, 2.4 - answered * 0.05);
    timer = window_;
    cardAge = 0;
  };

  const reset = () => {
    score = 0;
    lives = 3;
    answered = 0;
    fastest = Infinity;
    over = false;
    overAge = 0;
    verdict = null;
    combo.clear();
    fx.clear();
    ctx.onScore(0);
    nextPrompt();
  };

  const buttons = () => {
    const bw = W * 0.36;
    const bh = 66;
    const y = H * 0.68;
    return {
      no: { x: W * 0.5 - bw - 8, y, w: bw, h: bh },
      yes: { x: W * 0.5 + 8, y, w: bw, h: bh },
    };
  };

  const wrong = (x: number, y: number, why: string) => {
    const th = ctx.getTheme();
    const hud = groundInk(th, pal.deep);
    lives -= 1;
    combo.break();
    ctx.haptic("fail");
    verdict = { right: false, t: 0.45, side: false };
    fx.shake(13);
    fx.flash(pal.foe, 0.3);
    fx.burst(x, y, {
      count: 18,
      colour: [pal.foe, "#ffffff"],
      speed: 250,
      life: 0.5,
      size: 4,
      gravity: 300,
      kind: "square",
    });
    if (lives <= 0) {
      over = true;
      overAge = 0;
      best = Math.max(best, score);
      ctx.onRunEnd(score);
    } else {
      fx.pop(W / 2, H * 0.52, why, pal.foe, 22, th.fontDisplay);
      nextPrompt();
    }
  };

  const answer = (said: boolean) => {
    const th = ctx.getTheme();
    const truth = word === colour;
    const b = buttons();
    const btn = said ? b.yes : b.no;
    const cx = btn.x + btn.w / 2;
    const cy = btn.y + btn.h / 2;

    if (said === truth) {
      const took = window_ - timer;
      fastest = Math.min(fastest, took);
      // answering fast is worth more than answering safe
      const snap = took < window_ * 0.35;
      const gained = (snap ? 2 : 1) * combo.hit();
      score += gained;
      answered += 1;
      ctx.onScore(score);
      ctx.haptic("hit");
      verdict = { right: true, t: 0.3, side: said };
      fx.ring(cx, cy, pal.prize, 30, 5);
      fx.burst(cx, cy, {
        count: snap ? 20 : 10,
        colour: [pal.prize, pal.glow],
        speed: 220,
        life: 0.45,
        size: 3.5,
      });
      fx.pop(
        cx,
        cy - 40,
        snap ? `SNAP +${gained}` : `+${gained}`,
        pal.prize,
        snap ? 22 : 19,
        th.fontDisplay
      );
      nextPrompt();
    } else {
      wrong(cx, cy, truth ? "IT MATCHED" : "IT DIDN'T");
    }
  };

  const onDown = (e: PointerEvent) => {
    if (over) {
      if (overAge > 0.25) reset();
      return;
    }
    const r = ctx.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    // the whole left half is NOPE, the whole right half is MATCH — the
    // buttons are where the eye looks, the target is half the screen
    answer(x > W / 2);
  };
  ctx.canvas.addEventListener("pointerdown", onDown);

  nextPrompt();

  let auto = false;
  let autoCd = 0;

  const loop = makeLoop((dt) => {
    const th = ctx.getTheme();
    const hud = groundInk(th, pal.deep);
    clock += dt;
    cardAge += dt;
    fx.update(dt);
    combo.update(dt);
    if (verdict) {
      verdict.t -= dt;
      if (verdict.t <= 0) verdict = null;
    }

    if (over) {
      overAge += dt;
    } else {
      // attract mode: answer with a believable beat of hesitation
      if (auto) {
        autoCd -= dt;
        if (autoCd <= 0 && cardAge > 0.4) {
          answer(word === colour);
          autoCd = 0.15;
        }
      }
      timer -= dt;
      if (timer <= 0) wrong(W / 2, H * 0.44, "TOO SLOW");
    }

    drawBackdrop(g, W, H, pal, clock, {
      kind: "blobs",
      intensity: 0.6,
      vignette: 0.6,
    });

    fx.begin(g);
    fx.drawUnder(g);

    // ---- the prompt card
    const enter = easeOutBack(clamp(cardAge / 0.26, 0, 1));
    const wordY = H * 0.4;
    const ink = roleColour(colour);
    const cw = W * 0.78;
    const ch = 150;

    // the fuse ring, behind the card
    const frac = clamp(timer / window_, 0, 1);
    const rr = Math.min(W * 0.42, ch * 0.92);
    g.strokeStyle = hexA(hud.main, 0.1);
    g.lineWidth = 5;
    g.beginPath();
    g.arc(W / 2, wordY, rr, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = frac < 0.3 ? pal.foe : pal.glow;
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.arc(W / 2, wordY, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    g.stroke();
    g.lineCap = "butt";

    g.save();
    g.translate(W / 2, wordY);
    g.scale(0.85 + enter * 0.15, 0.85 + enter * 0.15);
    g.globalAlpha = clamp(cardAge / 0.14, 0, 1);

    g.fillStyle = hexA("#000000", 0.35);
    roundRect(g, -cw / 2 + 2, -ch / 2 + 5, cw, ch, 26);
    g.fill();
    g.fillStyle = hexA(th.surface, 0.9);
    roundRect(g, -cw / 2, -ch / 2, cw, ch, 26);
    g.fill();
    g.strokeStyle = hexA(
      verdict ? (verdict.right ? pal.prize : pal.foe) : ink,
      verdict ? 0.9 : 0.4
    );
    g.lineWidth = 2;
    roundRect(g, -cw / 2 + 1, -ch / 2 + 1, cw - 2, ch - 2, 25);
    g.stroke();

    halo(g, 0, 10, cw * 0.5, ink, 0.28);
    g.textAlign = "center";
    // the word, rendered in the (probably lying) ink colour
    const size = Math.min(54, (cw * 0.82) / (word.length * 0.6));
    g.fillStyle = hexA("#000000", 0.3);
    g.font = `900 ${size}px ${th.fontDisplay}`;
    g.fillText(word, 2, 20);
    g.fillStyle = ink;
    g.fillText(word, 0, 17);

    g.fillStyle = hexA(hud.dim, 0.9);
    g.font = `700 11px ${th.fontBody}`;
    g.fillText("DOES THE INK MATCH THE WORD?", 0, -ch / 2 + 30);
    g.restore();
    g.globalAlpha = 1;

    // ---- the answer buttons
    const b = buttons();
    const drawBtn = (
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
      col: string,
      hot: boolean
    ) => {
      const lift = hot ? easeOutCubic(clamp((verdict?.t ?? 0) / 0.3, 0, 1)) : 0;
      g.fillStyle = hexA("#000000", 0.32);
      roundRect(g, x + 2, y + 5 - lift * 3, w, h, 20);
      g.fill();
      const grad = g.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, hexA(col, 0.36 + lift * 0.5));
      grad.addColorStop(1, hexA(col, 0.16 + lift * 0.3));
      g.fillStyle = grad;
      roundRect(g, x, y - lift * 3, w, h, 20);
      g.fill();
      g.strokeStyle = hexA(col, 0.72 + lift * 0.28);
      g.lineWidth = 2;
      roundRect(g, x + 1, y + 1 - lift * 3, w - 2, h - 2, 19);
      g.stroke();
      g.textAlign = "center";
      g.fillStyle = col;
      g.font = `900 23px ${th.fontDisplay}`;
      g.fillText(label, x + w / 2, y + h / 2 + 9 - lift * 3);
    };
    const hotSide = verdict?.right ? verdict.side : undefined;
    drawBtn(b.no.x, b.no.y, b.no.w, b.no.h, "NOPE", pal.foe, hotSide === false);
    drawBtn(b.yes.x, b.yes.y, b.yes.w, b.yes.h, "MATCH", pal.prize, hotSide === true);

    // ---- HUD
    pips(g, W / 2, H * 0.11, 3, lives, pal.prize, hud.main, 6);
    drawCombo(g, combo, W / 2, H * 0.19, pal.prize, th.fontDisplay, clock);

    if (answered === 0 && !over) {
      g.textAlign = "center";
      g.fillStyle = hexA(hud.main, 0.35 + pulse(clock, 1.6) * 0.35);
      g.font = `700 13px ${th.fontBody}`;
      g.fillText("tap either side of the screen", W / 2, H * 0.79);
    }
    g.textAlign = "left";

    fx.drawOver(g, W, H);
    fx.end(g);

    if (over) {
      resultCard(g, th, W, H, {
        title: "trapped",
        score,
        unit: meta.scoreUnit,
        best,
        sub:
          fastest < Infinity
            ? `${answered} right · fastest ${fastest.toFixed(2)}s`
            : `${answered} right`,
        age: overAge,
        accent: pal.glow,
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
