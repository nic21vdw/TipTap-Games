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
  tags: GameTag[];
  intensity: number; // 0..1  calm -> frantic
  luck: number; // 0..1  pure skill -> pure chance
  nostalgia: number; // 0..1  modern -> iPhone-era homage
  sessionLength: number; // 0..1  30 seconds -> minutes
  scoreUnit: string; // 'pts' | 'sec' | 'chips'
  maxScorePerSecond: number; // anti-cheat ceiling
}

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
}

export interface GameModule {
  meta: GameMeta;
  mount: (ctx: GameContext) => GameInstance;
}
