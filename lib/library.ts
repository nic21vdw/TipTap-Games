// The player-made game library. A "game" a player publishes is a *spec*:
// which of our engines it runs on, what it's called, how it's coloured, and
// where it sits in the algorithm's feature space. Engines stay ours, so an
// uploaded game can never ship arbitrary code into anyone's feed — the worst
// a bad spec can do is be ugly.
//
// The library is device-global (every account on the phone sees every
// published game, with its author's handle on the card), while scores, likes
// and prefs stay per-account.

import { currentAccount, type Account } from "@/lib/accounts";

export interface CustomGameSpec {
  slug: string;
  base: string; // slug of the engine it runs on
  title: string;
  rule: string;
  description: string;
  history: string;
  accent: string; // hex; recolours the base engine
  tags: string[];
  intensity: number;
  luck: number;
  nostalgia: number;
  // ---- authorship (absent on games made before accounts existed) ----
  authorId?: string;
  authorHandle?: string;
  createdAt?: number;
  source?: "ai" | "studio" | "import";
}

const KEY = "ttg:games";
const LEGACY_KEY = "ttg:customGames";

/** Engines a spec may target, with the feel a player is picking when they do. */
export const BASES: { slug: string; label: string; feel: string }[] = [
  { slug: "tap-rush", label: "Tap Rush", feel: "frantic target tapping" },
  { slug: "reflex-gate", label: "Reflex Gate", feel: "timing a moving bar" },
  { slug: "drop-dodge", label: "Drop Dodge", feel: "dragging through falling hazards" },
  { slug: "flash-recall", label: "Flash Recall", feel: "memory sequences" },
  { slug: "cash-out", label: "Cash Out", feel: "banking a rising multiplier" },
  { slug: "one-lane", label: "One Lane", feel: "lane-flip endless runner" },
  { slug: "hold-line", label: "Hold the Line", feel: "press-and-release precision" },
  { slug: "word-trap", label: "Word Trap", feel: "read-fast reaction traps" },
  { slug: "pop-chain", label: "Pop Chain", feel: "clearing tile groups" },
  { slug: "one-gap", label: "One Gap", feel: "threading a single opening" },
  { slug: "drop-tower", label: "Drop Tower", feel: "stacking under gravity" },
  { slug: "cross-traffic", label: "Cross Traffic", feel: "crossing between hazards" },
  { slug: "drift-field", label: "Drift Field", feel: "floaty inertial steering" },
  { slug: "black-keys", label: "Black Keys", feel: "rhythm lanes" },
  { slug: "split", label: "Split", feel: "two things at once" },
  { slug: "nokia-mode", label: "Nokia Mode", feel: "monochrome snake-like" },
];

export const SPEC_TAGS = [
  "reflex", "precision", "memory", "endurance", "luck",
  "chaos", "calm", "retro", "casino", "oneTap", "drag", "hold",
] as const;

const safe = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // private mode — the game lives for this session only
    }
  },
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeLibrary(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let emitting = false;

function emit() {
  if (emitting) return;
  emitting = true;
  try {
    listeners.forEach((fn) => fn());
  } finally {
    emitting = false;
  }
}

function read(): CustomGameSpec[] {
  if (typeof window === "undefined") return [];
  let list: CustomGameSpec[] = [];
  try {
    list = JSON.parse(safe.get(KEY) ?? "null");
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) {
    // one-time migration off the pre-accounts key
    try {
      list = JSON.parse(safe.get(LEGACY_KEY) ?? "[]");
    } catch {
      list = [];
    }
    if (Array.isArray(list) && list.length) safe.set(KEY, JSON.stringify(list));
  }
  return Array.isArray(list) ? list : [];
}

function write(list: CustomGameSpec[]) {
  safe.set(KEY, JSON.stringify(list));
  emit();
}

export function allGames(): CustomGameSpec[] {
  return read().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function getSpec(slug: string): CustomGameSpec | null {
  return read().find((s) => s.slug === slug) ?? null;
}

export function gamesByAuthor(accountId: string): CustomGameSpec[] {
  return allGames().filter((s) => s.authorId === accountId);
}

/** Publishes under the signed-in account and returns the stored spec. */
export function publishGame(
  spec: CustomGameSpec,
  source: CustomGameSpec["source"] = "studio"
): CustomGameSpec {
  const me = currentAccount();
  const stored: CustomGameSpec = {
    ...spec,
    slug: uniqueSlug(spec.slug || slugify(spec.title)),
    authorId: spec.authorId ?? me.id,
    authorHandle: spec.authorHandle ?? me.handle,
    createdAt: spec.createdAt ?? Date.now(),
    source: spec.source ?? source,
  };
  write([...read().filter((s) => s.slug !== stored.slug), stored]);
  return stored;
}

/** Only the author can pull their own game out of the feed. */
export function removeGame(slug: string, byAccountId: string): boolean {
  const spec = getSpec(slug);
  if (!spec || spec.authorId !== byAccountId) return false;
  write(read().filter((s) => s.slug !== slug));
  return true;
}

export function reassignAuthor(fromId: string, account: Account) {
  const list = read();
  if (!list.some((s) => s.authorId === fromId)) return;
  write(
    list.map((s) =>
      s.authorId === fromId
        ? { ...s, authorId: account.id, authorHandle: account.handle }
        : s
    )
  );
}

// ---- slugs ----

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "game"
  );
}

function uniqueSlug(base: string): string {
  const taken = new Set(read().map((s) => s.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// ---- import / export (a game is a file you can send to a friend) ----

export function exportSpec(spec: CustomGameSpec): string {
  return JSON.stringify({ tiptapGame: 1, ...spec }, null, 2);
}

const HEX = /^#?[0-9a-fA-F]{6}$/;

/** Validates an uploaded file hard: unknown engine or junk axes = rejected. */
export function parseSpec(
  json: string
): { ok: true; spec: CustomGameSpec } | { ok: false; error: string } {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "that file isn't valid JSON" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "empty file" };

  const str = (v: unknown, max: number, fallback = "") =>
    typeof v === "string" ? v.slice(0, max) : fallback;
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  };

  const title = str(raw.title, 24).trim();
  if (!title) return { ok: false, error: "the file needs a title" };
  const base = str(raw.base, 40);
  if (!BASES.some((b) => b.slug === base))
    return { ok: false, error: `unknown engine "${base || "?"}"` };
  const accentRaw = str(raw.accent, 7, "#0095f6");
  if (!HEX.test(accentRaw)) return { ok: false, error: "accent must be a #rrggbb colour" };
  const tags = Array.isArray(raw.tags)
    ? (raw.tags as unknown[])
        .filter((t): t is string => typeof t === "string")
        .filter((t) => (SPEC_TAGS as readonly string[]).includes(t))
        .slice(0, 4)
    : [];

  return {
    ok: true,
    spec: {
      slug: slugify(str(raw.slug, 40) || title),
      base,
      title,
      rule: str(raw.rule, 48) || "Tap to find out.",
      description: str(raw.description, 140) || `An uploaded drop: ${title}.`,
      history: str(raw.history, 280) || "Uploaded to the feed by a player.",
      accent: accentRaw.startsWith("#") ? accentRaw : `#${accentRaw}`,
      tags: tags.length ? tags : ["chaos"],
      intensity: num(raw.intensity, 0.5),
      luck: num(raw.luck, 0.3),
      nostalgia: num(raw.nostalgia, 0.2),
      source: "import",
    },
  };
}
