"use client";

import { useEffect, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Sheet({ open, onClose, title, children }: Props) {
  // Escape closes, for anyone driving this with a keyboard rather than a thumb
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        // hidden by visibility as well as transform, so a closed sheet can
        // never intercept a tap even if layout shifts under it
        className={`ease-sheet fixed inset-x-0 bottom-0 z-50 max-h-[calc(var(--app-h)*0.8)] overflow-y-auto pb-[var(--safe-bottom)] transition-transform duration-[420ms] ${
          open
            ? "translate-y-0"
            : "pointer-events-none invisible translate-y-full"
        }`}
        style={{
          background: "var(--surface)",
          color: "var(--ink)",
          borderRadius: "calc(var(--radius) * 1.5) calc(var(--radius) * 1.5) 0 0",
          fontFamily: "var(--font-body)",
        }}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2
            className="text-lg font-extrabold tracking-wide"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="pressable flex h-9 w-9 items-center justify-center text-xl leading-none"
            style={{
              background: "var(--bg)",
              borderRadius: "var(--radius)",
              color: "var(--ink-dim)",
            }}
          >
            ×
          </button>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </>
  );
}
