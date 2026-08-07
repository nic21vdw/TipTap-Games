"use client";

import { useEffect, useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SearchIcon, SparkleIcon } from "@/components/ui/icons";
import { registerSpec } from "@/games/custom";
import { offlineSpec } from "@/lib/generator";
import { apiUrl, serverRoutesReachable } from "@/lib/native";
import { searchGames } from "@/lib/searchGames";
import {
  loadCustomSpecs,
  saveCustomSpec,
  type CustomGameSpec,
} from "@/lib/storage";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

export function SearchSheet() {
  const open = useUiStore((s) => s.sheet === "search");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<CustomGameSpec[]>(() =>
    typeof window === "undefined" ? [] : loadCustomSpecs()
  );

  // the catalog grows when a game is generated, so re-run on every open too
  const results = useMemo(() => (open ? searchGames(query) : []), [open, query]);
  const mineSlugs = useMemo(() => new Set(mine.map((s) => s.slug)), [mine]);

  // a fresh open always starts from the full list
  useEffect(() => {
    if (!open) {
      setQuery("");
      setError(null);
    }
  }, [open]);

  const play = (slug: string) => {
    useFeedStore.getState().jumpTo(slug);
    closeSheet();
  };

  const generate = async () => {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let spec: CustomGameSpec;
      try {
        if (!serverRoutesReachable) throw new Error("no server in this build");
        const res = await fetch(apiUrl("/api/generate"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        if (!res.ok) throw new Error(`generate failed: ${res.status}`);
        spec = ((await res.json()) as { spec: CustomGameSpec }).spec;
      } catch {
        spec = offlineSpec(prompt);
      }
      if (!registerSpec(spec)) spec = offlineSpec(prompt);
      if (!registerSpec(spec)) throw new Error("could not build that one");
      saveCustomSpec(spec);
      setMine(loadCustomSpecs());
      setPrompt("");
      play(spec.slug); // land on it, don't just queue it
    } catch (e) {
      setError(e instanceof Error ? e.message : "something broke, go again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={closeSheet} title="All games">
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
            if (e.key === "Enter" && results[0]) play(results[0].meta.slug);
          }}
          autoComplete="off"
          placeholder="search games by name"
          aria-label="Search games by name"
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: "var(--ink)" }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="pressable shrink-0 text-base leading-none"
            style={{ color: "var(--ink-dim)" }}
          >
            ×
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {results.map(({ meta }) => (
          <button
            key={meta.slug}
            onClick={() => play(meta.slug)}
            className="pressable flex items-center justify-between gap-3 px-3 py-2.5 text-left"
            style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: meta.palette.hero }}
                />
                <span
                  className="truncate text-sm font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {meta.title}
                </span>
                {mineSlugs.has(meta.slug) && (
                  <span
                    className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase"
                    style={{
                      background: "var(--surface)",
                      color: "var(--ink-dim)",
                      borderRadius: "4px",
                    }}
                  >
                    yours
                  </span>
                )}
              </span>
              <span
                className="mt-0.5 block truncate text-xs"
                style={{ color: "var(--ink-dim)" }}
              >
                {meta.rule}
              </span>
            </span>
            <span
              className="shrink-0 text-xs font-bold"
              style={{ color: "var(--accent)" }}
            >
              Play
            </span>
          </button>
        ))}
      </div>

      {query.trim() && results.length === 0 && (
        <p
          className="mt-3 px-3 py-4 text-center text-xs"
          style={{
            color: "var(--ink-dim)",
            background: "var(--bg)",
            borderRadius: "var(--radius)",
          }}
        >
          No game called &ldquo;{query.trim()}&rdquo; yet — describe it below and
          the feed will build it.
        </p>
      )}

      {/* generator: the fallback for when the catalog doesn't have it */}
      <div className="mt-6">
        <div
          className="mb-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--ink-dim)" }}
        >
          Make a game
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="something fast and neon where I bet everything and dodge stuff..."
          className="w-full resize-none p-3 text-sm outline-none"
          style={{
            background: "var(--bg)",
            color: "var(--ink)",
            borderRadius: "var(--radius)",
          }}
        />
        <button
          onClick={generate}
          disabled={busy || !prompt.trim()}
          className="pressable mt-2 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold disabled:opacity-40"
          style={{
            background: "var(--accent)",
            color: "#fff",
            borderRadius: "var(--radius)",
          }}
        >
          <SparkleIcon size={18} />
          {busy ? "Designing..." : "Generate my game"}
        </button>
        {error && (
          <p
            className="mt-2 text-xs font-semibold"
            style={{ color: "var(--danger)" }}
          >
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
