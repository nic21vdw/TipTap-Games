# Running a month-long giveaway

A season is a window of time with a name and a prize. It owns no scores: every
board in this document is the ordinary `scores` table read between two
timestamps, which is why a season can be opened, moved, renamed or cancelled at
any point — including after the month has already been played — without
touching a single run anybody earned.

## Before the first one: switch the backend on

Nothing below works until Tip Tap Games has a Supabase project. Until then the
app is exactly what it is today: `localStorage`, one device, seeded boards,
nothing shared and nothing to draw a winner from.

1. Create a project at [app.supabase.com](https://app.supabase.com). Any region
   near the players; the free tier is far more than this needs.
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, run it. It
   is idempotent — rerun it after any schema change.
3. **Authentication → Providers → Google**: enable it, and add
   `https://<project>.supabase.co/auth/v1/callback` as an authorised redirect
   URI on the Google OAuth client.
4. Set these on Vercel (Project → Settings → Environment Variables), then
   redeploy:

   | Name | Where it comes from |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, `anon` `public` |
   | `SUPABASE_SERVICE_ROLE_KEY` | same page, `service_role` — server only, never `NEXT_PUBLIC_` |
   | `ADMIN_SYNC_SECRET` | any long random string you keep |

5. Fill the catalog. `/api/runs/submit` reads each game's
   `max_score_per_second` from the `games` table to bound what it will accept,
   and **a game missing from that table gets no leaderboard at all**:

   ```bash
   curl -X POST https://<host>/api/admin/sync-catalog \
        -H "x-admin-secret: $ADMIN_SYNC_SECRET"
   ```

   Rerun it after every deploy that adds or retunes a game.

### The one thing that is not ready

The iOS bundle is forced guest-only: `cloudConfigured` in
`lib/supabase/config.ts` is false whenever `NEXT_PUBLIC_NATIVE=1`, so a player
on the App Store build has no account, and their scores never leave the phone.
A giveaway announced in the app but scored only on the web is worse than no
giveaway. Enabling it needs Google OAuth to survive the Capacitor webview —
a custom URL scheme, `@capacitor/app` to catch the redirect, and the
`apiUrl()` wrapper applied to the `/api/runs/*` calls in `lib/cloud.ts`.

## Open the season

```bash
curl -X POST https://<host>/api/admin/season \
     -H "x-admin-secret: $ADMIN_SYNC_SECRET" \
     -H "content-type: application/json" \
     -d '{"month":"2026-09",
          "title":"September Doomscroll Cup",
          "prize":"Best all-round player wins <prize>. Drawn 1 Oct."}'
```

`month` sets a UTC calendar month as the window; pass `startsAt` / `endsAt`
instead for anything that is not a whole month. The `slug` defaults to the
month. Posting the same slug again edits it in place — that is how you fix a
title or add the prize text later.

The moment a season is live, the leaderboard sheet opens on **This month**,
shows the title, the prize and the days left, and gains a **Contest** tab.
`GET /api/admin/season` lists everything you have opened.

## How a player scores

Each game is its own tournament. Your best verified run inside the window is
ranked against everyone else's on that game, and the top 25 take 25 points down
to 1. Your season total is the sum across every game you placed on.

That shape is deliberate: breadth and depth both pay. Winning one game outright
is 25 points; placing 25th on ten games is 10. Nobody can sit on one favourite
and hold the top, and a player who never opens a game is simply not in its
tournament rather than being counted as last. Ties break towards more games
placed on, then towards whoever got there first.

Imported guest scores are `verified = false` and never rank — they hold your
personal best across devices and nothing more. So a player has to be signed in
*while they play* for a run to count, which is what the sign-in prompt at a win
moment is for.

## Draw the winner

```bash
# The standings, top down, with the email to contact them on
curl "https://<host>/api/admin/season/winners?season=2026-09&limit=50" \
     -H "x-admin-secret: $ADMIN_SYNC_SECRET"

# Or a random draw, weighted by points, from a seed
curl "https://<host>/api/admin/season/winners?season=2026-09&draw=3&seed=october-live" \
     -H "x-admin-secret: $ADMIN_SYNC_SECRET"
```

Add `&format=csv` for a spreadsheet.

The seeded draw is the honest way to run this on stream. Points are public all
month and the seed is announced before the draw, so the result is reproducible
by anyone who reads this file — it is not "trust me, I picked a name". Weighted
means a player with 200 points holds 200 tickets against someone's 10, so
playing well still matters, but the last-week arrival is not playing for
nothing.

Emails come from `auth.users` via the service-role key, and this route is the
only place a handle is ever joined to an email. It is behind
`ADMIN_SYNC_SECRET`; do not paste a response from it on stream.

## What stops someone from cheating

- A score is only accepted against a single-use ticket opened by
  `/api/runs/open` when the player took control of that card, and only if it is
  reachable within the elapsed time **the server** measured against that game's
  `max_score_per_second`. Editing `localStorage` moves a local number and
  nothing else.
- The browser cannot write to `scores` at all — there is no insert policy. Only
  the two service-role routes write.
- Player-generated games (`games/variants.ts`, the `+` button) are absent from
  the `games` table by design, so they have no board and cannot be farmed for
  points.

## After the month

Do nothing. The window closes on its own, the boards freeze because no run can
land inside a window that has passed, and the next season starts empty. Old
seasons stay queryable forever by slug.
