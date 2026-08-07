"use client";

import { useEffect } from "react";
import { isNativeRuntime, nativeBuild } from "@/lib/native";
import { THEMES } from "@/lib/themes";
import { useThemeStore } from "@/store/useThemeStore";

function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55;
}

export function NativeShell() {
  const themeId = useThemeStore((s) => s.themeId);

  useEffect(() => {
    if (!nativeBuild || !isNativeRuntime()) return;
    document.documentElement.dataset.native = "1";

    let cancelled = false;

    void (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        if (!cancelled) await SplashScreen.hide({ fadeOutDuration: 220 });
      } catch {}
    })();

    const block = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    document.addEventListener("gesturestart", block);

    return () => {
      cancelled = true;
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("gesturestart", block);
    };
  }, []);

  useEffect(() => {
    if (!nativeBuild || !isNativeRuntime()) return;
    const dark = isDark(THEMES[themeId]?.bg ?? "#0b0f16");
    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      } catch {}
    })();
  }, [themeId]);

  return null;
}
