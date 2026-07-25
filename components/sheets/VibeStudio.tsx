"use client";

import { useEffect, useRef, useState } from "react";
import { GameHost } from "@/components/feed/GameHost";
import { SparkleIcon } from "@/components/ui/icons";
import { registerSpec } from "@/games/custom";
import { haptic } from "@/lib/haptics";
import {
  loadCustomSpecs,
  saveCustomSpec,
  type CustomGameSpec,
} from "@/lib/storage";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

interface LogLine {
  label: string;
  note: string;
}

type Phase = "idle" | "working" | "done" | "error";

const EXAMPLES = [
  "a snake that gets faster every time I blink",
  "something calm, blue, and impossible to lose",
  "1998 nokia energy but neon and unfair",
  "I want to bet everything on one tap",
  "a game about running away from my inbox",
];

export function VibeStudio() {
  const open = useUiStore((s) => s.sheet === "vibe");
  const closeSheet = useUiStore((s) => s.closeSheet);

  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);
  const [spec, setSpec] = useState<CustomGameSpec | null>(null);
  const [engine, setEngine] = useState("");
  const [error, setError] = useState("");
  const [mine, setMine] = useState<CustomGameSpec[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // the library only matters while the studio is open, and localStorage is
  // client-only, so read it on open rather than at module load
  useEffect(() => {
    if (open) setMine(loadCustomSpecs().slice().reverse());
  }, [open, phase]);

  // a closed studio never keeps a request (or a mounted game) alive
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
    const t = setTimeout(() => {
      setPhase("idle");
      setPct(0);
      setLog([]);
      setSpec(null);
      setError("");
    }, 400);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  const run = async () => {
    const wish = prompt.trim();
    if (!wish || phase === "working") return;
    haptic("hit");
    setPhase("working");
    setPct(0);
    setStage("Opening the studio");
    setLog([]);
    setSpec(null);
    setError("");

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/generate?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: wish }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`the studio said ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;

      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const msg = JSON.parse(line.slice(6)) as {
            type: "step" | "done";
            pct: number;
            label?: string;
            note?: string;
            spec?: CustomGameSpec;
            engine?: string;
          };
          setPct(msg.pct);
          if (msg.type === "step") {
            setStage(msg.label ?? "");
            setLog((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              // "Designing" reports repeatedly while the model thinks; keep
              // one line for it and let the note change underneath
              if (last && last.label === msg.label) {
                next[next.length - 1] = { label: msg.label!, note: msg.note ?? "" };
                return next;
              }
              next.push({ label: msg.label ?? "", note: msg.note ?? "" });
              return next;
            });
          } else if (msg.type === "done" && msg.spec) {
            if (!registerSpec(msg.spec)) throw new Error("that one would not compile");
            saveCustomSpec(msg.spec);
            setSpec(msg.spec);
            setEngine(msg.engine ?? "");
            setStage("Ready");
            setPhase("done");
            haptic("hit");
            finished = true;
          }
        }
      }
      if (!finished) throw new Error("the studio stopped early");
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof Error ? e.message : "something broke, go again");
      setPhase("error");
      haptic("fail");
    } finally {
      abortRef.current = null;
    }
  };

  const playIt = () => {
    if (!spec) return;
    useFeedStore.getState().insertNext(spec.slug);
    haptic("hit");
    closeSheet();
  };

  return (
    <>
      <div
        onClick={closeSheet}
        className={`fixed inset-0 z-[55] bg-black/60 backdrop-blur-[3px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-label="Vibe code a game"
        className={`ease-sheet fixed inset-x-0 bottom-0 z-[60] flex max-h-[92dvh] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] transition-transform duration-[420ms] ${
          open ? "translate-y-0" : "pointer-events-none invisible translate-y-full"
        }`}
        style={{
          background: "var(--surface)",
          color: "var(--ink)",
          borderRadius: "calc(var(--radius) * 1.5) calc(var(--radius) * 1.5) 0 0",
          fontFamily: "var(--font-body)",
        }}
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <div>
            <h2
              className="text-lg font-extrabold tracking-wide"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Vibe code a game
            </h2>
            <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Describe it. The studio builds it into your feed.
            </p>
          </div>
          <button
            onClick={closeSheet}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-2">
          {(phase === "idle" || phase === "error") && (
            <>
              <Composer
                prompt={prompt}
                setPrompt={setPrompt}
                onRun={run}
                error={phase === "error" ? error : ""}
              />
              {mine.length > 0 && (
                <div className="mt-6">
                  <div
                    className="mb-2 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--ink-dim)" }}
                  >
                    Your games
                  </div>
                  <div className="flex flex-col gap-2">
                    {mine.map((s) => (
                      <button
                        key={s.slug}
                        onClick={() => {
                          registerSpec(s);
                          useFeedStore.getState().insertNext(s.slug);
                          haptic("hit");
                          closeSheet();
                        }}
                        className="pressable flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                        style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
                      >
                        <span className="min-w-0">
                          <span
                            className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                            style={{ background: s.palette?.hero ?? s.accent }}
                          />
                          <span className="text-sm font-bold">{s.title}</span>
                          <span
                            className="ml-2 text-xs"
                            style={{ color: "var(--ink-dim)" }}
                          >
                            {s.rule}
                          </span>
                        </span>
                        <span
                          className="shrink-0 text-xs font-bold"
                          style={{ color: "var(--accent)" }}
                        >
                          Play next
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {phase === "working" && (
            <Progress pct={pct} stage={stage} log={log} logRef={logRef} />
          )}

          {phase === "done" && spec && (
            <Reveal
              spec={spec}
              engine={engine}
              onPlay={playIt}
              onAgain={() => {
                setPhase("idle");
                setPrompt("");
                setPct(0);
                setLog([]);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

function Composer({
  prompt,
  setPrompt,
  onRun,
  error,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  onRun: () => void;
  error: string;
}) {
  return (
    <>
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
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setPrompt(ex)}
            className="pressable px-2.5 py-1.5 text-left text-[11px] font-semibold"
            style={{
              background: "var(--bg)",
              color: "var(--ink-dim)",
              borderRadius: "999px",
            }}
          >
            {ex}
          </button>
        ))}
      </div>
      <button
        onClick={onRun}
        disabled={!prompt.trim()}
        className="pressable mt-3 flex w-full items-center justify-center gap-2 py-3.5 text-sm font-bold disabled:opacity-40"
        style={{
          background: "var(--accent)",
          color: "#fff",
          borderRadius: "var(--radius)",
        }}
      >
        <SparkleIcon size={18} />
        Vibe code it
      </button>
      {error && (
        <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }}>
          {error} — try again?
        </p>
      )}
    </>
  );
}

function Progress({
  pct,
  stage,
  log,
  logRef,
}: {
  pct: number;
  stage: string;
  log: LogLine[];
  logRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div className="flex items-end justify-between">
        <span
          className="text-[44px] font-extrabold leading-none tabular-nums"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {Math.round(pct)}
          <span className="text-xl">%</span>
        </span>
        <span
          className="anim-breathe pb-1.5 text-right text-xs font-bold"
          style={{ color: "var(--accent)" }}
        >
          {stage}
        </span>
      </div>
      <div
        className="mt-2 h-3 w-full overflow-hidden"
        style={{ background: "var(--bg)", borderRadius: 999 }}
      >
        <div
          className="h-full transition-[width] duration-500"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--accent), var(--accent-alt))",
            borderRadius: 999,
          }}
        />
      </div>
      <div
        ref={logRef}
        className="no-scrollbar mt-4 max-h-[38dvh] overflow-y-auto text-xs"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {log.map((l, i) => {
          const current = i === log.length - 1;
          return (
            <div key={`${l.label}-${i}`} className="flex gap-2 py-1.5">
              <span
                className="mt-[3px] inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: current ? "var(--accent)" : "var(--success)",
                  opacity: current ? 1 : 0.7,
                }}
              />
              <span className="min-w-0">
                <span className="font-bold">{l.label}</span>
                {l.note && (
                  <span className="ml-1.5" style={{ color: "var(--ink-dim)" }}>
                    {l.note}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Reveal({
  spec,
  engine,
  onPlay,
  onAgain,
}: {
  spec: CustomGameSpec;
  engine: string;
  onPlay: () => void;
  onAgain: () => void;
}) {
  const swatches = spec.palette
    ? [spec.palette.hero, spec.palette.foe, spec.palette.prize, spec.palette.deep, spec.palette.glow]
    : [spec.accent];
  return (
    <>
      <div className="flex gap-3">
        {/* the finished game, already running */}
        <div
          className="relative shrink-0 overflow-hidden"
          style={{
            width: 116,
            height: 206,
            borderRadius: "var(--radius)",
            background: "#000",
          }}
        >
          <GameHost
            slug={spec.slug}
            active
            interactive={false}
            onScore={() => {}}
            onRunEnd={() => {}}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-2xl font-extrabold leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {spec.title}
          </div>
          <div className="mt-0.5 text-sm font-semibold" style={{ color: "var(--accent)" }}>
            {spec.rule}
          </div>
          <p className="mt-2 text-xs leading-snug" style={{ color: "var(--ink-dim)" }}>
            {spec.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {spec.tags.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 text-[10px] font-bold"
                style={{
                  background: "var(--bg)",
                  color: "var(--ink-dim)",
                  borderRadius: 999,
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {swatches.map((c, i) => (
              <span
                key={`${c}-${i}`}
                className="h-4 w-4 rounded-full"
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="engine" value={spec.base} />
        <Stat label="speed" value={`×${(spec.tune?.speed ?? 1).toFixed(2)}`} />
        <Stat label="density" value={`×${(spec.tune?.density ?? 1).toFixed(2)}`} />
      </dl>

      <button
        onClick={onPlay}
        className="pressable mt-4 w-full py-3.5 text-sm font-bold"
        style={{ background: "var(--accent)", color: "#fff", borderRadius: "var(--radius)" }}
      >
        Play it now
      </button>
      <button
        onClick={onAgain}
        className="pressable mt-2 w-full py-3 text-sm font-bold"
        style={{ background: "var(--bg)", color: "var(--ink)", borderRadius: "var(--radius)" }}
      >
        Make another
      </button>
      <p className="mt-3 text-center text-[11px]" style={{ color: "var(--ink-dim)" }}>
        designed by {engine} · saved to your games
      </p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg)", borderRadius: "var(--radius)" }} className="py-2">
      <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-dim)" }}>
        {label}
      </dt>
      <dd className="truncate px-1 text-xs font-extrabold">{value}</dd>
    </div>
  );
}
