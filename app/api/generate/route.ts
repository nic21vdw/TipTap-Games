import { NextResponse } from "next/server";

// Bases the generator may target. Each engine is proven and safe to run; a
// spec picks one, renames it, recolours it and repositions it in the
// algorithm's feature space. `rule` is the engine's REAL interaction — the
// one thing the finished card must never lie about, so what you read is what
// you actually play.
const BASES = [
  { slug: "tap-rush", feel: "frantic target tapping", rule: "Hit the targets before they vanish" },
  { slug: "reflex-gate", feel: "timing a moving bar", rule: "Tap when the bar hits green" },
  { slug: "drop-dodge", feel: "dragging through falling hazards", rule: "Drag through the gaps" },
  { slug: "flash-recall", feel: "memory sequences", rule: "Repeat the sequence" },
  { slug: "cash-out", feel: "banking a rising multiplier before it busts", rule: "Bank it before it busts" },
  { slug: "one-lane", feel: "lane-flip endless runner", rule: "Tap to flip lanes" },
  { slug: "hold-line", feel: "press-and-release precision", rule: "Fill to the line, don't overshoot" },
  { slug: "word-trap", feel: "read-fast reaction traps", rule: "Tap only if the colour matches the word" },
  { slug: "pop-chain", feel: "clearing tile groups", rule: "Tap groups of 3 or more" },
];
const BASE_RULE: Record<string, string> = Object.fromEntries(
  BASES.map((b) => [b.slug, b.rule])
);

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

// h 0..360, s/l as percentages (0..100). Standard HSL→hex.
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

function pickBase(prompt: string, h: number): string {
  const p = prompt.toLowerCase();
  const keyword = (words: string[]) => words.some((w) => p.includes(w));
  if (keyword(["casino", "bet", "gambl", "risk", "bank", "multiplier", "cash"])) return "cash-out";
  if (keyword(["dodge", "car", "fall", "avoid", "drive", "traffic", "obstacle"])) return "drop-dodge";
  if (keyword(["memory", "remember", "simon", "recall", "sequence", "pattern"])) return "flash-recall";
  if (keyword(["run", "lane", "jump", "endless", "runner", "flip"])) return "one-lane";
  if (keyword(["tap", "fast", "speed", "frantic", "whack", "click", "target"])) return "tap-rush";
  if (keyword(["timing", "rhythm", "beat", "bar", "time it"])) return "reflex-gate";
  if (keyword(["match", "puzzle", "tile", "block", "group", "clear"])) return "pop-chain";
  if (keyword(["hold", "charge", "fill", "release", "meter", "gauge"])) return "hold-line";
  if (keyword(["read", "word", "colour", "color", "stroop", "trick"])) return "word-trap";
  return BASES[h % BASES.length].slug;
}

// Deterministic offline designer — the demo never depends on a key.
function localSpec(prompt: string): Spec {
  const h = hash(prompt.toLowerCase().trim() || "surprise me");
  const base = pickBase(prompt, h);

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
    // The rule is the base engine's REAL interaction, so the card never
    // promises a mechanic the game doesn't have.
    rule: BASE_RULE[base],
    description: `A player-made drop, spun from: "${prompt.slice(0, 60)}"`,
    history:
      "Generated on demand from a player prompt — the feed designed this one for you, tuned to your algorithm, born in 2026.",
    accent: hslToHex(h % 360, 85, 55),
    tags: ["chaos"],
    // `>>>` keeps the hash unsigned, so these axes never go negative
    intensity: ((h >>> 4) % 100) / 100,
    luck: ((h >>> 8) % 100) / 100,
    nostalgia: 0.1,
  };
}

async function deepseekSpec(prompt: string, key: string): Promise<Spec> {
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
          content: `You design mini games for a swipe feed. Every game runs on one of a fixed set of proven engines — you cannot invent a new mechanic, you choose the engine whose feel best fits the wish, then dress it up. Given a player's rambling wish, return ONLY JSON: {"base": one of [${baseList}], "title": string (max 20 chars, punchy, original — never an existing game's name), "description": string (max 120 chars, Instagram-caption tone, describing the vibe), "history": string (max 240 chars, a fun origin blurb crediting the player's idea), "accent": hex colour string fitting the vibe, "tags": array from [reflex,precision,memory,endurance,luck,chaos,calm,retro,casino,oneTap,drag,hold], "intensity": 0..1, "luck": 0..1, "nostalgia": 0..1}. Pick the base whose feel best matches the wish — the actual gameplay WILL be that engine, so choose it faithfully. Do not write a rule; the engine's own rule is used so the card never lies about how it plays.`,
        },
        { role: "user", content: prompt.slice(0, 500) },
      ],
      max_tokens: 400,
      temperature: 1.1,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`deepseek ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  const data = await res.json();
  const raw = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  if (!raw.base || !raw.title) throw new Error("deepseek returned no base/title");
  // Force the base to a real engine, and force the rule to that engine's
  // actual interaction. The model's creativity lives in title/description.
  const base = BASE_RULE[raw.base] ? raw.base : localSpec(prompt).base;
  return {
    ...localSpec(prompt), // slug + safe defaults
    ...raw,
    base,
    rule: BASE_RULE[base],
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
      return NextResponse.json({ spec, engine: "deepseek" });
    } catch (e) {
      // DeepSeek is the intended designer; when it fails we still ship a
      // playable game, but we say why so the failure isn't invisible.
      return NextResponse.json({
        spec: localSpec(prompt),
        engine: "local",
        engineError: e instanceof Error ? e.message : "deepseek unavailable",
      });
    }
  }
  return NextResponse.json({
    spec: localSpec(prompt),
    engine: "local",
    engineError: "DEEPSEEK_API_KEY not set on the server",
  });
}
