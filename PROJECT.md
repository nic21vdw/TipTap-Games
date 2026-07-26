# Tip Tap Games — Build Charter

Working reference for every agent turn. The product: a vertical,
snap-scrolling feed that feels like TikTok, except every card is a live,
playable mini game. The differentiator: **the player controls the
algorithm** via a tuner sheet with a live "Next up" strip.

## Definition of done (all shipping ✅ / pending ⬜)

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Vertical snap feed, 1 swipe = 1 card (touch/wheel/trackpad) | ✅ |
| 2 | 6+ genuinely different games | ✅ 19 shipped, incl. two in 3D |
| 3 | Auto start >60% visible, hard stop on leave, zero zombie rAF | ✅ verified: `__rafActive === 1` after 12 swipes |
| 4 | Guest play first, login only at a win moment | ✅ guest + Google OAuth, prompted only on a best/top-ten |
| 5 | Persisted scores | ✅ localStorage always; Postgres when Supabase env vars exist |
| 6 | Per-game leaderboard + own rank | ✅ live board when signed in, seeded fallback otherwise |
| 7 | Endless feed, no bottom | ✅ |
| 8 | Algorithm tuner changes the queue within 1 swipe | ✅ verified live |
| 9 | 3+ live-swappable themes | ✅ 6, no remount mid-run |
| 10 | Deployed public URL | ⬜ connect repo to Vercel (no creds in build env) |
| 11 | A soundtrack under the whole feed, one song per game | ✅ synthesised live, verified in Chromium |

## Hard rules

- Games are plain canvas/DOM + rAF. No engines. `mount` returns instantly,
  `destroy` leaves zero listeners/timers/loops. 3D is allowed on the same
  terms — `games/hardwater` and `games/basement-defense` project their own
  world and paint back-to-front, so they still ship zero dependencies.
- Games draw only with theme tokens from `ctx.getTheme()` — no hard-coded
  colours in `/games`.
- Original titles, art, palettes only. Mechanics are homages; names, art
  and trade dress are never borrowed.
- Casino = arcade-casino: virtual chips, free reset, no purchase
  affordance anywhere.
- Scrolling goes both ways. A card is never dropped from the list once
  it's been shown, so scrolling back lands on the game you just left, not a
  fresh draw — and that has to hold while a game owns the surface too. On a
  desktop the wheel, arrow keys, Enter and Esc drive the same navigation the
  swipe gestures do (`components/feed/nav.ts`).
- The feed never repeats. A game you've scrolled past is struck off the
  ledger (`ttg:seen`) for good; when the catalog runs out the feed mints
  new games (`games/variants.ts`) instead of recycling. Liking a game is
  the one thing that buys it a comeback, and never within 14 cards.
- The web build is a shop window for an App Store app. Anything
  viewport-shaped reads `--app-h` / `--safe-top` / `--safe-bottom`, never
  `dvh` or `env(safe-area-*)` directly — that seam is what lets the iPhone
  preview simulate a screen.
- Music is synthesised in the browser, never streamed or bundled. No audio
  file ever enters the repo, so there is nothing to license or attribute.
- A track always starts on the drop. No intros, no builds, no fade-ins:
  landing on a card lands you on the loudest bar of the song.
- iOS-feel motion everywhere: sheet transitions use
  `cubic-bezier(0.32, 0.72, 0, 1)`, buttons have springy press-scale,
  scores pop, toasts slide in. Smoothness is a feature, not polish.

## Key files

- `games/types.ts` — the game contract; `games/registry.ts` — catalog
- `lib/algorithm.ts` — scoring + weighted sampling without replacement
- `games/variants.ts` — mints fresh games once the catalog is exhausted
- `lib/storage.ts` — the synchronous local layer everything reads from
- `lib/cloud.ts` — background replica: mirrors local writes to Postgres,
  merges the account's copy back on sign-in, redeems run tickets
- `lib/supabase/config.ts` — the one check for "does this build have a
  backend?"; every cloud call site degrades to a no-op when it's false
- `components/feed/GameHost.tsx` — lifecycle owner
- `lib/music.ts` — Tip Tap Radio: the generative soundtrack engine
- `store/useMusicStore.ts` — mute / volume / now-playing state
- `components/sheets/AlgorithmSheet.tsx` — the demo centrepiece
- `supabase/schema.sql` — tables, RLS policies, leaderboard functions
- `app/api/runs/*` — the only writers to `scores`, service-role and
  ticket-validated
- `components/shell/DevicePreview.tsx` — desktop ⇄ iPhone preview shell

## Demo script (2 min)

1. Open the URL on a phone. A game is already live and playable — no demo,
   no tap to start.
2. Play, swipe, play, swipe. "No menus, no loading, no tutorial." Every
   swipe drops a different song — none of them exist as a file.
3. Open the tuner. Drag nostalgia up — point at Next up reordering live.
4. Swipe: the promised game arrives. Switch to 8-Bit mid-run.
5. Close on the leaderboard.

## Next up (roadmap)

Expiring "story" games · like/comment-modifies-the-game/share ·
profile XP per run · vibe-coded games via a `+` button ·
RPS / defuse-bomb / minesweeper / racing mechanics · OAuth + guest merge
once Supabase env vars exist · friends-only leaderboards on top of the
`profiles` table · Cloudflare Pages deploy (needs `@opennextjs/cloudflare`
+ wrangler) · music that reacts to the run (filter opens with your combo,
track drops out on a fail).

## Tip Tap Radio

Every game has its own song, generated from its slug and its algorithm axes
so it is the same song every session. `lib/music.ts` synthesises it live out
of oscillators and noise — kick, 808, supersaw, reese, plate reverb, 3/16
delay and a sidechain pump — across five genres: house, trap, future bass,
synthwave and drum & bass. Nostalgic games get synthwave, frantic ones get
drum & bass, the casino card gets house.

- Zero bytes of audio ship. Nothing to license, nothing to attribute.
- Scheduling is a 25 ms lookahead loop, so timing does not ride on rAF and
  the beat holds while a game is redrawing.
- Audio is gated behind the first gesture, as browsers require. Until then
  the now-playing chip reads "Tap for sound".
- `window.__ttgMusic.live` is the audit hook, the audio counterpart to
  `__rafActive`: it must read 1 while scrolling and 0 while muted.
