import { NextResponse } from "next/server";

// Bases the generator may target — engines that read the accent token
// heavily enough that a recolour + rename reads as a new game.
const BASES = [
  { slug: "tap-rush", feel: "frantic target tapping" },
  { slug: "reflex-gate", feel: "timing a moving bar" },
  { slug: "drop-dodge", feel: "dragging through falling hazards" },
  { slug: "flash-recall", feel: "memory sequences" },
  { slug: "cash-out", feel: "banking a rising multiplier before it busts" },
  { slug: "one-lane", feel: "lane-flip endless runner" },
  { slug: "hold-line", feel: "press-and-release precision" },
  { slug: "word-trap", feel: "read-fast reaction traps" },
  { slug: "pop-chain", feel: "clearing tile groups" },
];

interface Spec {
  slug: string;
  base: string;
  title: string;
  rule: string;
  description: string;
  history: string;
  accent: string;
  tags: string[];
  intensity: number;
  luck: number;
  nostalgia: number;
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
  const a = (s * Math.min(l, 1 - l)) / 100 / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * 100 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Deterministic offline designer — the demo never depends on a key.
function localSpec(prompt: string): Spec {
  const h = hash(prompt.toLowerCase().trim() || "surprise me");
  const p = prompt.toLowerCase();
  const keyword = (words: string[]) => words.some((w) => p.includes(w));
  let base = BASES[h % BASES.length].slug;
  if (keyword(["casino", "bet", "gambl", "risk", "bank"])) base = "cash-out";
  else if (keyword(["dodge", "car", "fall", "avoid", "drive"])) base = "drop-dodge";
  else if (keyword(["memory", "remember", "simon", "recall"])) base = "flash-recall";
  else if (keyword(["run", "lane", "jump", "endless"])) base = "one-lane";
  else if (keyword(["tap", "fast", "speed", "frantic", "whack"])) base = "tap-rush";
  else if (keyword(["timing", "rhythm", "beat", "bar"])) base = "reflex-gate";
  else if (keyword(["match", "puzzle", "tile", "block"])) base = "pop-chain";
  else if (keyword(["hold", "charge", "fill"])) base = "hold-line";

  const STOP = new Set([
    "the", "and", "with", "that", "for", "game", "games", "like", "want",
    "where", "when", "what", "which", "who", "this", "these", "those", "some",
    "make", "made", "have", "has", "can", "could", "would", "should", "very",
    "really", "just", "kind", "sort", "you", "your", "myself", "something",
    "anything", "into", "from", "about", "then", "than", "but", "not", "all",
    "its", "it", "im", "i", "a", "an", "of", "in", "on", "is", "are", "be",
  ]);
  const words = prompt
    .replace(/[^a-zA-Z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  // pair a single strong word with a noun so it reads like a title
  const TAIL = ["Run", "Rush", "Drift", "Break", "Dash", "Nerve", "Loop", "Fall"];
  const title =
    words.length >= 2
      ? words.join(" ")
      : words.length === 1
        ? `${words[0]} ${TAIL[h % TAIL.length]}`
        : "Wildcard";

  return {
    slug: `custom-${h.toString(36)}`,
    base,
    title,
    rule: "Your rules. Tap to find out.",
    description: `A player-made drop, spun from: "${prompt.slice(0, 60)}"`,
    history:
      "Generated on demand from a player prompt — the feed designed this one for you, tuned to your algorithm, born in 2026.",
    accent: hslToHex(h % 360, 85, 55),
    tags: ["chaos"],
    intensity: ((h >> 4) % 100) / 100,
    luck: ((h >> 8) % 100) / 100,
    nostalgia: 0.1,
  };
}

async function deepseekSpec(prompt: string, key: string): Promise<Spec | null> {
  const baseList = BASES.map((b) => `"${b.slug}" (${b.feel})`).join(", ");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You design mini games for a swipe feed. Given a player's rambling wish, return ONLY JSON: {"base": one of [${baseList}], "title": string (max 20 chars, punchy, original — never an existing game's name), "rule": string (max 48 chars, imperative), "description": string (max 120 chars, Instagram-caption tone), "history": string (max 240 chars, a fun origin blurb crediting the player's idea), "accent": hex colour string fitting the vibe, "tags": array from [reflex,precision,memory,endurance,luck,chaos,calm,retro,casino,oneTap,drag,hold], "intensity": 0..1, "luck": 0..1, "nostalgia": 0..1}. Pick the base whose feel best matches the wish.`,
        },
        { role: "user", content: prompt.slice(0, 500) },
      ],
      max_tokens: 400,
      temperature: 1.1,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const raw = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  if (!raw.base || !raw.title) return null;
  return {
    ...localSpec(prompt), // slug + safe defaults
    ...raw,
    slug: `custom-${hash(prompt + raw.title).toString(36)}`,
  };
}

export async function POST(req: Request) {
  let prompt = "";
  try {
    const body = await req.json();
    prompt = String(body.prompt ?? "").slice(0, 800);
  } catch {
    // fall through with empty prompt
  }
  const key = process.env.DEEPSEEK_API_KEY;
  if (key) {
    try {
      const spec = await deepseekSpec(prompt, key);
      if (spec) return NextResponse.json({ spec, engine: "deepseek" });
    } catch {
      // fall through to the local designer
    }
  }
  return NextResponse.json({ spec: localSpec(prompt), engine: "local" });
}
