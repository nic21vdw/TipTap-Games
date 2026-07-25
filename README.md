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

## Desktop vs iPhone preview

The product is an iPhone app; the web build is its shop window. Open the
Vercel URL on a laptop and a switch in the corner flips between two views:

- **Desktop** — the app filling the browser window (the old behaviour).
- **iPhone** — the app running inside a to-scale iPhone, with a device
  picker (17 Pro / 17 Pro Max / SE), the Dynamic Island, real safe-area
  insets, and the frame auto-scaling to fit short windows.

The choice is remembered, and `?view=desktop` / `?view=iphone` links
straight to either one — handy for App Store screenshots and demo links.
On a phone-sized browser none of this exists: you get the app, full bleed.

Implementation lives in `components/shell/DevicePreview.tsx`. The framed
mode works without touching a single feature component: the simulated
screen carries a `transform`, which makes it the containing block for every
`position: fixed` child, and `--app-h` / `--safe-top` / `--safe-bottom`
(defined in `app/globals.css`) carry the screen metrics the app lays out
against.

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
