"use client";

import type { Account } from "@/lib/accounts";

interface Props {
  account: Account | null;
  size?: number;
  ring?: boolean;
}

/**
 * Avatars are generated, never uploaded: a two-stop gradient off the account's
 * hue plus its initials. No image hosting, no moderation surface, and every
 * account looks distinct from the first frame.
 */
export function Avatar({ account, size = 40, ring = false }: Props) {
  const hue = account?.hue ?? 210;
  const label = initials(account);
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center font-extrabold"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(140deg, hsl(${hue} 82% 58%), hsl(${(hue + 48) % 360} 78% 44%))`,
        color: "#fff",
        fontSize: size * 0.38,
        fontFamily: "var(--font-display)",
        boxShadow: ring ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent)" : undefined,
        letterSpacing: "-0.02em",
      }}
      aria-hidden
    >
      {label}
      {account?.kind === "bot" && size >= 32 && (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 text-[8px] font-bold uppercase tracking-wider"
          style={{
            background: "var(--ink)",
            color: "var(--bg)",
            borderRadius: "4px",
          }}
        >
          bot
        </span>
      )}
    </span>
  );
}

function initials(account: Account | null): string {
  const source = (account?.name || account?.handle || "?").trim();
  const words = source.split(/[\s_.-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
