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
| 4 | Guest play first, login only at a win moment | ✅ guest → claimable account, progress carries over / ⬜ OAuth (needs Supabase creds) |
| 5 | Persisted scores | ✅ localStorage, per account / ⬜ Postgres (schema ready) |
| 6 | Per-game leaderboard + own rank | ✅ seeded + local best merged |
| 7 | Endless feed, no bottom | ✅ |
| 8 | Algorithm tuner changes the queue within 1 swipe | ✅ verified live |
| 9 | 3+ live-swappable themes | ✅ 4, no remount mid-run |
| 10 | Deployed public URL | ⬜ connect repo to Vercel (no creds in build env) |
| 11 | A soundtrack under the whole feed, one song per game | ✅ synthesised live, verified in Chromium |
| 12 | Accounts: sign up, sign in, several per device, profiles + XP | ✅ verified in Chromium |
| 13 | Publish your own game — studio, prompt, or uploaded file | ✅ credited to your handle, playable by every account |
| 14 | Message other accounts, send a game in a DM | ✅ real cross-account threads; bot accounts reply, labelled |

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
- A player-made game is a *spec*, never code: it names one of our engines and
  restyles it. An uploaded file can be ugly; it can never execute anything.
- Bot accounts are labelled "bot" on every surface they appear on. Nothing in
  the app pretends a generated reply came from a person.
- Accounts are device-local. The sign-up copy says so plainly, asks for no
  email, and tells you not to reuse a password that matters.
- A track always starts on the drop. No intros, no builds, no fade-ins:
  landing on a card lands you on the loudest bar of the song.
- iOS-feel motion everywhere: sheet transitions use
  `cubic-bezier(0.32, 0.72, 0, 1)`, buttons have springy press-scale,
  scores pop, toasts slide in. Smoothness is a feature, not polish.

## Key files

- `games/types.ts` — the game contract; `games/registry.ts` — catalog
- `lib/algorithm.ts` — scoring + weighted-random sampling
- `lib/storage.ts` — persistence seam (localStorage now, Supabase later)
- `lib/accounts.ts` — identity: guests, sign up/in, XP, follows, scoped keys
- `lib/library.ts` — published player games: publish, import/export, validate
- `lib/social.ts` — DM threads, game attachments, the labelled bot replies
- `components/sheets/CreateSheet.tsx` — describe it / build it / upload it
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

## Accounts, publishing, messages

The feed is guest-first: you are signed in as *someone* from the first frame,
and that guest can be claimed at any point — the scores, likes, memories and
games from before the sign-up move onto the new account. Several accounts
share a device, each with its own bests, algorithm memories, feed queue and
inbox; the leaderboard merges them so two people on one phone compete for
real. Every run pays XP into a level.

A published game is a spec over one of our engines: pick a mechanic, name it,
colour it, tag it, place it on the algorithm's axes. Three ways in — describe
it to the generator, build it by hand in the studio, or upload a `.json` file
someone exported. It lands on the feed with the author's avatar in the rail,
and the author can unpublish it again.

DMs are real threads between accounts on the device: send from one, switch
accounts, and it's in the inbox unread. Any card in the feed can ride along
in a message, and the receiver taps it to queue it as their next card. The
seeded leaderboard handles are bot accounts that reply on their own — badged
"bot" wherever they appear.

## Next up (roadmap)

Expiring "story" games · comment-modifies-the-game ·
RPS / defuse-bomb / minesweeper / racing mechanics · OAuth + cross-device
sync once Supabase env vars exist (the schema already models accounts,
follows, player games and messages) · music that reacts to the run (filter
opens with your combo, track drops out on a fail).

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
