# Tip Tap Games — Build Charter

Working reference for every agent turn. The product: a vertical,
snap-scrolling feed that feels like TikTok, except every card is a live,
playable mini game. The differentiator: **the player controls the
algorithm** via a tuner sheet with a live "Next up" strip.

## Definition of done (all shipping ✅ / pending ⬜)

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Vertical snap feed, 1 swipe = 1 card (touch/wheel/trackpad) | ✅ |
| 2 | 6+ genuinely different games | ✅ 9 shipped |
| 3 | Auto start >60% visible, hard stop on leave, zero zombie rAF | ✅ verified: `__rafActive === 1` after 12 swipes |
| 4 | Guest play first, login only at a win moment | ✅ guest / ⬜ OAuth (needs Supabase creds) |
| 5 | Persisted scores | ✅ localStorage / ⬜ Postgres (schema ready) |
| 6 | Per-game leaderboard + own rank | ✅ seeded + local best merged |
| 7 | Endless feed, no bottom | ✅ |
| 8 | Algorithm tuner changes the queue within 1 swipe | ✅ verified live |
| 9 | 3+ live-swappable themes | ✅ 4, no remount mid-run |
| 10 | Deployed public URL | ⬜ connect repo to Vercel (no creds in build env) |

## Hard rules

- Games are plain canvas/DOM + rAF. No engines. `mount` returns instantly,
  `destroy` leaves zero listeners/timers/loops.
- Games draw only with theme tokens from `ctx.getTheme()` — no hard-coded
  colours in `/games`.
- Original titles, art, palettes only. Mechanics are homages; names, art
  and trade dress are never borrowed.
- Casino = arcade-casino: virtual chips, free reset, no purchase
  affordance anywhere.
- The feed never repeats. A game you've scrolled past is struck off the
  ledger (`ttg:seen`) for good; when the catalog runs out the feed mints
  new games (`games/variants.ts`) instead of recycling. Liking a game is
  the one thing that buys it a comeback, and never within 14 cards.
- iOS-feel motion everywhere: sheet transitions use
  `cubic-bezier(0.32, 0.72, 0, 1)`, buttons have springy press-scale,
  scores pop, toasts slide in. Smoothness is a feature, not polish.

## Key files

- `games/types.ts` — the game contract; `games/registry.ts` — catalog
- `lib/algorithm.ts` — scoring + weighted sampling without replacement
- `games/variants.ts` — mints fresh games once the catalog is exhausted
- `lib/storage.ts` — persistence seam (localStorage now, Supabase later)
- `components/feed/GameHost.tsx` — lifecycle owner
- `components/sheets/AlgorithmSheet.tsx` — the demo centrepiece
- `supabase/schema.sql` — ready-to-apply Postgres schema

## Demo script (2 min)

1. Open the URL on a phone. A game is already running — say nothing for 3s.
2. Play, swipe, play, swipe. "No menus, no loading, no tutorial."
3. Open the tuner. Drag nostalgia up — point at Next up reordering live.
4. Swipe: the promised game arrives. Switch to 8-Bit mid-run.
5. Close on the leaderboard.

## Next up (roadmap)

Expiring "story" games · like/comment-modifies-the-game/share ·
profile XP per run · vibe-coded games via a `+` button ·
RPS / defuse-bomb / minesweeper / racing mechanics · OAuth + guest merge
once Supabase env vars exist.
