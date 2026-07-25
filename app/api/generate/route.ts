import { NextResponse } from "next/server";
import { CATALOG } from "@/games/registry";
import type { CustomGameSpec } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------- provider
//
// The designer speaks the OpenAI chat-completions dialect, which DeepSeek and
// every host that serves DeepSeek also speak. That gives three ways to run it,
// in priority order, and a local designer underneath so the feature is never
// dark:
//
//   OPENROUTER_API_KEY  -> openrouter.ai, deepseek-chat-v3 on its free tier
//   DEEPSEEK_API_KEY    -> api.deepseek.com (or DEEPSEEK_BASE_URL)
//   nothing             -> the local designer below
//
// DEEPSEEK_BASE_URL / DEEPSEEK_MODEL override the endpoint and model for any
// other OpenAI-compatible host.

interface Provider {
  name: string;
  url: string;
  key: string;
  model: string;
  headers?: Record<string, string>;
}

function provider(): Provider | null {
  const or = process.env.OPENROUTER_API_KEY;
  if (or) {
    return {
      name: "deepseek (openrouter free)",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: or,
      model: process.env.DEEPSEEK_MODEL ?? "deepseek/deepseek-chat-v3-0324:free",
      headers: {
        "HTTP-Referer": process.env.PUBLIC_URL ?? "https://tiptap.games",
        "X-Title": "Tip Tap Games",
      },
    };
  }
  const ds = process.env.DEEPSEEK_API_KEY;
  if (ds) {
    const base = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(
      /\/$/,
      ""
    );
    return {
      name: "deepseek",
      url: `${base}/chat/completions`,
      key: ds,
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    };
  }
  return null;
}

// ------------------------------------------------------------------ engines

/** Every shipped game can host a generated variant. */
const ENGINES = CATALOG.map((m) => ({
  slug: m.slug,
  rule: m.rule,
  tags: m.tags,
  intensity: m.intensity,
  luck: m.luck,
}));

const ENGINE_MENU = ENGINES.map(
  (e) => `${e.slug} — ${e.rule} [${e.tags.join(" ")}]`
).join("\n");

const VALID_TAGS = new Set([
  "reflex", "precision", "memory", "endurance", "luck", "chaos", "calm",
  "retro", "casino", "oneTap", "drag", "hold",
]);

// -------------------------------------------------------------- local mind

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** h in degrees, s and l in percent. */
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * Math.max(0, Math.min(1, c)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const STOP = new Set([
  "the", "and", "with", "that", "for", "game", "games", "like", "want", "where",
  "when", "what", "which", "who", "this", "these", "those", "some", "make",
  "made", "have", "has", "can", "could", "would", "should", "very", "really",
  "just", "kind", "sort", "you", "your", "myself", "something", "anything",
  "into", "from", "about", "then", "than", "but", "not", "all", "its", "it",
  "im", "i", "a", "an", "of", "in", "on", "is", "are", "be", "where's",
]);

function keywords(prompt: string): string[] {
  return prompt
    .replace(/[^a-zA-Z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()))
    .map((w) => w.toLowerCase());
}

/**
 * Subject words map straight onto the engine that does that thing. Without
 * this, "snake" scores nothing — no engine's slug or one-line rule says the
 * word — and the pick comes down to incidental substring luck.
 */
const ALIASES: Record<string, string[]> = {
  snake: ["nokia-mode", "coil"],
  worm: ["coil", "nokia-mode"],
  bird: ["one-gap", "sky-whale"],
  flap: ["one-gap"],
  block: ["line-fall", "block-fit", "drop-tower"],
  blocks: ["line-fall", "block-fit"],
  tetris: ["line-fall"],
  brick: ["brick-rally"],
  card: ["patience"],
  cards: ["patience"],
  poker: ["cash-out", "patience"],
  pool: ["corner-pocket"],
  farm: ["plot-farm"],
  tower: ["drop-tower", "field-defence", "floor-plan"],
  defence: ["lane-guard", "field-defence"],
  maze: ["tilt-maze", "sweep"],
  mine: ["sweep"],
  race: ["circuit", "redline", "sprint-party"],
  racing: ["circuit", "redline"],
  car: ["circuit", "hill-hauler", "ghost-traffic"],
  drive: ["hill-hauler", "ghost-traffic", "circuit"],
  fish: ["deep-cast"],
  fishing: ["deep-cast"],
  ski: ["powder-line"],
  snow: ["powder-line"],
  climb: ["hammer-climb", "sky-climb", "wall-switch"],
  pet: ["pet-rock", "poke-pet"],
  zombie: ["horde-run", "lane-guard"],
  ninja: ["slice-run", "wall-switch"],
  knife: ["blade-log"],
  fruit: ["slice-run"],
  slice: ["slice-run"],
  piano: ["black-keys", "beat-tap"],
  music: ["beat-tap", "beat-lane", "black-keys"],
  rhythm: ["beat-tap", "pulse-jump", "beat-lane"],
  word: ["word-trap", "tile-duel"],
  words: ["tile-duel", "word-trap"],
  spell: ["tile-duel"],
  draw: ["sled-line", "guess-draw", "landing-lines"],
  drawing: ["guess-draw", "sled-line"],
  rope: ["snip-drop", "grapple-swing"],
  swing: ["grapple-swing"],
  water: ["dig-flow", "pour"],
  bomb: ["slice-run", "bad-ideas"],
  jump: ["updraft", "pulse-jump", "rooftop-dash"],
  run: ["ruin-run", "one-lane", "rooftop-dash"],
  runner: ["ruin-run", "one-lane", "horde-run"],
  dodge: ["drop-dodge", "cube-field"],
  shoot: ["void-wing", "down-shaft", "ball-storm"],
  space: ["void-wing", "drift-field"],
  plane: ["landing-lines"],
  balloon: ["rise-shield"],
  bet: ["cash-out"],
  gamble: ["cash-out"],
  casino: ["cash-out"],
  plague: ["spread"],
  virus: ["spread"],
  island: ["island-toy"],
  merge: ["merge-grid"],
  match: ["cascade", "prism-match", "dot-link"],
  puzzle: ["pipe-link", "sweep", "block-fit"],
};

/** Score every engine against the prompt; used by the local designer and to
 *  give the model a shortlist worth reading. */
function shortlist(prompt: string, n: number): typeof ENGINES {
  const words = keywords(prompt);
  const p = prompt.toLowerCase();
  const aliased = new Map<string, number>();
  for (const w of words)
    for (const slug of ALIASES[w] ?? [])
      aliased.set(slug, (aliased.get(slug) ?? 0) + 9);
  const scored = ENGINES.map((e) => {
    let score = aliased.get(e.slug) ?? 0;
    for (const w of words) {
      if (e.slug.includes(w)) score += 2;
      if (e.rule.toLowerCase().includes(w)) score += 2;
      if (e.tags.some((tg) => tg.toLowerCase() === w)) score += 3;
    }
    // stated intent beats an incidental word match
    const wants = (list: string[], tag: string) =>
      list.some((w) => p.includes(w)) && e.tags.includes(tag as never) ? 5 : 0;
    score += wants(["fast", "frantic", "chaos", "mad", "hectic", "panic"], "chaos");
    score += wants(["calm", "chill", "slow", "relax", "zen", "gentle"], "calm");
    score += wants(["remember", "memory", "recall", "sequence"], "memory");
    score += wants(["retro", "old", "nokia", "nostalg", "classic", "90s"], "retro");
    score += wants(["bet", "gambl", "casino", "chips", "risk", "stake"], "casino");
    score += wants(["one tap", "single tap", "one button", "onetap"], "oneTap");
    score += wants(["drag", "swipe", "steer"], "drag");
    score += wants(["hold", "charge", "press and"], "hold");
    score += wants(["hard", "brutal", "endless", "forever", "marathon"], "endurance");
    return { e, score };
  });
  scored.sort((a, b) => b.score - a.score || a.e.slug.localeCompare(b.e.slug));
  return scored.slice(0, n).map((x) => x.e);
}

/** How many engines the prompt actually touched, for an honest progress note. */
function matchCount(prompt: string): number {
  const words = keywords(prompt);
  if (!words.length) return 0;
  return ENGINES.filter((e) =>
    words.some(
      (w) =>
        (ALIASES[w] ?? []).includes(e.slug) ||
        e.slug.includes(w) ||
        e.rule.toLowerCase().includes(w) ||
        e.tags.some((tg) => tg.toLowerCase() === w)
    )
  ).length;
}

const TAIL = ["Run", "Rush", "Drift", "Break", "Dash", "Nerve", "Loop", "Fall", "Line", "Gate"];

function localSpec(prompt: string): CustomGameSpec {
  const h = hash(prompt.toLowerCase().trim() || "surprise me");
  // if the prompt actually named something, honour it; only a prompt with
  // nothing to match on gets a hash-picked surprise
  const top = shortlist(prompt, 8);
  const best = matchCount(prompt) > 0 ? top[0] : top[h % top.length];
  const base = (best ?? ENGINES[h % ENGINES.length]).slug;
  const words = keywords(prompt).slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1));
  const title =
    words.length >= 2
      ? words.join(" ")
      : words.length === 1
        ? `${words[0]} ${TAIL[h % TAIL.length]}`
        : "Wildcard";
  const hue = h % 360;
  // unsigned shifts throughout: a signed >> here would hand the feed a
  // negative luck score and a density of 0.11
  const bits = (shift: number, mod: number) => (h >>> shift) % mod;
  const engine = ENGINES.find((e) => e.slug === base);
  return {
    slug: `custom-${h.toString(36)}`,
    base,
    title: title.slice(0, 22),
    rule: engine?.rule ?? "Your rules. Tap to find out.",
    description: `A player-made drop, spun from: "${prompt.slice(0, 60)}"`,
    history:
      "Generated on demand from a player prompt — the feed designed this one for you, tuned to your algorithm, born in 2026.",
    accent: hslToHex(hue, 85, 55),
    palette: {
      hero: hslToHex(hue, 85, 60),
      foe: hslToHex((hue + 165) % 360, 75, 52),
      prize: hslToHex((hue + 45) % 360, 90, 62),
      deep: hslToHex((hue + 200) % 360, 45, 22),
      glow: hslToHex((hue + 25) % 360, 70, 70),
    },
    tags: engine?.tags?.length ? [engine.tags[0]] : ["chaos"],
    intensity: engine?.intensity ?? bits(4, 100) / 100,
    luck: engine?.luck ?? bits(8, 100) / 100,
    nostalgia: 0.1,
    tune: {
      speed: 0.85 + bits(12, 60) / 100,
      density: 0.8 + bits(16, 70) / 100,
    },
  };
}

// -------------------------------------------------------------- validation

const clamp01 = (n: unknown, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
};

const hex = (v: unknown, fallback: string) =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;

const text = (v: unknown, fallback: string, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;

/** Whatever the model returns, this is what actually reaches the feed. */
function coerce(raw: Record<string, unknown>, prompt: string): CustomGameSpec {
  const fb = localSpec(prompt);
  const baseOk =
    typeof raw.base === "string" && ENGINES.some((e) => e.slug === raw.base);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string" && VALID_TAGS.has(t))
    : [];
  const pal = (raw.palette ?? {}) as Record<string, unknown>;
  const tune = (raw.tune ?? {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  };
  const title = text(raw.title, fb.title, 22);
  return {
    slug: `custom-${hash(prompt + title).toString(36)}`,
    base: baseOk ? (raw.base as string) : fb.base,
    title,
    rule: text(raw.rule, fb.rule, 48),
    description: text(raw.description, fb.description, 140),
    history: text(raw.history, fb.history, 280),
    accent: hex(raw.accent, fb.accent),
    palette: {
      hero: hex(pal.hero, fb.palette!.hero),
      foe: hex(pal.foe, fb.palette!.foe),
      prize: hex(pal.prize, fb.palette!.prize),
      deep: hex(pal.deep, fb.palette!.deep),
      glow: hex(pal.glow, fb.palette!.glow),
    },
    tags: tags.length ? tags : fb.tags,
    intensity: clamp01(raw.intensity, fb.intensity),
    luck: clamp01(raw.luck, fb.luck),
    nostalgia: clamp01(raw.nostalgia, fb.nostalgia),
    tune: {
      speed: num(tune.speed, 0.6, 1.6, fb.tune!.speed),
      density: num(tune.density, 0.5, 1.8, fb.tune!.density),
    },
  };
}

const SYSTEM = `You are the in-house game designer for Tip Tap Games, a vertical feed of tiny playable games.

You do not write code. You write a SPEC: you pick one of our shipped engines, then rename, recolour and retune it into a game that answers the player's wish.

Return ONLY a JSON object with exactly these keys:
{
  "base": string — the slug of the engine to build on, copied exactly from the engine list,
  "title": string — max 20 chars, punchy and ORIGINAL. Never the name of a real game.
  "rule": string — max 44 chars, imperative, tells the player what to do with their thumb,
  "description": string — max 120 chars, the caption, confident and a bit funny,
  "history": string — max 220 chars, a short origin blurb crediting the player's idea,
  "accent": "#rrggbb",
  "palette": { "hero": "#rrggbb", "foe": "#rrggbb", "prize": "#rrggbb", "deep": "#rrggbb", "glow": "#rrggbb" },
  "tags": string[] from [reflex,precision,memory,endurance,luck,chaos,calm,retro,casino,oneTap,drag,hold],
  "intensity": 0..1, "luck": 0..1, "nostalgia": 0..1,
  "tune": { "speed": 0.6..1.6, "density": 0.5..1.8 }
}

Rules:
- "base" MUST be one of the listed slugs, exactly. Pick the engine whose rule best matches the wish.
- palette: hero is what the player controls, foe is what ends the run, prize is what they want, deep is the far background, glow is the highlight. Make it match the mood of the wish.
- tune.speed above 1 makes it faster and twitchier; tune.density above 1 makes it busier.
- Never reference a real game by name in any field.`;

async function askModel(
  prompt: string,
  p: Provider,
  signal: AbortSignal
): Promise<CustomGameSpec | null> {
  const picks = shortlist(prompt, 28);
  const menu =
    picks.map((e) => `${e.slug} — ${e.rule} [${e.tags.join(" ")}]`).join("\n") +
    "\n(other engines are available; the full list follows)\n" +
    ENGINE_MENU;
  const res = await fetch(p.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${p.key}`,
      ...(p.headers ?? {}),
    },
    body: JSON.stringify({
      model: p.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${SYSTEM}\n\nENGINE LIST:\n${menu}` },
        { role: "user", content: prompt.slice(0, 600) },
      ],
      max_tokens: 700,
      temperature: 1.05,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`${p.name} returned ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  // some hosts wrap JSON in a fenced block
  const body = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const raw = JSON.parse(body) as Record<string, unknown>;
  if (!raw.title && !raw.base) return null;
  return coerce(raw, prompt);
}

// ------------------------------------------------------------------- route

interface Step {
  pct: number;
  label: string;
  note: string;
}

const enc = new TextEncoder();

export async function POST(req: Request) {
  let prompt = "";
  try {
    const body = await req.json();
    prompt = String(body.prompt ?? "").slice(0, 800);
  } catch {
    // an empty prompt still gets a game
  }
  const wantsStream = new URL(req.url).searchParams.get("stream") === "1";
  const p = provider();

  if (!wantsStream) {
    // plain one-shot, kept for anything that does not want the play-by-play
    if (p) {
      try {
        const spec = await askModel(prompt, p, AbortSignal.timeout(25000));
        if (spec) return NextResponse.json({ spec, engine: p.name });
      } catch {
        // fall through to the local designer
      }
    }
    return NextResponse.json({ spec: localSpec(prompt), engine: "local designer" });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const step = (s: Step) => send({ type: "step", ...s });

      const words = keywords(prompt);
      step({
        pct: 6,
        label: "Reading the brief",
        note: words.length
          ? `picked up: ${words.slice(0, 4).join(", ")}`
          : "no brief — going on instinct",
      });

      const picks = shortlist(prompt, 28);
      const hits = matchCount(prompt);
      step({
        pct: 15,
        label: "Shortlisting engines",
        note: hits
          ? `${hits} of ${ENGINES.length} engines match — best fit "${picks[0]?.slug}"`
          : `nothing to match on, ranking all ${ENGINES.length} by feel`,
      });

      let spec: CustomGameSpec | null = null;
      let engine = "local designer";

      if (p) {
        step({
          pct: 22,
          label: "Briefing the designer",
          note: `${p.model} is reading the engine list`,
        });
        // the model call is one long await, so creep the bar while it thinks
        const NOTES = [
          "choosing a mechanic",
          "naming it",
          "writing the one-line rule",
          "mixing a palette",
          "setting speed and density",
          "writing the caption",
        ];
        let tick = 0;
        const creep = setInterval(() => {
          tick += 1;
          const pct = Math.min(78, 24 + tick * 3.4);
          step({
            pct,
            label: "Designing",
            note: NOTES[Math.min(NOTES.length - 1, Math.floor(tick / 3))],
          });
        }, 700);
        try {
          spec = await askModel(prompt, p, AbortSignal.timeout(25000));
          if (spec) engine = p.name;
        } catch (e) {
          step({
            pct: 78,
            label: "Designer unreachable",
            note: `${e instanceof Error ? e.message : "call failed"} — falling back`,
          });
        } finally {
          clearInterval(creep);
        }
      } else {
        step({
          pct: 40,
          label: "No model key set",
          note: "using the built-in designer",
        });
      }

      if (!spec) {
        spec = localSpec(prompt);
        engine = "local designer";
      }

      step({
        pct: 86,
        label: "Checking the design",
        note: `engine "${spec.base}" · ${spec.tags.join(", ")}`,
      });
      step({
        pct: 93,
        label: "Mixing the palette",
        note: `${spec.palette?.hero} hero · ${spec.palette?.foe} hazard`,
      });
      step({
        pct: 97,
        label: "Compiling into your feed",
        note: `speed ×${spec.tune?.speed.toFixed(2)} · density ×${spec.tune?.density.toFixed(2)}`,
      });
      send({ type: "done", pct: 100, spec, engine });
      closed = true;
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
