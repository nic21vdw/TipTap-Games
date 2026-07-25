"use client";

import { Sheet } from "@/components/ui/Sheet";
import { THEMES, THEME_ORDER } from "@/lib/themes";
import { useThemeStore } from "@/store/useThemeStore";
import { useUiStore } from "@/store/useUiStore";

export function ThemeSheet() {
  const open = useUiStore((s) => s.sheet === "theme");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const themeId = useThemeStore((s) => s.themeId);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <Sheet open={open} onClose={closeSheet} title="Theme">
      <div className="grid grid-cols-2 gap-3">
        {THEME_ORDER.map((id) => {
          const t = THEMES[id];
          const selected = id === themeId;
          return (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className="pressable p-3 text-left"
              style={{
                borderRadius: "var(--radius)",
                background: t.bg,
                outline: selected ? `3px solid var(--accent)` : "none",
              }}
            >
              <div className="mb-2 flex gap-1.5">
                {[t.accent, t.accentAlt, t.success, t.danger].map((c) => (
                  <span
                    key={c}
                    className="h-4 w-4"
                    style={{ background: c, borderRadius: t.radius === 0 ? 0 : 999 }}
                  />
                ))}
              </div>
              <div className="text-sm font-extrabold" style={{ color: t.ink, fontFamily: t.fontDisplay }}>
                {t.name}
              </div>
              <div className="text-[11px]" style={{ color: t.inkDim }}>
                {t.blurb}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs" style={{ color: "var(--ink-dim)" }}>
        switches live — mid-run, no reload
      </p>
    </Sheet>
  );
}
