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

## Deploy to Vercel (2 minutes)

1. Go to [vercel.com/new](https://vercel.com/new) and import `TipTap-Games`.
2. Accept every default — Next.js is auto-detected, no build settings needed.
3. Deploy.

**Set the production branch.** `main` is an empty bootstrap commit, so a
production deploy from it renders nothing. Either merge the open pull
request first, or in **Settings → Git → Production Branch** point it at
`claude/hackathon-project-selection-6q3llv`. Vercel also builds a preview
URL for every branch and PR automatically, so a working link appears as
soon as the import finishes either way.

**Optional — real AI game generation.** Add `DEEPSEEK_API_KEY` under
**Settings → Environment Variables**. Without it, `/api/generate` falls
back to a local designer, so the feature works in the demo regardless.

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
- **Accounts** — play as a guest from the first frame, claim it with a handle
  and a password whenever you want, and your scores, likes and games come with
  you. A device can hold several accounts, each with its own bests, algorithm
  memories, feed and inbox; they meet on the leaderboard. Every run pays XP
  into a profile level.
- **Publish your own game** — three doors in the `+` sheet: *describe it* and
  the generator designs one, *build it* in the studio (engine, title, colour,
  tags, algorithm axes), or *upload* a `.json` game file someone exported.
  Published games carry the author's handle into the feed, can be sent in a
  DM, exported back out, or unpublished. A spec picks one of our engines and
  restyles it — it never carries code, so nothing you import can run.
- **Direct messages** — real threads between accounts on the device (send,
  switch account, it's there unread), with any card attachable as a playable
  card the receiver can queue. The seeded leaderboard handles are bot accounts
  that reply on their own, badged "bot" everywhere they appear.
- **Personal bests + per-game leaderboards** — persisted in localStorage
  today. `supabase/schema.sql` models the whole thing — accounts, follows,
  player games, messages — and `lib/accounts.ts`, `lib/storage.ts`,
  `lib/library.ts`, `lib/social.ts` are the swap points for moving it
  server-side (OAuth + cross-device sync).

## Architecture in one breath

Games implement a tiny contract (`games/types.ts`): `mount(ctx)` returns
`{destroy, pause, resume}`. `GameHost` owns the lifecycle — a card starts
when >60% visible and hard-stops when it leaves (a global `__rafActive`
counter proves exactly one loop runs at all times). Zustand stores hold the
feed queue, the algorithm vector, and the theme; moving a slider resamples
everything past the current card before your next swipe.

## Roadmap (from the team whiteboard)

- Story-mode games that expire after 10 seconds of play
- Comments that modify the game they're posted on
- More mechanics: rock-paper-scissors vs the feed, defuse-the-bomb,
  minesweeper-like, racing, sports
- OAuth + cross-device sync, so an account outlives the phone it was made on
