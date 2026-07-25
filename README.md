# Tip Tap Games

An endless, TikTok-style vertical feed where every card is a live, playable
mini game. No menus, no loading, no tutorials — the game is already running
when the card lands, and **you control the algorithm** that decides what
comes next.

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:3000 — open devtools mobile view, 390x844
```

## Deploy (2 minutes)

Import the repo at [vercel.com/new](https://vercel.com/new), accept the
defaults (Next.js is auto-detected), deploy. That's the public demo URL.

## What's inside

- **9 games**, all plain `<canvas>` + rAF, each an original take on a classic
  mechanic: Reflex Gate, Tap Rush, Word Trap, Hold the Line, Flash Recall,
  Drop Dodge, One Lane, Pop Chain, and Cash Out (arcade-casino: virtual
  chips only, nothing to buy, free reset).
- **The algorithm tuner** (`⚙` pill or the Tune button): 4 sliders
  (calm↔frantic, skill↔chance, modern↔2008, more-of-this↔surprise-me),
  tag demand/block chips, 4 presets, and a live **Next up** strip that
  reorders before your eyes. Weighted-random sampling over a per-game
  feature vector, boosted by implicit signals (dwell time, replays,
  fast swipe-aways).
- **4 live-switchable themes** — Arcade Dark, 8-Bit (pixelated canvas +
  scanlines), Skeuomorph '08, Neon Felt. Games read theme tokens every
  frame, so switching mid-run recolours without a remount.
- **Guest identity, personal bests, per-game leaderboards** — persisted in
  localStorage today. `supabase/schema.sql` + `lib/storage.ts` are the
  single swap point to move it server-side (OAuth + cross-device sync).

## Architecture in one breath

Games implement a tiny contract (`games/types.ts`): `mount(ctx)` returns
`{destroy, pause, resume}`. `GameHost` owns the lifecycle — a card starts
when >60% visible and hard-stops when it leaves (a global `__rafActive`
counter proves exactly one loop runs at all times). Zustand stores hold the
feed queue, the algorithm vector, and the theme; moving a slider resamples
everything past the current card before your next swipe.

## Roadmap (from the team whiteboard)

- Story-mode games that expire after 10 seconds of play
- Like / comment (comment = modify the game) / share per card
- Profile XP: every run feeds an account level
- Vibe-code games: a `+` button that generates a brand-new game into the feed
- More mechanics: rock-paper-scissors vs the feed, defuse-the-bomb,
  minesweeper-like, racing, sports
