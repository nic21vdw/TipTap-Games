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

**Optional — real AI game generation.** Add `OPENROUTER_API_KEY` under
**Settings → Environment Variables** to run the designer on DeepSeek's free
tier (see `.env.example`). Without a key, `/api/generate` falls back to a
local designer, so the Make button works in the demo regardless.

## What's inside

- **100 games**, all plain `<canvas>` + rAF. Nine are original inventions;
  the rest are the Nostalgia 100 — one card per mechanic that a 20-to-45
  year old would recognise, from feature-phone snake through the .io years
  to hypercasual. Original titles, art and palettes throughout: the
  mechanics are homages, the trade dress is ours. Cash Out is arcade-casino
  — virtual chips only, nothing to buy, free reset.
- **Vibe code your own** (the ⚡ **Make** button): describe a game in your
  own words, watch a live progress bar as the studio picks an engine, names
  it, mixes a palette and tunes its speed and density, then play the result
  as the next card in your feed. Runs on DeepSeek when a key is set, on a
  local designer when it isn't.
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

Most cards are declared through `games/kit.ts`: `defineGame(meta, blueprint)`
owns the loop, pointer plumbing, idle hint, tap-to-restart, the shared end
card and attract mode, so a game file is its mechanic and its art and
nothing else. They live in `games/packs/*.ts`, grouped by feel.

A generated game is a **spec**, not new code: it names one of the hundred
shipped engines, then supplies its own title, rule, palette and a
`tune: {speed, density}` that the engine reads through `ctx.tune`. That is
why a custom card can arrive instantly and can never crash the feed.

## Roadmap (from the team whiteboard)

- Story-mode games that expire after 10 seconds of play
- Like / comment (comment = modify the game) / share per card
- Profile XP: every run feeds an account level
- Generated games that compose two engines instead of retuning one
- Multiplayer for the arena cards, where the bots are currently pretending
