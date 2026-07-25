// Turns plain speech into an algorithm vector. The player types how they
// feel; we snipe keywords and move the axes. No sliders, no percentages.

import { DEFAULT_VECTOR, type AlgorithmVector } from "@/lib/algorithm";
import type { GameTag } from "@/games/types";

export interface Matched {
  /** the phrase we found, shown back as a chip */
  phrase: string;
  /** plain-language effect, e.g. "faster" */
  effect: string;
}

export interface ParseResult {
  vector: AlgorithmVector;
  matched: Matched[];
}

type Axis = "intensity" | "speed" | "difficulty" | "luck" | "nostalgia" | "realism" | "variety";

interface Rule {
  /** phrases to look for, longest first within a rule */
  words: string[];
  axis?: Axis;
  /** target value the axis is pulled toward when matched */
  to?: number;
  tag?: GameTag;
  block?: GameTag;
  kid?: boolean;
  effect: string;
}

// Order matters: earlier rules win the phrase, so put specific before generic.
const RULES: Rule[] = [
  { words: ["relaxing", "chill", "calm", "zen", "peaceful", "gentle", "cozy"], axis: "intensity", to: 0.1, effect: "calm" },

  // --- kid friendly ---
  { words: ["kid friendly", "kid-friendly", "kids", "child friendly", "family friendly", "for my kid", "safe for kids", "wholesome"], kid: true, effect: "kid-safe only" },

  // --- intensity ---
  { words: ["frantic", "chaos", "chaotic", "hectic", "crazy", "wild", "intense", "adrenaline", "panic", "mayhem"], axis: "intensity", to: 1, effect: "frantic" },
  { words: ["mellow", "quiet", "slow burn", "meditative", "casual", "easy going", "laid back"], axis: "intensity", to: 0.15, effect: "mellow" },

  // --- speed ---
  { words: ["fast", "faster", "quick", "quicker", "speed", "speedy", "rapid", "twitchy", "snappy", "blitz"], axis: "speed", to: 1, effect: "faster" },
  { words: ["slow", "patient", "take my time", "thoughtful", "leisurely"], axis: "speed", to: 0.1, effect: "slower" },

  // --- difficulty ---
  { words: ["brutal", "brutally hard", "hardcore", "punishing", "ruthless", "sweaty", "sweat", "try hard", "tryhard", "expert", "impossible", "harder", "hard", "difficult", "challenge", "challenging"], axis: "difficulty", to: 1, effect: "brutal" },
  { words: ["easy", "easier", "simple", "beginner", "forgiving", "relaxed", "casual mode", "noob"], axis: "difficulty", to: 0.1, effect: "easier" },

  // --- casino category (before the luck axis, so "no gambling" blocks the
  // card type rather than only nudging an axis) ---
  { words: ["casino", "gambling", "gamble", "betting", "poker", "slots", "cards", "chips"], tag: "casino", effect: "casino only" },

  // --- luck ---
  { words: ["lucky", "luck", "random", "chance", "risky", "risk", "bet", "slot"], axis: "luck", to: 1, effect: "more chance" },
  { words: ["skill", "skilled", "skill based", "pure skill", "no rng", "fair", "competitive"], axis: "luck", to: 0.05, effect: "pure skill" },

  // --- nostalgia ---
  { words: ["retro", "old school", "oldschool", "nostalgic", "nostalgia", "classic", "classics", "vintage", "throwback", "nokia", "arcade", "80s", "90s", "2000s", "childhood", "back in the day", "old"], axis: "nostalgia", to: 1, effect: "retro" },
  { words: ["modern", "new", "fresh", "current", "contemporary"], axis: "nostalgia", to: 0.1, effect: "modern" },

  // --- realism / tone ---
  { words: ["scary", "scarier", "dark", "creepy", "horror", "spooky", "eerie", "serious", "gritty", "realistic", "real", "mature", "intense vibes"], axis: "realism", to: 1, effect: "darker + realistic" },
  { words: ["cute", "cartoony", "cartoon", "silly", "goofy", "playful", "colorful", "colourful", "friendly", "abstract", "cheerful", "light hearted", "lighthearted"], axis: "realism", to: 0.05, effect: "lighter + playful" },

  // --- variety ---
  { words: ["surprise me", "surprise", "mix it up", "variety", "anything", "random stuff", "shuffle", "keep it fresh", "different"], axis: "variety", to: 1, effect: "surprise me" },
  { words: ["more of this", "more like this", "same", "stick with", "keep serving", "only this"], axis: "variety", to: 0.05, effect: "more of this" },

  // --- explicit tag demands ---
  { words: ["memory", "remember", "brain", "puzzle", "puzzles", "thinking"], tag: "memory", effect: "memory + puzzle" },
  { words: ["one tap", "one-tap", "single tap", "one finger", "one thumb"], tag: "oneTap", effect: "one-tap only" },
  { words: ["reflex", "reflexes", "reaction", "reactions"], tag: "reflex", effect: "reflex only" },
  { words: ["endless", "runner", "long game", "marathon"], tag: "endurance", effect: "endurance" },
  { words: ["precise", "precision", "accuracy", "accurate"], tag: "precision", effect: "precision" },
];

// Words that flip the meaning of whatever follows them, within a short window.
// "no luck", "nothing with gambling", "don't want it hard", "hate scary".
const NEGATORS =
  /\b(?:no|not|nothing|never|without|dont|don t|do not|doesnt|hate|avoid|less|least|skip|except|minus|zero)\b/g;
const NEG_WINDOW = 20; // chars after the negator that count as negated

function negatedRanges(q: string): [number, number][] {
  const out: [number, number][] = [];
  for (const m of q.matchAll(NEGATORS)) {
    const start = m.index ?? 0;
    // a negation stops at the next clause break
    const rest = q.slice(start, start + NEG_WINDOW);
    const stop = rest.search(/\b(?:but|and then|however)\b|[,;.]/);
    out.push([start, start + (stop === -1 ? NEG_WINDOW : stop)]);
  }
  return out;
}

/** Mirrors a target across the neutral midpoint: 1 -> 0, 0.1 -> 0.9. */
const invert = (v: number) => Math.max(0, Math.min(1, 1 - v));

/**
 * Parses a query into a vector. Starts from `base` so a query can refine an
 * existing mood, and unmatched axes stay exactly where the player left them.
 * Handles negation generically, so "no luck", "nothing scary", and "don't
 * want it hard" all work without enumerating every phrasing.
 */
export function parseIntent(
  query: string,
  base: AlgorithmVector = DEFAULT_VECTOR
): ParseResult {
  // Punctuation is preserved: commas and periods end a negation's reach, so
  // "nothing with luck, kid friendly" doesn't negate the kid-friendly clause.
  const q = ` ${query
    .toLowerCase()
    .replace(/[^a-z0-9\s,;.]/g, " ")
    .replace(/[ \t]+/g, " ")} `;
  const vector: AlgorithmVector = {
    ...base,
    onlyTags: [...base.onlyTags],
    blockTags: [...base.blockTags],
  };
  const matched: Matched[] = [];
  const claimed: [number, number][] = [];
  const negs = negatedRanges(q);

  const overlaps = (start: number, end: number) =>
    claimed.some(([s, e]) => start < e && end > s);
  const isNegated = (start: number) =>
    negs.some(([s, e]) => start >= s && start <= e);

  for (const rule of RULES) {
    // longest phrases first, and match whole words only so "real" never
    // fires on "really" and "old" never fires on "golden"
    const words = [...rule.words].sort((a, b) => b.length - a.length);
    for (const w of words) {
      const re = new RegExp(`\\b${w.replace(/[-\s]+/g, "[\\s-]+")}\\b`);
      const m = re.exec(q);
      if (!m) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      claimed.push([start, end]);

      const negated = isNegated(start);

      if (rule.axis && rule.to !== undefined) {
        vector[rule.axis] = negated ? invert(rule.to) : rule.to;
      }
      // a negated tag demand becomes a block, and vice versa
      const wantTag = negated ? undefined : rule.tag;
      const blockTag = negated ? (rule.tag ?? rule.block) : rule.block;
      if (wantTag && !vector.onlyTags.includes(wantTag)) {
        vector.onlyTags.push(wantTag);
        vector.blockTags = vector.blockTags.filter((t) => t !== wantTag);
      }
      if (blockTag && !vector.blockTags.includes(blockTag)) {
        vector.blockTags.push(blockTag);
        vector.onlyTags = vector.onlyTags.filter((t) => t !== blockTag);
      }
      if (rule.kid && !negated) {
        vector.kidFriendly = true;
        if (!vector.blockTags.includes("casino")) vector.blockTags.push("casino");
        vector.onlyTags = vector.onlyTags.filter((t) => t !== "casino");
      }
      matched.push({
        phrase: m[0].trim(),
        effect: negated ? negateEffect(rule.effect) : rule.effect,
      });
      break; // one phrase per rule
    }
  }

  return { vector, matched };
}

const OPPOSITE: Record<string, string> = {
  frantic: "calm",
  calm: "frantic",
  faster: "slower",
  slower: "faster",
  brutal: "easier",
  easier: "brutal",
  "more chance": "pure skill",
  "pure skill": "more chance",
  retro: "modern",
  modern: "retro",
  "darker + realistic": "lighter + playful",
  "lighter + playful": "darker + realistic",
  "surprise me": "more of this",
  "more of this": "surprise me",
  mellow: "frantic",
  forgiving: "brutal",
};

function negateEffect(effect: string): string {
  if (OPPOSITE[effect]) return OPPOSITE[effect];
  return effect.endsWith(" only") ? `no ${effect.replace(" only", "")}` : `no ${effect}`;
}
