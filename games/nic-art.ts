// Nic-world sprite kit.
//
// Every game in the feed keeps its mechanic exactly as it was; only the art
// changed. These are the shapes that changed it: cans, jars, wraps, feet and
// shades, drawn from primitives so nothing ships as an asset.
//
// Hard rule from PROJECT.md: no hard-coded colours in /games. Every function
// here takes its colours as arguments, so callers feed them from `ctx.pal`
// and `ctx.getTheme()` and a theme switch still recolours mid-run.
//
// The cans are original art — a silver body with a red sweep, and a blue
// body with a twin chevron. No wordmarks, no borrowed trade dress.

import { roundRect, shade } from "@/games/engine";

export interface CanSkin {
  /** the metal */
  body: string;
  /** the sweep / chevron that says which drink this is */
  band: string;
  /** lid and base rims */
  rim: string;
}

export type CanKind = "cola" | "energy";

/**
 * Builds the two can skins out of a game's palette, so Perfect Pour and
 * Can Stack read as the same fridge without either one hard-coding silver.
 */
export function skins(pal: {
  hero: string;
  foe: string;
  prize: string;
  glow: string;
}): Record<CanKind, CanSkin> {
  return {
    cola: { body: pal.glow, band: pal.foe, rim: shade(pal.glow, -0.3) },
    energy: { body: pal.hero, band: pal.prize, rim: shade(pal.hero, -0.3) },
  };
}

/**
 * An upright can, centred on (cx, cy). `crushed` squashes and tilts it for
 * the empties piles. Everything scales off w/h so the same call works at
 * 14px in a snake body and at 90px as a hero sprite.
 */
export function drawCan(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  skin: CanSkin,
  kind: CanKind = "cola",
  crushed = false
) {
  g.save();
  g.translate(cx, cy);
  if (crushed) {
    g.rotate(0.5);
    g.scale(1, 0.62);
  }
  const x = -w / 2;
  const y = -h / 2;
  const r = w * 0.22;

  // body
  g.fillStyle = skin.body;
  roundRect(g, x, y, w, h, r);
  g.fill();

  // the drink's mark: cola gets a sweep across the waist, energy gets a
  // twin chevron. Both clipped to the body so they wrap like a print.
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  g.fillStyle = skin.band;
  if (kind === "cola") {
    g.beginPath();
    g.moveTo(x, y + h * 0.62);
    g.quadraticCurveTo(x + w * 0.5, y + h * 0.34, x + w, y + h * 0.56);
    g.lineTo(x + w, y + h * 0.78);
    g.quadraticCurveTo(x + w * 0.5, y + h * 0.56, x, y + h * 0.84);
    g.closePath();
    g.fill();
  } else {
    for (let i = 0; i < 2; i++) {
      const cy2 = y + h * (0.44 + i * 0.2);
      g.beginPath();
      g.moveTo(x + w * 0.16, cy2);
      g.lineTo(x + w * 0.52, cy2 + h * 0.1);
      g.lineTo(x + w * 0.86, cy2);
      g.lineTo(x + w * 0.52, cy2 + h * 0.17);
      g.closePath();
      g.fill();
    }
  }
  // metal highlight down the left shoulder
  g.fillStyle = shade(skin.body, 0.45);
  g.fillRect(x + w * 0.14, y + h * 0.08, w * 0.1, h * 0.84);
  g.restore();

  // lid + base rims read as aluminium
  g.fillStyle = skin.rim;
  g.beginPath();
  g.ellipse(0, y + h * 0.03, w * 0.42, h * 0.055, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(0, y + h * 0.97, w * 0.42, h * 0.05, 0, 0, Math.PI * 2);
  g.fill();

  g.restore();
}

/**
 * How tall each can stands relative to its width. The energy can is the slim
 * tall one and the cola can is the squat one — at collectible size that
 * silhouette is doing more work than either mark, because a 16px sweep and a
 * 16px chevron are both just a smudge.
 */
export const CAN_ASPECT: Record<CanKind, number> = { cola: 1.62, energy: 2.15 };

/**
 * A collectible can sized off one number. `size` is the width; the height
 * follows from the kind, so a field of pickups keeps both drinks in
 * proportion without every caller doing the arithmetic.
 */
export function drawDrink(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  skin: CanSkin,
  kind: CanKind = "cola",
  spin = 0
) {
  g.save();
  g.translate(cx, cy);
  g.rotate(spin);
  drawCan(g, 0, 0, size, size * CAN_ASPECT[kind], skin, kind);
  g.restore();
}

/** A can seen from above — snake segments, stack tops, grid tiles. */
export function drawCanTop(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  skin: CanSkin
) {
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = skin.rim;
  g.fill();
  g.beginPath();
  g.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
  g.fillStyle = skin.body;
  g.fill();
  // the tab
  g.fillStyle = skin.band;
  roundRect(g, cx - r * 0.42, cy - r * 0.14, r * 0.84, r * 0.28, r * 0.14);
  g.fill();
}

/** Carbonation. Cheap bubbles for pours, fizz bursts and thrust trails. */
export function drawBubbles(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spread: number,
  count: number,
  colour: string,
  seed = 0
) {
  g.fillStyle = colour;
  for (let i = 0; i < count; i++) {
    // deterministic scatter — no per-frame Math.random, so bubbles hold still
    const a = ((i * 2.399 + seed) % (Math.PI * 2)) - Math.PI;
    const d = ((i * 0.618 + seed * 0.3) % 1) * spread;
    const rr = 1.4 + (((i * 0.37 + seed) % 1) * spread) / 14;
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, rr, 0, Math.PI * 2);
    g.fill();
  }
}

/** Peanut butter jar. Squat, amber, lid on top. */
export function drawJar(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  glass: string,
  lid: string,
  label: string
) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const lidH = h * 0.22;

  g.fillStyle = glass;
  roundRect(g, x, y + lidH, w, h - lidH, w * 0.16);
  g.fill();

  g.fillStyle = label;
  g.fillRect(x, y + h * 0.5, w, h * 0.26);

  g.fillStyle = lid;
  roundRect(g, x - w * 0.04, y, w * 1.08, lidH, w * 0.08);
  g.fill();
}

/** A blob of peanut butter — the thing that slows you down. */
export function drawBlob(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  colour: string,
  seed = 0
) {
  g.fillStyle = colour;
  g.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const wob = 1 + Math.sin(a * 3 + seed) * 0.14;
    const px = cx + Math.cos(a) * r * wob;
    const py = cy + Math.sin(a) * r * wob * 0.86;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
}

/** Granola wrap — a rolled tortilla with the cut end showing the filling. */
export function drawWrap(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot: number,
  tortilla: string,
  filling: string
) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);

  g.fillStyle = tortilla;
  roundRect(g, -w / 2, -h / 2, w, h, h * 0.42);
  g.fill();

  // the cut face
  g.fillStyle = filling;
  g.beginPath();
  g.ellipse(w / 2 - h * 0.3, 0, h * 0.24, h * 0.42, 0, 0, Math.PI * 2);
  g.fill();

  // oat flecks
  g.fillStyle = shade(tortilla, -0.28);
  for (let i = 0; i < 4; i++) {
    g.fillRect(-w * 0.34 + i * w * 0.19, -h * 0.14, w * 0.06, h * 0.1);
  }

  g.restore();
}

/** A granola crumb. Chunky, angular, scatters everywhere. */
export function drawCrumb(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  colour: string,
  seed = 0
) {
  g.fillStyle = colour;
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + seed;
    const rr = r * (0.66 + ((i * 0.41 + seed) % 1) * 0.44);
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
}

/** The foot cam's star. Sole plus five toes, pointing along +x when rot=0. */
export function drawFoot(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  rot: number,
  skin: string,
  nail: string
) {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);

  const w = len * 0.52;
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(-len * 0.08, 0, len * 0.42, w * 0.5, 0, 0, Math.PI * 2);
  g.fill();

  // toes, biggest to smallest along the leading edge
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const r = w * (0.19 - t * 0.055);
    const px = len * 0.33 + Math.sin(t * 1.5) * len * 0.03;
    const py = -w * 0.3 + t * w * 0.62;
    g.fillStyle = skin;
    g.beginPath();
    g.arc(px, py, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = nail;
    g.beginPath();
    g.arc(px + r * 0.34, py, r * 0.42, 0, Math.PI * 2);
    g.fill();
  }

  g.restore();
}

/** Sunglasses. Worn indoors, obviously. */
export function drawShades(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  lens: string,
  frame: string
) {
  const lw = w * 0.42;
  const lh = w * 0.3;

  g.fillStyle = frame;
  g.fillRect(cx - w * 0.09, cy - lh * 0.18, w * 0.18, lh * 0.26);

  for (const s of [-1, 1]) {
    const x = cx + s * (w * 0.5 - lw / 2) - lw / 2;
    g.fillStyle = frame;
    roundRect(g, x - 2, cy - lh / 2 - 2, lw + 4, lh + 4, lh * 0.44);
    g.fill();
    g.fillStyle = lens;
    roundRect(g, x, cy - lh / 2, lw, lh, lh * 0.4);
    g.fill();
    // glare streak
    g.fillStyle = shade(lens, 0.5);
    g.save();
    roundRect(g, x, cy - lh / 2, lw, lh, lh * 0.4);
    g.clip();
    g.beginPath();
    g.moveTo(x + lw * 0.1, cy + lh);
    g.lineTo(x + lw * 0.44, cy - lh);
    g.lineTo(x + lw * 0.62, cy - lh);
    g.lineTo(x + lw * 0.28, cy + lh);
    g.closePath();
    g.fill();
    g.restore();
  }
}

/**
 * The basement floor. A soft vignette wash used as the ground layer wherever
 * a game used to fill a flat gradient, so all sixteen cards feel like one room.
 */
export function drawRoom(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  deep: string,
  glow: string
) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, shade(deep, -0.1));
  grad.addColorStop(1, shade(deep, -0.62));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // monitor bloom off the back wall
  const bloom = g.createRadialGradient(W * 0.5, H * 0.22, 0, W * 0.5, H * 0.22, W * 0.8);
  bloom.addColorStop(0, `${glow}22`);
  bloom.addColorStop(1, `${glow}00`);
  g.fillStyle = bloom;
  g.fillRect(0, 0, W, H);
}
