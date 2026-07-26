// The two real photographs the feed is built around: the basement itself, and
// the man in it.
//
// Drop the files at the paths below and every game picks them up — the room
// becomes the backdrop behind the play field, and the headshot becomes the
// face on the cards. Until then every helper here returns false and the caller
// falls back to its drawn art, so a missing file never breaks a build, never
// blanks a card, and never shows a broken image.
//
//   public/nic/basement.jpg   the room: kitchen, desk, drum kit, ping pong
//   public/nic/headshot.png   the headshot, aviators on, indoors
//
// Loading is lazy and shared: the first game to ask kicks off one fetch per
// image for the whole session, and every later card draws the cached bitmap.

export type PhotoId = "basement" | "headshot";

const SRC: Record<PhotoId, string> = {
  basement: "/nic/basement.jpg",
  headshot: "/nic/headshot.png",
};

interface Slot {
  img: HTMLImageElement;
  ok: boolean;
  failed: boolean;
}

const slots = new Map<PhotoId, Slot>();

/**
 * The decoded bitmap, or null while it is still loading or if the file is not
 * there. Never throws, never blocks a frame.
 */
export function photo(id: PhotoId): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  let s = slots.get(id);
  if (!s) {
    const img = new Image();
    s = { img, ok: false, failed: false };
    slots.set(id, s);
    img.onload = () => {
      s!.ok = true;
    };
    img.onerror = () => {
      s!.failed = true;
    };
    img.src = SRC[id];
  }
  return s.ok ? s.img : null;
}

/** True once the file has been confirmed missing — lets callers stop asking. */
export function photoMissing(id: PhotoId): boolean {
  return slots.get(id)?.failed ?? false;
}

/**
 * Draws an image cover-fit into a rect: fills it completely, centre-cropping
 * the overflow, the way `background-size: cover` does. Games are 390x844 and
 * the room photo is a wide strip, so without this it would letterbox badly.
 */
function cover(
  g: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ir = img.naturalWidth / img.naturalHeight;
  const rr = w / h;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (ir > rr) sw = img.naturalHeight * rr;
  else sh = img.naturalWidth / rr;
  g.drawImage(
    img,
    (img.naturalWidth - sw) / 2,
    (img.naturalHeight - sh) / 2,
    sw,
    sh,
    x,
    y,
    w,
    h
  );
}

/**
 * The basement, behind the play field. `dim` is how far to sink it toward the
 * game's own deep colour so the sprites still read on top — 0 is the raw
 * photo, 1 is fully covered.
 *
 * Returns false if the photo is not available, so the caller can fall through
 * to its usual backdrop.
 */
export function drawBasement(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  deep: string,
  dim = 0.62
): boolean {
  const img = photo("basement");
  if (!img) return false;

  cover(g, img, 0, 0, W, H);

  // sink it back so the game reads in front of the room
  g.save();
  g.globalAlpha = dim;
  g.fillStyle = deep;
  g.fillRect(0, 0, W, H);
  g.restore();

  // the monitor glow that lights the room from the desk
  const bloom = g.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, W);
  bloom.addColorStop(0, "rgba(255,255,255,.07)");
  bloom.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = bloom;
  g.fillRect(0, 0, W, H);

  // vignette, so the edges of the crop never announce themselves
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.78);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,.55)");
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);

  return true;
}

/**
 * The headshot, circle-masked, centred on (cx, cy). Use it as the player
 * sprite, the avatar on a result card, or the thing a game is protecting.
 *
 * Returns false if the photo is not available.
 */
export function drawHeadshot(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  ring?: string
): boolean {
  const img = photo("headshot");
  if (!img) return false;

  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  cover(g, img, cx - r, cy - r, r * 2, r * 2);
  g.restore();

  if (ring) {
    g.strokeStyle = ring;
    g.lineWidth = Math.max(2, r * 0.09);
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  return true;
}
