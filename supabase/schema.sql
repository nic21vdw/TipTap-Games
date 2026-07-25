-- Tip Tap Games — Postgres schema (Supabase).
-- The app currently persists everything client-side; apply this and set
-- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY to move scores,
-- signals, and prefs server-side. lib/storage.ts is the single swap point.

create table players (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  avatar_url text,
  provider text check (provider in ('google','discord','guest')) not null,
  device_id text,
  created_at timestamptz default now()
);

create table games (
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

create table scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  game_slug text references games(slug),
  score integer not null check (score >= 0),
  duration_ms integer not null,
  created_at timestamptz default now()
);
create index on scores (game_slug, score desc);
create index on scores (player_id, game_slug, score desc);

create table player_signals (
  player_id uuid references players(id) on delete cascade,
  game_slug text references games(slug),
  dwell_ms bigint default 0,
  runs integer default 0,
  fast_swipes integer default 0,
  replays integer default 0,
  primary key (player_id, game_slug)
);

create table algorithm_prefs (
  player_id uuid primary key references players(id) on delete cascade,
  vector jsonb not null,
  updated_at timestamptz default now()
);

-- anti-cheat: a score is only accepted against an open, unconsumed run
create table runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id),
  game_slug text references games(slug),
  nonce text not null,
  started_at timestamptz default now(),
  consumed boolean default false
);
