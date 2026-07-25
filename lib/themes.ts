export type ThemeId = "arcade" | "eightbit" | "skeuo" | "felt";

export interface ThemeTokens {
  bg: string;
  surface: string;
  ink: string;
  inkDim: string;
  accent: string;
  accentAlt: string;
  success: string;
  danger: string;
  fontDisplay: string;
  fontBody: string;
  radius: number; // px, 0 for pixel themes
  pixelate: boolean; // canvas renders at 1/3 res, upscaled with smoothing off
  grain: number; // 0..1 overlay opacity
  scanlines: boolean;
}

export interface ThemeDef extends ThemeTokens {
  id: ThemeId;
  name: string;
  blurb: string;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  arcade: {
    id: "arcade",
    name: "Arcade Dark",
    blurb: "Near-black, one acid accent",
    bg: "#0a0a0f",
    surface: "#16161d",
    ink: "#f4f4f5",
    inkDim: "#8b8b96",
    accent: "#b6ff2e",
    accentAlt: "#2ee6ff",
    success: "#4ade80",
    danger: "#ff3b5c",
    fontDisplay:
      '"Arial Black", "Helvetica Neue", system-ui, sans-serif',
    fontBody: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    radius: 16,
    pixelate: false,
    grain: 0.04,
    scanlines: false,
  },
  eightbit: {
    id: "eightbit",
    name: "8-Bit",
    blurb: "Chunky pixels, scanlines",
    bg: "#1a1c2c",
    surface: "#29366f",
    ink: "#f4f4f4",
    inkDim: "#94b0c2",
    accent: "#ffcd75",
    accentAlt: "#41a6f6",
    success: "#38b764",
    danger: "#b13e53",
    fontDisplay:
      '"Courier New", ui-monospace, monospace',
    fontBody: '"Courier New", ui-monospace, monospace',
    radius: 0,
    pixelate: true,
    grain: 0,
    scanlines: true,
  },
  skeuo: {
    id: "skeuo",
    name: "Skeuomorph '08",
    blurb: "Linen, gloss, the original look",
    bg: "#c9ced6",
    surface: "#f2f2f7",
    ink: "#1c1c1e",
    inkDim: "#63666e",
    accent: "#2f6fe4",
    accentAlt: "#8e54c9",
    success: "#34c759",
    danger: "#ff3b30",
    fontDisplay: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    fontBody: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    radius: 12,
    pixelate: false,
    grain: 0.08,
    scanlines: false,
  },
  felt: {
    id: "felt",
    name: "Neon Felt",
    blurb: "Green felt, gold, hot pink",
    bg: "#0b3d2e",
    surface: "#0e4a38",
    ink: "#f7ecd0",
    inkDim: "#a8bfa1",
    accent: "#f5c542",
    accentAlt: "#ff4f9a",
    success: "#7fe38b",
    danger: "#ff5252",
    fontDisplay: '"Arial Narrow", Impact, system-ui, sans-serif',
    fontBody: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    radius: 10,
    pixelate: false,
    grain: 0.12,
    scanlines: false,
  },
};

export const THEME_ORDER: ThemeId[] = ["arcade", "eightbit", "skeuo", "felt"];

export function applyThemeToDom(t: ThemeTokens) {
  const r = document.documentElement.style;
  r.setProperty("--bg", t.bg);
  r.setProperty("--surface", t.surface);
  r.setProperty("--ink", t.ink);
  r.setProperty("--ink-dim", t.inkDim);
  r.setProperty("--accent", t.accent);
  r.setProperty("--accent-alt", t.accentAlt);
  r.setProperty("--success", t.success);
  r.setProperty("--danger", t.danger);
  r.setProperty("--font-display", t.fontDisplay);
  r.setProperty("--font-body", t.fontBody);
  r.setProperty("--radius", `${t.radius}px`);
  r.setProperty("--grain", `${t.grain}`);
  document.documentElement.dataset.scanlines = t.scanlines ? "1" : "0";
  document.documentElement.dataset.pixelate = t.pixelate ? "1" : "0";
}
