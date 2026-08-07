import type { ThemeTokens } from "@/lib/themes";

export type GameTag =
  | "reflex"
  | "precision"
  | "memory"
  | "endurance"
  | "luck"
  | "chaos"
  | "calm"
  | "retro"
  | "casino"
  | "oneTap"
  | "drag"
  | "hold";

export interface GameMeta {
  slug: string;
  title: string;
  rule: string; // one sentence, max 48 chars, shown always
  year: number; // era of the mechanic (homage year, or 2026 for originals)
  description: string; // one-liner for the caption, IG style
  history: string; // expanded caption: where the mechanic came from
  tags: GameTag[];
  intensity: number; // 0..1  calm -> frantic
  luck: number; // 0..1  pure skill -> pure chance
  nostalgia: number; // 0..1  modern -> retro
  sessionLength: number; // 0..1  30 seconds -> minutes
  scoreUnit: string; // 'pts' | 'sec' | 'chips'
  maxScorePerSecond: number; // anti-cheat ceiling
  /**
   * The game's own colours. Themes control the ground (bg/ink); this controls
   * the game's character, so Snake Feed is never the same blue as The Tab.
   */
  palette?: GamePalette;
  // Optional axes — registry.ts derives sane defaults when a game omits them.
  speed?: number; // 0..1  patient -> twitchy
  difficulty?: number; // 0..1  forgiving -> brutal
  realism?: number; // 0..1  playful/abstract -> dark/realistic
  kidSafe?: boolean; // false only for gambling-flavoured cards
}

/** GameMeta after registry.ts fills in every optional axis. */
export type FullGameMeta = Required<GameMeta>;

export interface GamePalette {
  hero: string; // the thing you control
  foe: string; // the thing that ends your run
  prize: string; // the thing you want
  deep: string; // scenery / far layer
  glow: string; // highlights, trails, sky washes
}

export interface GameContext {
  canvas: HTMLCanvasElement;
  /** 2d context, pre-scaled so games draw in logical (CSS px) coordinates */
  g: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  /** safe-area insets in logical px; keep readable HUD inside them */
  safeTop: number;
  safeBottom: number;
  /** live theme tokens — call every frame, never cache across frames */
  getTheme: () => ThemeTokens;
  /** this game's own colours, already resolved */
  pal: GamePalette;
  onScore: (score: number) => void;
  /** finalScore ends the run; reason is the game's own headline (e.g. "CRASHED"). */
  onRunEnd: (finalScore: number, reason?: string) => void;
  haptic: (kind: "light" | "hit" | "fail") => void;
  /**
   * Variant dials. A player-generated game runs a shipped engine with these
   * turned, so "same mechanic, faster and busier" really is a different game.
   * Absent for catalog games — the kit defaults both to 1.
   */
  tune?: GameTuning;
}

export interface GameTuning {
  speed: number; // multiplies simulated time
  density: number; // multiplies how much stuff spawns
}

export interface GameInstance {
  destroy: () => void; // MUST cancel rAF, remove listeners, stop audio
  pause: () => void;
  resume: () => void;
  /**
   * Attract mode. While a card is a preview in the feed it plays itself, so
   * the game is already in motion the instant it lands on screen. Games
   * without a policy simply keep animating.
   */
  autoplay?: (on: boolean) => void;
}

export interface GameModule {
  meta: GameMeta;
  mount: (ctx: GameContext) => GameInstance;
}
