import { NextResponse } from "next/server";
import {
  baseForPrompt,
  GENERATOR_BASES,
  hash,
  normalizeSpec,
  VALID_TAGS,
  type CustomGameSpec,
} from "@/lib/specs";

// Deterministic offline designer — the demo never depends on a key.
function localSpec(prompt: string): CustomGameSpec {
  return normalizeSpec({}, prompt);
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
          content: `You design mini games for a swipe feed. Given a player's rambling wish, return ONLY JSON: {"base": exactly one of these slugs, copied verbatim: [${baseList}], "title": string (max 24 chars, punchy, original — never an existing game's name — and must contain Nic, e.g. "Nic's Neon Rush"), "description": string (max 120 chars, Instagram-caption tone), "history": string (max 240 chars, a fun origin blurb crediting the player's idea), "accent": a 6-digit hex colour like "#ff4d6d" fitting the vibe, "tags": array of 1-3 strings from [${VALID_TAGS.join(",")}], "intensity": number 0..1, "luck": number 0..1, "nostalgia": number 0..1}. Pick the base whose feel best matches the wish. The base slug must match one of the listed slugs character for character.`,
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
