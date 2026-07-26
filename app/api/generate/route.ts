import { NextResponse } from "next/server";
import { hslToHex } from "@/lib/color";
import {
  baseForPrompt,
  GENERATOR_BASES,
  hash,
  normalizeSpec,
  VALID_TAGS,
  type CustomGameSpec,
} from "@/lib/specs";

const STOP = new Set([
  "the", "and", "with", "that", "for", "game", "games", "like", "want",
  "where", "when", "what", "which", "who", "this", "these", "those", "some",
  "make", "made", "have", "has", "can", "could", "would", "should", "very",
  "really", "just", "kind", "sort", "you", "your", "myself", "something",
  "anything", "into", "from", "about", "then", "than", "but", "not", "all",
  "its", "it", "im", "i", "a", "an", "of", "in", "on", "is", "are", "be",
  // filler that used to sneak into titles: "Runner Through", "Neon Where"
  "through", "over", "under", "while", "across", "around", "after", "before",
  "between", "against", "there", "here", "much", "more", "most", "many",
  "also", "even", "still", "every", "each", "one", "two", "get", "gets",
  "got", "going", "gonna", "wish", "wishes", "please", "thing", "things",
  "stuff", "play", "playing", "player", "feel", "feels", "vibe", "vibes",
  "little", "super", "kinda", "sorta", "maybe", "idea", "cool", "nice",
]);

// Nouns that read as a title's second half. A prompt word only becomes the
// tail when it already is one — otherwise we borrow from here.
const TAIL_WORDS = new Set([
  "runner", "run", "rush", "dash", "drift", "chase", "race", "jump", "climb",
  "drop", "fall", "dodge", "break", "loop", "gate", "lane", "line", "trap",
  "tower", "chain", "recall", "nerve", "bank", "bet", "streak", "combo",
]);
const TAIL_POOL = ["Run", "Rush", "Drift", "Break", "Dash", "Nerve", "Loop", "Fall"];

/** "ruins" -> "Ruin", so a two-word title reads like a title. */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

const titleCase = (w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase();

function titleFrom(prompt: string, h: number): string {
  const words = prompt
    .replace(/[^a-zA-Z ]/g, " ")
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !STOP.has(w));
  const unique = [...new Set(words)];
  if (unique.length === 0) return "Wildcard";

  const tailIndex = unique.findIndex((w, i) => i > 0 && TAIL_WORDS.has(w));
  const head = unique[0];
  const tail =
    tailIndex >= 0
      ? titleCase(unique[tailIndex])
      : unique.length > 1 && unique[1].length > 3
        ? titleCase(unique[1])
        : TAIL_POOL[h % TAIL_POOL.length];
  const title = `${titleCase(singular(head))} ${tail}`;
  return title.length <= 20 ? title : titleCase(singular(head)).slice(0, 20);
}

// Deterministic offline designer — the demo never depends on a key.
function localSpec(prompt: string): CustomGameSpec {
  const text = prompt.trim() || "surprise me";
  const h = hash(text.toLowerCase());
  const base = baseForPrompt(text.toLowerCase());
  const title = titleFrom(text, h);
  return normalizeSpec(
    {
      slug: `custom-${h.toString(36)}`,
      base,
      title,
      description: `A player-made drop, spun from: "${text.slice(0, 60)}"`,
      history:
        "Generated on demand from a player prompt — the feed designed this one for you, tuned to your algorithm, born in 2026.",
      accent: hslToHex(h % 360, 82, 56),
      tags: ["chaos"],
      // >>> keeps these unsigned; >> used to hand back negative axes, which
      // clamped to 0 and parked every custom game in the calm/skill corner.
      intensity: 0.35 + ((h >>> 4) % 60) / 100,
      luck: ((h >>> 10) % 45) / 100,
      nostalgia: 0.1,
    },
    text
  );
}

async function deepseekSpec(
  prompt: string,
  key: string
): Promise<CustomGameSpec | null> {
  const baseList = GENERATOR_BASES.map((b) => `"${b.slug}" (${b.feel})`).join(", ");
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
          content: `You design mini games for a swipe feed. Given a player's rambling wish, return ONLY JSON: {"base": exactly one of these slugs, copied verbatim: [${baseList}], "title": string (max 20 chars, punchy, original — never an existing game's name), "description": string (max 120 chars, Instagram-caption tone), "history": string (max 240 chars, a fun origin blurb crediting the player's idea), "accent": a 6-digit hex colour like "#ff4d6d" fitting the vibe, "tags": array of 1-3 strings from [${VALID_TAGS.join(",")}], "intensity": number 0..1, "luck": number 0..1, "nostalgia": number 0..1}. Pick the base whose feel best matches the wish. The base slug must match one of the listed slugs character for character.`,
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
  let raw: Partial<CustomGameSpec>;
  try {
    raw = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || !raw.title) return null;
  // The offline designer supplies every field the model skipped or fumbled;
  // normalizeSpec then guarantees the result is something we can build.
  return normalizeSpec(
    {
      ...localSpec(prompt),
      ...raw,
      slug: `custom-${hash(prompt + raw.title).toString(36)}`,
    },
    prompt
  );
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
