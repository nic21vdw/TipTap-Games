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
| 11 | A soundtrack under the whole feed, one song per game | ✅ synthesised live, verified in Chromium |

## Hard rules

- Games are plain canvas/DOM + rAF. No engines. `mount` returns instantly,
  `destroy` leaves zero listeners/timers/loops.
- Games draw only with theme tokens from `ctx.getTheme()` — no hard-coded
  colours in `/games`.
- Original titles, art, palettes only. Mechanics are homages; names, art
  and trade dress are never borrowed.
- Casino = arcade-casino: virtual chips, free reset, no purchase
  affordance anywhere.
- Music is synthesised in the browser, never streamed or bundled. No audio
  file ever enters the repo, so there is nothing to license or attribute.
- A track always starts on the drop. No intros, no builds, no fade-ins:
  landing on a card lands you on the loudest bar of the song.
- iOS-feel motion everywhere: sheet transitions use
  `cubic-bezier(0.32, 0.72, 0, 1)`, buttons have springy press-scale,
  scores pop, toasts slide in. Smoothness is a feature, not polish.
- Every input gets a reaction. A hit throws particles, a ring and a score
  pop; a fail shakes the camera and washes the screen. Silence is a bug.
- No run may end on the first mistake. Games carry lives, a shield or a
  save, so a card that lands on you is still worth ten seconds.
- Nothing a player must see or hit may sit under the feed's chrome. Use
  `safeBox(W, H)` from `games/fx.ts` — the caption, the score and the
  action rail all overlay the canvas.
- A generated card may invent a name, a look and a story, never the
  controls: its rule line is copied from the engine that actually runs.

## Game feel (`games/fx.ts`)

The shared juice layer, so feel is a resource instead of something each
game re-invents or skips.

- `createFx()` — particles, shockwave rings, motion trails, floating score
  pops, camera shake and full-screen flashes, all time-based and pooled.
- `drawBackdrop()` — living grounds (drifting blobs, parallax starfields,
  perspective grids, rotating light shafts, rolling hills) instead of the
  two-stop gradient every game used to paste in.
- `createCombo()` / `drawCombo()` — streaks that pay a multiplier.
- `resultCard()` — one game-over card everywhere, showing the score you
  earned, your best, and a stat worth chasing back ("6 perfect", "94%
  accuracy", "biggest chain 9").
- `groundInk()` — games paint their own dark ground out of their palette,
  so HUD text picks whichever end of the theme actually reads on it. The
  theme still chooses the colour; the player can still see the HUD.

## Key files

- `games/types.ts` — the game contract; `games/registry.ts` — catalog
- `games/fx.ts` — the shared juice layer (see above)
- `lib/algorithm.ts` — scoring + weighted-random sampling
- `lib/storage.ts` — persistence seam (localStorage now, Supabase later)
- `components/feed/GameHost.tsx` — lifecycle owner
- `lib/music.ts` — Tip Tap Radio: the generative soundtrack engine
- `store/useMusicStore.ts` — mute / volume / now-playing state
- `components/sheets/AlgorithmSheet.tsx` — the demo centrepiece
- `supabase/schema.sql` — ready-to-apply Postgres schema

## Demo script (2 min)

1. Open the URL on a phone. A game is already running — say nothing for 3s.
2. Play, swipe, play, swipe. "No menus, no loading, no tutorial." Every
   swipe drops a different song — none of them exist as a file.
3. Open the tuner. Drag nostalgia up — point at Next up reordering live.
4. Swipe: the promised game arrives. Switch to 8-Bit mid-run.
5. Close on the leaderboard.

## Next up (roadmap)

Expiring "story" games · like/comment-modifies-the-game/share ·
profile XP per run · vibe-coded games via a `+` button ·
RPS / defuse-bomb / minesweeper / racing mechanics · OAuth + guest merge
once Supabase env vars exist · music that reacts to the run (filter opens
with your combo, track drops out on a fail).

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
