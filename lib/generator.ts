// Background game generation. Kicking one off returns immediately: a
// placeholder card drops into the feed as the next card and plays a live
// "building…" animation, generation runs in the background (DeepSeek when the
// server has a key, offline designer otherwise), and when it finishes the
// card's slug is swapped in place — so the finished game pops up right where
// the player is already looking, no extra swipe, no blank wait.
import { registerSpec } from "@/games/custom";
import { apiUrl, serverRoutesReachable } from "@/lib/native";
import {
  registerPending,
  setGenProgress,
  clearGen,
} from "@/games/pending";
import { unregisterModule } from "@/games/registry";
import { saveCustomSpec, type CustomGameSpec } from "@/lib/storage";
import { useFeedStore } from "@/store/useFeedStore";

// Even when the offline designer answers instantly, we hold the build for a
// beat so it reads as something being made, not a jump-cut. Real DeepSeek
// latency is never capped — this is only a floor.
const MIN_COOK_MS = 3200;

const STEPS = [
  "Reading your idea",
  "Choosing a mechanic",
  "Designing the look",
  "Balancing difficulty",
  "Composing its track",
  "Almost there",
];

export interface GenHandle {
  slug: string; // provisional title's placeholder slug
  title: string;
  done: Promise<CustomGameSpec>;
}

/**
 * Start building a game from a prompt. Non-blocking: the returned handle
 * carries the provisional title (for a toast) and a promise that resolves
 * with the finished spec once it's live in the feed.
 */
export function startGeneration(prompt: string): GenHandle {
  const prov = provisional(prompt);
  registerPending({ slug: prov.slug, title: prov.title, accent: prov.accent });
  const uid = useFeedStore.getState().insertPending(prov.slug);

  // Drive the on-card progress bar toward a ceiling while we wait, so it
  // feels alive and never stalls at 0 or falsely hits 100 early.
  const startedAt = now();
  let target = 0.14;
  let cur = 0.05;
  const timer = setInterval(() => {
    const elapsed = now() - startedAt;
    const step = Math.min(STEPS.length - 1, Math.floor(elapsed / 620));
    cur += (target - cur) * 0.16;
    setGenProgress(prov.slug, Math.min(cur, 0.94), STEPS[step]);
    if (target < 0.9) target = Math.min(0.9, target + 0.035);
  }, 110);

  const done = (async (): Promise<CustomGameSpec> => {
    let spec: CustomGameSpec;
    try {
      if (!serverRoutesReachable) throw new Error("no server in this build");
      const res = await fetch(apiUrl("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`generate failed: ${res.status}`);
      const data = (await res.json()) as {
        spec: CustomGameSpec;
        engine?: string;
        engineError?: string;
      };
      spec = data.spec;
      if (data.engineError) {
        // Not fatal — the local designer still shipped a real game — but worth
        // knowing when the AI path was expected to run.
        console.warn(`[generate] engine=${data.engine}: ${data.engineError}`);
      }
    } catch (e) {
      console.warn("[generate] falling back to offline designer:", e);
      spec = offlineSpec(prompt, prov);
    }

    // Register early so the swap is instantaneous, but hold the visible
    // completion until the cook floor has passed.
    if (!registerSpec(spec)) spec = offlineSpec(prompt, prov);
    registerSpec(spec);

    const wait = Math.max(0, MIN_COOK_MS - (now() - startedAt));
    await sleep(wait);

    clearInterval(timer);
    setGenProgress(prov.slug, 1, "Ready");
    await sleep(260); // let the ring finish snapping shut

    saveCustomSpec(spec);
    useFeedStore.getState().resolveCard(uid, spec.slug);
    // The placeholder module has served its purpose; drop it from the catalog.
    unregisterModule(prov.slug);
    clearGen(prov.slug);
    return spec;
  })();

  return { slug: prov.slug, title: prov.title, done };
}

// --- provisional spec: instant, client-side, just enough for the placeholder
// title + accent while the real design lands. Mirrors the server's offline
// designer so the finished game feels like a continuation, not a swap. ---

export interface Prov {
  slug: string;
  title: string;
  accent: string;
}

function provisional(prompt: string): Prov {
  const h = hash(prompt.toLowerCase().trim() || "surprise me");
  return {
    slug: `pending-${h.toString(36)}-${uidSalt++}`,
    title: deriveTitle(prompt, h),
    accent: hslToHex(h % 360, 85, 55),
  };
}

const BASES = [
  "tap-rush", "reflex-gate", "drop-dodge", "flash-recall", "cash-out",
  "one-lane", "hold-line", "word-trap", "pop-chain",
];
const BASE_RULE: Record<string, string> = {
  "tap-rush": "Hit the targets before they vanish",
  "reflex-gate": "Tap when the bar hits green",
  "drop-dodge": "Drag through the gaps",
  "flash-recall": "Repeat the sequence",
  "cash-out": "Bank it before it busts",
  "one-lane": "Tap to flip lanes",
  "hold-line": "Fill to the line, don't overshoot",
  "word-trap": "Tap only if the colour matches the word",
  "pop-chain": "Tap groups of 3 or more",
};

function pickBase(prompt: string, h: number): string {
  const p = prompt.toLowerCase();
  const kw = (w: string[]) => w.some((x) => p.includes(x));
  if (kw(["casino", "bet", "gambl", "risk", "bank", "multiplier", "cash"])) return "cash-out";
  if (kw(["dodge", "car", "fall", "avoid", "drive", "traffic", "obstacle"])) return "drop-dodge";
  if (kw(["memory", "remember", "simon", "recall", "sequence", "pattern"])) return "flash-recall";
  if (kw(["run", "lane", "jump", "endless", "runner", "flip"])) return "one-lane";
  if (kw(["tap", "fast", "speed", "frantic", "whack", "click", "target"])) return "tap-rush";
  if (kw(["timing", "rhythm", "beat", "bar", "time it"])) return "reflex-gate";
  if (kw(["match", "puzzle", "tile", "block", "group", "clear"])) return "pop-chain";
  if (kw(["hold", "charge", "fill", "release", "meter", "gauge"])) return "hold-line";
  if (kw(["read", "word", "colour", "color", "stroop", "trick"])) return "word-trap";
  return BASES[h % BASES.length];
}

// Ultimate fallback if even our own API is unreachable — a fully playable
// offline game so a build never dead-ends on a broken card.
export function offlineSpec(prompt: string, prov: Prov = provisional(prompt)): CustomGameSpec {
  const h = hash(prompt.toLowerCase().trim() || "surprise me");
  const base = pickBase(prompt, h);
  return {
    slug: `custom-${h.toString(36)}`,
    base,
    title: prov.title,
    rule: BASE_RULE[base],
    description: `A player-made drop, spun from: "${prompt.slice(0, 60)}"`,
    history:
      "Generated on your device from your prompt — the feed designed this one for you, born in 2026.",
    accent: prov.accent,
    tags: ["chaos"],
    intensity: ((h >>> 4) % 100) / 100,
    luck: ((h >>> 8) % 100) / 100,
    nostalgia: 0.1,
  };
}

const STOP = new Set([
  "the", "and", "with", "that", "for", "game", "games", "like", "want",
  "where", "when", "what", "which", "who", "this", "these", "those", "some",
  "make", "made", "have", "has", "can", "could", "would", "should", "very",
  "really", "just", "kind", "sort", "you", "your", "myself", "something",
  "anything", "into", "from", "about", "then", "than", "but", "not", "all",
  "its", "it", "im", "i", "a", "an", "of", "in", "on", "is", "are", "be",
]);
const TAIL = ["Run", "Rush", "Drift", "Break", "Dash", "Nerve", "Loop", "Fall"];

function deriveTitle(prompt: string, h: number): string {
  const words = prompt
    .replace(/[^a-zA-Z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  // Every game in the feed carries Nic's name, placeholders included — so the
  // building card reads the same as the finished one.
  if (words.length >= 2) return `Nic's ${words.join(" ")}`.slice(0, 24);
  if (words.length === 1) return `Nic's ${words[0]} ${TAIL[h % TAIL.length]}`.slice(0, 24);
  return "Nic's Wildcard";
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const L = l / 100;
  const a = (s * Math.min(L, 1 - L)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    const v = Math.max(0, Math.min(255, Math.round(255 * c)));
    return v.toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

let uidSalt = 0;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
