"use client";

import { create } from "zustand";
import {
  THEMES,
  applyThemeToDom,
  resolvedFamily,
  type ThemeId,
  type ThemeTokens,
} from "@/lib/themes";
import { loadJson, saveJson } from "@/lib/storage";

interface ThemeState {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  hydrate: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeId: "coast",
  setTheme: (id) => {
    set({ themeId: id });
    applyThemeToDom(THEMES[id]);
    saveJson("theme", { themeId: id });
  },
  hydrate: () => {
    const { themeId } = loadJson<{ themeId: ThemeId }>("theme", {
      themeId: "coast",
    });
    const id = THEMES[themeId] ? themeId : "coast";
    set({ themeId: id });
    applyThemeToDom(THEMES[id]);
  },
}));

/** Non-reactive accessor for canvas games: always the current tokens. */
export function currentTheme(): ThemeTokens {
  const t = THEMES[useThemeStore.getState().themeId];
  const family = resolvedFamily();
  return { ...t, fontDisplay: family, fontBody: family };
}
