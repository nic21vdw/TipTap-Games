-- Tip Tap Games — Postgres schema (Supabase).
--
-- Apply with either:
--   supabase db push                     (CLI, from the repo root)
--   or paste into the SQL editor at app.supabase.com → SQL → New query
--
-- The app is fully playable with no backend at all: lib/storage.ts keeps
-- everything in localStorage. Setting NEXT_PUBLIC_SUPABASE_URL and
-- NEXT_PUBLIC_SUPABASE_ANON_KEY switches lib/cloud.ts on, which syncs that
-- local state up here and pulls it back on any other device.
--
-- Trust model: nothing in here is writable by a browser except a player's
-- own private state. Scores land only through /api/runs/submit, which runs
-- with the service-role key and checks the score against an open run.

-- ---------------------------------------------------------------------------
-- profiles — one row per signed-in player, keyed by auth.users
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  avatar_url text,
  -- set once, the first time a guest's local saves are imported
  guest_imported_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Handles are public: a leaderboard is a list of other people's handles.
drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select using (true);

drop policy if exists "a player can update their own profile" on public.profiles;
create policy "a player can update their own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- A new auth user gets a profile immediately, with a handle derived from
-- their Google name and a numeric suffix on collision.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := coalesce(
    nullif(regexp_replace(lower(new.raw_user_meta_data ->> 'name'), '[^a-z0-9]', '', 'g'), ''),
    nullif(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]', '', 'g'), ''),
    'player'
  );
  base := left(base, 16);
  candidate := base;
  while exists (select 1 from public.profiles p where p.handle = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;

  insert into public.profiles (id, handle, avatar_url)
  values (new.id, candidate, new.raw_user_meta_data ->> 'avatar_url');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- games — the catalog, mirrored from games/registry.ts
-- ---------------------------------------------------------------------------
--
-- Filled by POST /api/admin/sync-catalog, which upserts straight from
-- games/registry.ts so the catalog never drifts from the code. The server
-- reads max_score_per_second from here to bound what /api/runs/submit will
-- accept, which is why a slug missing from this table gets no leaderboard:
-- player-generated games have no shared board and stay local.

create table if not exists public.games (
  slug text primary key,
  title text not null,
  rule_text text not null,
  tags text[] not null default '{}',
  intensity real not null,
  luck real not null,
  nostalgia real not null,
  session_length real not null,
  score_unit text not null default 'pts',
  max_score_per_second real not null,
  is_active boolean not null default true
);

alter table public.games enable row level security;

drop policy if exists "the catalog is readable by everyone" on public.games;
create policy "the catalog is readable by everyone"
  on public.games for select using (true);

-- ---------------------------------------------------------------------------
-- runs — an open, single-use ticket that a score must be redeemed against
-- ---------------------------------------------------------------------------

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  game_slug text not null,
  nonce text not null,
  started_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists runs_player_open_idx
  on public.runs (player_id, started_at desc) where consumed_at is null;

alter table public.runs enable row level security;
-- No policies: browsers never touch this table. /api/runs/* uses the
-- service-role key, which bypasses RLS.

-- ---------------------------------------------------------------------------
-- scores — one row per finished run
-- ---------------------------------------------------------------------------
--
-- verified = false marks a score the server could not vouch for: today that
-- is only the one-time import of a player's guest bests when they first sign
-- in. Those count towards your own personal best but never rank publicly.

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  game_slug text not null,
  score integer not null check (score >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  verified boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists scores_board_idx
  on public.scores (game_slug, score desc) where verified;
create index if not exists scores_personal_idx
  on public.scores (player_id, game_slug, score desc);

alter table public.scores enable row level security;

drop policy if exists "scores are readable by everyone" on public.scores;
create policy "scores are readable by everyone"
  on public.scores for select using (true);
-- Deliberately no insert/update/delete policy. Writes go through
-- /api/runs/submit and /api/runs/import only.

-- ---------------------------------------------------------------------------
-- player_signals — implicit feedback that feeds the algorithm
-- ---------------------------------------------------------------------------

create table if not exists public.player_signals (
  player_id uuid not null references public.profiles(id) on delete cascade,
  game_slug text not null,
  dwell_ms bigint not null default 0,
  runs integer not null default 0,
  fast_swipes integer not null default 0,
  replays integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (player_id, game_slug)
);

alter table public.player_signals enable row level security;

drop policy if exists "a player reads their own signals" on public.player_signals;
create policy "a player reads their own signals"
  on public.player_signals for select using (auth.uid() = player_id);
drop policy if exists "a player writes their own signals" on public.player_signals;
create policy "a player writes their own signals"
  on public.player_signals for insert with check (auth.uid() = player_id);
drop policy if exists "a player updates their own signals" on public.player_signals;
create policy "a player updates their own signals"
  on public.player_signals for update using (auth.uid() = player_id) with check (auth.uid() = player_id);

-- ---------------------------------------------------------------------------
-- player_prefs — the tunable, portable part of an account
-- ---------------------------------------------------------------------------
--
-- One row per player. `memories` is the algorithm's visible memory list
-- (lib/memories.ts), `likes` the liked slugs, `custom_games` the specs for
-- player-generated cards, `theme` the chosen theme id.

create table if not exists public.player_prefs (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  memories jsonb not null default '[]'::jsonb,
  likes text[] not null default '{}',
  custom_games jsonb not null default '[]'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.player_prefs enable row level security;

drop policy if exists "a player reads their own prefs" on public.player_prefs;
create policy "a player reads their own prefs"
  on public.player_prefs for select using (auth.uid() = player_id);
drop policy if exists "a player writes their own prefs" on public.player_prefs;
create policy "a player writes their own prefs"
  on public.player_prefs for insert with check (auth.uid() = player_id);
drop policy if exists "a player updates their own prefs" on public.player_prefs;
create policy "a player updates their own prefs"
  on public.player_prefs for update using (auth.uid() = player_id) with check (auth.uid() = player_id);

-- ---------------------------------------------------------------------------
-- seasons — a named window of time the giveaway is drawn from
-- ---------------------------------------------------------------------------
--
-- A season owns no scores of its own. It is a start and an end, and every
-- season read below is the same query the all-time boards run with a
-- created_at filter bolted on. That means a season can be created, moved or
-- deleted after the fact without touching a single row in `scores`, and a
-- month that has already been played can be turned into a contest
-- retroactively.

create table if not exists public.seasons (
  slug text primary key,
  title text not null,
  prize text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists seasons_window_idx on public.seasons (starts_at, ends_at);

alter table public.seasons enable row level security;

-- The rules of the contest are public; only /api/admin/season writes them.
drop policy if exists "seasons are readable by everyone" on public.seasons;
create policy "seasons are readable by everyone"
  on public.seasons for select using (true);

-- Season boards read scores by time, so the all-time (game_slug, score) index
-- is the wrong shape for them.
create index if not exists scores_season_idx
  on public.scores (game_slug, created_at, score desc) where verified;

-- The season a name refers to: the named one, or whichever is live right now,
-- or — if two overlap — the one that ends soonest.
create or replace function public.season(p_season text default null)
returns public.seasons
language sql
stable
security definer
set search_path = public
as $$
  select s.* from public.seasons s
  where (p_season is not null and s.slug = p_season)
     or (p_season is null and now() >= s.starts_at and now() < s.ends_at)
  order by s.ends_at asc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- reads — leaderboards and personal bests
-- ---------------------------------------------------------------------------

-- Every player's best per game, verified runs only. Used for ranking.
create or replace view public.public_bests as
  select player_id, game_slug, max(score) as score
  from public.scores
  where verified
  group by player_id, game_slug;

-- Top N for a game. Callable by anyone, including signed-out visitors.
create or replace function public.leaderboard(p_slug text, p_limit int default 10)
returns table (player_id uuid, handle text, avatar_url text, score integer, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.player_id,
         p.handle,
         p.avatar_url,
         b.score,
         rank() over (order by b.score desc) as rank
  from public.public_bests b
  join public.profiles p on p.id = b.player_id
  where b.game_slug = p_slug
  order by b.score desc
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

-- A player's own best and where it sits on the board. Personal best counts
-- imported guest scores; the rank is against verified runs only.
create or replace function public.my_standing(p_slug text)
returns table (best integer, rank bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select max(s.score) from public.scores s
              where s.player_id = auth.uid() and s.game_slug = p_slug), 0) as best,
    (select count(*) + 1 from public.public_bests b
     where b.game_slug = p_slug
       and b.score > coalesce((select max(s.score) from public.scores s
                               where s.player_id = auth.uid() and s.game_slug = p_slug), 0)) as rank,
    (select count(*) from public.public_bests b where b.game_slug = p_slug) as total;
$$;

grant execute on function public.leaderboard(text, int) to anon, authenticated;
grant execute on function public.my_standing(text) to authenticated;

-- ---------------------------------------------------------------------------
-- reads — the season boards the giveaway is drawn from
-- ---------------------------------------------------------------------------

-- The live season's rules, for the card at the top of the leaderboard sheet.
create or replace function public.current_season(p_season text default null)
returns table (
  slug text,
  title text,
  prize text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.slug, s.title, s.prize, s.starts_at, s.ends_at
  from public.season(p_season) s
  where s.slug is not null;
$$;

-- One game's board for one season. Same shape as leaderboard(), so the client
-- renders either through one code path. No season, no rows — the caller falls
-- back to the all-time board rather than showing an empty list.
create or replace function public.season_leaderboard(
  p_slug text,
  p_season text default null,
  p_limit int default 10
)
returns table (player_id uuid, handle text, avatar_url text, score integer, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select s.starts_at, s.ends_at from public.season(p_season) s where s.slug is not null),
  bests as (
    select sc.player_id, max(sc.score) as score
    from public.scores sc, w
    where sc.verified
      and sc.game_slug = p_slug
      and sc.created_at >= w.starts_at
      and sc.created_at < w.ends_at
    group by sc.player_id
  )
  select b.player_id,
         p.handle,
         p.avatar_url,
         b.score,
         rank() over (order by b.score desc) as rank
  from bests b
  join public.profiles p on p.id = b.player_id
  order by b.score desc
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

-- The contest itself: one number per player across the whole catalog.
--
-- Every game is its own little tournament — your best run in the window is
-- ranked against everyone else's, and the top 25 take 25 points down to 1.
-- Your season total is the sum over every game you placed in, so the board
-- rewards breadth (place on ten games) and depth (win one outright) alike,
-- and a player who never touches a game is simply not in its tournament.
-- Ties break towards more games played, then towards whoever got there first.
create or replace function public.season_points(p_season text default null)
returns table (
  player_id uuid,
  points bigint,
  games_played bigint,
  best_rank bigint,
  settled_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with w as (select s.starts_at, s.ends_at from public.season(p_season) s where s.slug is not null),
  bests as (
    select distinct on (sc.player_id, sc.game_slug)
           sc.player_id, sc.game_slug, sc.score, sc.created_at
    from public.scores sc, w
    where sc.verified
      and sc.created_at >= w.starts_at
      and sc.created_at < w.ends_at
    order by sc.player_id, sc.game_slug, sc.score desc, sc.created_at asc
  ),
  ranked as (
    select b.*,
           rank() over (partition by b.game_slug order by b.score desc) as game_rank
    from bests b
  )
  select r.player_id,
         sum(greatest(0, 26 - r.game_rank))::bigint as points,
         count(*) filter (where r.game_rank <= 25)::bigint as games_played,
         min(r.game_rank) as best_rank,
         max(r.created_at) as settled_at
  from ranked r
  group by r.player_id;
$$;

-- The giveaway board. Draw the winner off row 1, or run a random draw over
-- everyone above a points cutoff — both are one read away.
create or replace function public.season_overall(
  p_season text default null,
  p_limit int default 50
)
returns table (
  player_id uuid,
  handle text,
  avatar_url text,
  points bigint,
  games_played bigint,
  best_rank bigint,
  rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select sp.player_id,
         p.handle,
         p.avatar_url,
         sp.points,
         sp.games_played,
         sp.best_rank,
         rank() over (order by sp.points desc, sp.games_played desc, sp.settled_at asc) as rank
  from public.season_points(p_season) sp
  join public.profiles p on p.id = sp.player_id
  where sp.points > 0
  order by sp.points desc, sp.games_played desc, sp.settled_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

-- Where the caller sits in the contest, whether or not they are on the visible
-- page of it. total is everyone with at least one point this season; rank 0
-- means "not on the board yet", which is not the same as last place.
create or replace function public.my_season_standing(p_season text default null)
returns table (points bigint, rank bigint, games_played bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with board as (select * from public.season_points(p_season) where points > 0),
  me as (select * from board where player_id = auth.uid())
  select
    coalesce((select m.points from me m), 0) as points,
    case when exists (select 1 from me) then (
      select count(*) + 1
      from board b, me m
      where b.points > m.points
         or (b.points = m.points and b.games_played > m.games_played)
         or (b.points = m.points and b.games_played = m.games_played
             and b.settled_at < m.settled_at)
    ) else 0 end as rank,
    coalesce((select m.games_played from me m), 0) as games_played,
    (select count(*) from board) as total;
$$;

grant execute on function public.season(text) to anon, authenticated;
grant execute on function public.current_season(text) to anon, authenticated;
grant execute on function public.season_leaderboard(text, text, int) to anon, authenticated;
grant execute on function public.season_points(text) to anon, authenticated;
grant execute on function public.season_overall(text, int) to anon, authenticated;
grant execute on function public.my_season_standing(text) to authenticated;
