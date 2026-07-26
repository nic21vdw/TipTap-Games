"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SearchIcon } from "@/components/ui/icons";
import { useAlgorithmStore } from "@/store/useAlgorithmStore";
import { useUiStore } from "@/store/useUiStore";

/**
 * The whole algorithm, as one search bar. You say what you feel like playing,
 * it snipes the keywords out and the feed leans that way. Everything it has
 * stored off the back of that lives in Settings.
 */
export function AlgorithmSheet() {
  const open = useUiStore((s) => s.sheet === "algo");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const applyQuery = useAlgorithmStore((s) => s.applyQuery);

  const [query, setQuery] = useState("");
  const [understood, setUnderstood] = useState<string[]>([]);
  const [missed, setMissed] = useState(false);

  const run = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const matched = applyQuery(q);
    setUnderstood(matched.map((m) => m.effect));
    setMissed(matched.length === 0);
    setQuery("");
  };

  return (
    <Sheet open={open} onClose={closeSheet} title="Your algorithm">
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
      >
        <span style={{ color: "var(--ink-dim)" }}>
          <SearchIcon size={18} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(query);
          }}
          placeholder="say what you feel like playing"
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: "var(--ink)" }}
        />
        <button
          onClick={() => run(query)}
          disabled={!query.trim()}
          className="pressable shrink-0 px-3 py-1 text-xs font-bold disabled:opacity-40"
          style={{
            background: "var(--accent)",
            color: "#fff",
            borderRadius: "calc(var(--radius) * 0.6)",
          }}
        >
          Tune
        </button>
      </div>

      {understood.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px]" style={{ color: "var(--ink-dim)" }}>
            picked up:
          </span>
          {understood.map((u, i) => (
            <span
              key={`${u}-${i}`}
              className="px-2 py-0.5 text-[11px] font-bold"
              style={{
                background: "var(--success)",
                color: "#fff",
                borderRadius: "999px",
              }}
            >
              {u}
            </span>
          ))}
        </div>
      )}
      {missed && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--ink-dim)" }}>
          didn&apos;t catch anything in that one — say it another way
        </p>
      )}

      <p className="mt-3 text-[11px]" style={{ color: "var(--ink-dim)" }}>
        Say it however you want — &ldquo;slow retro stuff, nothing stressful&rdquo;.
        What it keeps from that is in Settings.
      </p>
    </Sheet>
  );
}
