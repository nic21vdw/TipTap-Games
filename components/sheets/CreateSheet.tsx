"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SectionLabel } from "@/components/sheets/AccountSheet";
import {
  DownloadIcon,
  GamepadIcon,
  SendIcon,
  SparkleIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { registerSpec } from "@/games/custom";
import {
  allGames,
  BASES,
  exportSpec,
  gamesByAuthor,
  parseSpec,
  publishGame,
  slugify,
  SPEC_TAGS,
  type CustomGameSpec,
} from "@/lib/library";
import { useAccountStore } from "@/store/useAccountStore";
import { useFeedStore } from "@/store/useFeedStore";
import { useUiStore } from "@/store/useUiStore";

type Tab = "describe" | "build" | "upload";

export function CreateSheet() {
  const open = useUiStore((s) => s.sheet === "create");
  const closeSheet = useUiStore((s) => s.closeSheet);
  const me = useAccountStore((s) => s.me);
  const [tab, setTab] = useState<Tab>("describe");
  const [mine, setMine] = useState<CustomGameSpec[]>([]);

  const refresh = useCallback(
    () => setMine(me ? gamesByAuthor(me.id) : []),
    [me]
  );

  // the list belongs to whoever is signed in when the sheet opens
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // publish → register the engine, credit the author, queue it as the next card
  const publish = (spec: CustomGameSpec, source: CustomGameSpec["source"]) => {
    const stored = publishGame(spec, source);
    if (!registerSpec(stored)) throw new Error("couldn't build that one");
    refresh();
    useFeedStore.getState().insertNext(stored.slug);
    closeSheet();
  };

  return (
    <Sheet open={open} onClose={closeSheet} title="Make a game">
      <div
        className="mb-3 flex gap-1 p-1"
        style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
      >
        <Tabs tab={tab} setTab={setTab} />
      </div>

      {tab === "describe" && <DescribePanel onPublish={publish} />}
      {tab === "build" && <BuildPanel onPublish={publish} />}
      {tab === "upload" && <UploadPanel onPublish={publish} />}

      <MyGames mine={mine} onClose={closeSheet} />
    </Sheet>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: [Tab, string][] = [
    ["describe", "Describe it"],
    ["build", "Build it"],
    ["upload", "Upload"],
  ];
  return (
    <>
      {items.map(([id, label]) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className="flex-1 py-2 text-xs font-bold transition-colors"
          style={{
            background: tab === id ? "var(--surface)" : "transparent",
            color: tab === id ? "var(--ink)" : "var(--ink-dim)",
            borderRadius: "calc(var(--radius) * 0.7)",
          }}
        >
          {label}
        </button>
      ))}
    </>
  );
}

type PublishFn = (spec: CustomGameSpec, source: CustomGameSpec["source"]) => void;

// ---- tab 1: describe it (AI, with the local designer as the fallback) ----

function DescribePanel({ onPublish }: { onPublish: PublishFn }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`generate failed: ${res.status}`);
      const { spec } = (await res.json()) as { spec: CustomGameSpec };
      onPublish(spec, "ai");
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "something broke, go again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-dim)" }}>
        Yap about a game you wish existed. The feed designs it, publishes it
        under your handle, and drops it in as your next card.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="something fast and neon where I bet everything and dodge stuff..."
        className="w-full resize-none p-3 text-sm outline-none"
        style={{ background: "var(--bg)", color: "var(--ink)", borderRadius: "var(--radius)" }}
      />
      <button
        onClick={generate}
        disabled={busy || !prompt.trim()}
        className="pressable mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold disabled:opacity-40"
        style={{ background: "var(--accent)", color: "#fff", borderRadius: "var(--radius)" }}
      >
        <SparkleIcon size={18} />
        {busy ? "Designing..." : "Generate my game"}
      </button>
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

// ---- tab 2: build it (the studio) ----

const SWATCHES = ["#0095f6", "#b6ff2e", "#ff3b5c", "#ffb703", "#8b5cf6", "#2ee6ff", "#1fa855", "#ff7ad9"];

function BuildPanel({ onPublish }: { onPublish: PublishFn }) {
  const [title, setTitle] = useState("");
  const [rule, setRule] = useState("");
  const [description, setDescription] = useState("");
  const [base, setBase] = useState(BASES[0].slug);
  const [accent, setAccent] = useState(SWATCHES[1]);
  const [tags, setTags] = useState<string[]>(["reflex"]);
  const [intensity, setIntensity] = useState(0.6);
  const [luck, setLuck] = useState(0.2);
  const [nostalgia, setNostalgia] = useState(0.2);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (t: string) =>
    setTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].slice(0, 4)
    );

  const publish = () => {
    if (!title.trim()) return;
    setError(null);
    try {
      onPublish(
        {
          slug: slugify(title),
          base,
          title: title.trim().slice(0, 24),
          rule: (rule.trim() || "Tap to find out.").slice(0, 48),
          description:
            (description.trim() || `${title.trim()} — built in the studio.`).slice(0, 140),
          history: `Built by hand in the Tip Tap studio on the ${
            BASES.find((b) => b.slug === base)?.label ?? base
          } engine.`,
          accent,
          tags: tags.length ? tags : ["chaos"],
          intensity,
          luck,
          nostalgia,
        },
        "studio"
      );
      setTitle("");
      setRule("");
      setDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't publish that one");
    }
  };

  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-dim)" }}>
        Pick an engine, name it, colour it, and place it in the algorithm. Your
        game lands in everyone&apos;s feed on this device with your handle on it.
      </p>

      <Text value={title} onChange={setTitle} placeholder="title" max={24} />
      <Text value={rule} onChange={setRule} placeholder="one-line rule" max={48} />
      <Text
        value={description}
        onChange={setDescription}
        placeholder="caption (optional)"
        max={140}
      />

      <SectionLabel>Engine</SectionLabel>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {BASES.map((b) => (
          <button
            key={b.slug}
            onClick={() => setBase(b.slug)}
            className="pressable px-2.5 py-1.5 text-[11px] font-bold"
            style={{
              background: base === b.slug ? "var(--accent)" : "var(--bg)",
              color: base === b.slug ? "#fff" : "var(--ink)",
              borderRadius: "999px",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      <p className="-mt-2 mb-3 text-[11px]" style={{ color: "var(--ink-dim)" }}>
        {BASES.find((b) => b.slug === base)?.feel}
      </p>

      <SectionLabel>Colour</SectionLabel>
      <div className="mb-3 flex items-center gap-2">
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => setAccent(c)}
            aria-label={`accent ${c}`}
            className="pressable h-7 w-7"
            style={{
              background: c,
              borderRadius: "50%",
              boxShadow: accent === c ? "0 0 0 2px var(--surface), 0 0 0 4px var(--ink)" : undefined,
            }}
          />
        ))}
        <input
          type="color"
          value={accent}
          onChange={(e) => setAccent(e.target.value)}
          aria-label="custom accent"
          className="h-7 w-9 bg-transparent"
        />
      </div>

      <SectionLabel>Tags</SectionLabel>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SPEC_TAGS.map((t) => (
          <button
            key={t}
            onClick={() => toggleTag(t)}
            className="pressable px-2.5 py-1.5 text-[11px] font-bold"
            style={{
              background: tags.includes(t) ? "var(--accent)" : "var(--bg)",
              color: tags.includes(t) ? "#fff" : "var(--ink)",
              borderRadius: "999px",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <Slider label="calm ↔ frantic" value={intensity} onChange={setIntensity} />
      <Slider label="skill ↔ chance" value={luck} onChange={setLuck} />
      <Slider label="modern ↔ retro" value={nostalgia} onChange={setNostalgia} />

      <button
        onClick={publish}
        disabled={!title.trim()}
        className="pressable mt-3 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold disabled:opacity-40"
        style={{ background: "var(--accent)", color: "#fff", borderRadius: "var(--radius)" }}
      >
        <GamepadIcon size={18} /> Publish to the feed
      </button>
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

// ---- tab 3: upload a .json game file ----

function UploadPanel({ onPublish }: { onPublish: PublishFn }) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const take = (text: string) => {
    setError(null);
    const parsed = parseSpec(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    try {
      onPublish(parsed.spec, "import");
      setRaw("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "couldn't publish that one");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 64_000) {
      setError("that file is way too big for a game spec");
      return;
    }
    take(await file.text());
  };

  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-dim)" }}>
        Drop in a <code>.json</code> game file — one someone exported and sent
        you, or one you wrote yourself. Specs pick an engine and a look; they
        never carry code, so nothing you upload can run anything on your phone.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="pressable flex w-full items-center justify-center gap-2 py-3 text-sm font-bold"
        style={{ background: "var(--accent)", color: "#fff", borderRadius: "var(--radius)" }}
      >
        <UploadIcon size={18} /> Choose a game file
      </button>

      <div className="mt-3">
        <SectionLabel>or paste it</SectionLabel>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={4}
          placeholder='{"title":"Neon Bank","base":"cash-out","accent":"#b6ff2e", ...}'
          className="w-full resize-none p-3 font-mono text-xs outline-none"
          style={{ background: "var(--bg)", color: "var(--ink)", borderRadius: "var(--radius)" }}
        />
        <button
          onClick={() => take(raw)}
          disabled={!raw.trim()}
          className="pressable mt-2 w-full py-2.5 text-sm font-bold disabled:opacity-40"
          style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
        >
          Publish pasted game
        </button>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}

// ---- your published games ----

function MyGames({ mine, onClose }: { mine: CustomGameSpec[]; onClose: () => void }) {
  const me = useAccountStore((s) => s.me);
  const shareToDm = useUiStore((s) => s.shareToDm);
  const games = mine;
  const community = allGames().filter((g) => g.authorId !== me?.id);

  const download = (spec: CustomGameSpec) => {
    const blob = new Blob([exportSpec(spec)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.slug}.tiptap.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const playNext = (slug: string) => {
    useFeedStore.getState().insertNext(slug);
    onClose();
  };

  if (games.length === 0 && community.length === 0) return null;

  return (
    <>
      {games.length > 0 && (
        <div className="mt-6">
          <SectionLabel>Your games</SectionLabel>
          <div className="flex flex-col gap-2">
            {games.map((s) => (
              <div
                key={s.slug}
                className="flex items-center gap-2 px-3 py-2.5"
                style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.accent }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{s.title}</span>
                  <span className="block truncate text-xs" style={{ color: "var(--ink-dim)" }}>
                    {s.rule}
                  </span>
                </span>
                <button
                  onClick={() =>
                    shareToDm({ slug: s.slug, title: s.title, accent: s.accent, rule: s.rule })
                  }
                  aria-label={`Send ${s.title} to someone`}
                  className="pressable"
                  style={{ color: "var(--ink-dim)" }}
                >
                  <SendIcon size={16} />
                </button>
                <button
                  onClick={() => download(s)}
                  aria-label={`Export ${s.title}`}
                  className="pressable"
                  style={{ color: "var(--ink-dim)" }}
                >
                  <DownloadIcon size={16} />
                </button>
                <button
                  onClick={() => playNext(s.slug)}
                  className="pressable text-xs font-bold"
                  style={{ color: "var(--accent)" }}
                >
                  Play next
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {community.length > 0 && (
        <div className="mt-5">
          <SectionLabel>Made by other accounts</SectionLabel>
          <div className="flex flex-col gap-2">
            {community.slice(0, 8).map((s) => (
              <button
                key={s.slug}
                onClick={() => playNext(s.slug)}
                className="pressable flex items-center gap-2 px-3 py-2.5 text-left"
                style={{ background: "var(--bg)", borderRadius: "var(--radius)" }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.accent }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{s.title}</span>
                  <span className="block truncate text-xs" style={{ color: "var(--ink-dim)" }}>
                    @{s.authorHandle ?? "unknown"} · {s.rule}
                  </span>
                </span>
                <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                  Play next
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ---- inputs ----

function Text({
  value,
  onChange,
  placeholder,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
}) {
  return (
    <input
      value={value}
      maxLength={max}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mb-2 w-full px-3 py-2.5 text-sm outline-none"
      style={{ background: "var(--bg)", color: "var(--ink)", borderRadius: "var(--radius)" }}
    />
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-2 block">
      <span className="text-[11px] font-semibold" style={{ color: "var(--ink-dim)" }}>
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full"
        style={{ accentColor: "var(--accent)" }}
      />
    </label>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs font-semibold" style={{ color: "var(--danger)" }}>
      {children}
    </p>
  );
}
