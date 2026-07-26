// The headshot. One face, one file, every game.
//
// Nic shows up in more than one card now, and the whole joke only lands if
// it is unmistakably the *same* head each time — same jaw, same swoop, same
// dead-eyed stare — whether it is shuffling across a lane in Nic's Basement
// or filling the screen at 4 AM in Five Nights. So the head lives here and
// nowhere else; callers pass colours and a pose, never geometry.
//
// Real photo, zero code: drop a square headshot at `public/nic.jpg` and every
// game switches to it automatically — it gets masked into the same head
// shape, lit by the same lamp, and wears the same eyes and mouth on top. No
// file, no problem: the vector head below is the fallback and always draws.

import { roundRect, shade } from "@/games/engine";

const PHOTO_URL = "/nic.jpg";

let photo: HTMLImageElement | null = null;
let photoTried = false;

/** Point every game at a headshot at runtime (overrides `public/nic.jpg`). */
export function setNicPhoto(url: string) {
  photoTried = true;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    photo = img;
  };
  img.onerror = () => {
    photo = null;
  };
  img.src = url;
}

/**
 * Kicked off the first time any game draws the head. If the file isn't there
 * the load fails once, quietly, and we never ask again.
 */
function ensurePhoto() {
  if (photoTried || typeof window === "undefined") return;
  photoTried = true;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    photo = img;
  };
  img.onerror = () => {
    photo = null;
  };
  img.src = PHOTO_URL;
}

/** True once a real headshot is available, for callers that want to lean in. */
export function hasNicPhoto(): boolean {
  return photo !== null;
}

export interface NicHeadOpts {
  x: number;
  y: number;
  /** half-height of the skull; the head is ~0.92r wide */
  r: number;
  skin: string;
  hair: string;
  eye: string; // sclera
  pupil: string;
  dark: string; // mouth interior
  tooth: string;
  /** head tilt in radians */
  lean?: number;
  /** pupil offset, -1 (hard left) .. 1 (hard right) */
  gaze?: number;
  /** 0 = mouth shut, 1 = unhinged */
  gape?: number;
  /** brow anger, 0 = neutral, 1 = full scowl */
  scowl?: number;
  /** draws the eyes as burning points instead of pupils */
  glowEyes?: string;
  /** 0..1 — how much of the head is swallowed by the dark */
  shadowed?: number;
}

/** Draws Nic, facing you, centred on (x, y). */
export function drawNicHead(g: CanvasRenderingContext2D, o: NicHeadOpts) {
  ensurePhoto();
  const { x, y, r, skin, hair, eye, pupil, dark, tooth } = o;
  const lean = o.lean ?? 0;
  const gaze = o.gaze ?? 0;
  const gape = Math.max(0, Math.min(1, o.gape ?? 0));
  const scowl = Math.max(0, Math.min(1, o.scowl ?? 0));

  g.save();
  g.translate(x, y);
  g.rotate(lean);

  // skull behind the face, so the silhouette never reads flat
  g.fillStyle = shade(skin, -0.22);
  g.beginPath();
  g.ellipse(0, r * 0.12, r * 0.92, r, 0, 0, Math.PI * 2);
  g.fill();

  const headPath = () => {
    g.beginPath();
    g.ellipse(-r * 0.08, r * 0.06, r * 0.86, r * 0.95, 0, 0, Math.PI * 2);
  };

  if (photo) {
    // the real thing, masked into the same skull
    g.save();
    headPath();
    g.clip();
    const s = (r * 2.1) / Math.min(photo.width, photo.height);
    const pw = photo.width * s;
    const ph = photo.height * s;
    g.drawImage(photo, -pw / 2 - r * 0.08, -ph / 2 + r * 0.02, pw, ph);
    // lit by whatever lamp the game is running: tint, never replace
    g.globalCompositeOperation = "multiply";
    g.fillStyle = skin;
    g.globalAlpha = 0.55;
    headPath();
    g.fill();
    g.restore();
  } else {
    g.fillStyle = skin;
    headPath();
    g.fill();
    // ears
    g.beginPath();
    g.ellipse(-r * 0.92, r * 0.1, r * 0.16, r * 0.24, 0, 0, Math.PI * 2);
    g.ellipse(r * 0.86, r * 0.1, r * 0.16, r * 0.24, 0, 0, Math.PI * 2);
    g.fill();
    // hair: one stubborn swoop
    g.fillStyle = hair;
    g.beginPath();
    g.moveTo(-r * 0.95, -r * 0.28);
    g.quadraticCurveTo(-r * 0.7, -r * 1.25, r * 0.15, -r * 1.05);
    g.quadraticCurveTo(r * 1.05, -r * 0.95, r * 0.9, -r * 0.15);
    g.quadraticCurveTo(r * 0.55, -r * 0.62, r * 0.05, -r * 0.5);
    g.quadraticCurveTo(-r * 0.45, -r * 0.42, -r * 0.95, -r * 0.28);
    g.closePath();
    g.fill();
  }

  // eyes — dead white, pupils on their own schedule
  const drift = gaze * r * 0.1;
  if (o.glowEyes) {
    g.fillStyle = o.dark;
    g.beginPath();
    g.ellipse(-r * 0.36, 0, r * 0.28, r * 0.26, 0, 0, Math.PI * 2);
    g.ellipse(r * 0.34, -r * 0.02, r * 0.28, r * 0.26, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = o.glowEyes;
    g.shadowColor = o.glowEyes;
    g.shadowBlur = r * 0.7;
    g.beginPath();
    g.arc(-r * 0.36 + drift, r * 0.02, r * 0.1, 0, Math.PI * 2);
    g.arc(r * 0.34 + drift * 0.5, 0, r * 0.1, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  } else {
    g.fillStyle = eye;
    g.beginPath();
    g.ellipse(-r * 0.36, 0, r * 0.24, r * 0.22, 0, 0, Math.PI * 2);
    g.ellipse(r * 0.34, -r * 0.02, r * 0.24, r * 0.22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = pupil;
    g.beginPath();
    g.arc(-r * 0.36 + drift, r * 0.03, r * 0.09, 0, Math.PI * 2);
    g.arc(r * 0.34 + drift * 0.5, r * 0.01, r * 0.09, 0, Math.PI * 2);
    g.fill();
  }

  // brows
  g.strokeStyle = hair;
  g.lineWidth = Math.max(1, r * 0.13);
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-r * 0.62, -r * (0.34 + scowl * 0.06));
  g.lineTo(-r * 0.12, -r * (0.24 - scowl * 0.16));
  g.moveTo(r * 0.12, -r * (0.28 - scowl * 0.14));
  g.lineTo(r * 0.6, -r * (0.4 + scowl * 0.06));
  g.stroke();

  // stubble
  if (!photo) {
    g.fillStyle = shade(skin, -0.3);
    g.globalAlpha = 0.5;
    g.beginPath();
    g.ellipse(-r * 0.05, r * 0.62, r * 0.62, r * 0.34, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  // mouth
  const open = r * (0.22 + gape * 0.62);
  g.fillStyle = dark;
  roundRect(g, -r * (0.3 + gape * 0.12), r * 0.4, r * (0.6 + gape * 0.24), open, r * 0.14);
  g.fill();
  g.fillStyle = tooth;
  const tw = r * 0.14;
  const th = r * (0.16 + gape * 0.12);
  g.fillRect(-r * 0.2, r * 0.4, tw, th);
  g.fillRect(r * 0.06, r * 0.4, tw, th);
  if (gape > 0.5) {
    // bottom row shows up once the jaw is genuinely wrong
    g.fillRect(-r * 0.14, r * 0.4 + open - th * 0.8, tw, th * 0.8);
    g.fillRect(r * 0.0, r * 0.4 + open - th * 0.8, tw, th * 0.8);
  }

  if (o.shadowed) {
    g.globalAlpha = Math.min(1, o.shadowed);
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(-r * 0.08, r * 0.06, r * 0.9, r * 0.99, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  g.restore();
}
