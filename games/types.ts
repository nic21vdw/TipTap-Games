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
  // Optional axes — registry.ts derives sane defaults when a game omits them.
  speed?: number; // 0..1  patient -> twitchy
  difficulty?: number; // 0..1  forgiving -> brutal
  realism?: number; // 0..1  playful/abstract -> dark/realistic
  kidSafe?: boolean; // false only for gambling-flavoured cards
}

/** GameMeta after registry.ts fills in every optional axis. */
export type FullGameMeta = Required<GameMeta>;

export interface GameContext {
  canvas: HTMLCanvasElement;
  /** 2d context, pre-scaled so games draw in logical (CSS px) coordinates */
  g: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  /** live theme tokens — call every frame, never cache across frames */
  getTheme: () => ThemeTokens;
  onScore: (score: number) => void;
  onRunEnd: (finalScore: number) => void;
  haptic: (kind: "light" | "hit" | "fail") => void;
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
