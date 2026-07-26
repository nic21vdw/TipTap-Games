# Tip Tap Games

An endless, TikTok-style vertical feed where every card is a live, playable
mini game. No menus, no loading, no tutorials — the game is already running
when the card lands, and **you control the algorithm** that decides what
comes next.

## Run it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3002](http://localhost:3002). On a desktop-sized
browser, use the switch to move between the full desktop layout and a framed
iPhone preview. You can also open either mode directly:

- [Desktop mode](http://localhost:3002/?view=desktop)
- [iPhone mode](http://localhost:3002/?view=iphone)

For a production-equivalent local preview:

```bash
npm run build
npm start
```

The app remains a normal Next.js application in both modes. The iPhone mode
only changes the preview viewport and safe-area metrics; it does not fork,
disable, or replace any game functionality.

**Optional — real AI game generation.** Add `DEEPSEEK_API_KEY` to
`.env.local`. Without it, `/api/generate` falls back to a local designer, so
the feature still works.

## Accounts and cloud saves (Supabase)

Entirely optional. With no Supabase project the app is what it has always
been: guest play, localStorage saves, seeded leaderboards. Add the env vars
and the same build gains Google sign-in, cross-device saves and real
leaderboards, with no code change — see `.env.example` for every variable.

1. **Create the project** at [supabase.com](https://supabase.com), then run
   `supabase/schema.sql` in the SQL editor. It creates the tables, the
   row-level security policies, and the `leaderboard` / `my_standing`
   functions the app reads.
2. **Turn on Google.** Authentication → Providers → Google. Follow the
   Supabase instructions to create the OAuth client, then add
   `https://<your-domain>/auth/callback` — and `http://localhost:3002/auth/callback`
   for local work — to Authentication → URL Configuration → Redirect URLs.
3. **Set the env vars** (`.env.local` locally, Settings → Environment
   Variables on Vercel):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server-only, never NEXT_PUBLIC_
   ADMIN_SYNC_SECRET=<any long random string>
   ```

4. **Publish the catalog** once per deploy, so the server knows each game's
   score ceiling:

   ```bash
   curl -X POST https://<your-domain>/api/admin/sync-catalog \
        -H "x-admin-secret: $ADMIN_SYNC_SECRET"
   ```

### How it behaves

- **Guest first, always.** Nothing asks you to sign in until you set a
  personal best or land in a top ten — then the result toast offers to keep
  it. Decline once and it never asks again.
- **Local stays the read path.** `lib/storage.ts` is still synchronous, so a
  card that lands never waits on the network to know your best.
  `lib/cloud.ts` mirrors those writes to Postgres in the background and
  merges the account's copy back in on sign-in. Offline, the game is
  unchanged.
- **Guest saves are kept.** Signing in imports the bests you already had.
  They're stored `verified = false`: they hold your personal best on every
  device, but they never rank publicly, because the server never watched
  those runs.
- **Scores are server-validated.** Taking control of a card opens a run
  ticket; the score is redeemed against it exactly once, and rejected if it
  exceeds what the game's `maxScorePerSecond` allows in the elapsed time the
  *server* measured. No browser can write to `scores` at all — RLS grants no
  insert policy, and `/api/runs/submit` is the only writer.

### Hosting note

The deploy path is Vercel, above. Nothing here is Vercel-specific — the API
routes are standard Next.js route handlers — but Cloudflare Pages would need
`@opennextjs/cloudflare` and a `wrangler` config, which this repo doesn't
carry yet.

## Desktop vs iPhone preview

Open the Next.js app on a laptop and a switch in the corner flips between
two views:

- **Desktop** — the app filling the browser window (the old behaviour).
- **iPhone** — the app running inside a to-scale iPhone, with a device
  picker (17 Pro / 17 Pro Max / SE), the Dynamic Island, real safe-area
  insets, and the frame auto-scaling to fit short windows.

The choice is remembered, and `?view=desktop` / `?view=iphone` links
straight to either one — handy for screenshots and demo links.
On a phone-sized browser none of this exists: you get the app, full bleed.

Implementation lives in `components/shell/DevicePreview.tsx`. The framed
mode works without touching a single feature component: the simulated
screen carries a `transform`, which makes it the containing block for every
`position: fixed` child, and `--app-h` / `--safe-top` / `--safe-bottom`
(defined in `app/globals.css`) carry the screen metrics the app lays out
against.

## What's inside

- **100+ games**, all plain `<canvas>` + rAF, ranging from quick reflex and
  puzzle mechanics to Nic's Basement, Hardwater, Five Nights at Nic's
  Basement, and Cash Out.
- **The algorithm tuner** (`⚙` pill or the Tune button): 4 sliders
  (calm↔frantic, skill↔chance, modern↔2008, more-of-this↔surprise-me),
  tag demand/block chips, 4 presets, and a live **Next up** strip that
  reorders before your eyes. Weighted-random sampling over a per-game
  feature vector, boosted by implicit signals (dwell time, replays,
  fast swipe-aways).
- **5 live-switchable themes** on top of the Coast default — Arcade Dark,
  8-Bit (pixelated canvas + scanlines), Skeuomorph '08, Neon Felt, and Nic
  (basement purple, mint and gold — One Gap redresses itself as his sky,
  his pipes and his face). Games read theme tokens every frame, so
  switching mid-run recolours without a remount.
- **Guest identity, personal bests, per-game leaderboards** — localStorage
  by default, Postgres the moment Supabase env vars exist. See
  [Accounts and cloud saves](#accounts-and-cloud-saves-supabase).

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
