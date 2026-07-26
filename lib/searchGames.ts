// Name lookup over the live catalog. The algorithm search bar moves feature
// axes; this is the other half — you type a game's name and get that game.

import { CATALOG } from "@/games/registry";
import type { FullGameMeta } from "@/games/types";

export interface GameHit {
  meta: FullGameMeta;
  score: number;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "wrdtrp" still finds Word Trap — letters in order, gaps allowed. */
function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

function scoreGame(meta: FullGameMeta, q: string, tokens: string[]): number {
  const title = norm(meta.title);
  const slug = norm(meta.slug);
  const rule = norm(meta.rule);
  const description = norm(meta.description);
  const history = norm(meta.history);
  const tags = meta.tags.map(norm);

  let score = 0;
  if (title === q || slug === q) score += 1000;
  else if (title.startsWith(q) || slug.startsWith(q)) score += 600;
  else if (title.includes(q) || slug.includes(q)) score += 400;

  for (const t of tokens) {
    if (title.split(" ").some((w) => w === t)) score += 120;
    else if (title.includes(t)) score += 80;
    if (tags.some((tag) => tag === t || tag.includes(t))) score += 50;
    if (rule.includes(t)) score += 25;
    if (description.includes(t)) score += 15;
    if (history.includes(t)) score += 5;
  }

  // last resort: typos and half-typed names
  if (score === 0 && q.length >= 3) {
    const compact = q.replace(/ /g, "");
    if (isSubsequence(compact, title.replace(/ /g, ""))) score += 40;
  }
  return score;
}

/**
 * Ranked games for a query. An empty query returns the whole catalog in
 * alphabetical order, so the same view doubles as "all games".
 */
export function searchGames(query: string, limit = 24): GameHit[] {
  const q = norm(query);
  if (!q) {
    return [...CATALOG]
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, limit)
      .map((meta) => ({ meta, score: 0 }));
  }
  const tokens = q.split(" ").filter(Boolean);
  return CATALOG.map((meta) => ({ meta, score: scoreGame(meta, q, tokens) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.meta.title.localeCompare(b.meta.title))
    .slice(0, limit);
}

/** The single game a query is clearly asking for, if there is one. */
export function bestGameMatch(query: string): FullGameMeta | null {
  const [top] = searchGames(query, 1);
  return top && top.score >= 400 ? top.meta : null;
}
