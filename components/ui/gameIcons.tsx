// Per-game icons for the Games gallery. Every game already carries a
// `tags` list (mechanic first) and its own `palette`; we turn those into a
// distinct little tile so the whole catalog — including runtime-minted
// variants — gets a representative icon for free. No emoji: line/fill glyphs
// only, drawn in the game's own hero colour over its own scenery gradient.

import type { GamePalette, GameTag } from "@/games/types";

interface GlyphProps {
  size?: number;
  color?: string;
}

function Glyph({
  children,
  size = 24,
  color = "currentColor",
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

// One glyph per mechanic tag. The shape "kinda represents" the feel of the
// game — a bolt for reflex, a target for precision, a grid for memory, and
// so on — so a glance at the tile hints at how it plays.
const TAG_GLYPH: Record<GameTag, (p: GlyphProps) => React.ReactNode> = {
  reflex: (p) => (
    <Glyph {...p}>
      <path d="M13 3 5 13h5l-1 8 8-11h-5l1-7Z" fill={p.color ?? "currentColor"} stroke="none" />
    </Glyph>
  ),
  precision: (p) => (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </Glyph>
  ),
  memory: (p) => (
    <Glyph {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" fill={p.color ?? "currentColor"} stroke="none" />
    </Glyph>
  ),
  endurance: (p) => (
    <Glyph {...p}>
      <path d="M2 19 8.5 9l4 5 3-4.5L22 19Z" />
      <path d="M2 19h20" />
    </Glyph>
  ),
  luck: (p) => (
    <Glyph {...p}>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.3" fill={p.color ?? "currentColor"} stroke="none" />
      <circle cx="15" cy="9" r="1.3" fill={p.color ?? "currentColor"} stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill={p.color ?? "currentColor"} stroke="none" />
      <circle cx="9" cy="15" r="1.3" fill={p.color ?? "currentColor"} stroke="none" />
      <circle cx="15" cy="15" r="1.3" fill={p.color ?? "currentColor"} stroke="none" />
    </Glyph>
  ),
  chaos: (p) => (
    <Glyph {...p}>
      <path d="M12 2 14 8l6-2-3.5 5.2L22 14l-6 .8L15 21l-3-4.3L9 21l-1-6.2L2 14l5.5-2.8L4 6l6 2 2-6Z" />
    </Glyph>
  ),
  calm: (p) => (
    <Glyph {...p}>
      <path d="M12 3.5s6 6.2 6 10.3a6 6 0 0 1-12 0C6 9.7 12 3.5 12 3.5Z" />
    </Glyph>
  ),
  retro: (p) => (
    <Glyph {...p}>
      <path d="M5 5h4v4H5zM15 5h4v4h-4zM10 10h4v4h-4zM5 15h4v4H5zM15 15h4v4h-4z" fill={p.color ?? "currentColor"} stroke="none" />
    </Glyph>
  ),
  casino: (p) => (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
      <circle cx="12" cy="12" r="3.6" />
    </Glyph>
  ),
  oneTap: (p) => (
    <Glyph {...p}>
      <circle cx="12" cy="12" r="3.4" fill={p.color ?? "currentColor"} stroke="none" />
      <circle cx="12" cy="12" r="7" opacity={0.75} />
      <circle cx="12" cy="12" r="10.5" opacity={0.4} />
    </Glyph>
  ),
  drag: (p) => (
    <Glyph {...p}>
      <path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" />
    </Glyph>
  ),
  hold: (p) => (
    <Glyph {...p}>
      <path d="M9 11V5.5a2 2 0 0 1 4 0V11" />
      <path d="M13 8.5a1.8 1.8 0 0 1 3.6 0V15a5 5 0 0 1-5 5h-1.2a5 5 0 0 1-3.8-1.8L4 15s-.8-1.4.5-2.2 2.3.5 2.3.5l1.2 1.4" />
    </Glyph>
  ),
};

/** The mechanic that drives the glyph: the first tag we have a shape for. */
function primaryTag(tags: GameTag[]): GameTag {
  return tags.find((t) => t in TAG_GLYPH) ?? "reflex";
}

interface GameIconProps {
  palette: GamePalette;
  tags: GameTag[];
  size?: number;
}

/**
 * A rounded tile painted with the game's own scenery gradient, its mechanic
 * glyph in the hero colour, and a small prize spark in the corner — enough
 * for every game to read as its own thing at a glance.
 */
export function GameIcon({ palette, tags, size = 56 }: GameIconProps) {
  const tag = primaryTag(tags);
  const Draw = TAG_GLYPH[tag];
  const glyphSize = Math.round(size * 0.52);
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: "calc(var(--radius) * 0.9)",
        background: `linear-gradient(145deg, ${palette.deep}, ${palette.glow})`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)",
      }}
    >
      <Draw size={glyphSize} color={palette.hero} />
      <span
        className="absolute right-1.5 top-1.5 block rounded-full"
        style={{ width: 6, height: 6, background: palette.prize }}
      />
    </div>
  );
}
